import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// ─────────────────────────────────────────────────────────────────────────
// GET /api/tasks/[id]/attachments/[attachmentId]
// Streams the raw bytes of a single attachment back to the client with the
// original MIME type and a Content-Disposition header that triggers the
// browser's download UI (or inline preview for images/PDFs).
// ─────────────────────────────────────────────────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; attachmentId: string }> }
) {
  try {
    const { id, attachmentId } = await params

    const att = await db.taskAttachment.findFirst({
      where: { id: attachmentId, taskId: id },
      select: {
        id: true,
        fileName: true,
        fileType: true,
        fileSize: true,
        fileData: true,
      },
    })

    if (!att) {
      return NextResponse.json({ error: 'Attachment not found' }, { status: 404 })
    }

    // Build response headers. We let the browser decide whether to preview
    // (images/PDFs) or download based on Content-Type, while also supplying
    // a filename*=UTF-8''<encoded> for proper handling of unicode names.
    const encodedName = encodeURIComponent(att.fileName)
    const displayType = att.fileType || 'application/octet-stream'

    return new NextResponse(att.fileData as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': displayType,
        'Content-Length': String(att.fileSize),
        'Content-Disposition': `attachment; filename="${encodedName}"; filename*=UTF-8''${encodedName}`,
        'Cache-Control': 'private, no-cache, no-store, must-revalidate',
      },
    })
  } catch (error: any) {
    console.error('Download attachment error:', error)
    return NextResponse.json(
      { error: 'Failed to download attachment', detail: String(error?.message || error).substring(0, 200) },
      { status: 500 }
    )
  }
}

// ─────────────────────────────────────────────────────────────────────────
// DELETE /api/tasks/[id]/attachments/[attachmentId]
// Removes a single attachment from the task. The file bytes are deleted
// from the DB. The task itself is untouched.
// ─────────────────────────────────────────────────────────────────────────
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; attachmentId: string }> }
) {
  try {
    const { id, attachmentId } = await params

    const existing = await db.taskAttachment.findFirst({
      where: { id: attachmentId, taskId: id },
      select: { id: true, fileName: true },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Attachment not found' }, { status: 404 })
    }

    await db.taskAttachment.delete({ where: { id: attachmentId } })

    // ─── Audit log (non-fatal) ───────────────────────────────────────────
    try {
      const task = await db.task.findUnique({
        where: { id },
        select: { title: true },
      })
      if (task) {
        await db.taskActivity.create({
          data: {
            action: 'UPDATED',
            taskId: id,
            taskTitle: task.title,
            description: `Deleted attachment "${existing.fileName}" from task`,
          },
        })
      }
    } catch (actErr) {
      console.error('TaskActivity delete-attachment log error (non-fatal):', actErr)
    }

    return NextResponse.json({ success: true, id: attachmentId })
  } catch (error: any) {
    console.error('Delete attachment error:', error)
    return NextResponse.json(
      { error: 'Failed to delete attachment', detail: String(error?.message || error).substring(0, 200) },
      { status: 500 }
    )
  }
}
