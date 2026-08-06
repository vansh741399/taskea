// Backfill Kamlesh's today punches from ERP DB → HRMS DB directly
// This simulates what the new punch route will do automatically on each punch.
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
    dateStr: `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, '0')}-${String(ist.getUTCDate()).padStart(2, '0')}`,
  }
}

function formatHrmsTime(d) {
  const p = getIstParts(d)
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`
}

// CUID-like id generator (24 chars, starts with 'c')
function generateCuidId() {
  const ts = Date.now().toString(36).padStart(8, '0').slice(-8)
  const rand = Math.random().toString(36).slice(2, 14).padEnd(12, '0')
  return `c${ts}${rand}`.slice(0, 24)
}

const SHIFT_START_HOUR = 10
const SHIFT_END_HOUR = 19
const LATE_THRESHOLD_MIN = SHIFT_START_HOUR * 60 + 15 // 615 = 10:15 AM
const SHIFT_END_MIN = SHIFT_END_HOUR * 60 // 1140 = 7:00 PM
const SHIFT_HOURS = SHIFT_END_HOUR - SHIFT_START_HOUR // 9

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
    } else {
      hasInProgress = true
    }
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
    status, lateEntry, earlyOut,
    halfDay: false,
  }
}

console.log('=== STEP 1: Find Kamlesh in ERP ===')
const kamlesh = await erp.query(`
  SELECT id, name, "hrmsId" FROM "User"
  WHERE LOWER(name) LIKE '%kamlesh%' LIMIT 1
`)
const k = kamlesh.rows[0]
console.log('ERP user:', k)

console.log('\n=== STEP 2: Resolve HRMS employeeId code ===')
const hrmsEmp = await hrms.query(`
  SELECT id, "employeeId", "fullName" FROM "Employee" WHERE id = $1 LIMIT 1
`, [k.hrmsId])
console.log('HRMS employee:', hrmsEmp.rows[0])
const hrmsEmpCode = hrmsEmp.rows[0].employeeId

console.log('\n=== STEP 3: Fetch all ERP punches for Kamlesh today (IST) ===')
const todayParts = getIstParts(new Date())
const startUtcMs = Date.UTC(todayParts.year, todayParts.month - 1, todayParts.day) - IST_OFFSET_MS
const endUtcMs = Date.UTC(todayParts.year, todayParts.month - 1, todayParts.day + 1) - IST_OFFSET_MS - 1
const punches = await erp.query(`
  SELECT id, "punchIn", "punchOut", status FROM "PunchRecord"
  WHERE "userId" = $1 AND "punchIn" >= $2 AND "punchIn" <= $3
  ORDER BY "punchIn" ASC
`, [k.id, new Date(startUtcMs), new Date(endUtcMs)])
console.log(`Found ${punches.rows.length} punches for today:`)
for (const p of punches.rows) {
  console.log(`  - punchIn=${p.punchIn}, punchOut=${p.punchOut || '(in progress)'}, status=${p.status}`)
}

if (punches.rows.length === 0) {
  console.log('No punches to sync. Exiting.')
  await erp.end()
  await hrms.end()
  process.exit(0)
}

console.log('\n=== STEP 4: Compute daily summary ===')
const summary = computeDailySummary(punches.rows)
console.log('Summary:', {
  checkIn: summary.checkIn.toISOString(),
  checkOut: summary.checkOut?.toISOString() || null,
  totalHours: summary.totalHours,
  overtimeHours: summary.overtimeHours,
  status: summary.status,
  lateEntry: summary.lateEntry,
  earlyOut: summary.earlyOut,
})

console.log('\n=== STEP 5: Check if HRMS Attendance record exists for today ===')
const istMidnightUtcMs = Date.UTC(todayParts.year, todayParts.month - 1, todayParts.day) - IST_OFFSET_MS
const dateOnly = new Date(istMidnightUtcMs)
const existing = await hrms.query(`
  SELECT id, "employeeId", date, "checkIn", "checkOut", status
  FROM "Attendance"
  WHERE "employeeId" = $1
    AND date >= $2::timestamp
    AND date < ($2::timestamp + INTERVAL '1 day')
  LIMIT 1
`, [hrmsEmpCode, dateOnly])
console.log('Existing record:', existing.rows[0] || '(none)')

console.log('\n=== STEP 6: UPSERT to HRMS Attendance table ===')
const dayOfWeek = todayParts.dayOfWeek
const isSunday = dayOfWeek === 0
const isSaturday = dayOfWeek === 6
const isWeeklyOff = isSunday || isSaturday
const sundayHours = isSunday ? summary.totalHours : 0
const checkInStr = formatHrmsTime(summary.checkIn)
const checkOutStr = summary.checkOut ? formatHrmsTime(summary.checkOut) : ''
const remarks = `Backfilled from ERP on ${new Date().toISOString()}`

const client = await hrms.connect()
try {
  await client.query('BEGIN')
  let id, mode
  if (existing.rows.length > 0) {
    id = existing.rows[0].id
    mode = 'UPDATE'
    await client.query(
      `UPDATE "Attendance"
       SET "checkIn" = $3, "checkOut" = $4, "totalHours" = $5,
           status = $6, "lateEntry" = $7, "earlyOut" = $8,
           "halfDay" = $9, "overtimeHours" = $10,
           "isSunday" = $11, "isWeeklyOff" = $12,
           "sundayHours" = $13, remarks = $14,
           "updatedAt" = NOW()
       WHERE id = $2`,
      [hrmsEmpCode, id, checkInStr, checkOutStr, summary.totalHours,
       summary.status, summary.lateEntry, summary.earlyOut,
       summary.halfDay, summary.overtimeHours,
       isSunday, isWeeklyOff, sundayHours, remarks]
    )
  } else {
    id = generateCuidId()
    mode = 'INSERT'
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
  console.log(`✅ ${mode} attendance record ${id} for ${hrmsEmpCode}`)
} catch (e) {
  await client.query('ROLLBACK')
  console.error('❌ Failed:', e)
  throw e
} finally {
  client.release()
}

console.log('\n=== STEP 7: VERIFY — re-read HRMS Attendance for today ===')
const verify = await hrms.query(`
  SELECT id, "employeeId", date, "checkIn", "checkOut", "totalHours",
         status, "lateEntry", "earlyOut", "halfDay", "overtimeHours",
         "isSunday", "isWeeklyOff", "sundayHours", remarks, "createdAt", "updatedAt"
  FROM "Attendance"
  WHERE "employeeId" = $1
    AND date >= $2::timestamp
    AND date < ($2::timestamp + INTERVAL '1 day')
  LIMIT 1
`, [hrmsEmpCode, dateOnly])
console.log('Verified record:')
console.table(verify.rows)

await erp.end()
await hrms.end()
console.log('\n✅ Done. Kamlesh\'s today punch is now visible in HRMS.')
