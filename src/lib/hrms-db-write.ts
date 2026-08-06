// ════════════════════════════════════════════════════════════════════════
// v25·0806-fix — HRMS DB WRITE (attendance sync from ERP punches)
// ════════════════════════════════════════════════════════════════════════
// Syncs ERP PunchRecord → HRMS Attendance table directly via the HRMS
// Neon database connection (HRMS_DATABASE_URL).
//
// WHY:
//   The ERP punch feature launched 2026-08-01. Before that, HRMS had its
//   own attendance records (manually entered). After ERP punches went live,
//   punches were saved ONLY in the ERP database — HRMS had no way to know
//   about them. So users saw their July history in HRMS but August was
//   blank. This module fixes that by pushing each ERP punch into the HRMS
//   Attendance table in real-time.
//
// SAFETY:
//   - UPSERT only (INSERT if absent, UPDATE if present for same employee+date).
//   - NEVER DELETE.
//   - Only writes the SPECIFIC date being synced — never touches historical
//     records from before the sync was triggered.
//   - The HRMS Neon connection is SEPARATE from the ERP Neon connection.
//   - All queries are parameterized (no SQL injection).
//   - If the HRMS DB is unreachable, the ERP punch STILL succeeds — the
//     sync error is logged but does not block the user's punch.
//
// ENV:
//   HRMS_DATABASE_URL — Neon connection string for the HRMS database.
//     Example: postgresql://neondb_owner:***@ep-empty-haze-***.neon.tech/neondb?sslmode=require
// ════════════════════════════════════════════════════════════════════════

import { Pool } from 'pg'

// ─── Shift config (matches HR report + salary slip + attendance bridge) ───
const SHIFT_START_HOUR = 10
const SHIFT_END_HOUR = 19
const LATE_THRESHOLD_MINUTES = 15
const LATE_THRESHOLD_MIN = SHIFT_START_HOUR * 60 + LATE_THRESHOLD_MINUTES // 615 (10:15 AM)
const SHIFT_END_MIN = SHIFT_END_HOUR * 60 // 1140 (7:00 PM)
const SHIFT_HOURS = SHIFT_END_HOUR - SHIFT_START_HOUR // 9

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000 // IST = UTC + 5:30

let _pool: Pool | null = null

function getPool(): Pool | null {
  const url = process.env.HRMS_DATABASE_URL
  if (!url) return null
  if (!_pool) {
    _pool = new Pool({
      connectionString: url,
      max: 2,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 8000,
      ssl: { rejectUnauthorized: false },
    })
  }
  return _pool
}

export function isHrmsDbWritable(): boolean {
  return !!process.env.HRMS_DATABASE_URL
}

// ─── IST helpers ───
interface IstParts {
  year: number
  month: number // 1-12
  day: number // 1-31
  hour: number // 0-23
  minute: number // 0-59
  dayOfWeek: number // 0=Sun, 6=Sat
  dateStr: string // "YYYY-MM-DD"
}

