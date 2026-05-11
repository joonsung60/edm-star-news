import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const { topic, keywords } = await req.json()

    if (!topic || !keywords || keywords.length === 0) {
      return NextResponse.json({ error: '토픽과 키워드를 입력하세요.' }, { status: 400 })
    }

    // 키워드 기반으로 raw_articles에서 관련 기사 검색
    const keywordConditions = keywords
      .map((k: string) => `title.ilike.%${k}%,content.ilike.%${k}%`)
      .join(',')

    const { data: matchedArticles, error } = await supabase
      .from('raw_articles')
      .select('id, title, url')
      .or(keywordConditions)
      .eq('is_used', false)
      .order('published_at', { ascending: false })
      .limit(20)

    if (error) throw error
    if (!matchedArticles || matchedArticles.length === 0) {
      return NextResponse.json({ error: '매칭된 기사가 없습니다.' }, { status: 404 })
    }

    // 클러스터 생성
    const { data: cluster, error: clusterError } = await supabase
      .from('article_clusters')
      .insert({ topic, keywords })
      .select()
      .single()

    if (clusterError) throw clusterError

    // 클러스터에 기사 연결
    const clusterArticles = matchedArticles.map((article: any) => ({
      cluster_id: cluster.id,
      raw_article_id: article.id,
    }))

    const { error: linkError } = await supabase
      .from('cluster_articles')
      .insert(clusterArticles)

    if (linkError) throw linkError

    return NextResponse.json({
      success: true,
      clusterId: cluster.id,
      matched: matchedArticles.length,
      articles: matchedArticles.map((a: any) => ({ title: a.title, url: a.url })),
    })

  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 })
  }
}