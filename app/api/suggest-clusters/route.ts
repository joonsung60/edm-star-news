import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { cleanArticleText } from '@/lib/article-extraction'
import { getSourceTier, isAllTierC } from '@/lib/source-tiers'

const SUGGEST_SYSTEM = `당신은 EDM 뉴스 에디터입니다. 최근 영문 EDM 뉴스 기사 목록을 받아 한국어 기사 1개로 재구성할 수 있는 후보만 제안하세요.

	핵심 원칙:
	- 카테고리 클러스터 금지: festival, synth, preview, release, new music, house, techno, club, lineup 같은 넓은 단어만 공유하는 묶음은 절대 제안하지 마세요.
	- 반드시 같은 사건, 같은 릴리즈, 같은 행사, 같은 인물, 같은 제품 단위로만 묶으세요.
	- Tier C 소스만으로 구성된 그룹은 제안하지 마세요. Tier C는 보조 신호로만 사용하세요.
	- Tier A 소스가 포함된 구체적 사건/릴리즈/행사를 우선 제안하세요.
	- 연도 단독(2025, 2026 등), 매체명, 사이트명, 시리즈명, 인터뷰 형식 표현(catches up with, chats to, talks to 등), 연말 결산/차트/베스트 목록 문구는 절대 클러스터 기준으로 사용하지 마세요.
	- 좋은 예: "Music On Festival 취소 사태", "EDC Las Vegas 2026 관련 소식", "Armin van Buuren 'A State of Trance 2026' 발매"
- 나쁜 예: "주요 페스티벌 소식", "신시사이저 뉴스", "preview 관련 EDM 뉴스", "2025 관련 소식", "catches up with 관련 소식", "Best Electronic Music 관련 소식"

반드시 아래 JSON 형식으로만 응답하세요. 그 외의 설명이나 마크다운 금지.

{
  "suggestions": [
    {
      "topic": "한국어 토픽 (40자 이내)",
      "keywords": ["english", "keyword", "list"],
      "articleIds": ["uuid", "uuid"],
      "reason": "같은 사건/릴리즈/행사/인물로 판단한 이유",
      "commonEntities": ["Music On Festival", "Amsterdam"]
    }
  ]
}

규칙:
- 0~5개의 그룹을 제안하되, 각 그룹은 최소 2개의 기사를 포함
- 같은 사건/릴리즈/행사/인물/제품이라는 근거가 부족하면 억지로 묶지 말고 빈 배열을 반환하세요.
- topic: 한국어, 구체적이고 명확하게 (예: "Music On Festival 취소 사태")
- keywords: 3~6개의 영문 키워드. 카테고리 단어 단독 금지
- articleIds: 반드시 제공된 목록의 UUID만 사용
- reason: 왜 하나의 기사로 묶을 수 있는지 설명
- commonEntities: 기사 제목/요약에서 반복되는 구체적 고유명사 또는 사건 문구
- 어느 그룹에도 명확히 속하지 않는 단일 기사는 제외`

type Suggestion = {
  topic: string
  keywords: string[]
  articleIds: string[]
  reason?: string
  commonEntities?: string[]
  cohesionScore?: number
}

type SuggestionWithArticles = Suggestion & {
  articles: { id: string; title: string; url: string }[]
}

type RawArticle = {
  id: string
  title: string
  content: string | null
  url: string
  source_id: string | number | null
  sourceName?: string
  sourceTier?: SourceTier
}

type SourceTier = 'A' | 'B' | 'C' | 'manual' | 'unknown'

type SuggestionStatus = 'pending' | 'approved' | 'rejected' | 'published'

const ALLOWED_STATUSES: SuggestionStatus[] = ['pending', 'approved', 'rejected', 'published']
const MIN_COHESION_SCORE = 40
const DEFAULT_ANALYSIS_LIMIT = 100
const MAX_ANALYSIS_LIMIT = 150

type DbSuggestedCluster = {
  id: string
  topic: string
  keywords: string[] | null
  article_ids: string[] | null
  status: SuggestionStatus
  cluster_id: string | null
  created_at: string
}

type PersistedSuggestion = SuggestionWithArticles & {
  id: string
  status: SuggestionStatus
  clusterId: string | null
  articleId: string | null
  createdAt: string
}

