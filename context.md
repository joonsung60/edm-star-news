# EDM Star News Korea - 프로젝트 컨텍스트

## 프로젝트 개요
EDM 관련 영문 매체의 RSS/URL 원문을 수집하고, 관련 기사들을 사건/릴리즈/행사/인물 단위로 묶은 뒤 로컬 Ollama + Qwen3:14b로 한국어 종합 기사를 생성하는 뉴스 사이트.

현재 운영 원칙은 명확하다.

- 기사 수집, 토픽 제안, 클러스터링, 기사 생성, 검토, 게시는 로컬 어드민에서 수행한다.
- 공개 뉴스 사이트는 Cloudflare Pages 정적 export로 배포한다.
- 공개 사이트는 Supabase의 `published=true` 기사만 빌드 타임에 읽어 HTML로 만든다.
- 배포본에는 API 라우트와 proxy가 없다. Ollama도 사용하지 않는다.

## 기술 스택
- Next.js 16.2.6 App Router
- React 19
- Supabase PostgreSQL
- Ollama `qwen3:14b` (Windows에서 실행, WSL에서 `http://172.25.224.1:11434` 접근)
- Cloudflare Pages 정적 export (`out/`)

> Next.js 16 주의: `middleware.ts`는 deprecated이고 `proxy.ts`를 사용한다. 동적 route handler의 `params`는 Promise다.

## 핵심 DB 테이블
- `rss_sources`: RSS 피드 소스 목록
- `raw_articles`: 수집 원문 기사
  - 주요 컬럼: `id`, `title`, `content`, `url`, `image_url`, `source_id`, `author`, `published_at`, `is_used`
- `article_clusters`: 토픽별 기사 묶음
  - 주요 컬럼: `id`, `topic`, `keywords`
- `cluster_articles`: 클러스터와 원문 기사 연결
  - 주요 컬럼: `cluster_id`, `raw_article_id`
- `articles`: 생성된 한국어 기사
  - 주요 컬럼: `id`, `title`, `content`, `cluster_id`, `published`, `published_at`, `created_at`
  - 추가 계획: `slug`, `category`, `genre`, `tags`
- `suggested_clusters`: 자동 토픽 제안 저장
  - 현재 코드가 실제 사용하는 컬럼: `id`, `topic`, `keywords`, `article_ids`, `status`, `cluster_id`, `created_at`
  - `status`: `pending` | `approved` | `rejected` | `published`
  - 여기서 `published`는 공개 게시가 아니라 "제안 승인 후 기사 생성까지 완료됨" 의미다.
  - `article_id`, `reason`, `common_entities`, `cohesion_score` 컬럼은 현재 저장 경로에서 사용하지 않는다.

## 주요 파일
```txt
proxy.ts
  로컬 /admin/* 보호. Next.js 16 proxy. 정적 export에서는 제외된다.

next.config.ts
  BUILD_STATIC=1일 때만 output:'export', trailingSlash:true, images.unoptimized:true.

scripts/build-static.mjs
  Cloudflare Pages용 빌드 스크립트.
  app/api와 proxy.ts를 .cf-build-stash로 임시 이동하고,
  BUILD_STATIC=1 npx next build --webpack 실행 후 복원한다.

app/page.tsx
  공개 홈. published=true 기사 최대 20개를 published_at desc로 표시.
  기사 썸네일은 cluster_id -> cluster_articles -> raw_articles.image_url에서 첫 이미지를 가져온다.

app/layout.tsx
  EDM Star News 공통 헤더와 더미 네비게이션.

app/articles/[id]/page.tsx
  공개 기사 상세. generateStaticParams로 published=true 기사 id만 정적 생성.

app/admin/page.tsx
  로컬 어드민 UI. 6개 탭.

app/admin/login/page.tsx
  로컬 어드민 로그인 폼.

app/api/admin/login/route.ts
  ADMIN_PASSWORD 검증, 24시간 HMAC 쿠키 발급, IP별 실패 5회 시 15분 차단.

app/api/collect/route.ts
  RSS 수집 + URL 직접 추가. 제목/본문/이미지 추출.

app/api/suggest-clusters/route.ts
  최근 미사용 raw_articles를 LLM으로 분석해 suggested_clusters에 pending 저장.

app/api/suggest-clusters/[id]/route.ts
  suggested_clusters status/cluster_id PATCH.

app/api/cluster/route.ts
  articleIds 또는 keywords 기반 클러스터 생성. matchMode or/and 지원.

app/api/generate/route.ts
  클러스터 원문을 Qwen3:14b에 넘겨 한국어 기사 생성.

app/api/articles/route.ts
  생성 기사 목록 조회. published 필터 지원.

app/api/articles/[id]/route.ts
  게시 전 초안 PATCH 수정, DELETE 삭제. published=true 기사는 수정/삭제 차단.

app/api/articles/[id]/publish/route.ts
  published=true, published_at=now() 업데이트 후 Cloudflare deploy hook 비동기 호출.

app/api/cron/route.ts
  CRON_SECRET 기반 스케줄러 엔드포인트. 기사 생성은 하지 않고 RSS 수집용.

lib/article-extraction.ts
  HTML 본문/제목/이미지 추출 및 cleanArticleText 정제.

lib/prompts.ts
  기사 생성 시스템 프롬프트. 상대 날짜 표현 금지 규칙 포함.

lib/source-tiers.ts
  소스 Tier 정의와 getSourceTier(), isAllTierC().

supabase-planned-migrations.sql
  아직 적용 전/검토용 SQL. 일부 내용은 현재 코드 방향과 혼재 가능성이 있으므로 적용 전 재검토 필요.
```

