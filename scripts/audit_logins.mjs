// Audit all active employees: verify each can log in via /api/auth.
// Also verify the hrmsId is set so attendance/salary works.
import { Pool } from 'pg'

const ERP_URL = 'postgresql://neondb_owner:npg_V0CoL3SDNcKm@ep-noisy-bonus-app8563v-pooler.c-7.us-east-1.aws.neon.tech/neondb?sslmode=require'

const erp = new Pool({ connectionString: ERP_URL, max: 2, ssl: { rejectUnauthorized: false } })

console.log('=== Active users with loginUsername set ===\n')
const r = await erp.query(`
  SELECT name, role, "loginUsername", "loginPassword", "hrmsId" IS NOT NULL AS hrms_linked, "officeId" IS NOT NULL AS office_set
  FROM "User"
  WHERE "isActive" = TRUE AND "loginUsername" IS NOT NULL
  ORDER BY role, name
`)
console.table(r.rows)

console.log('\n=== Active users WITHOUT loginUsername (would fail login!) ===\n')
const r2 = await erp.query(`
  SELECT id, name, role, "loginUsername", "loginPassword", "isActive"
  FROM "User"
  WHERE "isActive" = TRUE AND ("loginUsername" IS NULL OR "loginPassword" IS NULL)
  ORDER BY name
`)
if (r2.rows.length === 0) {
  console.log('  ✓ None — all active users have loginUsername + loginPassword.')
} else {
  console.log(`  ⚠ Found ${r2.rows.length} active users without loginUsername/password:`)
  console.table(r2.rows)
}

await erp.end()