const CATEGORY_KEYWORDS = new Set([
  'album',
  'albums',
  'club',
  'clubs',
  'dj',
  'edm',
  'festival',
  'festivals',
  'house',
  'intros',
  'lineup',
  'line-ups',
  'music',
  'new',
  'new music',
  'premiere',
  'preview',
  'record',
  'records',
  'release',
  'released',
  'releases',
  'single',
  'synth',
  'synths',
  'techno',
  'track',
  'tracks',
])

const STOPWORDS = new Set([
  'about',
  'after',
  'album',
  'albums',
  'also',
  'and',
  'are',
  'artist',
  'artists',
  'back',
  'best',
  'can',
  'club',
  'dance',
  'deep',
  'dj',
  'edm',
  'from',
  'has',
  'have',
  'home',
  'house',
  'into',
  'label',
  'live',
  'magazine',
  'menu',
  'mix',
  'music',
  'new',
  'news',
  'out',
  'premiere',
  'preview',
  'records',
  'release',
  'released',
  'releases',
  'review',
  'show',
  'site',
  'single',
  'so',
  'techno',
  'tech',
  'the',
  'this',
  'track',
  'tracks',
  'with',
  'year',
  'far',
  'just',
  'page',
	  'privacy',
	  'policy',
	  'cookie',
	  'cookies',
	  'http',
	  'https',
	  'www',
	  'com',
	  'net',
	  'org',
	])

const SOURCE_OR_SERIES_PATTERNS = [
  /\b909originals\b/i,
  /^ia mix(?:\s+\d+)?$/i,
  /^myrecordbag$/i,
  /\b(bandcamp daily|beatportal|attack magazine|inverted audio)\b/i,
  /\b(mixmag|dj mag|the quietus|crack magazine|ransom note|5 magazine)\b/i,
  /\b(create digital music|cdm|groove magazine|fazemag|tsugi)\b/i,
]

const LOW_SIGNAL_CLUSTER_PATTERNS = [
  /^(?:19|20)\d{2}$/i,
  /^(?:19|20)\d{2}\s+(?:related|news|review|in review)$/i,
  /\b(?:catches up with|chats to|talks to|interview with|in conversation with)\b/i,
  /\b(?:best electronic music|best albums|best tracks|top-selling tracks|top selling tracks|chart toppers)\b/i,
  /\bfestival line-ups you might\b/i,
]

async function attachSourceMeta(articles: RawArticle[]): Promise<RawArticle[]> {
  const sourceIds = Array.from(new Set(
    articles
      .map((article) => article.source_id)
      .filter((id): id is string | number => id !== null)
  ))

  if (sourceIds.length === 0) {
    return articles.map((article) => ({ ...article, sourceTier: 'unknown' }))
  }

  const sourceMeta = new Map<string, { name: string; tier: SourceTier }>()
  const { data } = await supabase
    .from('rss_sources')
    .select('id, name')
    .in('id', sourceIds)

  for (const source of (data ?? []) as { id: string | number; name: string | null }[]) {
    const name = source.name ?? '알 수 없는 소스'
    sourceMeta.set(String(source.id), {
      name,
      tier: getSourceTier(name),
    })
  }

  return articles.map((article) => {
    const meta = article.source_id !== null ? sourceMeta.get(String(article.source_id)) : undefined
    return {
      ...article,
      sourceName: meta?.name,
      sourceTier: meta?.tier ?? 'unknown',
    }
  })
}

function articleSnippet(article: RawArticle): string {
  return cleanArticleText(article.content ?? '', 450)
    .replace(/\s+/g, ' ')
    .trim()
}

function parseSuggestions(responseText: string): { suggestions?: Suggestion[] } {
  try {
    return JSON.parse(responseText)
  } catch {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('LLM 응답 JSON 파싱 실패')
    }
    return JSON.parse(jsonMatch[0])
  }
}

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').replace(/\s+/g, ' ').trim()
}