function getIstParts(d: Date): IstParts {
  const ist = new Date(d.getTime() + IST_OFFSET_MS)
  const y = ist.getUTCFullYear()
  const m = ist.getUTCMonth() + 1
  const day = ist.getUTCDate()
  return {
    year: y,
    month: m,
    day,
    hour: ist.getUTCHours(),
    minute: ist.getUTCMinutes(),
    dayOfWeek: ist.getUTCDay(),
    dateStr: `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
  }
}

function formatHrmsTime(d: Date): string {
  const p = getIstParts(d)
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`
}

// Generate a cuid-style id (24 chars, starts with 'c') compatible with
// the HRMS Prisma schema. Combines base36 timestamp + random suffix.
function generateCuidId(): string {
  const ts = Date.now().toString(36).padStart(8, '0').slice(-8)
  const rand = Math.random().toString(36).slice(2, 14).padEnd(12, '0')
  const counter = process.hrtime?.()[1]?.toString(36).slice(0, 3).padEnd(3, '0') || '000'
  return `c${ts}${rand}${counter}`.slice(0, 24)
}

// ─── Public types ───

export interface HrmsAttendanceUpsertInput {
  /** HRMS employeeId code, e.g. "EMP-021". NOT the cuid. */
  hrmsEmployeeId: string
  /** Any timestamp on the target IST day. We use the IST date part only. */
  date: Date
  /** Earliest punch-in for the day (or null if none). */
  checkIn: Date | null
  /** Latest punch-out for the day (or null if still punched in). */
  checkOut: Date | null
  /** Worked hours between checkIn and checkOut. */
  totalHours: number
  /** Computed overtime (max(0, totalHours - 9)). */
  overtimeHours: number
  /** Status string — matches HRMS's existing values. */
  status: 'present' | 'late' | 'early-out' | 'half-day' | 'absent'
  lateEntry: boolean
  earlyOut: boolean
  halfDay: boolean
  /** Optional remark. Defaults to "Synced from ERP punch". */
  remarks?: string | null
}

export interface HrmsAttendanceUpsertResult {
  success: boolean
  id: string | null
  mode: 'insert' | 'update' | 'noop'
  error?: string
}

/**
 * Look up the HRMS employeeId (e.g. "EMP-021") by the HRMS Employee.id (cuid).
 * Returns null if not found or DB not configured.
 */
export async function fetchHrmsEmployeeCodeByCuid(
  hrmsCuid: string
): Promise<string | null> {
  const pool = getPool()
  if (!pool || !hrmsCuid) return null
  try {
    const res = await pool.query(
      `SELECT "employeeId" FROM "Employee" WHERE id = $1 LIMIT 1`,
      [hrmsCuid]
    )
    if (res.rows.length === 0) return null
    return res.rows[0].employeeId
  } catch (e) {
    console.error('[HRMS-DB-WRITE] fetchHrmsEmployeeCodeByCuid error:', e)
    return null
  }
}

/**
 * UPSert an HRMS Attendance record for a specific employee + IST date.
 *
 * Behavior:
 *   - If a record exists for (employeeId, date): UPDATE checkIn/checkOut/
 *     totalHours/status/etc.
 *   - Otherwise: INSERT a new record with a fresh cuid id.
 *   - NEVER deletes. NEVER touches other dates or employees.
 *
 * Returns { success, id, mode } on success, { success: false, error } on failure.
 */
export async function upsertHrmsAttendanceRecord(
  input: HrmsAttendanceUpsertInput
): Promise<HrmsAttendanceUpsertResult> {
  const pool = getPool()
  if (!pool) {
    return { success: false, id: null, mode: 'noop', error: 'HRMS_DATABASE_URL not configured' }
  }
  if (!input.hrmsEmployeeId) {
    return { success: false, id: null, mode: 'noop', error: 'hrmsEmployeeId is required' }
  }

  const parts = getIstParts(input.date)
  // IST midnight expressed as a UTC Date — this is what the HRMS Attendance.date
  // column stores (the HRMS app uses Prisma with @db.Timestamp in IST context).
  const istMidnightUtcMs = Date.UTC(parts.year, parts.month - 1, parts.day) - IST_OFFSET_MS
  const dateOnly = new Date(istMidnightUtcMs)

  const dayOfWeek = parts.dayOfWeek
  const isSunday = dayOfWeek === 0
  const isSaturday = dayOfWeek === 6
  const isWeeklyOff = isSunday || isSaturday
  const sundayHours = isSunday ? Math.round(input.totalHours * 100) / 100 : 0

  const checkInStr = input.checkIn ? formatHrmsTime(input.checkIn) : ''
  const checkOutStr = input.checkOut ? formatHrmsTime(input.checkOut) : ''
  const remarks = input.remarks || 'Synced from ERP punch'

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // Check if record exists for this employee + date (IST day boundaries in UTC)
    const existing = await client.query(
      `SELECT id FROM "Attendance"
       WHERE "employeeId" = $1
         AND date >= $2::timestamp
         AND date < ($2::timestamp + INTERVAL '1 day')
       LIMIT 1`,
      [input.hrmsEmployeeId, dateOnly]
    )

    let id: string
    let mode: 'insert' | 'update'

    if (existing.rows.length > 0) {
      id = existing.rows[0].id
      mode = 'update'
      await client.query(
        `UPDATE "Attendance"
         SET "checkIn" = $3,
             "checkOut" = $4,
             "totalHours" = $5,
             status = $6,
             "lateEntry" = $7,
             "earlyOut" = $8,
             "halfDay" = $9,
             "overtimeHours" = $10,
             "isSunday" = $11,
             "isWeeklyOff" = $12,
             "sundayHours" = $13,
             remarks = $14,
             "updatedAt" = NOW()
         WHERE id = $2`,
        [
          input.hrmsEmployeeId,
          id,
          checkInStr,
          checkOutStr,
          Math.round(input.totalHours * 100) / 100,
          input.status,
          input.lateEntry,
          input.earlyOut,
          input.halfDay,
          Math.round(input.overtimeHours * 100) / 100,
          isSunday,
          isWeeklyOff,
          sundayHours,
          remarks,
        ]
      )
    } else {
      id = generateCuidId()
      mode = 'insert'
      await client.query(
        `INSERT INTO "Attendance" (
            id, "employeeId", date, "checkIn", "checkOut", "totalHours",
            status, "lateEntry", "halfDay", "overtimeHours", "earlyOut",
            "isHoliday", "isWeeklyOff", "isSunday", "isPH", "sundayHours",
            remarks, "createdAt", "updatedAt"
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW(), NOW())`,
        [
          id,
          input.hrmsEmployeeId,
          dateOnly,
          checkInStr,
          checkOutStr,
          Math.round(input.totalHours * 100) / 100,
          input.status,
          input.lateEntry,
          input.halfDay,
          Math.round(input.overtimeHours * 100) / 100,
          input.earlyOut,
          false, // isHoliday — never auto-mark; HRMS admin sets these
          isWeeklyOff,
          isSunday,
          false, // isPH — public holiday; HRMS admin sets these
          sundayHours,
          remarks,
        ]
      )
    }

    await client.query('COMMIT')
    return { success: true, id, mode }
  } catch (e: any) {
    await client.query('ROLLBACK').catch(() => {})
    console.error('[HRMS-DB-WRITE] upsertHrmsAttendanceRecord error:', e?.message || e)
    return {
      success: false,
      id: null,
      mode: 'noop',
      error: e?.message || String(e),
    }
  } finally {
    client.release()
  }
}

