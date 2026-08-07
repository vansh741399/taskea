// Fetch all HRMS employees with their credentials (mobile/email used for login)
// and verify they exist in Taskea (ERP) database
import { Pool } from 'pg'

const ERP_URL = 'postgresql://neondb_owner:npg_V0CoL3SDNcKm@ep-noisy-bonus-app8563v.c-7.us-east-1.aws.neon.tech/neondb?sslmode=require'
const HRMS_URL = 'postgresql://neondb_owner:npg_pGbVon2mrZ3q@ep-empty-haze-aq8y1r98-pooler.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require'

const erp = new Pool({ connectionString: ERP_URL, max: 2, ssl: { rejectUnauthorized: false } })
const hrms = new Pool({ connectionString: HRMS_URL, max: 2, ssl: { rejectUnauthorized: false } })

console.log('=== STEP 1: All HRMS Employees (login = mobile or email) ===')
const hrmsEmps = await hrms.query(`
  SELECT "employeeId", "fullName", email, mobile, location, department,
         designation, firm, "employmentType", status, "joiningDate"
  FROM "Employee"
  WHERE status = 'Yes'
  ORDER BY "employeeId" ASC
`)
console.log(`Total active HRMS employees: ${hrmsEmps.rows.length}`)
console.table(hrmsEmps.rows.map(r => ({
  employeeId: r.employeeId,
  fullName: r.fullName,
  mobile: r.mobile || '(none)',
  email: r.email || '(none)',
  location: r.location,
  dept: r.department,
  designation: r.designation,
  firm: r.firm,
})))

console.log('\n=== STEP 2: All ERP users in Taskea ===')
const erpUsers = await erp.query(`
  SELECT id, name, email, phone, "hrmsId", role, "isActive", "officeId"
  FROM "User"
  ORDER BY role DESC, name ASC
`)
console.log(`Total Taskea users: ${erpUsers.rows.length}`)
console.table(erpUsers.rows.map(r => ({
  id: r.id,
  name: r.name,
  email: r.email,
  phone: r.phone || '(none)',
  hrmsId: r.hrmsId || '(none)',
  role: r.role,
  isActive: r.isActive,
})))

console.log('\n=== STEP 3: Match HRMS employees → Taskea users ===')
const matches = []
const unmatchedHrms = []
for (const h of hrmsEmps.rows) {
  // Match by hrmsId (cuid stored in ERP matches Employee.id in HRMS)
  const erpMatch = erpUsers.rows.find(u => u.hrmsId === h.employeeId || u.hrmsId === (
    // Try alternate forms
    h.employeeId
  ))
  // Also try name match
  const nameMatch = erpUsers.rows.find(u =>
    u.name && h.fullName && u.name.toLowerCase().includes(u.name.toLowerCase().split(' ')[0]) &&
    h.fullName.toLowerCase().includes(u.name.toLowerCase().split(' ')[0])
  )
  if (erpMatch || nameMatch) {
    matches.push({
      hrmsEmployeeId: h.employeeId,
      hrmsName: h.fullName,
      hrmsMobile: h.mobile,
      hrmsEmail: h.email,
      erpUserId: (erpMatch || nameMatch).id,
      erpName: (erpMatch || nameMatch).name,
      erpEmail: (erpMatch || nameMatch).email,
      erpPhone: (erpMatch || nameMatch).phone,
      matchedBy: erpMatch ? 'hrmsId' : 'name',
    })
  } else {
    unmatchedHrms.push({
      hrmsEmployeeId: h.employeeId,
      hrmsName: h.fullName,
      hrmsMobile: h.mobile,
      hrmsEmail: h.email,
      hrmsLocation: h.location,
    })
  }
}
console.log(`✅ Matched: ${matches.length}`)
console.table(matches)
console.log(`\n❌ Unmatched HRMS employees (no Taskea account): ${unmatchedHrms.length}`)
console.table(unmatchedHrms)

console.log('\n=== STEP 4: ERP users with NO hrmsId (need linking) ===')
const noHrmsId = erpUsers.rows.filter(u => !u.hrmsId)
console.table(noHrmsId.map(r => ({ id: r.id, name: r.name, email: r.email, role: r.role })))

console.log('\n=== STEP 5: ERP users with NO office assigned ===')
const noOffice = erpUsers.rows.filter(u => !u.officeId && u.role !== 'OWNER')
console.table(noOffice.map(r => ({ id: r.id, name: r.name, role: r.role, officeId: r.officeId || 'NULL' })))

console.log('\n=== STEP 6: Today\'s punches in ERP (IST Aug 6) ===')
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000
const now = new Date()
const ist = new Date(now.getTime() + IST_OFFSET_MS)
const y = ist.getUTCFullYear(), m = ist.getUTCMonth() + 1, d = ist.getUTCDate()
const startUtcMs = Date.UTC(y, m - 1, d) - IST_OFFSET_MS
const endUtcMs = Date.UTC(y, m - 1, d + 1) - IST_OFFSET_MS - 1
const todayPunches = await erp.query(`
  SELECT p.id, u.name AS "userName", p."punchIn", p."punchOut", p.status,
         p."punchInDistance", p."punchOutDistance", o.name AS "office"
  FROM "PunchRecord" p
  JOIN "User" u ON u.id = p."userId"
  LEFT JOIN "OfficeLocation" o ON o.id = p."officeId"
  WHERE p."punchIn" >= $1 AND p."punchIn" <= $2
  ORDER BY p."punchIn" ASC
`, [new Date(startUtcMs), new Date(endUtcMs)])
console.log(`Today (${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')} IST) punches: ${todayPunches.rows.length}`)
console.table(todayPunches.rows.map(r => ({
  user: r.userName,
  punchIn: r.punchIn,
  punchOut: r.punchOut || '(in progress)',
  status: r.status,
  office: r.office,
  inDist: r.punchInDistance,
})))

console.log('\n=== STEP 7: Today\'s HRMS Attendance records ===')
const hrmsAtt = await hrms.query(`
  SELECT a."employeeId", e."fullName", a.date, a."checkIn", a."checkOut",
         a.status, a."lateEntry", a."earlyOut"
  FROM "Attendance" a
  LEFT JOIN "Employee" e ON e."employeeId" = a."employeeId"
  WHERE a.date >= $1
  ORDER BY a.date DESC
`, [new Date(startUtcMs)])
console.log(`Today HRMS attendance records: ${hrmsAtt.rows.length}`)
console.table(hrmsAtt.rows)

await erp.end()
await hrms.end()
console.log('\nDone.')
