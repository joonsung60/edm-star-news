import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { SYSTEM_PROMPT_A } from '@/lib/prompts'

type ImageSourceRow = {
  id: string
  image_url: string
  source_memo: string | null
  source_date: string | null
  extracted_text: string | null
  generated_article_id: string | null
}

type GeneratedImageArticle = {
  title: string
  content: string
  slug: string
  category: string
  genre: string
}

const ALLOWED_CATEGORIES = ['페스티벌', '아티스트', '릴리즈', '뉴스', '인터뷰']
const DEFAULT_CATEGORY = '뉴스'
const DEFAULT_GENRE = 'edm'
const SLUG_MAX_LENGTH = 30
const BUCKET_NAME = 'image-sources'
const MAX_BASE64_LENGTH = 14_000_000

type GenerateRequest = {
  imageBase64?: string
  mimeType?: string
}

function normalizeOptionalText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function parseImagePayload(imageBase64: string): {
  base64: string
  mimeTypeFromPayload: string | null
} {
  const dataUrlMatch = imageBase64.match(/^data:(image\/(?:jpeg|jpg|png));base64,(.+)$/i)
  if (dataUrlMatch) {
    return {
      base64: dataUrlMatch[2],
      mimeTypeFromPayload: dataUrlMatch[1].toLowerCase().replace('image/jpg', 'image/jpeg'),
    }
  }

  return {
    base64: imageBase64.replace(/\s+/g, ''),
    mimeTypeFromPayload: null,
  }
}

function extensionForMime(mimeType: string): string {
  return mimeType === 'image/png' ? 'png' : 'jpg'
}

async function uploadArticleImage(
  sourceId: string,
  imageBase64: string,
  rawMimeType: string | null
): Promise<{ imageUrl: string; imagePath: string }> {
  if (imageBase64.length > MAX_BASE64_LENGTH) {
    throw new Error('이미지 파일이 너무 큽니다.')
  }

  const { base64, mimeTypeFromPayload } = parseImagePayload(imageBase64)
  const mimeType = (mimeTypeFromPayload ?? rawMimeType ?? 'image/jpeg')
    .toLowerCase()
    .replace('image/jpg', 'image/jpeg')

  if (!['image/jpeg', 'image/png'].includes(mimeType)) {
    throw new Error('jpg/png 이미지만 지원합니다.')
  }

  const bytes = Buffer.from(base64, 'base64')
  if (bytes.length === 0) {
    throw new Error('이미지 데이터를 읽지 못했습니다.')
  }

  const ext = extensionForMime(mimeType)
  const imagePath = `${new Date().getFullYear()}/${sourceId}/article-${Date.now()}.${ext}`

  const { error: uploadError } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(imagePath, bytes, {
      contentType: mimeType,
      upsert: false,
    })

  if (uploadError) {
    throw new Error(`이미지 업로드 실패: ${uploadError.message}`)
  }

  const { data } = supabase.storage
    .from(BUCKET_NAME)
    .getPublicUrl(imagePath)

  return { imageUrl: data.publicUrl, imagePath }
}

function normalizeSlug(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/-+$/, '')
}

function normalizeCategory(raw: string): string {
  const trimmed = raw.trim()
  return ALLOWED_CATEGORIES.includes(trimmed) ? trimmed : DEFAULT_CATEGORY
}

function normalizeGenre(raw: string): string {
  const trimmed = raw.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
  return trimmed || DEFAULT_GENRE
}

async function ensureUniqueSlug(base: string): Promise<string> {
  const safeBase = base || `image-article-${Date.now().toString(36)}`
  let candidate = safeBase
  for (let suffix = 2; suffix < 100; suffix++) {
    const { data } = await supabase
      .from('articles')
      .select('id')
      .eq('slug', candidate)
      .maybeSingle()
    if (!data) return candidate
    candidate = `${safeBase}-${suffix}`
  }
  return `${safeBase}-${Date.now().toString(36)}`
}

