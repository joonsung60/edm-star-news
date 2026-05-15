# EDM Star News - 현재 프로젝트 컨텍스트

이 문서는 프로젝트 상태를 웹 Claude/ChatGPT와 공유하기 위한 브리핑이다. 세부 구현을 전부 설명하기보다, 현재 구조와 중요한 판단을 빠르게 이해하는 것이 목적이다.

## 1. 프로젝트 목적

EDM/전자음악 관련 해외 소스(RSS, 개별 URL, SNS/포스터 이미지)를 바탕으로 한국어 EDM 뉴스 기사를 생성하고, 사람이 검토한 뒤 `edmstarnews.com`에 게시한다.

현재 기사 생성 경로는 두 가지다.

1. **RSS/URL 기반**
   - RSS 또는 URL로 원문 기사 수집
   - 자동 토픽 제안 또는 수동 클러스터 생성
   - 클러스터 기반 한국어 기사 초안 생성
   - 사람이 수정/삭제/게시

2. **이미지/SNS 기반**
   - SNS 캡처/포스터 이미지 1개 업로드
   - Vision LLM이 원본 전체 이미지를 분석
   - 분석 결과 확인
   - 선택적으로 기사 이미지 영역 크롭
   - 이미지 1개를 근거로 기사 초안 1개 생성
   - 사람이 수정/삭제/게시

## 2. 현재 아키텍처

### 로컬 어드민

- `npm run dev`로 로컬 Next.js 실행
- Next.js 16.2.6이며 dev/build 모두 webpack 사용
- `/admin`에서 수집, 분석, 기사 생성, 검토, 게시 수행
- Ollama는 로컬에서만 사용
- Supabase에 원문, 이미지 소스, 기사 초안, 게시 기사 저장
- `/admin/*`은 로컬에서 `proxy.ts`와 쿠키 세션으로 보호

### 공개 사이트

- `edmstarnews.com`
- Cloudflare Pages static export
- 공개 사이트는 Supabase에서 `articles.published = true` 기사만 빌드 타임에 읽어 정적 HTML로 생성
- 배포본에는 Ollama, API routes, proxy, admin UI가 없다
- 현재 `scripts/build-static.mjs`가 정적 빌드 전에 `app/admin`, `app/api`, `proxy.ts`를 stash로 제외한다

## 3. 기술 스택

- Next.js 16.2.6 App Router
- React 19
- Tailwind CSS
- Supabase PostgreSQL + Storage
- Ollama
- Cloudflare Pages static export
- `react-image-crop` (어드민 이미지 크롭 UI)

주의:

- Next.js 16에서는 `middleware.ts` 대신 `proxy.ts`를 사용한다.
- 동적 route handler의 `params`는 Promise다.
- 정적 export에서는 API route/proxy가 실행되지 않는다.
- Turbopack은 이 프로젝트의 static export에서 문제가 있어 `--webpack`을 사용한다.

## 4. 환경 변수

로컬 `.env.local`:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `OLLAMA_BASE_URL`
- `OLLAMA_MODEL` (일반 기사 생성 기본 모델. 미설정 시 코드 default는 `qwen3:14b`)
- `SUGGEST_MODEL` (자동 토픽 제안 전용. 미설정 시 `OLLAMA_MODEL`로 폴백)
- `ADMIN_PASSWORD`
- `CLOUDFLARE_DEPLOY_HOOK_URL`

Cloudflare Pages:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Cloudflare 배포본에는 `OLLAMA_BASE_URL`, `OLLAMA_MODEL`, `ADMIN_PASSWORD`가 필요 없다.

## 5. 주요 DB/Storage

### `rss_sources`

RSS 소스 목록.

### `raw_articles`

RSS/URL로 수집된 원문 기사.

주요 컬럼:

- `id`
- `title`
- `content`
- `url`
- `image_url`
- `source_id`
- `published_at`

### `article_clusters` / `cluster_articles`

RSS/URL 기사들을 토픽별로 묶는 클러스터 구조.

### `suggested_clusters`

자동 토픽 제안 저장 테이블.

`status`:

- `pending`: 검토 전
- `approved`: 승인 처리 중
- `rejected`: 거절
- `published`: 제안 승인 후 기사 초안 생성 완료

주의: 여기서 `published`는 공개 게시가 아니다. 공개 게시 여부는 `articles.published`.

### `articles`

생성된 한국어 기사.

주요 컬럼:

- `id`
- `title`
- `content`
- `cluster_id`
- `image_url`
- `published`
- `published_at`
- `updated_at`
- `created_at`
- `slug`
- `category`
- `genre`

