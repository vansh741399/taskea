// ════════════════════════════════════════════════════════════════════════
// Find all ACTIVE HRMS employees and compare against ERP users.
// Identifies which active HRMS employees do NOT have an ERP dashboard yet.
// READ-ONLY — no writes.
// ════════════════════════════════════════════════════════════════════════
import { Client } from 'pg'

const ERP_DB_URL = 'postgresql://neondb_owner:npg_V0CoL3SDNcKm@ep-noisy-bonus-app8563v-pooler.c-7.us-east-1.aws.neon.tech/neondb?sslmode=require'
const HRMS_DB_URL = 'postgresql://neondb_owner:npg_pGbVon2mrZ3q@ep-empty-haze-aq8y1r98-pooler.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require'

async function main() {
  const erp = new Client({ connectionString: ERP_DB_URL, ssl: { rejectUnauthorized: false } })
  const hrms = new Client({ connectionString: HRMS_DB_URL, ssl: { rejectUnauthorized: false } })
  await erp.connect()
  await hrms.connect()

  // 1. Get ALL active HRMS employees (status='Yes' means active in HRMS)
  const hrmsRes = await hrms.query(`
    SELECT id, "employeeId", "fullName", designation, department, firm, location,
           "employmentType", "joiningDate", "reportingManager", status,
           "monthlySalary", "salaryType", "shiftStart", "shiftEnd", "relievingDate"
    FROM "Employee"
    WHERE status = 'Yes'
      AND "relievingDate" IS NULL
    ORDER BY "fullName"
  `)
  console.log(`\n=== HRMS ACTIVE EMPLOYEES: ${hrmsRes.rows.length} ===`)
  for (const e of hrmsRes.rows) {
    console.log(`  ${e.employeeId} | ${e.fullName} | ${e.designation} | ${e.firm} | ${e.location}`)
  }

  // 2. Get ALL ERP users with their hrmsId links
  const erpRes = await erp.query(`
    SELECT id, name, "loginUsername", role, "hrmsId", "isActive"
    FROM "User"
    ORDER BY name
  `)
  console.log(`\n=== ERP USERS: ${erpRes.rows.length} ===`)
  const linkedHrmsIds = new Set()
  for (const u of erpRes.rows) {
    if (u.hrmsId) linkedHrmsIds.add(u.hrmsId)
  }
  console.log(`(Linked hrmsIds: ${linkedHrmsIds.size})`)

  // 3. Find missing
  const missing = hrmsRes.rows.filter(e => !linkedHrmsIds.has(e.id))
  console.log(`\n=== MISSING ERP DASHBOARDS: ${missing.length} ===`)
  for (const m of missing) {
    console.log(`  HRMS cuid=${m.id}`)
    console.log(`    employeeId=${m.employeeId} | name=${m.fullName} | desig=${m.designation} | firm=${m.firm} | loc=${m.location} | salary=${m.monthlySalary}`)
  }

  await erp.end()
  await hrms.end()

  console.log('\n=== JSON OUTPUT (for create script) ===')
  console.log(JSON.stringify(missing, null, 2))
}

main().catch(e => { console.error(e); process.exit(1) })