function parseGeneratedArticle(response: string): GeneratedImageArticle | null {
  const candidates = extractJsonCandidates(response)

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as Partial<GeneratedImageArticle>
      if (typeof parsed.title === 'string' && typeof parsed.content === 'string') {
        return {
          title: parsed.title.trim(),
          content: parsed.content.trim(),
          slug: typeof parsed.slug === 'string' ? parsed.slug.trim() : '',
          category: typeof parsed.category === 'string' ? parsed.category.trim() : '',
          genre: typeof parsed.genre === 'string' ? parsed.genre.trim() : '',
        }
      }
    } catch {
      // Try the next candidate or the legacy parser below.
    }
  }

  const titleMatch = response.match(/(?:^|\n)\s*(?:제목|title)\s*[:：]\s*(.+)/i)
  const contentMatch = response.match(
    /(?:^|\n)\s*(?:본문|내용|content)\s*[:：]\s*([\s\S]+?)(?=\n\s*(?:슬러그|slug|카테고리|category|장르|genre)\s*[:：]|$)/i
  )

  if (titleMatch && contentMatch) {
    const slugMatch = response.match(/(?:^|\n)\s*(?:슬러그|slug)\s*[:：]\s*(.+)/i)
    const categoryMatch = response.match(/(?:^|\n)\s*(?:카테고리|category)\s*[:：]\s*(.+)/i)
    const genreMatch = response.match(/(?:^|\n)\s*(?:장르|genre)\s*[:：]\s*(.+)/i)

    return {
      title: titleMatch[1].trim(),
      content: contentMatch[1].trim(),
      slug: slugMatch?.[1].trim() ?? '',
      category: categoryMatch?.[1].trim() ?? '',
      genre: genreMatch?.[1].trim() ?? '',
    }
  }

  return null
}

function extractJsonCandidates(response: string): string[] {
  const candidates: string[] = []
  const fenced = response.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced?.[1]) candidates.push(fenced[1].trim())

  const firstBrace = response.indexOf('{')
  const lastBrace = response.lastIndexOf('}')
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(response.slice(firstBrace, lastBrace + 1).trim())
  }

  candidates.push(response.trim())
  return Array.from(new Set(candidates.filter(Boolean)))
}

function formatSourceDate(value: string | null): string {
  if (!value) return '없음'
  const date = new Date(`${value}T00:00:00+09:00`)
  if (Number.isNaN(date.getTime())) return '없음'
  return date.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'Asia/Seoul',
  })
}

function buildPrompt(source: ImageSourceRow): string {
  return `아래는 단일 이미지/SNS 소스를 Vision LLM으로 분석한 결과입니다.
이 이미지 하나만을 근거로 한국어 EDM 뉴스 기사 초안을 작성하세요.

중요:
- 분석 결과에 없는 사실을 추측하지 마세요.
- 정보가 부족하면 짧고 신중한 기사로 작성하세요.
- 소스 메모는 사용자의 맥락 보충 자료입니다. 단, 메모만으로 과장하지 마세요.
- 날짜가 필요하면 사용자 입력 날짜 또는 이미지 분석 결과에 명확히 있는 구체적 날짜만 사용하세요.
- '오늘', '어제', '최근', '며칠 전' 같은 상대적 날짜 표현은 금지입니다.
- 출력은 반드시 JSON 객체 하나만 허용됩니다.
- 마크다운 코드블록, 설명 문장, 주석, 목록, 머리말을 JSON 앞뒤에 붙이지 마세요.
- JSON 키는 "title", "content", "slug", "category", "genre" 다섯 개입니다.
- JSON 문자열 안의 줄바꿈은 \\n으로 이스케이프하세요.
- category는 "페스티벌", "아티스트", "릴리즈", "뉴스", "인터뷰" 중 하나입니다.
- genre는 house, techno, trance, drum-and-bass, dubstep, ambient, experimental, hardstyle, future-bass, big-room 등 영문 소문자로 작성하세요. 특정하기 어렵다면 "edm"입니다.

[소스 메모]
${source.source_memo ?? '없음'}

[사용자 입력 날짜]
${formatSourceDate(source.source_date)}

[이미지 분석 결과]
${source.extracted_text ?? ''}

응답 예:
{"title":"한국어 기사 제목","content":"한국어 기사 본문","slug":"english-keyword-slug","category":"뉴스","genre":"edm"}`
}

