import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

async function handleCron(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const startedAt = new Date().toISOString()

  try {
    const collectRes = await fetch(`${req.nextUrl.origin}/api/collect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })
    const collectData = await collectRes.json().catch(() => ({}))

    return NextResponse.json({
      ok: collectRes.ok && collectData.success !== false,
      startedAt,
      finishedAt: new Date().toISOString(),
      collected: collectData.collected ?? null,
      error: collectData.error ?? null,
    })
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        startedAt,
        finishedAt: new Date().toISOString(),
        error: String(err),
      },
      { status: 500 }
    )
  }
}

export async function GET(req: NextRequest) {
  return handleCron(req)
}

export async function POST(req: NextRequest) {
  return handleCron(req)
}
