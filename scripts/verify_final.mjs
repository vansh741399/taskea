// Simple verification — ERP database only (no JOIN to HRMS)
import { Pool } from 'pg'
const ERP_URL = 'postgresql://neondb_owner:npg_V0CoL3SDNcKm@ep-noisy-bonus-app8563v.c-7.us-east-1.aws.neon.tech/neondb?sslmode=require'
const erp = new Pool({ connectionString: ERP_URL, max: 2, ssl: { rejectUnauthorized: false } })

const finalCheck = await erp.query(`
  SELECT u.id, u.name, u.email, u.role, u."loginUsername", u."loginPassword",
         u."isActive", u."hrmsId", o.city AS "officeCity"
  FROM "User" u
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
  hrmsLinked: r.hrmsId ? '✅' : '❌',
  office: r.officeCity || '—',
})))

await erp.end()
