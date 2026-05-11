# EDM Star News Korea - 프로젝트 컨텍스트

## 프로젝트 개요
EDM 관련 영문 매체(Mixmag, RA, DJ Mag 등)의 RSS 피드를 자동 수집하고,
여러 기사를 클러스터링해 로컬 LLM으로 한국어 종합 기사를 자동 생성하는 뉴스 사이트.

## 기술 스택
- Frontend/Backend: Next.js 16 (App Router)
- DB: Supabase (PostgreSQL)
- LLM: Ollama + Qwen3:14b (Windows에서 실행, WSL에서 http://172.25.224.1:11434 로 접근)
- 멀티모달: qwen2.5vl:7b (이미지 분석용, 추후 활용)
- Hosting: 로컬 개발 중 (추후 Vercel + Supabase 배포)

## DB 테이블 구조
- rss_sources: RSS 피드 소스 목록 (32개)
- raw_articles: 수집된 원문 기사
- article_clusters: 토픽별 기사 묶음
- cluster_articles: 클러스터-기사 연결 테이블
- articles: 생성된 한국어 종합 기사

## 주요 파일 구조
app/
  admin/page.tsx        # 어드민 UI (4개 탭)
  api/
    collect/route.ts    # RSS 수집 + URL 직접 추가
    cluster/route.ts    # 키워드 기반 클러스터 생성
    generate/route.ts   # 한국어 기사 생성
lib/
  supabase.ts           # Supabase 클라이언트
  prompts.ts            # LLM 시스템 프롬프트 (A/B)

## 어드민 워크플로우
1. RSS 수집 실행 (하루 2회)
2. URL 직접 추가 (리서치 중 발견한 기사)
3. 클러스터 생성 (토픽 + 키워드 입력)
4. 기사 생성 (클러스터 ID 입력)

## 현재 상태
- RSS 수집: 작동 중 (22개 소스 정상, 10개 실패)
- 클러스터 생성: 작동 중
- 기사 생성: 작동 중 (프롬프트 튜닝 진행 중)
- 기사 목록/상세 페이지: 미구현

## 알려진 이슈
- DJ Mag RSS: 날짜 파싱 오류로 수집 실패
- Resident Advisor RSS URL 404 (수정 필요: https://ra.co/xml/news.xml)
- EDM Identity: JavaScript 렌더링 필요해서 본문 수집 안됨
- raw_articles content에 HTML 네비게이션 찌꺼기 섞임 (전처리 개선 필요)
- Ollama OLLAMA_HOST=0.0.0.0 설정 필요 (WSL ↔ Windows 통신)

## 다음 작업 목록
- [ ] 기사 목록 페이지 (app/page.tsx)
- [ ] 기사 상세 페이지 (app/articles/[id]/page.tsx)
- [ ] 클러스터 생성 후 바로 기사 생성 버튼 추가
- [ ] content 전처리 개선 (HTML 찌꺼기 제거)
- [ ] DJ Mag 날짜 파싱 오류 수정
- [ ] RA RSS URL 수정
- [ ] 스케줄러 (하루 2회 자동 수집)
- [ ] 시스템 프롬프트 B 작성 (심층 기사용, 현재 dummy)