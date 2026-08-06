// Create ERP/Taskea accounts for Priyanka Shukla (EMP-504) and Reetu Sindal (EMP-037).
// Also re-verify Ashish Sir's existing dashboard setup.
//
// SAFETY:
//   - Only INSERTs new rows into the ERP "User" table (NO HRMS modifications)
//   - Never deletes or modifies existing users
//   - Uses cuid-style IDs compatible with Prisma
//   - Sets isActive=true so they can log in immediately
//   - Default password pattern: FirstName@2025 (user can change later)
//   - Idempotent: skips creation if user with same loginUsername or email already exists
import { Pool } from 'pg'

const ERP_URL = 'postgresql://neondb_owner:npg_V0CoL3SDNcKm@ep-noisy-bonus-app8563v-pooler.c-7.us-east-1.aws.neon.tech/neondb?sslmode=require'
const HRMS_URL = 'postgresql://neondb_owner:npg_pGbVon2mrZ3q@ep-empty-haze-aq8y1r98-pooler.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require'

const erp = new Pool({ connectionString: ERP_URL, max: 2, ssl: { rejectUnauthorized: false } })
const hrms = new Pool({ connectionString: HRMS_URL, max: 2, ssl: { rejectUnauthorized: false } })

function generateCuidId() {
  const ts = Date.now().toString(36).padStart(8, '0').slice(-8)
  const rand = Math.random().toString(36).slice(2, 14).padEnd(12, '0')
  return `c${ts}${rand}`.slice(0, 24)
}

console.log('=== STEP 1: Fetch HRMS records for Priyanka Shukla + Reetu Sindal ===')
const hrmsEmps = await hrms.query(`
  SELECT id, "employeeId", "fullName", email, mobile, location, department,
         designation, firm, "employmentType", "joiningDate"
  FROM "Employee"
  WHERE "employeeId" IN ('EMP-504', 'EMP-037')
    AND status = 'Yes'
`)
console.log(`Found ${hrmsEmps.rows.length} HRMS employees:`)
console.table(hrmsEmps.rows)

// Check office locations
console.log('\n=== STEP 2: Check existing OfficeLocations ===')
const offices = await erp.query(`SELECT id, name, city FROM "OfficeLocation" ORDER BY city`)
console.table(offices.rows)
const officeByCity = {}
for (const o of offices.rows) {
  officeByCity[o.city.toLowerCase()] = o.id
}

// Build the new user records
const usersToCreate = hrmsEmps.rows.map(h => {
  const first = h.fullName.split(' ')[0].toLowerCase()
  // Override: Reetu → login as "ritu" (founder calls her Ritu)
  let loginUsername = first
  if (h.employeeId === 'EMP-037') loginUsername = 'ritu'
  return {
    hrmsId: h.id,
    employeeId: h.employeeId,
    name: h.fullName,
    email: (h.email && h.email.trim()) ? h.email : `${loginUsername}@laxree.com`,
    role: 'EMPLOYEE',
    department: h.department || '—',
    designation: h.designation || '—',
    phone: h.mobile || null,
    location: h.location || null,
    loginUsername,
    loginPassword: `${first.charAt(0).toUpperCase()}${first.slice(1)}@2025`,  // Priyanka@2025, Ritu@2025
    officeId: officeByCity[(h.location || '').toLowerCase()] || officeByCity['ajmer'],
    joinDate: h.joiningDate,
  }
})

console.log('\n=== STEP 3: Users to create ===')
console.table(usersToCreate.map(u => ({
  employeeId: u.employeeId,
  name: u.name,
  loginUsername: u.loginUsername,
  loginPassword: u.loginPassword,
  email: u.email,
  role: u.role,
  location: u.location,
  officeId: u.officeId,
  hrmsId: u.hrmsId,
})))

// Check for existing users with same loginUsername or email (idempotency)
console.log('\n=== STEP 4: Idempotency check — skip already-existing users ===')
const existing = await erp.query(`
  SELECT id, name, email, "loginUsername", "hrmsId"
  FROM "User"
  WHERE "loginUsername" = ANY($1) OR email = ANY($2)
`, [usersToCreate.map(u => u.loginUsername), usersToCreate.map(u => u.email)])

const existingByLogin = new Map(existing.rows.map(r => [r.loginUsername, r]))
const existingByEmail = new Map(existing.rows.map(r => [r.email, r]))

const toCreate = usersToCreate.filter(u => !existingByLogin.has(u.loginUsername) && !existingByEmail.has(u.email))
const skipped = usersToCreate.filter(u => existingByLogin.has(u.loginUsername) || existingByEmail.has(u.email))

console.log(`Will create: ${toCreate.length} new users`)
console.log(`Will skip:   ${skipped.length} already existing`)
skipped.forEach(u => console.log(`  SKIP: ${u.name} (loginUsername=${u.loginUsername} already in DB)`))

// INSERT new users
console.log('\n=== STEP 5: INSERT new users into ERP User table ===')
for (const u of toCreate) {
  const id = generateCuidId()
  await erp.query(`
    INSERT INTO "User" (
      id, email, name, role, department, designation, phone, location,
      "loginUsername", "loginPassword", "isActive", "joinDate",
      "hrmsId", "officeId", "createdAt", "updatedAt"
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8,
      $9, $10, TRUE, $11,
      $12, $13, NOW(), NOW()
    )
    ON CONFLICT (email) DO NOTHING
  `, [
    id, u.email, u.name, u.role, u.department, u.designation, u.phone, u.location,
    u.loginUsername, u.loginPassword, u.joinDate,
    u.hrmsId, u.officeId,
  ])
  console.log(`  ✓ Created: ${u.name} | id=${id} | loginUsername=${u.loginUsername} | password=${u.loginPassword} | hrmsId=${u.hrmsId}`)
}

// Verify Ashish Sir's dashboard setup
console.log('\n=== STEP 6: Verify Ashish Sir (existing DIRECTOR user-dir3) ===')
const ashish = await erp.query(`
  SELECT id, name, role, "loginUsername", "loginPassword", "hrmsId", "officeId", "isActive"
  FROM "User"
  WHERE "loginUsername" = 'ashish'
`)
console.table(ashish.rows)
if (ashish.rows.length === 0) {
  console.log('  ⚠️ Ashish Sir not found! May need to create.')
} else {
  console.log(`  ✓ Ashish Sir exists with role=${ashish.rows[0].role}, isActive=${ashish.rows[0].isactive}`)
  console.log(`    Password: ${ashish.rows[0].loginpassword}`)
  console.log(`    hrmsId:   ${ashish.rows[0].hrmsid} ${ashish.rows[0].hrmsid ? '(linked to HRMS)' : '(NOT linked — needs fixing)'}`)
}

// Final summary
console.log('\n=== STEP 7: Final verification — list all users with loginUsername set ===')
const all = await erp.query(`
  SELECT name, role, "loginUsername" AS username, "isActive" AS active, "hrmsId" IS NOT NULL AS hrms_linked
  FROM "User"
  WHERE "loginUsername" IS NOT NULL
  ORDER BY name
`)
console.table(all.rows)

await erp.end()
await hrms.end()
console.log('\n✓ Done.')
