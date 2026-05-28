import { NextRequest, NextResponse } from 'next/server'
import { generateFromImageSource } from '@/lib/jobs/generate-from-image-source'

type GenerateRequest = {
  imageBase64?: string
  mimeType?: string
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await req.json().catch(() => ({})) as GenerateRequest

  if (!id) {
    return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 })
  }

  try {
    const { article } = await generateFromImageSource(id, {
      imageBase64: body.imageBase64,
      mimeType: body.mimeType,
    })
    return NextResponse.json({ article })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
