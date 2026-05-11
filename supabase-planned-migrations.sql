-- supabase-planned-migrations.sql
-- EDM Star News Korea
--
-- 적용 전 주의:
-- 1. 운영 DB에 직접 적용하기 전 dev/staging에서 먼저 실행할 것.
-- 2. 아래 UPDATE 문은 rss_sources.name 값이 정확히 일치한다는 가정으로 작성됐다.
--    실행 전에 반드시 아래 SELECT로 현재 등록된 이름을 확인하고, 차이가 있으면 IN(...) 리스트를 보정할 것.
--    SELECT id, name FROM rss_sources ORDER BY name;
-- 3. 안전을 위해 각 섹션을 BEGIN/COMMIT으로 묶어 적용하는 것을 권장한다.

-- ===========================================================
-- 1. rss_sources Tier 시스템 컬럼 추가
-- ===========================================================
ALTER TABLE rss_sources
  ADD COLUMN IF NOT EXISTS tier text DEFAULT 'B',
  ADD COLUMN IF NOT EXISTS source_type text,
  ADD COLUMN IF NOT EXISTS language text,
  ADD COLUMN IF NOT EXISTS region text;

-- 컬럼 의미 (운영 시 컨벤션):
--   tier        : 'A' | 'B' | 'C' | 'manual'  -- 기사 생성 신뢰도/사용 정책 등급
--   source_type : 'magazine' | 'blog' | 'news' | 'platform' 등 자유 텍스트
--   language    : 'en' | 'ko' | 'fr' | 'de' 등 (ISO 639-1)
--   region      : 'global' | 'uk' | 'us' | 'kr' | 'eu' 등

-- ===========================================================
-- 2. rss_sources Tier 값 업데이트
-- ===========================================================
-- 아래 UPDATE는 name이 일치하는 행만 갱신한다. 이름이 어긋난 행은 갱신 0건이 되므로
-- 적용 후 다음 쿼리로 누락된 소스를 확인할 것:
--   SELECT name FROM rss_sources WHERE tier IS NULL OR tier = '' OR tier = 'B';

-- 2-A. Tier A — 기사 생성 핵심 근거
UPDATE rss_sources SET tier = 'A'
WHERE name IN (
  'Mixmag',
  'DJ Mag',                  -- 확인 필요: DB에 'DJ Magazine' 등 변형 가능
  'The Quietus',
  'Crack Magazine',
  'Ransom Note',             -- 확인 필요: 'The Ransom Note'일 가능성
  '5 Magazine',
  '909originals',
  'Create Digital Music',    -- 확인 필요: 'CDM', 'createdigitalmusic' 등 변형 가능
  'Groove Magazine',         -- 확인 필요: 'Groove' 단독 표기 가능
  'Tsugi',
  'Attack Magazine',
  'Bandcamp Daily'
);

-- 2-B. Tier B — 뉴스 감지/보조
UPDATE rss_sources SET tier = 'B'
WHERE name IN (
  'Electronic Groove',
  'When We Dip',
  'Data Transmission',
  'Decoded Magazine',
  'Synthtopia',
  'DJ TechTools',            -- 확인 필요: 'DJTechTools' 한 단어 가능
  'FAZEmag',                 -- 확인 필요: 'FAZE Magazine' 표기 가능
  'EDM Identity'
);

-- 2-C. Tier C — 단독 기사 생성 금지 (이슈 감지 보조)
UPDATE rss_sources SET tier = 'C'
WHERE name IN (
  'EDM Sauce',
  'EDMTunes',                -- 확인 필요: 'EDM Tunes' 띄어쓰기 가능
  'We Rave You',
  'EDM Maniac',
  'RaverRafting',            -- 확인 필요: 'Raver Rafting' 띄어쓰기 가능
  'By The Wavs',
  'The Nocturnal Times'
);

-- 2-D. Manual — RSS 불안정, 수동 URL ingest 중심
UPDATE rss_sources SET tier = 'manual'
WHERE name IN (
  'Resident Advisor',        -- 확인 필요: 'RA'로 등록되어 있을 가능성
  'Beatportal'
);

-- ===========================================================
-- 3. 추가 RSS 소스 삽입
-- ===========================================================
-- rss_sources.url에 unique constraint가 보장되지 않을 수 있으므로
-- ON CONFLICT 대신 INSERT ... SELECT ... WHERE NOT EXISTS 패턴을 사용한다.
-- (url에 unique index가 이미 있다면 ON CONFLICT (url) DO NOTHING으로 단순화 가능)

INSERT INTO rss_sources (name, url, is_active, tier, source_type, language, region)
SELECT 'Bandcamp Daily', 'https://daily.bandcamp.com/feed', true, 'A', 'platform', 'en', 'global'
WHERE NOT EXISTS (
  SELECT 1 FROM rss_sources WHERE url = 'https://daily.bandcamp.com/feed'
);

INSERT INTO rss_sources (name, url, is_active, tier, source_type, language, region)
SELECT 'Attack Magazine', 'https://www.attackmagazine.com/feed/', true, 'A', 'magazine', 'en', 'uk'
WHERE NOT EXISTS (
  SELECT 1 FROM rss_sources WHERE url = 'https://www.attackmagazine.com/feed/'
);

INSERT INTO rss_sources (name, url, is_active, tier, source_type, language, region)
SELECT 'Inverted Audio', 'https://inverted-audio.com/feed/', true, 'B', 'magazine', 'en', 'uk'
WHERE NOT EXISTS (
  SELECT 1 FROM rss_sources WHERE url = 'https://inverted-audio.com/feed/'
);

-- ===========================================================
-- 4. articles 확장 컬럼 추가
-- ===========================================================
ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS slug text,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS genre text,
  ADD COLUMN IF NOT EXISTS tags text[];

-- slug는 NOT NULL인 행에 한해 유일성 보장.
-- (모든 기존 행을 NULL로 두고 점진적으로 채우는 운영을 가정)
CREATE UNIQUE INDEX IF NOT EXISTS articles_slug_unique
  ON articles(slug)
  WHERE slug IS NOT NULL;

-- 컬럼 의미:
--   slug      : 영문 URL slug. 예) 'martin-garrix-stmpd-2026-single'
--   category  : 사이트 네비 매핑되는 큰 분류 (예: 페스티벌, 아티스트, 신보, 리뷰)
--   genre     : EDM 하위 장르 (house, techno, trance, dubstep 등)
--   tags      : 자유 태그 배열. 검색/필터링용.

-- ===========================================================
-- 적용 후 확인 쿼리
-- ===========================================================
-- 1) Tier 분포 확인
--    SELECT tier, count(*) FROM rss_sources GROUP BY tier ORDER BY tier;
--
-- 2) Tier가 기본값으로만 남아있는 소스(즉 매칭 실패) 확인
--    SELECT name FROM rss_sources WHERE tier = 'B' ORDER BY name;
--    (Tier B로 의도된 소스 + 매칭 실패로 기본값 유지된 소스가 함께 보임)
--
-- 3) 추가 소스 정상 삽입 확인
--    SELECT name, tier FROM rss_sources WHERE url IN (
--      'https://daily.bandcamp.com/feed',
--      'https://www.attackmagazine.com/feed/',
--      'https://inverted-audio.com/feed/'
--    );
--
-- 4) articles 새 컬럼 확인
--    SELECT column_name, data_type FROM information_schema.columns
--    WHERE table_name = 'articles' AND column_name IN ('slug','category','genre','tags');
