// ════════════════════════════════════════════════════════════════════════
// Create ERP user dashboards for all active HRMS employees that don't have one yet.
// IDEMPOTENT: uses INSERT ... ON CONFLICT DO NOTHING (safe to re-run).
// NO HRMS modification — only ERP User table INSERTs.
// ════════════════════════════════════════════════════════════════════════
import { Client } from 'pg'
import { randomBytes } from 'crypto'

const ERP_DB_URL = 'postgresql://neondb_owner:npg_V0CoL3SDNcKm@ep-noisy-bonus-app8563v-pooler.c-7.us-east-1.aws.neon.tech/neondb?sslmode=require'
const HRMS_DB_URL = 'postgresql://neondb_owner:npg_pGbVon2mrZ3q@ep-empty-haze-aq8y1r98-pooler.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require'

// Helper: generate a cuid-like ID (24 hex chars)
function genId() {
  return 'u' + randomBytes(12).toString('hex')
}

// Helper: generate a username from full name (lowercase, first name, or first+last initial)
function genUsername(fullName, existingUsernames) {
  const parts = fullName.toLowerCase().trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'emp' + Math.floor(Math.random() * 10000)
  let base = parts[0]
  // If single name, use it
  // If conflicts with existing, try first+lastinitial, then add number
  let username = base
  let suffix = 1
  while (existingUsernames.has(username)) {
    if (suffix === 1 && parts.length > 1) {
      username = base + parts[parts.length - 1][0]
    } else {
      username = base + suffix
    }
    suffix++
  }
  existingUsernames.add(username)
  return username
}

// Helper: generate default password (Name@2025 format)
function genPassword(fullName) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'Employee@2025'
  // Capitalize first letter of first name, remove spaces, add @2025
  const name = parts[0].charAt(0).toUpperCase() + parts[0].slice(1).toLowerCase()
  return `${name}@2025`
}

// Map HRMS location to ERP officeId (need to query ERP for office IDs)
async function getOfficeMap(erp) {
  const r = await erp.query(`SELECT id, name FROM "OfficeLocation" WHERE "isActive" = true`)
  const map = {}
  for (const o of r.rows) {
    // Match by partial name
    const n = o.name.toLowerCase()
    if (n.includes('ajmer')) map['Ajmer'] = o.id
    else if (n.includes('jaipur')) map['Jaipur'] = o.id
    else if (n.includes('gurugram') || n.includes('gurgaon')) map['Gurgaon'] = o.id
    // Roofing Factory and Palra Warehouse — default to Ajmer office
    if (!map['Roofing Factory']) map['Roofing Factory'] = o.id
    if (!map['Palra Warehouse']) map['Palra Warehouse'] = o.id
  }
  return map
}

async function main() {
  const erp = new Client({ connectionString: ERP_DB_URL, ssl: { rejectUnauthorized: false } })
  const hrms = new Client({ connectionString: HRMS_DB_URL, ssl: { rejectUnauthorized: false } })
  await erp.connect()
  await hrms.connect()

  // 1. Get active HRMS employees
  const hrmsRes = await hrms.query(`
    SELECT id, "employeeId", "fullName", designation, department, firm, location,
           "employmentType", "joiningDate"
    FROM "Employee"
    WHERE status = 'Yes' AND "relievingDate" IS NULL
    ORDER BY "fullName"
  `)
  console.log(`HRMS active employees: ${hrmsRes.rows.length}`)

  // 2. Get existing ERP users (hrmsId links + loginUsernames)
  const erpRes = await erp.query(`SELECT id, name, "loginUsername", "hrmsId" FROM "User"`)
  const linkedHrmsIds = new Set(erpRes.rows.filter(u => u.hrmsId).map(u => u.hrmsId))
  const existingUsernames = new Set(erpRes.rows.filter(u => u.loginUsername).map(u => u.loginUsername))
  console.log(`Existing ERP users: ${erpRes.rows.length}, linked hrmsIds: ${linkedHrmsIds.size}`)

  // 3. Get office map
  const officeMap = await getOfficeMap(erp)
  console.log(`Office map:`, officeMap)

  // 4. Find missing
  const missing = hrmsRes.rows.filter(e => !linkedHrmsIds.has(e.id))
  console.log(`\nMissing dashboards: ${missing.length}`)

  if (missing.length === 0) {
    console.log('All active HRMS employees already have ERP dashboards. Nothing to do.')
    await erp.end(); await hrms.end()
    return
  }

  // 5. Create ERP users for missing
  let created = 0
  for (const emp of missing) {
    const userId = genId()
    const username = genUsername(emp.fullName, existingUsernames)
    const password = genPassword(emp.fullName)
    const officeId = officeMap[emp.location] || officeMap['Ajmer'] || null

    try {
      await erp.query(`
        INSERT INTO "User" (id, name, email, role, "loginUsername", "loginPassword",
                           "hrmsId", "officeId", "isActive", "joinDate", "createdAt", "updatedAt")
        VALUES ($1, $2, $3, 'EMPLOYEE', $4, $5, $6, $7, true, $8, NOW(), NOW())
        ON CONFLICT (id) DO NOTHING
      `, [
        userId,
        emp.fullName,
        `${username}@laxree.com`,
        username,
        password,
        emp.id,  // hrmsId (cuid from HRMS)
        officeId,
        emp.joiningDate || new Date(),
      ])
      console.log(`  ✓ Created: ${emp.fullName} | username=${username} | password=${password} | hrmsId=${emp.employeeId} | office=${emp.location}`)
      created++
    } catch (e) {
      console.error(`  ✗ FAILED: ${emp.fullName} — ${e.message}`)
    }
  }

  console.log(`\n=== SUMMARY ===`)
  console.log(`Created ${created} new ERP user dashboards.`)
  console.log(`All can log in at https://task.ea.laxree.com with their username + password.`)
  console.log(`All have role=EMPLOYEE → they get the employee dashboard (punch-in, attendance, salary slip, leaves, my HR report).`)

  await erp.end(); await hrms.end()
}

main().catch(e => { console.error(e); process.exit(1) })
