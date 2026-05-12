import { NextResponse, type NextRequest } from 'next/server'
import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  signAdminSession,
} from '@/lib/admin-session'

const MAX_FAILURES = 5
const BLOCK_DURATION_MS = 15 * 60 * 1000

type Attempt = { failures: number; blockedUntil: number }
const attempts = new Map<string, Attempt>()

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return request.headers.get('x-real-ip') ?? 'unknown'
}

export async function POST(request: NextRequest) {
  const password = process.env.ADMIN_PASSWORD
  if (!password) {
    return NextResponse.json(
      { error: 'ADMIN_PASSWORD is not configured' },
      { status: 500 },
    )
  }

  const ip = getClientIp(request)
  const now = Date.now()
  const existing = attempts.get(ip)

  if (existing && existing.blockedUntil > now) {
    const retryAfter = Math.ceil((existing.blockedUntil - now) / 1000)
    return NextResponse.json(
      {
        error: '로그인 시도가 너무 많습니다. 15분 후 다시 시도해주세요.',
        retryAfter,
      },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    )
  }

  let submitted = ''
  try {
    const body = await request.json()
    if (typeof body?.password === 'string') submitted = body.password
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 })
  }

  if (submitted !== password) {
    const carry =
      existing && existing.blockedUntil === 0 ? existing.failures : 0
    const failures = carry + 1
    const next: Attempt = { failures, blockedUntil: 0 }
    if (failures >= MAX_FAILURES) next.blockedUntil = now + BLOCK_DURATION_MS
    attempts.set(ip, next)
    return NextResponse.json(
      {
        error: '비밀번호가 올바르지 않습니다.',
        remaining: Math.max(0, MAX_FAILURES - failures),
      },
      { status: 401 },
    )
  }

  attempts.delete(ip)
  const token = await signAdminSession(password)
  const response = NextResponse.json({ ok: true })
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  })
  return response
}