이미지 우선순위:

1. `articles.image_url`
2. 없으면 `cluster_id → cluster_articles → raw_articles.image_url`
3. 없으면 본문 markdown 이미지

이미지/SNS 기반 기사는 `articles.image_url`에 직접 이미지가 저장된다.

### `image_sources`

이미지/SNS 기반 기사 생성을 위한 소스 테이블.

주요 컬럼:

- `id`
- `image_url`
- `image_path`
- `source_memo`
- `source_date`
- `extracted_text`
- `generated_article_id`
- `status`
- `created_at`

`generated_article_id`는 `articles.id`를 참조한다. 기사 삭제 시 참조를 `null`로 풀어야 한다. DB FK는 가능하면 `on delete set null` 권장.

### Supabase Storage

Bucket:

- `image-sources`

용도:

- 이미지/SNS 원본 저장
- 크롭된 기사용 이미지 저장
- 기사 이미지 교체용 이미지 저장

## 6. 주요 파일

### 공개 사이트

```txt
app/page.tsx
  공개 홈. published 기사 목록과 인기 기사 목록 표시.
  loadPublishedArticles()를 통해 articles.image_url 우선 썸네일 사용.

app/articles/[slug]/page.tsx
  기사 상세. slug 우선 조회, UUID fallback.
  본문 상단 이미지와 OG image 모두 articles.image_url 우선 사용.

app/category/[category]/page.tsx
app/genre/[genre]/page.tsx
  카테고리/장르별 기사 목록.

components/ArticleList.tsx
  공개 기사 목록 UI.

lib/articles.ts
  published 기사 로딩, 카테고리/장르 필터, 이미지 fallback 처리.
```

### 어드민

```txt
app/admin/page.tsx
  로컬 어드민 UI.
  두 그룹:
  - RSS 및 URL 기반 기사 생성
  - 이미지 소스 및 SNS 기반 기사 생성

app/admin/login/page.tsx
  어드민 로그인 UI.

app/api/admin/login/route.ts
  ADMIN_PASSWORD 검증, 쿠키 발급, IP 기반 실패 제한.

proxy.ts
  Next.js 16 proxy. 로컬 /admin 보호.

lib/admin-session.ts
  admin_session 쿠키 sign/verify.
```

### RSS/URL 파이프라인

```txt
app/api/collect/route.ts
  RSS 수집과 URL 직접 추가.

app/api/suggest-clusters/route.ts
  자동 토픽 제안. 엔터티 매칭 + LLM 가치 평가 구조.

app/api/suggest-clusters/[id]/route.ts
  제안 status/cluster_id PATCH.

app/api/cluster/route.ts
  수동/자동 클러스터 생성.

app/api/generate/route.ts
  클러스터 기반 한국어 기사 생성.

app/api/raw-articles/backfill-titles/route.ts
  과거 URL형 title 재추출/보정용.
```

### 이미지/SNS 파이프라인

```txt
app/api/image-sources/analyze/route.ts
  이미지 원본을 Storage에 저장하고 Vision LLM으로 전체 이미지 분석.
  모델은 현재 mistral-small3.2:24b.

app/api/image-sources/[id]/generate/route.ts
  image_sources.extracted_text 기반 기사 초안 생성.
  optional imageBase64가 있으면 크롭 이미지를 Storage에 저장 후 articles.image_url로 사용.
  없으면 원본 image_sources.image_url 사용.

app/api/image-sources/[id]/route.ts
  image_sources status 업데이트. 기각 등에 사용.

app/api/articles/[id]/image/route.ts
  생성 기사 검토 탭의 이미지 교체 API.
  새 이미지/크롭 이미지를 Storage에 저장하고 articles.image_url 업데이트.
```

### 배포/정적 파일

```txt
scripts/build-static.mjs
  public 정적 파일 생성 → app/admin, app/api, proxy.ts stash → next build --webpack → 복원.

scripts/generate-static-files.mjs
  sitemap.xml, robots.txt, llms.txt 생성.

next.config.ts
  BUILD_STATIC=1일 때 output:'export', trailingSlash, images.unoptimized 설정.
```

## 7. 어드민 UI 현재 구조

### 그룹 1: RSS 및 URL 기반 기사 생성

탭:

1. RSS 수집
2. URL 직접 추가
3. 자동 토픽 제안
4. 생성 기사 검토
5. 클러스터 수동
6. 기사 생성 수동

### 그룹 2: 이미지 소스 및 SNS 기반 기사 생성

탭:

1. 이미지 소스 추가
   - 이미지 업로드
   - 소스 메모/날짜 입력
   - Vision 분석
   - 분석 결과 미리보기
   - 선택적 크롭
   - 기사 초안 생성

