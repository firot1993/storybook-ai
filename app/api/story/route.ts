import { NextRequest, NextResponse } from 'next/server'
import { listAllStories } from '@/lib/db'

// GET /api/story - List all stories
export async function GET() {
  try {
    const stories = await listAllStories()
    return NextResponse.json({ stories })
  } catch (error) {
    console.error('Error listing stories:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
