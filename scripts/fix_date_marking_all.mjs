// Fix Kamlesh's existing HRMS Attendance record — was stored with wrong date
// (2026-08-05T18:30:00Z = midnight IST, but should be 2026-08-06T00:00:00Z
// = midnight UTC of IST calendar date).
//
// Also backfill Chaitanaya's today punch (was missing because the punch route
// wasn't deployed yet).
import { Pool } from 'pg'

const ERP_URL = 'postgresql://neondb_owner:npg_V0CoL3SDNcKm@ep-noisy-bonus-app8563v.c-7.us-east-1.aws.neon.tech/neondb?sslmode=require'
const HRMS_URL = 'postgresql://neondb_owner:npg_pGbVon2mrZ3q@ep-empty-haze-aq8y1r98-pooler.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require'

const erp = new Pool({ connectionString: ERP_URL, max: 2, ssl: { rejectUnauthorized: false } })
const hrms = new Pool({ connectionString: HRMS_URL, max: 2, ssl: { rejectUnauthorized: false } })

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000

function getIstParts(d) {
  const ist = new Date(d.getTime() + IST_OFFSET_MS)
  return {
    year: ist.getUTCFullYear(),
    month: ist.getUTCMonth() + 1,
    day: ist.getUTCDate(),
    hour: ist.getUTCHours(),
    minute: ist.getUTCMinutes(),
    dayOfWeek: ist.getUTCDay(),
  }
}

