import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { workflowId, authorId, content } = body

    if (!workflowId || !authorId || !content) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const comment = await db.comment.create({
      data: { workflowId, authorId, content },
      include: {
        author: { select: { id: true, name: true, email: true, role: true, avatar: true } },
      },
    })

    // Get workflow to notify relevant users
    const workflow = await db.workflowInstance.findUnique({
      where: { id: workflowId },
      select: { creatorId: true, title: true },
    })

    if (workflow && workflow.creatorId !== authorId) {
      await db.notification.create({
        data: {
          type: 'COMMENT',
          title: `New Comment: ${workflow.title}`,
          message: content.substring(0, 100),
          senderId: authorId,
          receiverId: workflow.creatorId,
          workflowId,
        },
      })
    }

    return NextResponse.json(comment, { status: 201 })
  } catch (error) {
    console.error('Comments POST error:', error)
    return NextResponse.json({ error: 'Failed to create comment' }, { status: 500 })
  }
}