// ─── Higher-level helper: sync a full day's punches for a user ───

export interface DailyPunchSummary {
  checkIn: Date | null
  checkOut: Date | null
  totalHours: number
  overtimeHours: number
  status: 'present' | 'late' | 'early-out' | 'half-day' | 'absent'
  lateEntry: boolean
  earlyOut: boolean
  halfDay: boolean
}

/**
 * Compute the consolidated daily attendance summary from a list of ERP
 * punch records for a single user on a single IST day.
 *
 * Rules:
 *   - checkIn = earliest punchIn
 *   - checkOut = latest punchOut (null if any punch is still IN_PROGRESS)
 *   - totalHours = (checkOut - checkIn) / 1h, or 0 if checkOut is null
 *   - lateEntry = checkIn minutes-of-day > 10:15 IST (615)
 *   - earlyOut  = checkOut minutes-of-day < 19:00 IST (1140)
 *   - status priority: late > early-out > present
 *   - overtimeHours = max(0, totalHours - 9)
 */
export function computeDailyPunchSummary(
  punches: { punchIn: Date; punchOut: Date | null }[]
): DailyPunchSummary {
  if (!punches.length) {
    return {
      checkIn: null, checkOut: null,
      totalHours: 0, overtimeHours: 0,
      status: 'absent', lateEntry: false, earlyOut: false, halfDay: false,
    }
  }

  let earliestIn = punches[0].punchIn
  let latestOut: Date | null = null
  let hasInProgress = false

  for (const p of punches) {
    if (new Date(p.punchIn) < new Date(earliestIn)) {
      earliestIn = new Date(p.punchIn)
    }
    if (p.punchOut) {
      const po = new Date(p.punchOut)
      if (!latestOut || po > latestOut) {
        latestOut = po
      }
    } else {
      hasInProgress = true
    }
  }

  // If any punch is still IN_PROGRESS, treat as "still working" — checkOut
  // is null until the user punches out. This matches HRMS behavior where
  // an active day shows checkIn but blank checkOut until close.
  const finalCheckOut = hasInProgress ? null : latestOut

  let totalHours = 0
  if (finalCheckOut) {
    const workedMs = finalCheckOut.getTime() - new Date(earliestIn).getTime()
    totalHours = Math.max(0, workedMs / (1000 * 60 * 60))
  }

  const inParts = getIstParts(new Date(earliestIn))
  const punchInMin = inParts.hour * 60 + inParts.minute
  const lateEntry = punchInMin > LATE_THRESHOLD_MIN

  let earlyOut = false
  if (finalCheckOut) {
    const outParts = getIstParts(finalCheckOut)
    const punchOutMin = outParts.hour * 60 + outParts.minute
    earlyOut = punchOutMin < SHIFT_END_MIN
  }

  const overtimeHours = Math.max(0, totalHours - SHIFT_HOURS)

  let status: DailyPunchSummary['status']
  if (lateEntry) {
    status = 'late'
  } else if (earlyOut) {
    status = 'early-out'
  } else if (finalCheckOut) {
    status = 'present'
  } else {
    // Has punch-in but no punch-out yet — still working. Mark as present
    // so the day doesn't show as "absent" while the user is on shift.
    status = 'present'
  }

  return {
    checkIn: new Date(earliestIn),
    checkOut: finalCheckOut,
    totalHours: Math.round(totalHours * 100) / 100,
    overtimeHours: Math.round(overtimeHours * 100) / 100,
    status,
    lateEntry,
    earlyOut,
    halfDay: false,
  }
}
