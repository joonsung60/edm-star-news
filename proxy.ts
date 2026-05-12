import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_COOKIE_NAME, verifyAdminSession } from '@/lib/admin-session'

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (pathname === '/admin/login') {
    return NextResponse.next()
  }

  const password = process.env.ADMIN_PASSWORD
  if (!password) {
    return new NextResponse('ADMIN_PASSWORD is not configured', { status: 500 })
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value
  const valid = token ? await verifyAdminSession(token, password) : false

  if (!valid) {
    const url = request.nextUrl.clone()
    url.pathname = '/admin/login'
    url.search = `?from=${encodeURIComponent(pathname)}`
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/admin/:path*'],
}
