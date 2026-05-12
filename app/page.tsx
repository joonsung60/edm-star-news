import Link from 'next/link'
import { supabase } from '@/lib/supabase'

type ArticleListItem = {
  id: string
  slug: string | null
  title: string
  content: string
  published_at: string | null
  cluster_id: string | null
  imageUrl: string | null
  category?: string | null
  genre?: string | null
}

type ArticleRow = {
  id: string
  slug: string | null
  title: string
  content: string
  published_at: string | null
  cluster_id: string | null
  category?: string | null
  genre?: string | null
}

type ClusterArticleRow = {
  cluster_id: string
  raw_article_id: string
}

type RawArticleImageRow = {
  id: string
  image_url: string | null
}

async function loadArticles(): Promise<{ articles: ArticleListItem[]; error: string | null }> {
  const { data, error } = await supabase
    .from('articles')
    .select('id, slug, title, content, published_at, cluster_id, category, genre')
    .eq('published', true)
    .order('published_at', { ascending: false })
    .limit(20)

  if (error) {
    return { articles: [], error: error.message }
  }

  const rows = (data ?? []) as ArticleRow[]
  const clusterIds = Array.from(
    new Set(rows.map((r) => r.cluster_id).filter((id): id is string => Boolean(id)))
  )

  const imageByCluster = new Map<string, string>()

  if (clusterIds.length > 0) {
    const { data: caData } = await supabase
      .from('cluster_articles')
      .select('cluster_id, raw_article_id')
      .in('cluster_id', clusterIds)

    const clusterArticles = (caData ?? []) as ClusterArticleRow[]
    const rawIds = Array.from(
      new Set(clusterArticles.map((ca) => ca.raw_article_id).filter(Boolean))
    )

    if (rawIds.length > 0) {
      const { data: rawData } = await supabase
        .from('raw_articles')
        .select('id, image_url')
        .in('id', rawIds)
        .not('image_url', 'is', null)

      const imageByRawId = new Map<string, string>()
      for (const row of (rawData ?? []) as RawArticleImageRow[]) {
        if (row.image_url) imageByRawId.set(row.id, row.image_url)
      }

      for (const ca of clusterArticles) {
        if (imageByCluster.has(ca.cluster_id)) continue
        const img = imageByRawId.get(ca.raw_article_id)
        if (img) imageByCluster.set(ca.cluster_id, img)
      }
    }
  }

  const articles: ArticleListItem[] = rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    content: r.content,
    published_at: r.published_at,
    cluster_id: r.cluster_id,
    imageUrl: r.cluster_id ? imageByCluster.get(r.cluster_id) ?? null : null,
    category: r.category,
    genre: r.genre,
  }))

  return { articles, error: null }
}

export default async function Home() {
  const { articles, error } = await loadArticles()
  const popular = articles.slice(0, 5)

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-10">
        <section>
          <h2 className="text-xl font-bold mb-5 pb-2 border-b-2 border-zinc-900">
            최신 기사
          </h2>

          {error && (
            <div className="p-4 border border-red-300 bg-red-50 rounded text-red-700 text-sm">
              기사를 불러오지 못했습니다: {error}
            </div>
          )}

          {!error && articles.length === 0 && (
            <p className="text-zinc-500 py-8">아직 발행된 기사가 없습니다.</p>
          )}

          <ul>
            {articles.map((article) => (
              <li key={article.id}>
                <Link
                  href={`/articles/${article.slug ?? article.id}`}
                  className="flex gap-4 py-5 border-b border-zinc-200 group"
                >
                  <div className="w-40 h-28 sm:w-48 sm:h-32 flex-shrink-0 overflow-hidden rounded bg-zinc-100">
                    {article.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={article.imageUrl}
                        alt=""
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xs text-zinc-400">
                        no image
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <CategoryBadges category={article.category} genre={article.genre} />
                    <h3 className="text-base sm:text-lg font-semibold leading-snug line-clamp-2 group-hover:underline">
                      {article.title}
                    </h3>
                    <p className="mt-1.5 text-sm text-zinc-600 line-clamp-2">
                      {article.content}
                    </p>
                    {article.published_at && (
                      <time className="mt-2 block text-xs text-zinc-500">
                        {formatDate(article.published_at)}
                      </time>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <aside className="lg:sticky lg:top-6 self-start">
          <h2 className="text-lg font-bold mb-4 pb-2 border-b-2 border-zinc-900">
            인기 기사
          </h2>
          {popular.length === 0 ? (
            <p className="text-sm text-zinc-500">표시할 기사가 없습니다.</p>
          ) : (
            <ol className="space-y-4">
              {popular.map((article, idx) => (
                <li key={article.id}>
                  <Link
                    href={`/articles/${article.slug ?? article.id}`}
                    className="flex gap-3 group"
                  >
                    <span className="text-xl font-bold text-zinc-300 w-6 flex-shrink-0 leading-tight">
                      {idx + 1}
                    </span>
                    <span className="text-sm font-medium leading-snug line-clamp-3 group-hover:underline">
                      {article.title}
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </aside>
      </div>
    </div>
  )
}

function CategoryBadges({
  category,
  genre,
}: {
  category?: string | null
  genre?: string | null
}) {
  if (!category && !genre) return null
  return (
    <div className="mb-1.5 flex flex-wrap items-center gap-1.5 text-xs">
      {category && (
        <span className="px-2 py-0.5 rounded bg-zinc-900 text-white font-medium">
          {category}
        </span>
      )}
      {genre && (
        <span className="px-2 py-0.5 rounded border border-zinc-300 text-zinc-700">
          {genre}
        </span>
      )}
    </div>
  )
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}
