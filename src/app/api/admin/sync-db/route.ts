import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// POST /api/admin/sync-db
// Syncs the production DB schema with the Prisma schema by running ALTER TABLE
// statements directly via $executeRawUnsafe. Idempotent (uses IF NOT EXISTS).
//
// USAGE:
//   curl -X POST https://erp-ea.vercel.app/api/admin/sync-db
export async function POST(request: NextRequest) {
  const results: { step: string; status: 'ok' | 'skipped' | 'error'; message: string }[] = []

  // Helper: run a SQL statement safely via $executeRawUnsafe
  const runSql = async (sql: string, stepName: string) => {
    try {
      await db.$executeRawUnsafe(sql)
      results.push({ step: stepName, status: 'ok', message: 'OK' })
    } catch (e: any) {
      const msg = String(e?.message || e).substring(0, 200)
      // If error is "column already exists" or "table already exists", treat as ok
      if (msg.toLowerCase().includes('already exists') || msg.toLowerCase().includes('duplicate column') || msg.toLowerCase().includes('duplicate object')) {
        results.push({ step: stepName, status: 'skipped', message: 'Already exists' })
      } else {
        results.push({ step: stepName, status: 'error', message: msg })
      }
    }
  }

  // ───────────────────────────────────────────────────────────────────────
  // 1. Add missing columns to Task table (additive — no data loss)
  // ───────────────────────────────────────────────────────────────────────
  const taskColumns: { name: string; sql: string }[] = [
    { name: 'reviseReason',    sql: `ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "reviseReason" TEXT` },
    { name: 'reviseNextDate',  sql: `ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "reviseNextDate" TIMESTAMP(3)` },
    { name: 'revisedAt',       sql: `ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "revisedAt" TIMESTAMP(3)` },
    { name: 'reviseCount',     sql: `ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "reviseCount" INTEGER DEFAULT 0` },
    { name: 'score',           sql: `ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "score" DOUBLE PRECISION` },
    { name: 'frequency',       sql: `ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "frequency" TEXT` },
    { name: 'weekDays',        sql: `ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "weekDays" TEXT` },
    { name: 'monthDates',      sql: `ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "monthDates" TEXT` },
    { name: 'directorDependency', sql: `ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "directorDependency" TEXT` },
    { name: 'projectId',       sql: `ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "projectId" TEXT` },
    // ─── assignedById: Director who assigned the task (Samarth Sir / Ashish Sir) ───
    // This column is REQUIRED for the Director Dashboard feature. Without it, every
    // /api/tasks call returns HTTP 500 because Prisma tries to JOIN via this column
    // in the `include: { assignedBy: ... }` clause, and the DB rejects the query.
    // Adding it as nullable TEXT preserves all 36 existing rows (they get NULL, which
    // the API now treats as "legacy task — visible to every director").
    { name: 'assignedById',    sql: `ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "assignedById" TEXT` },
  ]
  for (const col of taskColumns) {
    await runSql(col.sql, `Add Task.${col.name}`)
  }

  // ───────────────────────────────────────────────────────────────────────
  // 2. Add missing columns to TaskStep table
  // ───────────────────────────────────────────────────────────────────────
  const taskStepColumns: { name: string; sql: string }[] = [
    { name: 'needsDirectorApproval', sql: `ALTER TABLE "TaskStep" ADD COLUMN IF NOT EXISTS "needsDirectorApproval" BOOLEAN DEFAULT false` },
    { name: 'directorName',          sql: `ALTER TABLE "TaskStep" ADD COLUMN IF NOT EXISTS "directorName" TEXT` },
    { name: 'directorNote',          sql: `ALTER TABLE "TaskStep" ADD COLUMN IF NOT EXISTS "directorNote" TEXT` },
  ]
  for (const col of taskStepColumns) {
    await runSql(col.sql, `Add TaskStep.${col.name}`)
  }

  // ───────────────────────────────────────────────────────────────────────
  // 3. Add missing columns to Leave table
  // ───────────────────────────────────────────────────────────────────────
  const leaveColumns: { name: string; sql: string }[] = [
    { name: 'applicationTag', sql: `ALTER TABLE "Leave" ADD COLUMN IF NOT EXISTS "applicationTag" TEXT DEFAULT 'AL'` },
    { name: 'eaRemark',       sql: `ALTER TABLE "Leave" ADD COLUMN IF NOT EXISTS "eaRemark" TEXT` },
    { name: 'approvedById',   sql: `ALTER TABLE "Leave" ADD COLUMN IF NOT EXISTS "approvedById" TEXT` },
    { name: 'approvedAt',     sql: `ALTER TABLE "Leave" ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3)` },
    { name: 'totalDays',      sql: `ALTER TABLE "Leave" ADD COLUMN IF NOT EXISTS "totalDays" DOUBLE PRECISION DEFAULT 1` },
  ]
  for (const col of leaveColumns) {
    await runSql(col.sql, `Add Leave.${col.name}`)
  }

  // ───────────────────────────────────────────────────────────────────────
  // 4. Create TaskActivity table if it doesn't exist
  // ───────────────────────────────────────────────────────────────────────
  await runSql(`
    CREATE TABLE IF NOT EXISTS "TaskActivity" (
      "id"          TEXT NOT NULL,
      "action"      TEXT NOT NULL,
      "taskTitle"   TEXT NOT NULL,
      "taskId"      TEXT NOT NULL,
      "priority"    TEXT,
      "department"  TEXT,
      "category"    TEXT,
      "status"      TEXT,
      "actorId"     TEXT,
      "description" TEXT,
      "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "TaskActivity_pkey" PRIMARY KEY ("id")
    )
  `, 'Create TaskActivity table')

  // Create indexes on TaskActivity (idempotent)
  await runSql(`CREATE INDEX IF NOT EXISTS "TaskActivity_taskId_idx" ON "TaskActivity"("taskId")`, 'Index TaskActivity.taskId')
  await runSql(`CREATE INDEX IF NOT EXISTS "TaskActivity_createdAt_idx" ON "TaskActivity"("createdAt")`, 'Index TaskActivity.createdAt')
  await runSql(`CREATE INDEX IF NOT EXISTS "TaskActivity_action_idx" ON "TaskActivity"("action")`, 'Index TaskActivity.action')

  // Add foreign key from TaskActivity.actorId → User.id (if not exists)
  // Postgres doesn't support IF NOT EXISTS for ADD CONSTRAINT directly, so we use a DO block
  await runSql(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'TaskActivity_actorId_fkey' AND table_name = 'TaskActivity'
      ) THEN
        ALTER TABLE "TaskActivity"
          ADD CONSTRAINT "TaskActivity_actorId_fkey"
          FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
      END IF;
    END $$;
  `, 'Add FK TaskActivity.actorId → User.id')

  // ───────────────────────────────────────────────────────────────────────
  // 4b. Create TaskAttachment table (v25·0627) if it doesn't exist
  // ───────────────────────────────────────────────────────────────────────
  // Purely ADDITIVE — does NOT touch any existing table or row. Files are
  // stored as raw BYTEA so the feature works on Vercel without external
  // object storage. Existing tasks simply have zero attachments until the
  // user uploads one.
  await runSql(`
    CREATE TABLE IF NOT EXISTS "TaskAttachment" (
      "id"           TEXT NOT NULL,
      "taskId"       TEXT NOT NULL,
      "fileName"     TEXT NOT NULL,
      "fileType"     TEXT NOT NULL DEFAULT 'application/octet-stream',
      "fileSize"     INTEGER NOT NULL DEFAULT 0,
      "fileData"     BYTEA NOT NULL,
      "uploadedById" TEXT,
      "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "TaskAttachment_pkey" PRIMARY KEY ("id")
    )
  `, 'Create TaskAttachment table')

  await runSql(`CREATE INDEX IF NOT EXISTS "TaskAttachment_taskId_idx" ON "TaskAttachment"("taskId")`, 'Index TaskAttachment.taskId')
  await runSql(`CREATE INDEX IF NOT EXISTS "TaskAttachment_createdAt_idx" ON "TaskAttachment"("createdAt")`, 'Index TaskAttachment.createdAt')

  // FK: TaskAttachment.taskId → Task.id (CASCADE on delete)
  await runSql(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'TaskAttachment_taskId_fkey' AND table_name = 'TaskAttachment'
      ) THEN
        ALTER TABLE "TaskAttachment"
          ADD CONSTRAINT "TaskAttachment_taskId_fkey"
          FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      END IF;
    END $$;
  `, 'Add FK TaskAttachment.taskId → Task.id')

  // FK: TaskAttachment.uploadedById → User.id (SET NULL on delete)
  await runSql(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'TaskAttachment_uploadedById_fkey' AND table_name = 'TaskAttachment'
      ) THEN
        ALTER TABLE "TaskAttachment"
          ADD CONSTRAINT "TaskAttachment_uploadedById_fkey"
          FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
      END IF;
    END $$;
  `, 'Add FK TaskAttachment.uploadedById → User.id')

  // ───────────────────────────────────────────────────────────────────────
  // 5. Add missing User columns
  // ───────────────────────────────────────────────────────────────────────
  const userColumns: { name: string; sql: string }[] = [
    { name: 'loginUsername',  sql: `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "loginUsername" TEXT` },
    { name: 'loginPassword',  sql: `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "loginPassword" TEXT` },
    { name: 'isActive',       sql: `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN DEFAULT true` },
    { name: 'joinDate',       sql: `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "joinDate" TIMESTAMP(3)` },
    { name: 'designation',    sql: `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "designation" TEXT` },
    { name: 'phone',          sql: `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "phone" TEXT` },
    { name: 'location',       sql: `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "location" TEXT` },
    { name: 'avatar',         sql: `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "avatar" TEXT` },
  ]
  for (const col of userColumns) {
    await runSql(col.sql, `Add User.${col.name}`)
  }

  // ───────────────────────────────────────────────────────────────────────
  // 5b. Ensure unique index on User.loginUsername (matches Prisma @unique)
  // ───────────────────────────────────────────────────────────────────────
  // Only enforce uniqueness for NON-NULL values — multiple NULLs are allowed
  // (Prisma's standard behaviour for @unique on nullable columns).
  await runSql(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE indexname = 'User_loginUsername_key'
      ) THEN
        CREATE UNIQUE INDEX "User_loginUsername_key"
          ON "User" ("loginUsername")
          WHERE "loginUsername" IS NOT NULL;
      END IF;
    END $$;
  `, 'Ensure unique index on User.loginUsername')

  // ───────────────────────────────────────────────────────────────────────
  // 6. Add missing MondayMeeting columns (just in case)
  // ───────────────────────────────────────────────────────────────────────
  const mondayColumns: { name: string; sql: string }[] = [
    { name: 'planRedScore',       sql: `ALTER TABLE "MondayMeeting" ADD COLUMN IF NOT EXISTS "planRedScore" DOUBLE PRECISION DEFAULT 0` },
    { name: 'planYellowScore',    sql: `ALTER TABLE "MondayMeeting" ADD COLUMN IF NOT EXISTS "planYellowScore" DOUBLE PRECISION DEFAULT 0` },
    { name: 'planGreenScore',     sql: `ALTER TABLE "MondayMeeting" ADD COLUMN IF NOT EXISTS "planGreenScore" DOUBLE PRECISION DEFAULT 0` },
    { name: 'actualRedScore',     sql: `ALTER TABLE "MondayMeeting" ADD COLUMN IF NOT EXISTS "actualRedScore" DOUBLE PRECISION DEFAULT 0` },
    { name: 'actualYellowScore', sql: `ALTER TABLE "MondayMeeting" ADD COLUMN IF NOT EXISTS "actualYellowScore" DOUBLE PRECISION DEFAULT 0` },
    { name: 'actualGreenScore',   sql: `ALTER TABLE "MondayMeeting" ADD COLUMN IF NOT EXISTS "actualGreenScore" DOUBLE PRECISION DEFAULT 0` },
    { name: 'nextRedScore',       sql: `ALTER TABLE "MondayMeeting" ADD COLUMN IF NOT EXISTS "nextRedScore" DOUBLE PRECISION DEFAULT 0` },
    { name: 'nextYellowScore',   sql: `ALTER TABLE "MondayMeeting" ADD COLUMN IF NOT EXISTS "nextYellowScore" DOUBLE PRECISION DEFAULT 0` },
    { name: 'nextGreenScore',     sql: `ALTER TABLE "MondayMeeting" ADD COLUMN IF NOT EXISTS "nextGreenScore" DOUBLE PRECISION DEFAULT 0` },
    { name: 'prScore',            sql: `ALTER TABLE "MondayMeeting" ADD COLUMN IF NOT EXISTS "prScore" DOUBLE PRECISION DEFAULT 0` },
    { name: 'commitments',        sql: `ALTER TABLE "MondayMeeting" ADD COLUMN IF NOT EXISTS "commitments" TEXT` },
    { name: 'notes',              sql: `ALTER TABLE "MondayMeeting" ADD COLUMN IF NOT EXISTS "notes" TEXT` },
  ]
  for (const col of mondayColumns) {
    await runSql(col.sql, `Add MondayMeeting.${col.name}`)
  }

  // ───────────────────────────────────────────────────────────────────────
  // 7. Final verification — count tasks to confirm DB is reachable
  // ───────────────────────────────────────────────────────────────────────
  let finalTaskCount = 0
  try {
    finalTaskCount = await db.task.count()
    results.push({ step: 'Verify Task.count()', status: 'ok', message: `Counted ${finalTaskCount} tasks` })
  } catch (e: any) {
    results.push({ step: 'Verify Task.count()', status: 'error', message: String(e?.message || e).substring(0, 200) })
  }

  return NextResponse.json({
    success: true,
    finalTaskCount,
    steps: results,
  })
}

export async function GET() {
  return NextResponse.json({
    message: 'POST to this endpoint to run the DB schema sync (additive ALTER TABLE statements).',
    warning: 'Takes 5-10 seconds. Idempotent — safe to run multiple times.',
  })
}