2. 생성 기사 검토
   - 기존 검토 탭 재사용
   - 기사 수정/삭제/게시
   - 이미지 교체 지원

이미지 크롭은 `react-image-crop` 기반으로 클로드 코드가 안정화했다. 이전 직접 구현 cropper는 `RangeError: Maximum call stack size exceeded` 문제가 있어 폐기하는 방향이다.

## 8. Vision 분석 프롬프트

위치:

```txt
app/api/image-sources/analyze/route.ts
createVisionPrompt()
```

현재 구조:

1. 제외할 것: UI 잡음
   - 상태바, 좋아요/댓글 수, 재생 중 음악, 팔로우 버튼 등

2. 추출할 것: 기사화에 필요한 팩트
   - 아티스트명, 이벤트명, 날짜, 장소, 라인업, 캡션 핵심 문구 등

3. 주의사항
   - 계정명과 실제 아티스트명 구분
   - 이미지에 없는 연도 추측 금지
   - 대문자 디자인 표기 정규화
   - 불명확한 내용은 "불명확" 표시

4. 응답 형식
   - 항목별 추출 결과

중요한 정책:

- Vision 분석은 항상 크롭 전 원본 전체 이미지로 수행한다.
- 크롭은 기사 이미지 용도일 뿐 분석 입력에는 쓰지 않는다.
- `기사화 판단` 항목은 제거했다.

## 9. 기사 생성 정책

### RSS/URL 기반

`app/api/generate/route.ts`가 클러스터 원문들을 정제해 Ollama에 전달한다.

LLM 응답 필드:

- `title`
- `content`
- `slug`
- `category`
- `genre`

검증:

- 너무 짧은 기사 실패
- 한국어 비율 낮으면 실패
- Login/Search/Share/Previous article 등 원문 페이지 잡음이 있으면 실패
- 실패 시 1회 재시도

### 이미지/SNS 기반

`app/api/image-sources/[id]/generate/route.ts`가 Vision 분석 결과를 바탕으로 기사 초안을 만든다.

특징:

- 단일 이미지 소스 → 단일 기사 초안
- 토픽 제안/클러스터 과정을 거치지 않는다
- 크롭 이미지가 있으면 `articles.image_url`에 크롭 이미지 URL 저장
- 크롭하지 않으면 원본 이미지 URL 저장

### 공통 프롬프트 정책

`lib/prompts.ts`의 `SYSTEM_PROMPT_A`:

- 한국어 기사체
- 상대 날짜 표현 금지 (`오늘`, `어제`, `최근`, `며칠 전`)
- 날짜가 필요하면 소스의 구체 날짜만 사용
- 불명확하면 날짜 언급 생략
- 영어 고유명사는 영문 원문 유지가 기본
- 한국어 정착 표기만 예외적으로 허용
- 임의 한글 음역 금지

## 10. 자동 토픽 제안 정책

목표는 "한국어 EDM 뉴스 기사로 작성할 가치가 있는 raw article 후보"를 찾는 것.

현재 구조:

1. 코드 기반 후보 생성
   - `lib/edm-entities.json` 엔터티 사전 사용
   - 아티스트/페스티벌/레이블 매칭
   - 단독 기사 후보도 허용

2. LLM 가치 평가
   - 후보마다 Ollama 호출
   - 기사 가치가 있으면 topic/keywords 반환
   - 카테고리 단어, 매체명, 연도 단독, 인터뷰 시리즈명 등은 거절

현재 주의:

- raw article의 사용 여부를 추적하는 `is_used`류 컬럼은 없다.
- 같은 raw article이 반복 후보로 잡힐 수 있다.

## 11. Cloudflare 배포

Cloudflare Pages 설정:

- Build command: `npm run build:static`
- Output directory: `out`

배포 시:

- 공개 사이트 HTML만 생성
- `/admin` 없음
- `/api` 없음
- `proxy.ts` 없음

게시/수정/이미지 교체 시 로컬 API가 `CLOUDFLARE_DEPLOY_HOOK_URL`로 재빌드를 요청한다.

재빌드 트리거:

- 기사 게시: `/api/articles/[id]/publish`
- 게시 기사 수정: `/api/articles/[id]`
- 게시 기사 이미지 교체: `/api/articles/[id]/image`

## 12. 현재 완료된 것