## 로컬 어드민 워크플로우
1. **① RSS 수집**
   - 등록 RSS 소스에서 새 기사 수집
   - 실패 소스는 UI에 표시

2. **② URL 직접 추가**
   - URL을 여러 줄로 붙여넣어 직접 원문 수집
   - 수집 시 실제 HTML에서 제목/본문/이미지 재추출

3. **③ 자동 토픽 제안**
   - 최근 미사용 `raw_articles` 최대 100개를 LLM에 전달
   - LLM이 같은 사건/릴리즈/행사/인물/제품 단위 후보만 제안
   - `suggested_clusters`에 `pending` 저장
   - 액션:
     - `승인 & 기사 생성`: status approved -> `/api/cluster` -> `/api/generate` -> status published
     - `거절`: status rejected
   - 실패 시 status를 pending으로 롤백

4. **④ 생성 기사 검토**
   - `articles.published=false` 초안을 검토
   - 게시 전 제목/본문 수정 가능
   - 게시 전 삭제 가능
   - `게시` 클릭 시 `published=true`, `published_at=now()`로 변경하고 Cloudflare deploy hook 호출

5. **⑤ 클러스터 (수동)**
   - 토픽/키워드로 수동 클러스터 생성
   - 자동 제안 실패 시 백업 경로

6. **⑥ 기사 생성 (수동)**
   - 클러스터 ID를 직접 넣어 기사 생성
   - 자동 플로우 실패 시 백업 경로

## 자동 토픽 제안 현재 정책
- LLM 프롬프트는 "카테고리 묶음 금지"와 "같은 사건/릴리즈/행사/인물/제품만"을 강하게 요구한다.
- 매체명, 사이트명, 연도 단독, `catches up with`, `chats to`, 연말 결산/차트/베스트 목록 표현은 클러스터 기준으로 금지한다.
- 응집도 최소 기준은 `40`.
- 기본 분석 기사 수는 `100`, 요청 body의 `limit`으로 최대 `150`까지 허용한다.
- Tier C 기사는 LLM 입력에서 제외하지 않는다.
- 단, 최종 후보가 Tier C 소스만으로 구성되면 저장 전에 차단한다.
- 현재 `suggest-clusters`는 fallback 후보 생성을 쓰지 않고 LLM 결과만 저장한다.
- `suggest-clusters`는 `lib/source-tiers.ts`의 `getSourceTier()` / `isAllTierC()`를 사용한다.

