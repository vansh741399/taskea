import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  try {
    const templates = await db.workflowTemplate.findMany({
      where: { isActive: true },
      include: {
        steps: { orderBy: { order: 'asc' } },
        _count: { select: { instances: true } },
      },
      orderBy: { name: 'asc' },
    })

    return NextResponse.json(templates)
  } catch (error) {
    console.error('Workflow templates GET error:', error)
    return NextResponse.json({ error: 'Failed to fetch workflow templates' }, { status: 500 })
  }
}
