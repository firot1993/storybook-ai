import { NextRequest, NextResponse } from 'next/server'
import { listStoriesByCharacter } from '@/lib/db'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const stories = await listStoriesByCharacter(id)
  return NextResponse.json({ stories })
}