function formatHrmsTime(d) {
  const p = getIstParts(d)
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`
}

function generateCuidId() {
  const ts = Date.now().toString(36).padStart(8, '0').slice(-8)
  const rand = Math.random().toString(36).slice(2, 14).padEnd(12, '0')
  return `c${ts}${rand}`.slice(0, 24)
}

const SHIFT_START_HOUR = 10
const SHIFT_END_HOUR = 19
const LATE_THRESHOLD_MIN = SHIFT_START_HOUR * 60 + 15
const SHIFT_END_MIN = SHIFT_END_HOUR * 60
const SHIFT_HOURS = SHIFT_END_HOUR - SHIFT_START_HOUR

function computeDailySummary(punches) {
  if (!punches.length) return null
  let earliestIn = new Date(punches[0].punchIn)
  let latestOut = null
  let hasInProgress = false
  for (const p of punches) {
    const pin = new Date(p.punchIn)
    if (pin < earliestIn) earliestIn = pin
    if (p.punchOut) {
      const po = new Date(p.punchOut)
      if (!latestOut || po > latestOut) latestOut = po
    } else hasInProgress = true
  }
  const finalCheckOut = hasInProgress ? null : latestOut
  let totalHours = 0
  if (finalCheckOut) {
    totalHours = Math.max(0, (finalCheckOut.getTime() - earliestIn.getTime()) / (1000 * 60 * 60))
  }
  const inParts = getIstParts(earliestIn)
  const punchInMin = inParts.hour * 60 + inParts.minute
  const lateEntry = punchInMin > LATE_THRESHOLD_MIN
  let earlyOut = false
  if (finalCheckOut) {
    const outParts = getIstParts(finalCheckOut)
    const punchOutMin = outParts.hour * 60 + outParts.minute
    earlyOut = punchOutMin < SHIFT_END_MIN
  }
  const overtimeHours = Math.max(0, totalHours - SHIFT_HOURS)
  let status
  if (lateEntry) status = 'late'
  else if (earlyOut) status = 'early-out'
  else if (finalCheckOut) status = 'present'
  else status = 'present'
  return {
    checkIn: earliestIn,
    checkOut: finalCheckOut,
    totalHours: Math.round(totalHours * 100) / 100,
    overtimeHours: Math.round(overtimeHours * 100) / 100,
    status, lateEntry, earlyOut, halfDay: false,
  }
}

// Sync one user's today punches to HRMS with CORRECT date handling
async function syncUserToday(erpUser, hrmsEmpCode) {
  console.log(`\n--- Syncing ${erpUser.name} (${hrmsEmpCode}) ---`)
  
  // Get today IST calendar date
  const todayParts = getIstParts(new Date())
  
  // Fetch ERP punches for today IST
  const startUtcMs = Date.UTC(todayParts.year, todayParts.month - 1, todayParts.day) - IST_OFFSET_MS
  const endUtcMs = Date.UTC(todayParts.year, todayParts.month - 1, todayParts.day + 1) - IST_OFFSET_MS - 1
  const punches = await erp.query(`
    SELECT id, "punchIn", "punchOut", status FROM "PunchRecord"
    WHERE "userId" = $1 AND "punchIn" >= $2 AND "punchIn" <= $3
    ORDER BY "punchIn" ASC
  `, [erpUser.id, new Date(startUtcMs), new Date(endUtcMs)])
  
  console.log(`  Found ${punches.rows.length} punches today`)
  if (punches.rows.length === 0) {
    console.log('  Skipping — no punches')
    return
  }
  
  const summary = computeDailySummary(punches.rows)
  console.log('  Summary:', {
    checkIn: summary.checkIn.toISOString(),
    checkOut: summary.checkOut?.toISOString() || '(in progress)',
    totalHours: summary.totalHours,
    status: summary.status,
    lateEntry: summary.lateEntry,
  })
  
  // ✅ CORRECT date: midnight UTC of the IST calendar date
  // (NOT midnight IST which would be Aug-05 18:30 UTC for Aug-6 IST)
  const dateOnly = new Date(Date.UTC(todayParts.year, todayParts.month - 1, todayParts.day))
  console.log(`  Storing date as: ${dateOnly.toISOString()} (should be ${todayParts.year}-${String(todayParts.month).padStart(2,'0')}-${String(todayParts.day).padStart(2,'0')}T00:00:00.000Z)`)
  
  const dayOfWeek = todayParts.dayOfWeek
  const isSunday = dayOfWeek === 0
  const isSaturday = dayOfWeek === 6
  const isWeeklyOff = isSunday || isSaturday
  const sundayHours = isSunday ? summary.totalHours : 0
  const checkInStr = formatHrmsTime(summary.checkIn)
  const checkOutStr = summary.checkOut ? formatHrmsTime(summary.checkOut) : ''
  const remarks = `Re-synced (date fix) on ${new Date().toISOString()}`
  
  // Look for existing record on this date (using CORRECT date range)
  const dayStartUtc = Date.UTC(todayParts.year, todayParts.month - 1, todayParts.day)
  const dayEndUtc = dayStartUtc + 24 * 60 * 60 * 1000 - 1
  const existing = await hrms.query(`
    SELECT id, date, "checkIn", "checkOut", status FROM "Attendance"
    WHERE "employeeId" = $1
      AND date >= to_timestamp($2 / 1000.0)
      AND date <= to_timestamp($3 / 1000.0)
    LIMIT 1
  `, [hrmsEmpCode, dayStartUtc, dayEndUtc])
  
  // ALSO look for the wrongly-dated record (Aug-05 18:30 UTC for Aug-6 IST)
  // so we can update it instead of creating a duplicate
  const wrongDateUtcMs = dayStartUtc - IST_OFFSET_MS  // = Aug-05 18:30 UTC
  const wrongDateEndUtcMs = wrongDateUtcMs + 60 * 60 * 1000  // 1-hour window
  const wrongDateExisting = existing.rows.length === 0 ? await hrms.query(`
    SELECT id, date, "checkIn", "checkOut", status FROM "Attendance"
    WHERE "employeeId" = $1
      AND date >= to_timestamp($2 / 1000.0)
      AND date <= to_timestamp($3 / 1000.0)
    LIMIT 1
  `, [hrmsEmpCode, wrongDateUtcMs, wrongDateEndUtcMs]) : { rows: [] }
  
  let id, mode
  const client = await hrms.connect()
  try {
    await client.query('BEGIN')
    
    if (existing.rows.length > 0) {
      // Correctly-dated record exists — UPDATE it
      id = existing.rows[0].id
      mode = 'UPDATE (correct date)'
      await client.query(
        `UPDATE "Attendance"
         SET "checkIn" = $1, "checkOut" = $2, "totalHours" = $3,
             status = $4, "lateEntry" = $5, "earlyOut" = $6,
             "halfDay" = $7, "overtimeHours" = $8,
             "isSunday" = $9, "isWeeklyOff" = $10,
             "sundayHours" = $11, remarks = $12,
             "updatedAt" = NOW()
         WHERE id = $13`,
        [checkInStr, checkOutStr, summary.totalHours,
         summary.status, summary.lateEntry, summary.earlyOut,
         summary.halfDay, summary.overtimeHours,
         isSunday, isWeeklyOff, sundayHours, remarks, id]
      )
    } else if (wrongDateExisting.rows.length > 0) {
      // Wrongly-dated record exists — UPDATE it AND fix the date
      id = wrongDateExisting.rows[0].id
      mode = 'UPDATE (fixing date from Aug-5 18:30 to Aug-6 00:00)'
      await client.query(
        `UPDATE "Attendance"
         SET date = $1,
             "checkIn" = $2, "checkOut" = $3, "totalHours" = $4,
             status = $5, "lateEntry" = $6, "earlyOut" = $7,
             "halfDay" = $8, "overtimeHours" = $9,
             "isSunday" = $10, "isWeeklyOff" = $11,
             "sundayHours" = $12, remarks = $13,
             "updatedAt" = NOW()
         WHERE id = $14`,
        [dateOnly,
         checkInStr, checkOutStr, summary.totalHours,
         summary.status, summary.lateEntry, summary.earlyOut,
         summary.halfDay, summary.overtimeHours,
         isSunday, isWeeklyOff, sundayHours, remarks, id]
      )
    } else {
      // No existing record — INSERT new with correct date
      id = generateCuidId()
      mode = 'INSERT (correct date)'
      await client.query(
        `INSERT INTO "Attendance" (
            id, "employeeId", date, "checkIn", "checkOut", "totalHours",
            status, "lateEntry", "halfDay", "overtimeHours", "earlyOut",
            "isHoliday", "isWeeklyOff", "isSunday", "isPH", "sundayHours",
            remarks, "createdAt", "updatedAt"
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW(), NOW())`,
        [id, hrmsEmpCode, dateOnly,
         checkInStr, checkOutStr, summary.totalHours,
         summary.status, summary.lateEntry, summary.halfDay,
         summary.overtimeHours, summary.earlyOut,
         false, isWeeklyOff, isSunday, false, sundayHours,
         remarks]
      )
    }
    
    await client.query('COMMIT')
    console.log(`  ✅ ${mode} — id=${id}`)
  } catch (e) {
    await client.query('ROLLBACK')
    console.error('  ❌ Failed:', e.message)
    throw e
  } finally {
    client.release()
  }
}

// === Main ===
console.log('=== Fetching today\'s punches from ERP for ALL active employees ===')
const todayParts = getIstParts(new Date())
console.log(`Today (IST): ${todayParts.year}-${String(todayParts.month).padStart(2,'0')}-${String(todayParts.day).padStart(2,'0')}`)

const startUtcMs = Date.UTC(todayParts.year, todayParts.month - 1, todayParts.day) - IST_OFFSET_MS
const endUtcMs = Date.UTC(todayParts.year, todayParts.month - 1, todayParts.day + 1) - IST_OFFSET_MS - 1
const todayPunches = await erp.query(`
  SELECT p.id, p."userId", u.name, u."hrmsId"
  FROM "PunchRecord" p
  JOIN "User" u ON u.id = p."userId"
  WHERE p."punchIn" >= $1 AND p."punchIn" <= $2
    AND u."isActive" = true AND u."hrmsId" IS NOT NULL
  ORDER BY u.name ASC
`, [new Date(startUtcMs), new Date(endUtcMs)])

// Unique users who punched today
const usersByUserId = {}
for (const p of todayPunches.rows) {
  if (!usersByUserId[p.userId]) {
    usersByUserId[p.userId] = { id: p.userId, name: p.name, hrmsId: p.hrmsId }
  }
}
const uniqueUsers = Object.values(usersByUserId)
console.log(`Unique users who punched today: ${uniqueUsers.length}`)
console.table(uniqueUsers)

console.log('\n=== Syncing each user ===')
for (const user of uniqueUsers) {
  // Resolve HRMS employeeId code (EMP-XXX)
  const hrmsEmp = await hrms.query(`
    SELECT "employeeId", "fullName" FROM "Employee" WHERE id = $1 LIMIT 1
  `, [user.hrmsId])
  if (hrmsEmp.rows.length === 0) {
    console.log(`❌ No HRMS employee found for ${user.name} (hrmsId=${user.hrmsId})`)
    continue
  }
  await syncUserToday(user, hrmsEmp.rows[0].employeeId)
}

console.log('\n=== VERIFY: All HRMS Attendance records for today ===')
const dayStartUtc = Date.UTC(todayParts.year, todayParts.month - 1, todayParts.day)
const dayEndUtc = dayStartUtc + 24 * 60 * 60 * 1000 - 1
const verify = await hrms.query(`
  SELECT a.id, a."employeeId", e."fullName", a.date, a."checkIn", a."checkOut",
         a.status, a."lateEntry", a."earlyOut"
  FROM "Attendance" a
  LEFT JOIN "Employee" e ON e."employeeId" = a."employeeId"
  WHERE a.date >= to_timestamp($1 / 1000.0)
    AND a.date <= to_timestamp($2 / 1000.0)
  ORDER BY a.date DESC
`, [dayStartUtc, dayEndUtc])
console.log(`HRMS Attendance records for ${todayParts.year}-${String(todayParts.month).padStart(2,'0')}-${String(todayParts.day).padStart(2,'0')}: ${verify.rows.length}`)
console.table(verify.rows)

await erp.end()
await hrms.end()
console.log('\n✅ Done.')
