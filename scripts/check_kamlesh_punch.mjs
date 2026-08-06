// Check Kamlesh's punch state in both ERP and HRMS DBs
import pg from 'pg'
import { Pool } from 'pg'

const ERP_URL = 'postgresql://neondb_owner:npg_V0CoL3SDNcKm@ep-noisy-bonus-app8563v.c-7.us-east-1.aws.neon.tech/neondb?sslmode=require'
const HRMS_URL = 'postgresql://neondb_owner:npg_pGbVon2mrZ3q@ep-empty-haze-aq8y1r98-pooler.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require'

const erp = new Pool({ connectionString: ERP_URL, max: 2, ssl: { rejectUnauthorized: false } })
const hrms = new Pool({ connectionString: HRMS_URL, max: 2, ssl: { rejectUnauthorized: false } })

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000
function istParts(d) {
  const ist = new Date(d.getTime() + IST_OFFSET_MS)
  return {
    year: ist.getUTCFullYear(),
    month: ist.getUTCMonth() + 1,
    day: ist.getUTCDate(),
    dateStr: `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, '0')}-${String(ist.getUTCDate()).padStart(2, '0')}`,
  }
}

console.log('=== Step 1: Find Kamlesh in ERP DB ===')
const kamlesh = await erp.query(`
  SELECT id, name, email, "hrmsId", role, "officeId", "isActive"
  FROM "User"
  WHERE LOWER(name) LIKE '%kamlesh%'
  LIMIT 5
`)
console.table(kamlesh.rows)

if (kamlesh.rows.length === 0) {
  console.log('No Kamlesh found in ERP. Trying alternative spellings...')
  const alt = await erp.query(`
    SELECT id, name, email, "hrmsId", role FROM "User" WHERE role IN ('EMPLOYEE','MANAGER') ORDER BY name
  `)
  console.log('All employees:')
  console.table(alt.rows.map(r => ({ id: r.id, name: r.name, email: r.email, hrmsId: r.hrmsId })))
  process.exit(0)
}

const k = kamlesh.rows[0]
console.log(`\n=== Step 2: Find Kamlesh in HRMS DB ===`)
const hrmsEmp = await hrms.query(`
  SELECT id, "employeeId", "fullName", email, location, department, designation, firm
  FROM "Employee"
  WHERE LOWER("fullName") LIKE '%kamlesh%' OR "employeeId" = $1
  LIMIT 5
`, [k.hrmsId || ''])
console.table(hrmsEmp.rows)

const todayParts = istParts(new Date())
console.log(`\n=== Today (IST): ${todayParts.dateStr} ===`)

console.log(`\n=== Step 3: Kamlesh's punches in ERP (last 7 days IST) ===`)
const punchStartUtcMs = Date.UTC(todayParts.year, todayParts.month - 1, todayParts.day - 6) - IST_OFFSET_MS
const punches = await erp.query(`
  SELECT id, "userId", "officeId", "punchIn", "punchOut", status,
         "punchInDistance", "punchOutDistance"
  FROM "PunchRecord"
  WHERE "userId" = $1 AND "punchIn" >= $2
  ORDER BY "punchIn" DESC
  LIMIT 30
`, [k.id, new Date(punchStartUtcMs)])
console.table(punches.rows.map(r => ({
  id: r.id.substring(0, 8),
  punchIn: r.punchIn,
  punchOut: r.punchOut,
  status: r.status,
  punchInDist: r.punchInDistance,
})))

console.log(`\n=== Step 4: Kamlesh's HRMS Attendance records (today + last 7 days) ===`)
if (hrmsEmp.rows.length > 0) {
  const empId = hrmsEmp.rows[0].employeeId
  const startDateIso = `${todayParts.year}-${String(todayParts.month - 1).padStart(2,'0')}-${String(todayParts.day - 6).padStart(2,'0')}`
  // simpler: query last 10 days
  const hrmsAtt = await hrms.query(`
    SELECT id, "employeeId", date, "checkIn", "checkOut", "totalHours",
           status, "lateEntry", "earlyOut", "halfDay", "overtimeHours"
    FROM "Attendance"
    WHERE "employeeId" = $1 AND date >= NOW() - INTERVAL '10 days'
    ORDER BY date DESC
    LIMIT 30
  `, [empId])
  console.log(`HRMS Attendance records for ${empId}:`)
  console.table(hrmsAtt.rows)
} else {
  console.log('No HRMS employee record found for Kamlesh')
}

console.log(`\n=== Step 5: HRMS Attendance table schema ===`)
const schema = await hrms.query(`
  SELECT column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
  WHERE table_name = 'Attendance'
  ORDER BY ordinal_position
`)
console.table(schema.rows)

console.log(`\n=== Step 6: All HRMS Attendance records for today (IST) ===`)
const todayStartUtc = new Date(Date.UTC(todayParts.year, todayParts.month - 1, todayParts.day) - IST_OFFSET_MS)
const allToday = await hrms.query(`
  SELECT a.id, a."employeeId", e."fullName", a.date, a."checkIn", a."checkOut", a.status
  FROM "Attendance" a
  LEFT JOIN "Employee" e ON e."employeeId" = a."employeeId"
  WHERE a.date >= $1
  ORDER BY a.date DESC
  LIMIT 30
`, [todayStartUtc])
console.table(allToday.rows)

await erp.end()
await hrms.end()
console.log('\nDone.')
