import { NextResponse } from 'next/server'
import { triggerDeployHook } from '@/lib/deploy-hook'

export async function POST() {
  try {
    const result = await triggerDeployHook()
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 })
  }
}