## 기사 생성 현재 정책
- `/api/generate`는 클러스터에 연결된 raw_articles 원문을 정제해 LLM에 전달한다.
- LLM 입력에는 `발행일`, `제목`, `내용`, `원문 URL`, `매체`, `소스 등급`이 포함된다.
- 생성 프롬프트에는 한국어 작성과 상대 날짜 표현 금지 규칙이 들어 있다.
- 생성 결과는 한글 비율과 원문 잡음 패턴을 검사한다.
- 현재 `/api/generate`의 소스 Tier 조회는 아직 `rss_sources.tier` 컬럼을 우선 시도하고, 실패하면 unknown으로 fallback한다.
- 따라서 소스 Tier 기준을 완전히 코드 파일로 단일화하려면 `/api/generate`도 `lib/source-tiers.ts` 사용으로 정리해야 한다.

## Cloudflare Pages 배포 아키텍처
### 핵심 원칙
로컬 파이프라인과 공개 뉴스 사이트를 분리한다.

### 로컬
- `npm run dev`
- `/admin`과 `/api/*` 전체 기능 사용
- Ollama 사용
- Supabase 쓰기 작업 수행
- 게시 시 Cloudflare deploy hook 호출

### Cloudflare Pages
- `npm run build:static`
- 출력 디렉토리: `out`
- 정적 HTML/CSS/JS만 배포
- `app/api`와 `proxy.ts`는 빌드 중 제외되므로 배포본에는 API가 없다.
- `app/admin`은 현재 stash 대상이 아니므로 정적 페이지로 배포될 수 있다. 하지만 API가 없어서 기능은 동작하지 않는다.
- 정적 export에는 proxy 인증이 적용되지 않는다. 배포본 `/admin` 노출을 막으려면 Cloudflare Access 또는 build script에서 `app/admin`도 제외하는 조치가 필요하다.

### Cloudflare Pages 대시보드 설정
- Build command: `npm run build:static`
- Build output directory: `out`
- Environment variables:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Cloudflare에는 필요 없음:
  - `OLLAMA_BASE_URL`
  - `ADMIN_PASSWORD`
  - `CLOUDFLARE_DEPLOY_HOOK_URL`
  - `BUILD_STATIC`

### 자동 재빌드 흐름
1. 로컬 어드민에서 기사 게시
2. `/api/articles/[id]/publish`가 Supabase 업데이트
3. 같은 API가 `CLOUDFLARE_DEPLOY_HOOK_URL`로 fire-and-forget POST
4. Cloudflare Pages가 다시 빌드
5. `app/page.tsx`와 `app/articles/[id]/page.tsx`가 published 기사만 정적 생성

## 환경 변수
### 로컬 `.env.local`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `OLLAMA_BASE_URL=http://172.25.224.1:11434`
- `ADMIN_PASSWORD`
- `CLOUDFLARE_DEPLOY_HOOK_URL`
- `CRON_SECRET` 선택

### Cloudflare Pages
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## 소스 Tier 관리
현재 의사결정 방향은 DB 컬럼보다 `lib/source-tiers.ts`를 기준으로 삼는 것이다.

### Tier A: 기사 생성 핵심 근거
- Mixmag
- DJ Mag
- The Quietus
- Crack Magazine
- Ransom Note
- 5 Magazine
- 909originals
- Create Digital Music
- Groove Magazine (DE)
- Tsugi (FR)
- Attack Magazine
- Bandcamp Daily

### Tier B: 뉴스 감지/보조
- Electronic Groove
- When We Dip
- Data Transmission
- Decoded Magazine
- Synthtopia
- DJ TechTools
- FAZEmag (DE)
- EDM Identity
- Inverted Audio

### Tier C: 단독 기사 생성 금지
- EDM Sauce
- EDMTunes
- We Rave You
- EDM Maniac
- RaverRafting
- By The Wavs
- The Nocturnal Times

### Manual: RSS 불안정, 수동 URL ingest 중심
- Resident Advisor
- Beatportal

## 아직 혼재된 부분 / 주의
- `suggest-clusters`는 `lib/source-tiers.ts`를 사용한다.
- `generate`는 아직 `rss_sources.tier` DB 컬럼을 우선 읽는다.
- `supabase-planned-migrations.sql`에는 `rss_sources.tier/source_type/language/region` 추가 SQL이 남아 있다.
- 그러므로 "Tier는 코드 파일만 쓴다"로 확정하려면 SQL 파일에서 RSS Tier 컬럼 추가/업데이트 섹션을 제거하거나 주석 처리하고, `/api/generate`를 `lib/source-tiers.ts`로 맞춰야 한다.
- 반대로 DB Tier를 유지하기로 하면 `lib/source-tiers.ts`와 DB 값의 싱크 정책을 정해야 한다.