- RSS/URL 수집
- 자동 토픽 제안
- 클러스터 기반 기사 생성
- 생성 기사 검토/수정/삭제/게시
- 게시 후 수정
- slug 기반 기사 URL
- category/genre 기반 공개 목록
- sitemap/robots/llms 정적 생성
- 이미지/SNS 기반 Vision 분석
- 이미지 소스 원본 Storage 저장
- 이미지 크롭 기반 기사 이미지 저장
- 생성 기사 검토 탭 이미지 교체
- `articles.image_url` 우선 썸네일/본문 이미지 사용

## 13. 남은 작업 / 주의점

- Vision 프롬프트는 계속 조정 중이다. 특히 SNS UI 잡음, 연도 추측, 라인업 누락 문제가 핵심.
- 이미지/SNS 기반 생성 결과의 품질 검증 로직은 아직 약하다.
- 이미지 원본/크롭 이미지 Storage 정리 정책이 없다.
- 게시 후 여러 번 수정하면 Cloudflare 빌드가 여러 번 트리거된다. debounce 없음.
- 배포본 `/admin`은 현재 제외 상태. 공개 사이트에 admin을 포함하려면 Cloudflare Access 같은 별도 보호 필요.
- 과거 테스트 기사/이미지/클러스터 정리 필요.
- 일부 RSS 소스는 계속 실패할 수 있고, JS 렌더링 의존 사이트는 본문 추출 품질이 낮다.

## 14. API 시그니처

로컬 어드민에서만 실행된다. Cloudflare 정적 배포본에는 포함되지 않는다. 모든 응답은 JSON이며, 에러는 `{ error: string }`이다.

### 인증

#### `POST /api/admin/login`

- Body: `{ password: string }`
- 응답: `{ ok: true }` + `Set-Cookie: admin_session=...`
- 401: 비밀번호 불일치 (`{ error, remaining }`)
- 429: 동일 IP에서 15분 내 5회 실패 (`{ error, retryAfter }`)

### 기사

#### `GET /api/articles`

- Query
  - `published`: `'true'` | `'false'` | 생략. `'true'`/`'false'` 이외 값은 무시.
  - `limit`: 기본 50, 최대 100.
- 정렬: `published=true`이면 `published_at DESC`, 그 외에는 `created_at DESC`.
- 응답: `{ articles: Article[] }`

#### `PATCH /api/articles/[id]`

- Body: `{ title: string, content: string, category?: string | null, genre?: string | null }`
- 검증: `title.length >= 4`, `content.length >= 80`
- 기사가 게시 상태(`published=true`)면 `CLOUDFLARE_DEPLOY_HOOK_URL`로 fire-and-forget 재빌드 트리거.
- 응답: `{ article }`

#### `DELETE /api/articles/[id]`

- 게시된 기사는 400 (`이 화면에서 삭제할 수 없습니다`).
- 연결된 `image_sources` 행이 있으면 `generated_article_id=null`, `status='analyzed'`로 푼 뒤 삭제.
- 응답: `{ deleted: true, article }`

#### `PATCH /api/articles/[id]/publish`

- Body 없음.
- `published=true`, `published_at=now()` 설정. deploy hook 트리거.
- 응답: `{ article }`

#### `PATCH /api/articles/[id]/image`

- Body: `{ imageBase64: string, mimeType?: 'image/jpeg' | 'image/png' }`
- `imageBase64`는 data URL(`data:image/jpeg;base64,...`) 또는 raw base64. 최대 길이 14MB.
- Storage `image-sources` 버킷의 `{year}/articles/{id}-{ts}.{ext}` 경로에 업로드 후 `articles.image_url` 갱신.
- 게시된 기사면 deploy hook 트리거.
- 응답: `{ article }`

### 수집 / 클러스터 / 생성

#### `POST /api/collect`

- Body: `{ urls?: string[] }`
  - `urls`가 있으면 URL 직접 추가 모드. 없으면 `rss_sources.is_active=true` 전체 RSS 수집.
- 응답: `{ success, collected: number, failures: { source, url, error }[] }`

#### `POST /api/cluster`

- Body: `{ topic: string, keywords?: string[], articleIds?: string[], matchMode?: 'or' | 'and' }`
- `articleIds`가 있으면 그 id들을 우선 사용. 없으면 `keywords`로 `raw_articles.title/content` ILIKE 검색 (최대 20개).
- 매칭 결과로 `article_clusters` 생성 + `cluster_articles` 연결.
- 응답: `{ success, clusterId, matchMode, matched, articles: { title, url }[] }`

#### `POST /api/generate`

- Body: `{ clusterIds: string[] }`
- 각 클러스터의 raw 기사 본문을 정제해 Ollama로 한국어 기사 생성. 검증 실패 시 1회 재시도. `articles`에 `published=false`로 저장.
- 응답: `{ results: { success, clusterId, article?, error? }[] }`

