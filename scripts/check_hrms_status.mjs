import { Client } from 'pg'
const HRMS_DB_URL = 'postgresql://neondb_owner:npg_pGbVon2mrZ3q@ep-empty-haze-aq8y1r98-pooler.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require'
const c = new Client({ connectionString: HRMS_DB_URL, ssl: { rejectUnauthorized: false } })
await c.connect()
const r = await c.query(`SELECT status, COUNT(*)::int as cnt FROM "Employee" GROUP BY status ORDER BY cnt DESC`)
console.log('=== status distribution ===')
for (const row of r.rows) console.log(`  status=${JSON.stringify(row.status)} | count=${row.cnt}`)
const total = await c.query(`SELECT COUNT(*)::int as cnt FROM "Employee"`)
console.log(`\nTotal Employee rows: ${total.rows[0].cnt}`)
const sample = await c.query(`SELECT id, "employeeId", "fullName", status, "relievingDate" FROM "Employee" LIMIT 5`)
console.log('\nSample rows:')
for (const s of sample.rows) console.log(`  ${s.employeeId} | ${s.fullName} | status=${JSON.stringify(s.status)} | relieving=${s.relievingDate}`)
await c.end()
