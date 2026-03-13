import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'

export async function POST(request: NextRequest) {
  const inviteCode = process.env.INVITE_CODE
  if (!inviteCode) {
    return NextResponse.json({ error: 'Auth not configured' }, { status: 500 })
  }

  const body = await request.json()
  const { code } = body as { code?: string }

  if (!code || code !== inviteCode) {
    return NextResponse.json({ error: 'Invalid invite code' }, { status: 401 })
  }

  const hash = createHash('sha256').update(inviteCode).digest('hex')
  const response = NextResponse.json({ ok: true })

  response.cookies.set('storybook-auth', hash, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: '/',
  })

  return response
}
