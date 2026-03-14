import { NextRequest, NextResponse } from 'next/server'

const PUBLIC_PATHS = ['/login', '/api/auth', '/api/auth/byok', '/api/health']
const PUBLIC_PREFIXES = ['/_next/', '/favicon.ico']

async function hashCode(code: string): Promise<string> {
  const encoded = new TextEncoder().encode(code)
  const buf = await crypto.subtle.digest('SHA-256', encoded)
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function middleware(request: NextRequest) {
  const inviteCode = process.env.INVITE_CODE
  if (!inviteCode) return NextResponse.next()

  const { pathname } = request.nextUrl

  if (
    PUBLIC_PATHS.includes(pathname) ||
    PUBLIC_PREFIXES.some((p) => pathname.startsWith(p)) ||
    pathname.match(/\.(svg|png|jpg|jpeg|gif|webp|ico|css|js|woff2?)$/)
  ) {
    return NextResponse.next()
  }

  const cookie = request.cookies.get('storybook-auth')?.value
  if (cookie === await hashCode(inviteCode)) {
    return NextResponse.next()
  }

  // Allow access if user has a BYOK cookie (presence check only; decryption in API routes)
  const byokCookie = request.cookies.get('storybook-byok')?.value
  if (byokCookie) {
    return NextResponse.next()
  }

  const loginUrl = new URL('/login', request.url)
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
}