function normalizeEntity(entity: string): string {
  return entity
    .replace(/^[-–—:|]\s*/i, '')
    .replace(/^(at|for|of|the|with)\s+/i, '')
    .replace(/\s+[-–—|]\s*(909originals|bandcamp daily|beatportal|attack magazine|inverted audio|mixmag|dj mag|cdm|create digital music)$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function isCategoryKeyword(keyword: string): boolean {
  return CATEGORY_KEYWORDS.has(normalizeText(keyword))
}

function isUrlOrDomainText(text: string): boolean {
  const lower = text.toLowerCase()
  const normalized = normalizeText(text)
  return /\bhttps?:\/\//.test(lower)
    || /\bwww\./.test(lower)
    || /\b[a-z0-9-]+\.(com|net|org|co|uk|de|fr|io|fm)\b/.test(lower)
    || /\b(https|http|www)\b/.test(normalized)
    || /\b(com|net|org|co|uk|de|fr|io|fm)\b/.test(normalized)
}

function isSourceOrSeriesEntity(text: string): boolean {
  const normalized = normalizeEntity(text)
  return SOURCE_OR_SERIES_PATTERNS.some((pattern) => pattern.test(normalized))
}

function isLowSignalClusterText(text: string): boolean {
  const normalized = normalizeText(text)
  return LOW_SIGNAL_CLUSTER_PATTERNS.some((pattern) => pattern.test(normalized))
}

function isSpecificEntity(entity: string): boolean {
  const normalized = normalizeText(entity)
  if (
    !normalized
    || isCategoryKeyword(normalized)
    || isUrlOrDomainText(entity)
    || isSourceOrSeriesEntity(entity)
    || isLowSignalClusterText(entity)
  ) {
    return false
  }
  if (/\b(of the year|the year|so far|year \d{4})\b/.test(normalized) || /[&-]$/.test(entity.trim())) {
    return false
  }

  const tokens = normalized.split(' ').filter(Boolean)
  if (tokens.length >= 2) {
    return tokens.some((token) => !STOPWORDS.has(token) && !CATEGORY_KEYWORDS.has(token) && !/^\d+$/.test(token))
  }

  const originalTokens = entity.split(/\s+/).filter(Boolean)
  const hasUppercaseSignal = originalTokens.some((token) => /[A-Z]/.test(token[0]) || /^[A-Z0-9]{2,}$/.test(token))
  return hasUppercaseSignal && normalized.length >= 4 && !STOPWORDS.has(normalized)
}

function calculateCohesionScore(articleIds: string[], commonEntities: string[], rawArticles: RawArticle[]): number {
  if (articleIds.length < 2 || commonEntities.length === 0) {
    return 0
  }

  const articleById = new Map(rawArticles.map((article) => [article.id, article]))
  const entityHits = commonEntities.reduce((total, entity) => {
    const normalizedEntity = normalizeText(entity)
    const hits = articleIds.filter((id) => {
      const article = articleById.get(id)
      return article ? normalizeText(article.title).includes(normalizedEntity) : false
    }).length
    return total + hits / articleIds.length
  }, 0)
  const averageEntityCoverage = entityHits / commonEntities.length
  const sizeBonus = Math.min(articleIds.length, 5) * 4
  const categoryPenalty = commonEntities.every((entity) => isCategoryKeyword(entity)) ? 45 : 0

  return Math.max(0, Math.min(100, Math.round(averageEntityCoverage * 80 + sizeBonus - categoryPenalty)))
}

function isTierCOnlySuggestion(suggestion: Pick<Suggestion, 'articleIds'>, articleById: Map<string, RawArticle>): boolean {
  const articles = suggestion.articleIds
    .map((id) => articleById.get(id))
    .filter((article): article is RawArticle => Boolean(article))

  if (articles.length < 2) {
    return false
  }

  const sourceNames = articles
    .map((article) => article.sourceName)
    .filter((name): name is string => Boolean(name))

  return articles.every((article) => article.sourceTier === 'C') || isAllTierC(sourceNames)
}

function applySourcePolicy(suggestions: SuggestionWithArticles[], rawArticles: RawArticle[]): SuggestionWithArticles[] {
  const articleById = new Map(rawArticles.map((article) => [article.id, article]))
  return suggestions.filter((suggestion) => !isTierCOnlySuggestion(suggestion, articleById))
}

function normalizeSuggestion(
  suggestion: Partial<Suggestion>,
  validIds: Set<string>,
  articleMeta: Map<string, { id: string; title: string; url: string }>,
  rawArticles: RawArticle[]
): SuggestionWithArticles | null {
  const articleIds = Array.from(new Set(
    (Array.isArray(suggestion.articleIds) ? suggestion.articleIds : [])
      .map((id) => String(id).trim())
      .filter((id) => validIds.has(id))
  ))
  const keywords = Array.from(new Set(
    (Array.isArray(suggestion.keywords) ? suggestion.keywords : [])
      .map((keyword) => String(keyword).trim())
      .filter((keyword) => keyword.length > 0)
      .filter((keyword) => !isCategoryKeyword(keyword))
      .filter((keyword) => !isUrlOrDomainText(keyword))
      .filter((keyword) => !isSourceOrSeriesEntity(keyword))
      .filter((keyword) => !isLowSignalClusterText(keyword))
      .slice(0, 6)
  ))
  const commonEntities = Array.from(new Set(
    (Array.isArray(suggestion.commonEntities) ? suggestion.commonEntities : [])
      .map((entity) => normalizeEntity(String(entity)))
      .filter(isSpecificEntity)
      .slice(0, 5)
  ))
  const topic = String(suggestion.topic ?? '').trim()
  const reason = String(suggestion.reason ?? '').trim()
  const cohesionScore = typeof suggestion.cohesionScore === 'number'
    ? Math.round(suggestion.cohesionScore)
    : calculateCohesionScore(articleIds, commonEntities.length > 0 ? commonEntities : keywords, rawArticles)

  if (
    !topic
    || isUrlOrDomainText(topic)
    || isSourceOrSeriesEntity(topic)
    || isLowSignalClusterText(topic)
    || articleIds.length < 2
    || cohesionScore < MIN_COHESION_SCORE
  ) {
    return null
  }

  if (keywords.length === 0 && commonEntities.length === 0) {
    return null
  }

  return {
    topic,
    keywords,
    articleIds,
    reason,
    commonEntities,
    cohesionScore,
    articles: articleIds.map((id) => articleMeta.get(id)!).filter(Boolean),
  }
}

async function hydrateSuggestions(rows: DbSuggestedCluster[]): Promise<PersistedSuggestion[]> {
  if (rows.length === 0) return []

  const allIds = Array.from(new Set(rows.flatMap((row) => row.article_ids ?? [])))
  const articleMeta = new Map<string, { id: string; title: string; url: string }>()

  if (allIds.length > 0) {
    const { data: rawArticles } = await supabase
      .from('raw_articles')
      .select('id, title, url')
      .in('id', allIds)

    for (const article of (rawArticles ?? []) as { id: string; title: string; url: string }[]) {
      articleMeta.set(article.id, { id: article.id, title: article.title, url: article.url })
    }
  }

  return rows.map((row) => {
    const articleIds = row.article_ids ?? []
    const commonEntities = row.keywords?.filter((keyword) => !isCategoryKeyword(keyword)) ?? []
    return {
      id: row.id,
      topic: row.topic,
      keywords: row.keywords ?? [],
      articleIds,
      reason: commonEntities[0]
        ? `"${commonEntities[0]}"를 기준으로 저장된 제안입니다.`
        : undefined,
      commonEntities: commonEntities.length > 0 ? commonEntities : undefined,
      cohesionScore: commonEntities.length > 0
        ? calculateCohesionScore(articleIds, commonEntities, articleIds.map((id) => {
          const meta = articleMeta.get(id)
	          return {
	            id,
	            title: meta?.title ?? '',
	            content: null,
	            url: meta?.url ?? '',
	            source_id: null,
	          }
	        }))
        : undefined,
      articles: articleIds
        .map((id) => articleMeta.get(id))
        .filter((a): a is { id: string; title: string; url: string } => Boolean(a)),
      status: row.status,
      clusterId: row.cluster_id,
      articleId: null,
      createdAt: row.created_at,
    }
  })
}

export async function GET(req: NextRequest) {
  try {
    const status = req.nextUrl.searchParams.get('status')

    let query = supabase
      .from('suggested_clusters')
      .select('*')
      .order('created_at', { ascending: false })

    if (status) {
      if (!ALLOWED_STATUSES.includes(status as SuggestionStatus)) {
        return NextResponse.json(
          { error: `유효하지 않은 status: ${status}` },
          { status: 400 }
        )
      }
      query = query.eq('status', status)
    }

    const { data, error } = await query
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const suggestions = await hydrateSuggestions((data ?? []) as DbSuggestedCluster[])
    return NextResponse.json({ suggestions })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const limit = typeof body.limit === 'number' && body.limit > 0
      ? Math.min(body.limit, MAX_ANALYSIS_LIMIT)
      : DEFAULT_ANALYSIS_LIMIT

    const { data: articles, error } = await supabase
      .from('raw_articles')
      .select('id, title, content, url, source_id')
      .eq('is_used', false)
	      .order('published_at', { ascending: false })
	      .limit(limit)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    if (!articles || articles.length === 0) {
      return NextResponse.json({ suggestions: [], total: 0, message: '최근 미사용 기사가 없습니다.' })
    }

    const rawArticles = await attachSourceMeta(articles as RawArticle[])
    // Tier C 기사는 입력에서 제외하지 않는다. 최종 제안이 Tier C만으로 구성될 때만 차단한다.
    const articlesText = rawArticles
      .map((article) =>
        [
          `[${article.id}]`,
          article.sourceName ? `매체: ${article.sourceName}` : null,
          article.sourceTier && article.sourceTier !== 'unknown' ? `소스 등급: Tier ${article.sourceTier}` : null,
          `제목: ${article.title}`,
          `요약: ${articleSnippet(article) || '(본문 없음)'}`,
        ].filter(Boolean).join('\n')
      )
      .join('\n---\n')

    const ollamaUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434'
    const ollamaRes = await fetch(`${ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'qwen3:14b',
        system: SUGGEST_SYSTEM,
        prompt: `다음 기사 목록(${articles.length}개)을 분석해 토픽 그룹을 제안하세요.\n\n${articlesText}`,
        format: 'json',
        stream: false,
        think: true,
      }),
    })

    if (!ollamaRes.ok) {
      return NextResponse.json(
        { error: `Ollama 응답 오류: ${ollamaRes.status}` },
        { status: 502 }
      )
    }

    const ollamaData = await ollamaRes.json()
    const responseText: string = ollamaData.response ?? ''

    let parsed: { suggestions?: Suggestion[] }
    try {
      parsed = parseSuggestions(responseText)
    } catch (err) {
      return NextResponse.json(
        { error: String(err), raw: responseText.slice(0, 500) },
        { status: 502 }
      )
    }

    const validIds = new Set(rawArticles.map((article) => article.id))
    const articleMeta = new Map(
      rawArticles.map((article) => [article.id, { id: article.id, title: article.title, url: article.url }])
    )

    const llmSuggestions = applySourcePolicy((parsed.suggestions ?? [])
      .map((suggestion) => normalizeSuggestion(suggestion, validIds, articleMeta, rawArticles))
      .filter((suggestion): suggestion is SuggestionWithArticles => suggestion !== null), rawArticles)
    const suggestions = llmSuggestions
    const source = 'llm'

    if (suggestions.length === 0) {
      return NextResponse.json({
        suggestions: [],
        saved: 0,
        total: articles.length,
        source,
        llmSuggestionCount: parsed.suggestions?.length ?? 0,
      })
    }

    const insertPayload = suggestions.map((s) => ({
      topic: s.topic,
      keywords: s.keywords,
      article_ids: s.articleIds,
      status: 'pending' as const,
    }))

    const { data: inserted, error: insertError } = await supabase
      .from('suggested_clusters')
      .insert(insertPayload)
      .select()

    if (insertError) {
      return NextResponse.json(
        { error: `제안 저장 실패: ${insertError.message}` },
        { status: 500 }
      )
    }

    const persisted = await hydrateSuggestions((inserted ?? []) as DbSuggestedCluster[])

    return NextResponse.json({
      suggestions: persisted,
      saved: persisted.length,
      total: articles.length,
      source,
      llmSuggestionCount: parsed.suggestions?.length ?? 0,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
