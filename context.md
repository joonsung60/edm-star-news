# EDM Star News Korea - 프로젝트 컨텍스트

## 프로젝트 개요
EDM 관련 영문 매체(Mixmag, RA, DJ Mag 등)의 RSS 피드를 자동 수집하고,
여러 기사를 클러스터링해 로컬 LLM으로 한국어 종합 기사를 자동 생성하는 뉴스 사이트.

## 기술 스택
- Frontend/Backend: Next.js 16 (App Router, Server Components 기본)
- DB: Supabase (PostgreSQL)
- LLM: Ollama + Qwen3:14b (Windows에서 실행, WSL에서 http://172.25.224.1:11434 로 접근)
- 멀티모달: qwen2.5vl:7b (이미지 분석용, 추후 활용)
- Hosting: 로컬 개발 중 (추후 Vercel + Supabase 배포)

## DB 테이블 구조
- rss_sources: RSS 피드 소스 목록 (32개)
- raw_articles: 수집된 원문 기사 (id, title, content, url, image_url, source_id, author, published_at, is_used)
- article_clusters: 토픽별 기사 묶음 (id, topic, keywords)
- cluster_articles: 클러스터-기사 연결 테이블 (cluster_id, raw_article_id)
- articles: 생성된 한국어 종합 기사 (id, title, content, cluster_id, published, published_at, created_at)
  - 추가 예정 컬럼: slug, category, genre, tags
- suggested_clusters: LLM/휴리스틱이 제안한 클러스터 후보
  - 현재 코드가 실제로 사용하는 DB 컬럼: id, topic, keywords, article_ids, status, cluster_id, created_at
  - status: pending | approved | rejected | published
  - 주의: reason, common_entities, cohesion_score, article_id는 현재 DB 저장 컬럼으로 쓰지 않는다. UI 표시용 reason/commonEntities/cohesionScore는 GET hydrate 단계에서 keywords/article_ids 기반으로 일부 재구성한다.

## 주요 파일 구조
```
app/
  page.tsx                        # 기사 목록 (Server Component, 발행 정렬)
  layout.tsx                      # 루트 레이아웃
  articles/[id]/page.tsx          # 기사 상세 (한국어 문장 단위로 <p> 분리)
  admin/page.tsx                  # 어드민 UI (6개 탭)
  api/
    collect/route.ts              # RSS 수집 + URL 직접 추가 (failures 리포팅)
    cluster/route.ts              # 키워드/articleIds 기반 클러스터 생성 (matchMode: or/and)
    generate/route.ts             # 한국어 기사 생성 (Ollama Qwen3:14b, Tier C 단독 생성 차단)
    suggest-clusters/route.ts     # POST: LLM/휴리스틱 토픽 제안 → DB 저장 / GET: 상태별 조회, Tier C 단독 제안 차단
    suggest-clusters/[id]/route.ts # PATCH: 제안 status/cluster_id 업데이트
    articles/route.ts             # GET: 생성 기사 목록 조회 (published 필터)
    articles/[id]/route.ts        # PATCH: 게시 전 기사 초안 수정 / DELETE: 게시 전 기사 초안 삭제
    articles/[id]/publish/route.ts # PATCH: 기사 published=true + published_at 세팅
    cron/route.ts                 # 스케줄러용 엔드포인트 (CRON_SECRET 인증)
lib/
  supabase.ts                     # Supabase 클라이언트
  article-extraction.ts           # HTML 본문 추출 + 정제 (extractArticleText, extractImageUrl, cleanArticleText)
  prompts.ts                      # LLM 시스템 프롬프트 (A 작성됨, B는 dummy)
  source-tiers.ts                 # 소스 Tier 정의 및 getSourceTier(), isAllTierC() 헬퍼
```

## 어드민 워크플로우 (6개 탭)
1. **① RSS 수집** — 32개 소스에서 새 기사 수집, 실패한 소스 리스트 표시
2. **② URL 직접 추가** — 리서치 중 발견한 URL 수동 등록
3. **③ 자동 토픽 제안** (메인 워크플로우)
   - "토픽 제안 받기" → LLM이 미사용 raw_articles를 분석해 그룹 제안 → suggested_clusters에 status='pending'으로 저장
   - 서브탭: 미처리 / 기사 생성 완료 / 거절됨
   - 카드별 액션: "승인 & 기사 생성" (PATCH approved → /api/cluster → /api/generate → PATCH suggested_clusters.status='published') / "거절" (PATCH rejected)
   - 중간 단계 실패 시 자동으로 status='pending' 롤백
   - 주의: suggested_clusters.status='published'는 공개 게시가 아니라 "기사 생성 완료" 의미로 UI에서 표시한다.
4. **④ 생성 기사 검토** — articles 중 published=false 초안 목록 확인 → 상세 검토 → "게시" 버튼으로 published=true, published_at=now()
   - 서브탭: 게시 대기 / 게시됨
   - 게시 대기 초안은 "수정" 버튼으로 제목/본문 수정 가능. 게시된 기사는 이 수정 API에서 막는다.
   - 게시 대기 초안은 "삭제" 버튼으로 제거 가능. 게시된 기사는 이 삭제 API에서 막는다.
   - 공개 뉴스 사이트(app/page.tsx)는 published=true 기사만 보여준다.
5. **⑤ 클러스터 (수동)** — 토픽+키워드 직접 입력해 클러스터 생성 (백업 워크플로우)
6. **⑥ 기사 생성 (수동)** — 클러스터 ID 입력해 기사 생성 (백업 워크플로우)

## 자동 토픽 제안 동작 원리
- LLM이 카테고리성 클러스터(festival, techno 등)를 만드는 걸 막기 위해 시스템 프롬프트에 "같은 사건/릴리즈/행사/인물/제품 단위" 명시
- 응답 후처리: `CATEGORY_KEYWORDS` 필터 + 응집도 점수(cohesionScore) 계산 + 부분집합 제거(removeSubsetSuggestions) + 동일 article 묶음 dedupe
- LLM이 유효 결과를 못 내면 fallback: 제목에서 entity 추출(extractTitleEntities, knownEntityPatterns 매칭) → entity별 그룹 생성 → 응집도 ≥ 60만 통과
- POST 응답에 `source: 'llm' | 'fallback'`로 어떤 경로였는지 표시
- 저장 시에는 현재 DB 스키마에 맞춰 topic/keywords/article_ids/status만 insert한다. reason/commonEntities/cohesionScore는 저장하지 않는다.

## 현재 상태
- RSS 수집: 작동 중 (실패 소스는 어드민 UI에서 확인 가능)
- 본문 추출: lib/article-extraction.ts로 분리됨 (article/main/section 후보 + 메타 설명 + 잡음 제거)
- 자동 토픽 제안: 작동 중 (LLM + entity fallback 2-stage, DB pending 저장)
- 승인 → 자동 클러스터/기사 생성 파이프라인: 작동 중. 발행 완료 상태에는 cluster_id만 저장한다.
- 기사 목록/상세 페이지: 구현 완료 (공개 목록은 published=true만, published_at desc 정렬 / 상세는 한국어 문장 단위 단락 분리)
- 뉴스 사이트 홈: 한국 뉴스 사이트형 카드 레이아웃 구현됨 (썸네일, 최신 기사, 최근 게시 기사 TOP 5 사이드바)
- 기사 초안 수정/삭제/게시 엔드포인트와 어드민 UI 트리거 구현됨
- 스케줄러 엔드포인트: /api/cron 구현됨 (Vercel Cron 또는 외부 스케줄러용)

## 배포 아키텍처

### 핵심 원칙
기사 생성(로컬)과 뉴스 사이트(Vercel)는 완전히 분리된다.

### 로컬 (네 컴퓨터)
- Ollama + Qwen3:14b로 기사 생성
- 어드민 UI로 RSS 수집, 클러스터링, 기사 생성, 발행 관리
- 생성된 기사는 Supabase에 저장
- OLLAMA_BASE_URL: http://172.25.224.1:11434

### Vercel (배포된 뉴스 사이트)
- Supabase에서 published=true 기사를 읽어서 보여주기만 함
- Ollama 전혀 사용하지 않음
- OLLAMA_BASE_URL 환경변수 불필요
- 어드민 기능은 로컬에서만 사용 (Vercel 배포본에는 어드민 인증 필요)

### Vercel 환경변수 (필요한 것만)
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY
- CRON_SECRET (선택, Vercel Cron용)

### Vercel Cron (배포 후 설정)
vercel.json에 추가:
```json
{
  "crons": [{ "path": "/api/cron", "schedule": "0 0,12 * * *" }]
}
```

단, `/api/cron`은 RSS 수집만 하고 기사 생성은 하지 않음. 기사 생성은 계속 로컬 어드민에서 수동으로 한다.

## 소스 Tier 관리
- Supabase DB 컬럼 대신 `lib/source-tiers.ts` 파일로 관리
- `getSourceTier()`, `isAllTierC()` 헬퍼 함수 포함

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

### Manual: RSS 불안정, 수동 URL ingest
- Resident Advisor
- Beatportal

### 코드 반영 상태
- `/api/suggest-clusters`: 소스 Tier를 LLM 입력에 전달한다.
- `/api/suggest-clusters`: Tier C 소스만으로 구성된 후보는 저장 전에 제외한다.
- `/api/generate`: 원문 소스의 매체/등급을 LLM 입력에 전달한다.
- `/api/generate`: 사용 가능한 원문이 모두 Tier C이면 기사 생성을 차단한다.
- 기준 구현 방향: Supabase `rss_sources.tier` 컬럼이 아니라 `lib/source-tiers.ts`를 단일 기준으로 사용한다.

## 추가 예정 소스
- Bandcamp Daily: https://daily.bandcamp.com/feed
- Attack Magazine: https://www.attackmagazine.com/feed/
- Inverted Audio: https://inverted-audio.com/feed/

## 콘텐츠 모델 확장 계획
### 기사 수정 기능 (미구현)
- 발행 전 검토/수정: 어드민의 생성 기사 검토 단계에서 미리보기와 본문 수정 후 게시
- 발행 후 수정: 기사 상세 페이지에서 어드민 로그인 시 수정 버튼 노출

### URL Slug
- 현재: `/articles/[uuid]`
- 목표: `/articles/[영문-slug]`
- 기사 생성 시 LLM이 영문 slug도 함께 생성
- articles 테이블에 slug 컬럼 추가 필요

### 카테고리/네비게이션
- 현재: 더미 메뉴 (홈 | 페스티벌 | 아티스트 | 신보 | 장르별 | 국가별)
- 기사 20~30개 쌓인 후 카테고리 체계 결정
- 기사 생성 시 category, genre 자동 태깅 필요
- articles 테이블에 category, genre, tags 컬럼 추가 예정

## 환경 변수
- NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
- OLLAMA_BASE_URL (기본 http://localhost:11434, WSL에서는 http://172.25.224.1:11434)
- CRON_SECRET (선택, /api/cron Authorization: Bearer 검증용)

## 마이그레이션 / 스키마 변경 계획
- 파일: `supabase-planned-migrations.sql` (프로젝트 루트)
- 적용 전 운영 DB에서 다음을 확인:
  - rss_sources.url unique 제약 유무 — 없으면 SQL 파일이 사용하는 NOT EXISTS 패턴 그대로 두면 안전
- SQL 파일 구성:
  - Bandcamp Daily, Attack Magazine, Inverted Audio INSERT (NOT EXISTS 가드)
  - articles에 slug/category/genre/tags 컬럼 + slug 부분 unique index
  - 주의: 소스 Tier는 DB 컬럼이 아니라 `lib/source-tiers.ts`로 관리하므로 rss_sources tier 컬럼 추가/업데이트는 우선순위에서 제외한다.

## public UI category/genre 표시 준비 (DB 컬럼 추가 전 상태)
- `app/page.tsx`, `app/articles/[id]/page.tsx`: 타입에 `category?`, `genre?` optional 필드 추가, `CategoryBadges` 컴포넌트로 제목 근처에 뱃지 렌더링
- 현재는 Supabase select에 category/genre를 포함하지 않으므로 항상 undefined → 뱃지는 렌더되지 않음 (DB가 없는 상태에서도 깨지지 않음)
- 컬럼 추가 후 해야 할 일: 두 파일 모두 select 절에 `, category, genre` 추가 + 매핑부 전달. 코드 내 `TODO(supabase-planned-migrations.sql §4)` 주석으로 마킹해둠

## 알려진 이슈
- RSS 실패 후보
  - DJ Mag: RSS 자체는 정상. `BST` 날짜 파싱은 collect/route.ts에서 보정함.
  - FAZEmag, The Nocturnal Times: RSS 자체는 정상 확인. 다음 수집에서 성공 가능성이 높음.
  - 6AM Group, Dubstep FBI, Resident Advisor: 현재 등록 URL 404. RA의 `https://ra.co/xml/news.xml`도 직접 확인 결과 404.
  - Beatportal: `/feed/`가 RSS가 아니라 HTML을 반환.
  - Magnetic Magazine: 403 Forbidden.
  - Your EDM: 503 또는 타임아웃.
  - Stoney Roads: 타임아웃.
- EDM Identity: JavaScript 렌더링 필요해서 본문 수집 품질이 낮을 수 있음
- 과거 raw_articles content에는 HTML 네비게이션 찌꺼기가 섞여 있을 수 있음. generate 단계에서 cleanArticleText로 재정화한다.
- Ollama OLLAMA_HOST=0.0.0.0 설정 필요 (WSL ↔ Windows 통신)
- suggested_clusters는 RLS policy가 필요하다. anon key 기반 서버 API를 쓰고 있으므로 select/insert/update policy가 없으면 저장/상태 변경이 실패한다.
- suggested_clusters에 article_id 컬럼은 현재 없다. 기사 링크까지 저장하려면 `article_id uuid references articles(id)` 컬럼을 별도 추가해야 한다.

## 다음 작업 목록

### 이미지 관련
- [ ] Supabase Storage 버킷 생성 (이미지 저장용)
- [ ] collect/route.ts에 og:image 다운로드 → Supabase Storage 업로드 로직 추가 (현재는 외부 URL을 raw_articles.image_url에 그대로 저장)
- [ ] raw_articles.image_url을 외부 URL 대신 Supabase Storage URL로 교체
- [x] 기사 목록 페이지 썸네일 연결 (cluster → cluster_articles → raw_articles.image_url join, app/page.tsx)
- [ ] 기사 상세 페이지 썸네일/이미지 연결
- [ ] 본문 내 이미지 URL도 수집 단계에서 저장 (현재 extractImageUrl이 og:image 하나만 추출)
- [ ] qwen2.5-vl:7b로 이미지 캡션 자동 생성 (3번째 단계)

### 뉴스 사이트 UI
- [x] app/page.tsx 뉴스 사이트 레이아웃 완성
  - 헤더(layout.tsx): EDM Star News + 더미 네비 (홈|페스티벌|아티스트|신보|장르별▾|국가별▾)
  - 메인: 최신 기사 카드형 (썸네일+제목+날짜+2줄 미리보기)
  - 사이드바: 최근 발행 기사 5개 (인기 기사 대체용)
- [x] 기사 상세 페이지 문장 단위 줄바꿈 (splitKoreanSentences로 `<p>` 분리)
- [x] 어드민에서 기사 게시(publish) 버튼 UI 노출 (④ 생성 기사 검토 탭, 게시 대기/게시됨 서브탭)

### 배포 관련
- [ ] 도메인 구매 (가비아 or Namecheap, edmstarnews.com 등)
- [ ] Vercel 가입 및 GitHub repo 연결
- [ ] Vercel 환경변수 설정 (SUPABASE_URL, SUPABASE_ANON_KEY)
- [ ] 도메인 Vercel 연결
- [ ] vercel.json Cron 설정 (하루 2회 RSS 수집)
- [ ] 어드민 페이지 인증 추가 (배포 전 필수)

### 콘텐츠 품질
- [x] articles.published_at 컬럼 추가 및 활용 (publish API, 목록 정렬, 상세 표시 모두 적용됨)
- [x] 상대 날짜 표현 금지 프롬프트 적용 (SYSTEM_PROMPT_A 및 generate 프롬프트에 명시)
- [x] 원문 발행일을 LLM에 전달 (generate/route.ts에서 raw_articles.published_at select → formatSourceDate → "발행일:" 라인 주입)
- [ ] 시스템 프롬프트 B 작성 (lib/prompts.ts SYSTEM_PROMPT_B는 현재 빈 문자열)
- [ ] 클러스터 키워드 매칭 AND 기본화 — API(/api/cluster)는 matchMode `'and' | 'or'` 분기를 지원하지만, 어드민 UI는 항상 `'or'`로 호출 중
- [ ] `lib/source-tiers.ts` 기준으로 소스 Tier 관리 로직 정리
- [x] Tier C 소스 단독 기사 생성 금지 규칙을 토픽 제안/생성 단계에 반영
- [ ] Bandcamp Daily, Attack Magazine, Inverted Audio RSS 소스 추가
- [ ] 기사 수정 기능 구현 (게시 전 초안 수정은 구현됨, 게시 후 수정은 미구현)
- [ ] articles.slug 컬럼 추가 및 `/articles/[slug]` 라우팅 전환
- [ ] articles.category, articles.genre, articles.tags 컬럼 추가 및 LLM 자동 태깅

### 아직 미결정
- [ ] suggested_clusters.article_id 컬럼 추가 여부 (발행됨 탭에서 기사 바로가기 복구용)
- [ ] RA 기사 처리 방안 (PDF → LLM 파이프라인, 추후)
- [ ] 카테고리 체계 확정 (기사 20~30개 누적 후 결정)