## 콘텐츠 모델 확장 계획
### URL Slug
- 현재: `/articles/[uuid]`
- 목표: `/articles/[영문-slug]`
- 필요 작업:
  - `articles.slug` 컬럼 추가
  - 기사 생성 시 slug 생성
  - 상세 라우트 변경 또는 uuid/slug 병행

### 카테고리/네비게이션
- 현재 메뉴는 더미: 홈 | 페스티벌 | 아티스트 | 신보 | 장르별 | 국가별
- 기사 20~30개 누적 후 카테고리 체계 결정
- 필요 컬럼: `category`, `genre`, `tags`
- 필요 작업:
  - 기사 생성 시 category/genre/tags 추출
  - 공개 목록/상세에서 뱃지 표시
  - 메뉴 필터 페이지 구현

### 발행 후 수정
- 현재 게시 전 초안 수정은 구현됨.
- 게시 후 수정 UI/API는 아직 미구현.

## Supabase / SQL 메모
- `articles.published_at` 컬럼 필요. 이미 적용되어 있어야 현재 게시/정렬/정적 생성이 정상 동작한다.
- `suggested_clusters`는 RLS policy가 필요하다. anon key 기반 서버 API를 쓰므로 select/insert/update policy가 없으면 저장/상태 변경이 실패한다.
- `suggested_clusters.article_id`는 현재 코드가 저장하지 않는다. 생성 기사 id까지 추적하려면 컬럼과 PATCH 로직을 별도 추가해야 한다.
- `supabase-planned-migrations.sql`은 적용 전 반드시 현재 코드 방향과 맞는지 검토해야 한다.

## 알려진 이슈
- Cloudflare 정적 export에서 `/admin`이 노출될 수 있다. API는 없지만 UI 자체 노출이 싫으면 `scripts/build-static.mjs`의 stash 대상에 `app/admin`을 추가하거나 Cloudflare Access를 사용해야 한다.
- Next.js 16.2 Turbopack은 `output:'export'`를 제대로 내보내지 않는 문제가 있어 `build-static.mjs`에서 `--webpack`을 강제한다.
- `app/api/admin/login`의 rate limit은 in-memory라 dev 서버 재시작 시 초기화된다.
- proxy의 IP 판단은 `x-forwarded-for`/`x-real-ip`를 신뢰한다. 로컬 사용 전제에서는 충분하지만 외부 공개용 보안 설계는 아니다.
- `ADMIN_PASSWORD`는 로그인 비밀번호이자 HMAC 서명 키다. 비밀번호 변경 시 기존 쿠키는 자동 무효화된다.
- 과거 raw_articles 중 title이 URL 형태로 저장된 데이터가 있을 수 있다. 신규 수집은 `extractArticleTitle`로 개선됐고, 기존 데이터는 backfill API로 재추출 가능하다.
- 일부 RSS 소스는 계속 실패할 수 있다:
  - Beatportal: RSS 대신 HTML 반환, 수동 URL ingest 권장
  - Resident Advisor: 기존 RSS URL 불안정/404, 수동 URL ingest 권장
  - Magnetic Magazine: 403 가능
  - Your EDM: 503/타임아웃 가능
  - Stoney Roads: 타임아웃 가능
- EDM Identity 등 JS 렌더링 의존 사이트는 본문 수집 품질이 낮을 수 있다.

## 다음 작업 후보
- Cloudflare Pages 실제 연결:
  - GitHub push
  - Cloudflare Pages 프로젝트 생성
  - Build command `npm run build:static`
  - Output directory `out`
  - Supabase env 설정
  - 첫 배포 확인
  - 로컬 게시 버튼으로 deploy hook 재빌드 확인
- `/api/generate`의 Tier 조회를 `lib/source-tiers.ts`로 단일화
- 정적 배포에서 `/admin` 제외 여부 결정
- `supabase-planned-migrations.sql` 정리
- 기존 URL형 raw article title backfill 실행
- slug/category/genre/tags 스키마와 생성 프롬프트 확장
