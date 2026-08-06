import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// ─────────────────────────────────────────────────────────────────────────
// GET /api/tasks/[id]/attachments
// Returns metadata for all attachments linked to a task. The `fileData`
// column is intentionally excluded — clients fetch binary content via the
// per-attachment download endpoint to keep this list response small.
// ─────────────────────────────────────────────────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const task = await db.task.findUnique({
      where: { id },
      select: { id: true },
    })
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    const attachments = await db.taskAttachment.findMany({
      where: { taskId: id },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        taskId: true,
        fileName: true,
        fileType: true,
        fileSize: true,
        uploadedById: true,
        createdAt: true,
      },
    })

    return NextResponse.json({ attachments })
  } catch (error: any) {
    console.error('List attachments error:', error)
    return NextResponse.json(
      { error: 'Failed to list attachments', detail: String(error?.message || error).substring(0, 200) },
      { status: 500 }
    )
  }
}

// ─────────────────────────────────────────────────────────────────────────
// POST /api/tasks/[id]/attachments
// Multipart/form-data upload. Accepts one or more files under the `files`
// field. Each file is stored as raw bytes in the TaskAttachment table.
//
// Constraints:
//   • Max per-file size: 15 MB (Vercel serverless body limit safety)
//   • Allowed file types: images, PDFs, docs, excel, text, archives, any
//     common office format. We do not reject by extension — we only
//     surface the MIME type the browser sends us. The intent is "any file"
//     per the user's spec.
//   • Multiple attachments per task are supported.
//
// Returns: { uploaded: [{ id, fileName, fileSize, fileType }, ...] }
// ─────────────────────────────────────────────────────────────────────────
const MAX_FILE_SIZE = 15 * 1024 * 1024 // 15 MB per file

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const task = await db.task.findUnique({
      where: { id },
      select: { id: true, title: true },
    })
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    const formData = await req.formData()
    const files = formData.getAll('files').filter(f => f instanceof File) as File[]

    if (files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 })
    }

    // Optional: uploader user id (sent as a form field for audit)
    const uploadedById = (formData.get('uploadedById') as string | null) || null

    const uploaded: { id: string; fileName: string; fileSize: number; fileType: string }[] = []
    const errors: { fileName: string; reason: string }[] = []

    for (const file of files) {
      // Validate size
      if (file.size > MAX_FILE_SIZE) {
        errors.push({
          fileName: file.name,
          reason: `File exceeds 15 MB limit (got ${(file.size / (1024 * 1024)).toFixed(1)} MB)`,
        })
        continue
      }
      if (file.size === 0) {
        errors.push({ fileName: file.name, reason: 'File is empty' })
        continue
      }

      try {
        const arrayBuffer = await file.arrayBuffer()
        const fileData = Buffer.from(arrayBuffer)

        const att = await db.taskAttachment.create({
          data: {
            taskId: id,
            fileName: file.name,
            fileType: file.type || 'application/octet-stream',
            fileSize: file.size,
            fileData,
            uploadedById,
          },
          select: {
            id: true,
            fileName: true,
            fileSize: true,
            fileType: true,
          },
        })
        uploaded.push(att)
      } catch (e: any) {
        console.error('Failed to store attachment', file.name, e)
        errors.push({
          fileName: file.name,
          reason: String(e?.message || e).substring(0, 200),
        })
      }
    }

    // ─── Audit log entry in TaskActivity (non-fatal) ───────────────────
    try {
      if (uploaded.length > 0) {
        await db.taskActivity.create({
          data: {
            action: 'UPDATED',
            taskId: id,
            taskTitle: task.title,
            description: `Attached ${uploaded.length} file(s) to task: ${uploaded.map(u => u.fileName).join(', ')}`,
            actorId: uploadedById,
          },
        })
      }
    } catch (actErr) {
      console.error('TaskActivity attach log error (non-fatal):', actErr)
    }

    return NextResponse.json({ uploaded, errors }, { status: uploaded.length > 0 ? 201 : 400 })
  } catch (error: any) {
    console.error('Upload attachment error:', error)
    return NextResponse.json(
      { error: 'Failed to upload attachments', detail: String(error?.message || error).substring(0, 200) },
      { status: 500 }
    )
  }
}