#### `GET /api/cron`, `POST /api/cron`

- Header: `CRON_SECRET` 환경변수가 설정되어 있으면 `Authorization: Bearer ${CRON_SECRET}` 필요. 미설정 시 인증 없음.
- 내부적으로 `/api/collect`를 POST 호출.
- 응답: `{ ok, startedAt, finishedAt, collected, error }`

### 자동 토픽 제안 / 차단

#### `GET /api/suggest-clusters`

- Query: `status?` (`pending` | `approved` | `rejected` | `published`)
- 응답: `{ suggestions: PersistedSuggestion[] }` (각 제안에 raw 기사 메타 hydrate 포함)

#### `POST /api/suggest-clusters`

- Body: `{ limit?: number }` (기본 200, 최대 200)
- 흐름: 엔터티 사전 매칭으로 후보 클러스터 생성 → 후보별 LLM 승인 → 중복/블록리스트 필터 → `suggested_clusters`에 `status='pending'`으로 저장.
- 사전 로드 실패 시 단일 LLM 경로(`runLlmOnlyPath`)로 fallback.
- 응답: `{ suggestions, saved, total, source: 'entity+llm' | 'llm', model, candidateCount?, candidateReviewCount?, approvedCount?, normalizedSuggestionCount, duplicateSkipCount? }`

#### `PATCH /api/suggest-clusters/[id]`

- Body: `{ status?: 'pending' | 'approved' | 'rejected' | 'published', clusterId?: string | null }`
- 응답: `{ suggestion }`

#### `GET /api/topic-suggestion-blocklist`

- 응답: `{ rules: { id, pattern, reason, enabled, created_at }[] }`

#### `POST /api/topic-suggestion-blocklist`

- Body: `{ pattern: string, reason?: string }` (저장 시 `enabled=true`)
- 응답: `{ rule }`

#### `PATCH /api/topic-suggestion-blocklist`

- Body: `{ id: string, enabled?: boolean, reason?: string | null }`
- 응답: `{ rule }`

#### `DELETE /api/topic-suggestion-blocklist?id=...`

- 응답: `{ success: true }`

### 이미지 / SNS 파이프라인

#### `POST /api/image-sources/analyze`

- Body: `{ imageBase64: string, fileName?: string, mimeType?: 'image/jpeg' | 'image/png', sourceMemo?: string, sourceDate?: 'YYYY-MM-DD' }`
- 흐름: 원본 이미지를 Storage `{year}/{uuid}/original.{ext}`에 업로드 → Vision LLM(`mistral-small3.2:24b`)으로 전체 이미지 분석 → `image_sources` 행 생성 (`status='analyzed'`).
- 응답: `{ imageSource, extractedText, imageUrl }`

#### `POST /api/image-sources/[id]/generate`

- Body: `{ imageBase64?: string, mimeType?: 'image/jpeg' | 'image/png' }`
- `imageBase64`가 있으면 크롭 이미지를 Storage `{year}/{sourceId}/article-{ts}.{ext}`에 업로드해 `articles.image_url`로 사용. 없으면 `image_sources.image_url` 그대로 사용.
- `image_sources.extracted_text` 기반으로 Ollama 한국어 기사 생성. `articles`에 `published=false`로 저장 + `image_sources.generated_article_id` 설정, `status='draft_created'`.
- 이미 `generated_article_id`가 살아 있으면 400. 사라진 참조면 자동으로 풀고 진행.
- 응답: `{ article }`

#### `PATCH /api/image-sources/[id]`

- Body: `{ status: 'analyzed' | 'draft_created' | 'rejected' }`
- 응답: `{ imageSource }`

### 운영 유틸

#### `POST /api/raw-articles/backfill-titles`

- Body: `{ dryRun?: boolean, limit?: number }` (기본 `dryRun=true`, `limit=30`, 최대 100)
- URL 형태로 저장된 `raw_articles.title`을 다시 가져온 HTML에서 재추출. `dryRun=true`면 변경 없이 미리보기.
- 응답: `{ dryRun, checked, updatable, results: { id, url, oldTitle, newTitle, updated, wouldUpdate?, error? }[] }`

### 공통 사항

- `cluster_id` 등 동적 segment의 `params`는 Next.js 16 규약대로 Promise.
- Deploy hook을 트리거하는 엔드포인트: `PATCH /api/articles/[id]`(게시 기사일 때), `PATCH /api/articles/[id]/publish`, `PATCH /api/articles/[id]/image`(게시 기사일 때). 모두 fire-and-forget. 디바운스 없음.
