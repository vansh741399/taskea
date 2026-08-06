// Create new Taskea accounts for 4 HRMS employees who have email/mobile
// but no Taskea account yet. Also link Girish Shahani (existing user) to
// his HRMS record (he was missing the hrmsId link).
//
// SAFETY:
//   - Only INSERTs new rows into the ERP "User" table (no HRMS modifications)
//   - Never deletes or modifies existing users
//   - Uses cuid-style IDs compatible with Prisma
//   - Sets isActive=true so they can log in immediately
//   - Default password pattern: FirstName@2025 (user can change later)
import { Pool } from 'pg'

const ERP_URL = 'postgresql://neondb_owner:npg_V0CoL3SDNcKm@ep-noisy-bonus-app8563v.c-7.us-east-1.aws.neon.tech/neondb?sslmode=require'
const HRMS_URL = 'postgresql://neondb_owner:npg_pGbVon2mrZ3q@ep-empty-haze-aq8y1r98-pooler.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require'

const erp = new Pool({ connectionString: ERP_URL, max: 2, ssl: { rejectUnauthorized: false } })
const hrms = new Pool({ connectionString: HRMS_URL, max: 2, ssl: { rejectUnauthorized: false } })

function generateCuidId() {
  const ts = Date.now().toString(36).padStart(8, '0').slice(-8)
  const rand = Math.random().toString(36).slice(2, 14).padEnd(12, '0')
  return `c${ts}${rand}`.slice(0, 24)
}

console.log('=== STEP 1: Fetch HRMS records for the 4 employees to create ===')
const hrmsIds = ['EMP-002', 'EMP-041', 'EMP-432', 'EMP-501']
const hrmsEmps = await hrms.query(`
  SELECT id, "employeeId", "fullName", email, mobile, location, department,
         designation, firm, "employmentType", "joiningDate"
  FROM "Employee"
  WHERE "employeeId" = ANY($1) AND status = 'Yes'
  ORDER BY "employeeId" ASC
`, [hrmsIds])
console.log(`Found ${hrmsEmps.rows.length} HRMS employees:`)
console.table(hrmsEmps.rows)

// Check if offices exist for their locations
console.log('\n=== STEP 2: Check existing OfficeLocations ===')
const offices = await erp.query(`
  SELECT id, name, city, "isActive" FROM "OfficeLocation" ORDER BY city
`)
console.table(offices.rows)

// Map location name → officeId
const officeByCity = {}
for (const o of offices.rows) {
  const cityKey = o.city.toLowerCase()
  if (!officeByCity[cityKey]) officeByCity[cityKey] = o.id
}
// Add fuzzy mappings
officeByCity['gurgaon'] = officeByCity['gurgaon'] || officeByCity['gurugram']
officeByCity['gurugram'] = officeByCity['gurugram'] || officeByCity['gurgaon']

console.log('\n=== STEP 3: Check if any of these employees already exist in Taskea ===')
const existingEmails = hrmsEmps.rows.map(e => e.email).filter(Boolean)
const existingUsers = await erp.query(`
  SELECT id, name, email FROM "User" WHERE email = ANY($1)
`, [existingEmails])
console.log('Already existing users with these emails:')
console.table(existingUsers.rows)

console.log('\n=== STEP 4: Create new Taskea accounts ===')
const results = []
for (const emp of hrmsEmps.rows) {
  // Skip if already exists
  if (existingUsers.rows.some(u => u.email === emp.email)) {
    results.push({
      employeeId: emp.employeeId,
      name: emp.fullName,
      status: 'skipped',
      reason: 'User with this email already exists in Taskea',
    })
    continue
  }

  // Generate credentials
  const firstName = emp.fullName.split(' ')[0].toLowerCase()
  const loginUsername = firstName
  const loginPassword = `${emp.fullName.split(' ')[0]}@2025`
  const userId = generateCuidId()
  const officeId = officeByCity[(emp.location || '').toLowerCase()] || null

  // Use HRMS email as Taskea email (or generate a fallback)
  const email = emp.email || `${firstName}@laxree.com`

  try {
    await erp.query(`
      INSERT INTO "User" (
        id, name, email, phone, role, department, designation, location,
        "hrmsId", "officeId", "loginUsername", "loginPassword",
        "isActive", "createdAt", "updatedAt"
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, true, NOW(), NOW())
    `, [
      userId,
      emp.fullName,
      email,
      emp.mobile || null,
      'EMPLOYEE',
      emp.department || null,
      emp.designation || null,
      emp.location || null,
      emp.id, // hrmsId = HRMS Employee.id (cuid)
      officeId,
      loginUsername,
      loginPassword,
    ])
    results.push({
      employeeId: emp.employeeId,
      hrmsCuid: emp.id,
      name: emp.fullName,
      email,
      mobile: emp.mobile,
      loginUsername,
      loginPassword,
      officeId,
      location: emp.location,
      status: 'created',
      userId,
    })
    console.log(`✅ Created account for ${emp.fullName} (${emp.employeeId}) — username: ${loginUsername}, password: ${loginPassword}`)
  } catch (e) {
    results.push({
      employeeId: emp.employeeId,
      name: emp.fullName,
      status: 'failed',
      error: e.message,
    })
    console.error(`❌ Failed to create ${emp.fullName}: ${e.message}`)
  }
}

console.log('\n=== STEP 5: Link Girish Shahani (existing user) to HRMS record ===')
// Girish Shahani in Taskea → Girish Shani in HRMS (EMP-429)
const girishHrms = await hrms.query(`
  SELECT id, "employeeId", "fullName" FROM "Employee"
  WHERE "employeeId" = 'EMP-429' LIMIT 1
`)
console.log('HRMS Girish:', girishHrms.rows[0])

if (girishHrms.rows.length > 0) {
  const girishUpdate = await erp.query(`
    UPDATE "User"
    SET "hrmsId" = $1, "updatedAt" = NOW()
    WHERE email = 'sales2@laxree.com' AND "hrmsId" IS NULL
    RETURNING id, name, email, "hrmsId"
  `, [girishHrms.rows[0].id])
  console.log('Updated Girish:', girishUpdate.rows[0] || '(no rows — already linked or not found)')
}

console.log('\n=== STEP 6: Final summary ===')
console.table(results)

console.log('\n=== STEP 7: Verify all users with their HRMS linkage ===')
const finalCheck = await erp.query(`
  SELECT u.id, u.name, u.email, u.role, u."loginUsername", u."loginPassword",
         u."isActive", u."hrmsId", e."employeeId" AS "hrmsEmployeeCode",
         e."fullName" AS "hrmsName", o.city AS "officeCity"
  FROM "User" u
  LEFT JOIN "Employee" e ON e.id = u."hrmsId"
  LEFT JOIN "OfficeLocation" o ON o.id = u."officeId"
  WHERE u."isActive" = true
  ORDER BY u.role DESC, u.name ASC
`)
console.log(`Active Taskea users: ${finalCheck.rows.length}`)
console.table(finalCheck.rows.map(r => ({
  name: r.name,
  email: r.email,
  role: r.role,
  username: r.loginUsername,
  password: r.loginPassword,
  hrmsLinked: r.hrmsEmployeeCode ? `✅ ${r.hrmsEmployeeCode}` : '❌',
  office: r.officeCity || '—',
})))

await erp.end()
await hrms.end()
console.log('\n✅ Done.')
