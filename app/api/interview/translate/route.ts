import { NextRequest, NextResponse } from 'next/server'
import { interviewTranslate } from '@/lib/jobs/interview-translate'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as { raw_article_id?: unknown }

  if (typeof body.raw_article_id !== 'string' || !body.raw_article_id) {
    return NextResponse.json(
      { success: false, error: 'raw_article_id가 필요합니다.' },
      { status: 400 }
    )
  }

  try {
    const { article } = await interviewTranslate(body.raw_article_id)
    return NextResponse.json({ success: true, article })
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 })
  }
}
