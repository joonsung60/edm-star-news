import Link from 'next/link'
import type { ArticleListItem } from '@/lib/articles'
import { PopularList } from '@/components/ArticleList'
import { loadPublishedArticles } from '@/lib/articles'

const CATEGORY_BADGE: Record<string, string> = {
  '페스티벌': 'bg-orange-500 text-white',
  '릴리즈': 'bg-emerald-600 text-white',
  '뉴스': 'bg-blue-600 text-white',
}

export default async function Home() {
  const { articles, error } = await loadPublishedArticles({ limit: 20 })
  const popular = articles.slice(0, 5)
  const hero = articles[0]
  const subHeroes = articles.slice(1, 3)
  const latest = articles.slice(3)

  return (
    <div className="max-w-[1280px] mx-auto px-4 md:px-6 lg:px-8 py-8">
      {error ? (
        <div className="p-4 border border-red-300 bg-red-50 text-red-700 text-sm">
          기사를 불러오지 못했습니다: {error}
        </div>
      ) : articles.length === 0 ? (
        <p className="text-gray-500 py-8">아직 발행된 기사가 없습니다.</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-10">
          <section className="min-w-0">
            {hero && <OverlayArticleCard article={hero} size="hero" />}

            {subHeroes.length > 0 && (
              <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-6">
                {subHeroes.map((article) => (
                  <OverlayArticleCard key={article.id} article={article} size="sub" />
                ))}
              </div>
            )}

            {latest.length > 0 && (
              <section className="mt-10">
                <SectionTitle>최신 기사</SectionTitle>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {latest.map((article) => (
                    <ArticleGridCard key={article.id} article={article} />
                  ))}
                </div>
              </section>
            )}
          </section>

          <aside className="lg:sticky lg:top-32 self-start">
            <SectionTitle>인기 기사</SectionTitle>
            <PopularList articles={popular} />
          </aside>
        </div>
      )}
    </div>
  )
}

function OverlayArticleCard({
  article,
  size,
}: {
  article: ArticleListItem
  size: 'hero' | 'sub'
}) {
  return (
    <Link
      href={articleHref(article)}
      className={`group relative block overflow-hidden bg-gray-900 ${
        size === 'hero' ? 'aspect-[16/9] sm:aspect-[2/1]' : 'aspect-[16/10]'
      }`}
    >
      {article.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={article.imageUrl}
          alt=""
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-xs font-bold uppercase tracking-widest text-gray-500">
          EDM Star News
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-4 sm:p-6">
        <CategoryBadge category={article.category} />
        <h2
          className={`mt-3 font-black leading-tight text-white transition-colors group-hover:text-blue-200 ${
            size === 'hero'
              ? 'text-3xl sm:text-4xl md:text-5xl lg:text-6xl'
              : 'text-xl sm:text-2xl'
          }`}
        >
          {article.title}
        </h2>
        {article.published_at && (
          <time className="mt-3 block text-xs text-gray-200">
            {formatDate(article.published_at)}
          </time>
        )}
      </div>
    </Link>
  )
}

function ArticleGridCard({ article }: { article: ArticleListItem }) {
  return (
    <article className="group">
      <Link href={articleHref(article)} className="block">
        <div className="relative aspect-[16/9] overflow-hidden bg-gray-900">
          {article.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={article.imageUrl}
              alt=""
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs font-bold uppercase tracking-widest text-gray-500">
              EDM Star News
            </div>
          )}
          <CategoryBadge category={article.category} />
        </div>
        <div className="pt-3">
          <h2 className="text-lg sm:text-xl font-bold leading-snug transition-colors group-hover:text-[#0052D4]">
            {article.title}
          </h2>
          {article.published_at && (
            <time className="mt-1 block text-xs text-gray-500">
              {formatDate(article.published_at)}
            </time>
          )}
        </div>
      </Link>
    </article>
  )
}

function CategoryBadge({ category }: { category?: string | null }) {
  if (!category) return null

  return (
    <span
      className={`inline-block px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider ${
        CATEGORY_BADGE[category] ?? 'bg-gray-800 text-white'
      }`}
      style={{ fontFamily: 'var(--font-display), sans-serif' }}
    >
      {category}
    </span>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-6 border-b-2 border-black pb-2">
      <h2
        className="text-sm font-bold tracking-[0.2em] uppercase"
        style={{ fontFamily: 'var(--font-display), sans-serif' }}
      >
        {children}
      </h2>
    </div>
  )
}

function articleHref(article: ArticleListItem) {
  return `/articles/${article.slug ?? article.id}`
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}
