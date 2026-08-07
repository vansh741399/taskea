import { Client } from 'pg'
const HRMS_DB_URL = 'postgresql://neondb_owner:npg_pGbVon2mrZ3q@ep-empty-haze-aq8y1r98-pooler.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require'
const c = new Client({ connectionString: HRMS_DB_URL, ssl: { rejectUnauthorized: false } })
await c.connect()
const r = await c.query(`
  SELECT column_name, data_type
  FROM information_schema.columns
  WHERE table_name = 'Employee'
  ORDER BY ordinal_position
`)
console.log('=== Employee columns ===')
for (const row of r.rows) console.log(`  ${row.column_name} (${row.data_type})`)
await c.end()
