'use client'

import { useState } from 'react'

type Tab = 'collect' | 'add-urls' | 'suggest' | 'cluster' | 'generate'

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<Tab>('collect')

  return (
    <div className="max-w-4xl mx-auto p-8">
      <h1 className="text-2xl font-bold mb-8">EDM Star News 어드민</h1>

      {/* 탭 */}
      <div className="flex gap-2 mb-8 border-b">
        {[
          { id: 'collect', label: '① RSS 수집' },
          { id: 'add-urls', label: '② URL 직접 추가' },
          { id: 'suggest', label: '③ 자동 토픽 제안' },
          { id: 'cluster', label: '④ 클러스터 (수동)' },
          { id: 'generate', label: '⑤ 기사 생성 (수동)' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as Tab)}
            className={`px-4 py-2 font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-black text-black'
                : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 탭 컨텐츠 */}
      {activeTab === 'collect' && <CollectTab />}
      {activeTab === 'add-urls' && <AddUrlsTab />}
      {activeTab === 'suggest' && <SuggestTab />}
      {activeTab === 'cluster' && <ClusterTab />}
      {activeTab === 'generate' && <GenerateTab />}
    </div>
  )
}

function CollectTab() {
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<string>('')

  const handleCollect = async () => {
    setIsLoading(true)
    setResult('')
    try {
      const res = await fetch('/api/collect', { method: 'POST' })
      const data = await res.json()
      setResult(`수집 완료: ${data.collected}개 기사 저장됨`)
    } catch {
      setResult('오류가 발생했습니다.')
    }
    setIsLoading(false)
  }

  return (
    <div>
      <p className="text-gray-600 mb-6">32개 RSS 소스에서 새 기사를 수집합니다.</p>
      <button
        onClick={handleCollect}
        disabled={isLoading}
        className="px-6 py-3 bg-black text-white rounded font-semibold disabled:opacity-50"
      >
        {isLoading ? '수집 중...' : 'RSS 수집 실행'}
      </button>
      {result && <p className="mt-4 text-green-600">{result}</p>}
    </div>
  )
}

function AddUrlsTab() {
  const [urls, setUrls] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<string>('')

  const handleAdd = async () => {
    const urlList = urls.split('\n').map(u => u.trim()).filter(u => u.length > 0)
    if (urlList.length === 0) return

    setIsLoading(true)
    setResult('')
    try {
      const res = await fetch('/api/collect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: urlList }),
      })
      const data = await res.json()
      setResult(`${data.collected}개 기사가 DB에 추가됐습니다.`)
      setUrls('')
    } catch {
      setResult('오류가 발생했습니다.')
    }
    setIsLoading(false)
  }

  return (
    <div>
      <p className="text-gray-600 mb-4">URL을 한 줄에 하나씩 붙여넣으세요.</p>
      <textarea
        className="w-full h-48 p-4 border rounded font-mono text-sm mb-4"
        placeholder="https://mixmag.net/article/...&#10;https://ra.co/articles/..."
        value={urls}
        onChange={(e) => setUrls(e.target.value)}
      />
      <button
        onClick={handleAdd}
        disabled={isLoading}
        className="px-6 py-3 bg-black text-white rounded font-semibold disabled:opacity-50"
      >
        {isLoading ? '추가 중...' : 'URL 추가'}
      </button>
      {result && <p className="mt-4 text-green-600">{result}</p>}
    </div>
  )
}

function ClusterTab() {
  const [topic, setTopic] = useState('')
  const [keywords, setKeywords] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<string>('')

  const handleCluster = async () => {
    if (!topic) return
    setIsLoading(true)
    setResult('')
    try {
      const res = await fetch('/api/cluster', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic,
          keywords: keywords.split(',').map(k => k.trim()).filter(k => k.length > 0),
          matchMode: 'or',
        }),
      })
      const data = await res.json()
      setResult(`클러스터 생성 완료: ${data.clusterId} (${data.matched}개 기사 매칭)`)
      setTopic('')
      setKeywords('')
    } catch {
      setResult('오류가 발생했습니다.')
    }
    setIsLoading(false)
  }

  return (
    <div>
      <p className="text-gray-600 mb-6">토픽과 키워드를 입력하면 관련 기사들을 자동으로 묶습니다.</p>
      <input
        className="w-full p-3 border rounded mb-4"
        placeholder="토픽 (예: Martin Garrix 2026 신곡 발표)"
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
      />
      <input
        className="w-full p-3 border rounded mb-4"
        placeholder="키워드 (쉼표로 구분, 예: Martin Garrix, STMPD, new single)"
        value={keywords}
        onChange={(e) => setKeywords(e.target.value)}
      />
      <button
        onClick={handleCluster}
        disabled={isLoading}
        className="px-6 py-3 bg-black text-white rounded font-semibold disabled:opacity-50"
      >
        {isLoading ? '클러스터 생성 중...' : '클러스터 생성'}
      </button>
      {result && <p className="mt-4 text-green-600">{result}</p>}
    </div>
  )
}

type Suggestion = {
  topic: string
  keywords: string[]
  articleIds: string[]
  reason?: string
  commonEntities?: string[]
  cohesionScore?: number
  articles: { id: string; title: string; url: string }[]
}

type ApprovalResult = { state: 'pending' | 'success' | 'error'; message: string }

type GenerateResult = {
  success: boolean
  article?: {
    title: string
    content: string
  }
  error?: string
}

function SuggestTab() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [analyzed, setAnalyzed] = useState<number | null>(null)
  const [suggestionSource, setSuggestionSource] = useState<'llm' | 'fallback' | null>(null)
  const [approving, setApproving] = useState<number | null>(null)
  const [results, setResults] = useState<Record<number, ApprovalResult>>({})

  const handleSuggest = async () => {
    setIsLoading(true)
    setError('')
    setSuggestions([])
    setResults({})
    setAnalyzed(null)
    setSuggestionSource(null)
    try {
      const res = await fetch('/api/suggest-clusters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json()
      if (data.error) {
        setError(data.error)
      } else {
        setSuggestions(data.suggestions ?? [])
        setAnalyzed(data.total ?? null)
        setSuggestionSource(data.source ?? null)
      }
    } catch {
      setError('오류가 발생했습니다.')
    }
    setIsLoading(false)
  }

  const handleApprove = async (idx: number) => {
    const s = suggestions[idx]
    setApproving(idx)
    setResults((r) => ({ ...r, [idx]: { state: 'pending', message: '클러스터 생성 중...' } }))

    try {
      const clusterRes = await fetch('/api/cluster', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: s.topic, keywords: s.keywords, articleIds: s.articleIds }),
      })
      const clusterData = await clusterRes.json()
      if (!clusterData.success) {
        setResults((r) => ({
          ...r,
          [idx]: { state: 'error', message: clusterData.error ?? '클러스터 생성 실패' },
        }))
        setApproving(null)
        return
      }

      setResults((r) => ({
        ...r,
        [idx]: { state: 'pending', message: `클러스터 생성됨 (${clusterData.matched}개 매칭). 기사 생성 중...` },
      }))

      const genRes = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clusterIds: [clusterData.clusterId] }),
      })
      const genData = await genRes.json()
      const result = genData.results?.[0]

      if (result?.success) {
        setResults((r) => ({
          ...r,
          [idx]: { state: 'success', message: `완료: ${result.article.title}` },
        }))
      } else {
        setResults((r) => ({
          ...r,
          [idx]: { state: 'error', message: result?.error ?? '기사 생성 실패' },
        }))
      }
    } catch (err) {
      setResults((r) => ({ ...r, [idx]: { state: 'error', message: String(err) } }))
    }
    setApproving(null)
  }

  return (
    <div>
      <p className="text-gray-600 mb-6">
        최근 미사용 raw 기사를 LLM이 분석해 토픽 그룹을 제안합니다. 카드의 “승인 & 기사 생성”을 누르면 클러스터 생성과 한국어 기사 생성이 자동으로 이어집니다.
      </p>
      <button
        onClick={handleSuggest}
        disabled={isLoading}
        className="px-6 py-3 bg-black text-white rounded font-semibold disabled:opacity-50"
      >
        {isLoading ? '분석 중...' : '토픽 제안 받기'}
      </button>

      {analyzed !== null && !isLoading && (
        <p className="mt-4 text-sm text-gray-500">
          {analyzed}개 기사 분석 → {suggestions.length}개 토픽 제안
          {suggestionSource === 'fallback' && ' (자동 보정)'}
          {suggestionSource === 'llm' && ' (LLM)'}
        </p>
      )}

      {error && <p className="mt-4 text-red-500">{error}</p>}

      {suggestions.length > 0 && (
        <div className="mt-8 space-y-4">
          {suggestions.map((s, idx) => {
            const result = results[idx]
            const done = result?.state === 'success'
            return (
              <div key={idx} className="border rounded p-4">
                <div className="flex items-start justify-between gap-4 mb-3">
	                  <div className="flex-1 min-w-0">
  	                    <h3 className="font-semibold text-lg">{s.topic}</h3>
	                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
	                      {typeof s.cohesionScore === 'number' && (
	                        <span className="font-medium text-gray-700">응집도 {s.cohesionScore}</span>
	                      )}
	                      {s.commonEntities && s.commonEntities.length > 0 && (
	                        <span>공통 근거: {s.commonEntities.join(', ')}</span>
	                      )}
	                    </div>
	                    <div className="flex flex-wrap gap-1 mt-2">
	                      {s.keywords.map((k) => (
	                        <span key={k} className="px-2 py-0.5 text-xs bg-gray-100 rounded">
                          {k}
                        </span>
                      ))}
                    </div>
                  </div>
                  <button
                    onClick={() => handleApprove(idx)}
                    disabled={approving !== null || done}
                    className="px-4 py-2 bg-black text-white text-sm rounded font-semibold disabled:opacity-50 whitespace-nowrap"
                  >
                    {approving === idx ? '처리 중...' : done ? '완료' : '승인 & 기사 생성'}
	                  </button>
	                </div>
	                {s.reason && <p className="mb-3 text-sm text-gray-600">{s.reason}</p>}

	                <details className="mt-2">
                  <summary className="text-sm text-gray-500 cursor-pointer">
                    매칭된 기사 {s.articles.length}개
                  </summary>
                  <ul className="mt-2 text-sm text-gray-600 space-y-1">
                    {s.articles.map((a) => (
                      <li key={a.id} className="truncate">
                        ・{' '}
                        <a
                          href={a.url}
                          target="_blank"
                          rel="noreferrer"
                          className="hover:underline"
                        >
                          {a.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                </details>

                {result && (
                  <p
                    className={`mt-3 text-sm ${
                      result.state === 'success'
                        ? 'text-green-600'
                        : result.state === 'error'
                        ? 'text-red-500'
                        : 'text-gray-500'
                    }`}
                  >
                    {result.message}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function GenerateTab() {
  const [clusterId, setClusterId] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<GenerateResult | null>(null)

  const handleGenerate = async () => {
    if (!clusterId) return
    setIsLoading(true)
    setResult(null)
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clusterIds: [clusterId] }),
      })
      const data = await res.json()
      setResult(data.results[0])
    } catch {
      setResult({ success: false, error: '오류가 발생했습니다.' })
    }
    setIsLoading(false)
  }

  return (
    <div>
      <p className="text-gray-600 mb-6">클러스터 ID를 입력하면 한국어 종합 기사를 생성합니다.</p>
      <input
        className="w-full p-3 border rounded mb-4"
        placeholder="클러스터 ID (UUID)"
        value={clusterId}
        onChange={(e) => setClusterId(e.target.value)}
      />
      <button
        onClick={handleGenerate}
        disabled={isLoading}
        className="px-6 py-3 bg-black text-white rounded font-semibold disabled:opacity-50"
      >
        {isLoading ? '생성 중...' : '기사 생성'}
      </button>
      {result && (
        <div className={`mt-6 p-4 rounded border ${result.success ? 'border-green-400' : 'border-red-400'}`}>
          {result.success ? (
            <>
              <p className="font-bold text-lg">{result.article?.title}</p>
              <p className="text-gray-600 mt-2">{result.article?.content}</p>
            </>
          ) : (
            <p className="text-red-500">{result.error}</p>
          )}
        </div>
      )}
    </div>
  )
}