async function generateArticle(source: ImageSourceRow): Promise<GeneratedImageArticle> {
  const ollamaUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434'
  const ollamaModel = process.env.OLLAMA_MODEL || 'qwen3:14b'

  const res = await fetch(`${ollamaUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: ollamaModel,
      system: SYSTEM_PROMPT_A,
      prompt: buildPrompt(source),
      format: 'json',
      stream: false,
      think: false,
    }),
  })

  const data = await res.json().catch(() => null)

  if (!res.ok) {
    throw new Error(`Ollama 오류: ${JSON.stringify(data).slice(0, 300)}`)
  }

  if (!data?.response || typeof data.response !== 'string') {
    throw new Error(`Ollama 응답 없음: ${JSON.stringify(data).slice(0, 300)}`)
  }

  const generated = parseGeneratedArticle(data.response)
  if (!generated) {
    throw new Error(
      `Ollama 응답을 기사 JSON으로 파싱하지 못했습니다. 응답 미리보기: ${data.response.slice(0, 500)}`
    )
  }

  return generated
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await req.json().catch(() => ({})) as GenerateRequest

  if (!id) {
    return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 })
  }

  const { data: source, error: sourceError } = await supabase
    .from('image_sources')
    .select('id, image_url, source_memo, source_date, extracted_text, generated_article_id')
    .eq('id', id)
    .maybeSingle()

  if (sourceError) {
    return NextResponse.json({ error: sourceError.message }, { status: 500 })
  }

  if (!source) {
    return NextResponse.json({ error: '이미지 소스를 찾을 수 없습니다.' }, { status: 404 })
  }

  const imageSource = source as ImageSourceRow

  if (!imageSource.extracted_text?.trim()) {
    return NextResponse.json({ error: '이미지 분석 결과가 없습니다.' }, { status: 400 })
  }

  if (imageSource.generated_article_id) {
    const { data: existingArticle, error: existingArticleError } = await supabase
      .from('articles')
      .select('id')
      .eq('id', imageSource.generated_article_id)
      .maybeSingle()

    if (existingArticleError) {
      return NextResponse.json({ error: existingArticleError.message }, { status: 500 })
    }

    if (existingArticle) {
      return NextResponse.json(
        { error: '이미 기사 초안이 생성된 이미지 소스입니다.' },
        { status: 400 }
      )
    }

    const { error: resetError } = await supabase
      .from('image_sources')
      .update({
        generated_article_id: null,
        status: 'analyzed',
      })
      .eq('id', imageSource.id)

    if (resetError) {
      return NextResponse.json({ error: resetError.message }, { status: 500 })
    }

    imageSource.generated_article_id = null
  }

  try {
    let articleImageUrl = imageSource.image_url

    if (body.imageBase64) {
      const uploaded = await uploadArticleImage(
        imageSource.id,
        body.imageBase64,
        normalizeOptionalText(body.mimeType)
      )
      articleImageUrl = uploaded.imageUrl
    }

    const generated = await generateArticle(imageSource)
    const slug = await ensureUniqueSlug(normalizeSlug(generated.slug))
    const category = normalizeCategory(generated.category)
    const genre = normalizeGenre(generated.genre)

    const { data: article, error: articleError } = await supabase
      .from('articles')
      .insert({
        title: generated.title,
        content: generated.content,
        cluster_id: null,
        published: false,
        slug,
        category,
        genre,
        image_url: articleImageUrl,
      })
      .select()
      .single()

    if (articleError) {
      throw articleError
    }

    const { error: updateError } = await supabase
      .from('image_sources')
      .update({
        generated_article_id: article.id,
        status: 'draft_created',
      })
      .eq('id', imageSource.id)

    if (updateError) {
      throw updateError
    }

    return NextResponse.json({ article })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
