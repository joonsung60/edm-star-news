import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { extractArticleText, extractImageUrl } from '@/lib/article-extraction'
import Parser from 'rss-parser'

const parser = new Parser()
const { data: sources, error } = await supabase
  .from('rss_sources')
  .select('*')
  .eq('is_active', true)

console.log('sources:', sources)
console.log('error:', error)

async function fetchArticleContent(url: string): Promise<{ content: string; imageUrl: string | null }> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
    const html = await res.text()

    const imageUrl = extractImageUrl(html)
    const content = extractArticleText(html, 5000)

    return { content, imageUrl }
  } catch {
    return { content: '', imageUrl: null }
  }
}

// RSS 자동 수집
async function collectFromRSS(): Promise<number> {
  const { data: sources } = await supabase
    .from('rss_sources')
    .select('*')
    .eq('is_active', true)

  if (!sources) {
    console.log('소스 없음')
    return 0
  }

  console.log(`소스 ${sources.length}개 발견`)
  let collected = 0

  for (const source of sources) {
    try {
      console.log(`파싱 시도: ${source.name} - ${source.url}`)
      const feed = await parser.parseURL(source.url)
      console.log(`파싱 성공: ${source.name} - ${feed.items.length}개 아이템`)

      for (const item of feed.items.slice(0, 10)) {
        if (!item.link) continue

        const { data: existing } = await supabase
          .from('raw_articles')
          .select('id')
          .eq('url', item.link)
          .single()

        if (existing) continue

        const { content, imageUrl } = await fetchArticleContent(item.link)

        await supabase.from('raw_articles').insert({
          source_id: source.id,
          title: item.title || '제목 없음',
          content,
          url: item.link,
          image_url: imageUrl,
          author: item.creator || null,
          published_at: item.pubDate ? new Date(item.pubDate).toISOString() : null,
        })

        collected++
      }

      await supabase
        .from('rss_sources')
        .update({ last_fetched_at: new Date().toISOString() })
        .eq('id', source.id)

    } catch (err) {
      console.error(`RSS 실패: ${source.name}`, err)
    }
  }

  return collected
}

// URL 직접 추가
async function collectFromUrls(urls: string[]): Promise<number> {
  let collected = 0

  for (const url of urls) {
    try {
      const { data: existing } = await supabase
        .from('raw_articles')
        .select('id')
        .eq('url', url)
        .single()

      if (existing) continue

      const { content, imageUrl } = await fetchArticleContent(url)

      // 제목 추출 시도
      const titleMatch = content.match(/^(.{10,100}?)[.!?]/)
      const title = titleMatch ? titleMatch[1].trim() : url

      await supabase.from('raw_articles').insert({
        source_id: null,
        title,
        content,
        url,
        image_url: imageUrl,
        published_at: new Date().toISOString(),
      })

      collected++
    } catch (err) {
      console.error(`URL 추가 실패: ${url}`, err)
    }
  }

  return collected
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const { urls } = body

    console.log('수집 시작:', urls ? `URL ${urls.length}개` : 'RSS 모드')

    const collected = urls && urls.length > 0
      ? await collectFromUrls(urls)
      : await collectFromRSS()

    console.log('수집 완료:', collected)
    return NextResponse.json({ success: true, collected })
  } catch (err) {
    console.error('collect API 에러:', err)
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 })
  }
}
