// lib/source-tiers.ts
// RSS 소스 등급 관리
// DB 컬럼 대신 코드로 관리. 소스 추가/변경 시 이 파일만 수정하면 됨.

/**
 * Tier A: 기사 생성 핵심 근거 소스
 * 품질 높은 저널리즘. 단독으로 기사 생성 가능.
 */
export const TIER_A: string[] = [
  'Mixmag',
  'DJ Mag',
  'The Quietus',
  'Crack Magazine',
  'Ransom Note',
  '5 Magazine',
  '909originals',
  'Create Digital Music',
  'Groove Magazine (DE)',
  'Tsugi (FR)',
  'Attack Magazine',   // 추가 예정
  'Bandcamp Daily',    // 추가 예정
]

/**
 * Tier B: 뉴스 감지 및 보조 소스
 * 기사 생성 시 A티어와 함께 사용. 단독 사용은 지양.
 */
export const TIER_B: string[] = [
  'Electronic Groove',
  'When We Dip',
  'Data Transmission',
  'Decoded Magazine',
  'Synthtopia',
  'DJ TechTools',
  'FAZEmag (DE)',
  'EDM Identity',
  'Inverted Audio',    // 추가 예정
]

/**
 * Tier C: 단독 기사 생성 금지
 * 뉴스 감지용. 홍보성/블로그성 콘텐츠 비중 높음.
 * A/B티어 소스와 함께 클러스터에 포함될 때만 사용.
 */
export const TIER_C: string[] = [
  'EDM Sauce',
  'EDMTunes',
  'We Rave You',
  'EDM Maniac',
  'RaverRafting',
  'By The Wavs',
  'The Nocturnal Times',
]

/**
 * Manual: RSS 불안정. URL 직접 추가(수동 ingest) 중심.
 */
export const TIER_MANUAL: string[] = [
  'Resident Advisor',
  'Beatportal',
]

/**
 * 소스 이름으로 tier 반환
 */
export function getSourceTier(sourceName: string): 'A' | 'B' | 'C' | 'manual' | 'unknown' {
  if (TIER_A.includes(sourceName)) return 'A'
  if (TIER_B.includes(sourceName)) return 'B'
  if (TIER_C.includes(sourceName)) return 'C'
  if (TIER_MANUAL.includes(sourceName)) return 'manual'
  return 'unknown'
}

/**
 * 클러스터의 소스 목록이 Tier C로만 구성되어 있는지 확인
 * true면 기사 생성 차단
 */
export function isAllTierC(sourceNames: string[]): boolean {
  if (sourceNames.length === 0) return false
  return sourceNames.every(name => TIER_C.includes(name))
}