// Look up Priyanka, Ritu, Ashish in HRMS DB (broader search).
// Use production ERP Neon DB URL directly (not the local SQLite one in .env).
// READ-ONLY. Will NOT modify HRMS data.

import 'dotenv/config'
import pg from 'pg'

const HRMS_URL = process.env.HRMS_DATABASE_URL
const ERP_URL  = 'postgresql://neondb_owner:npg_V0CoL3SDNcKm@ep-noisy-bonus-app8563v-pooler.c-7.us-east-1.aws.neon.tech/neondb?sslmode=require'

async function main() {
  const hrms = new pg.Pool({ connectionString: HRMS_URL, ssl: { rejectUnauthorized: false } })
  const erp  = new pg.Pool({ connectionString: ERP_URL,  ssl: { rejectUnauthorized: false } })

  // ── HRMS: search broadly for Ritu (any name part containing ritu) ───
  console.log('\n═══ HRMS broad search for Ritu ═══')
  const r2 = await hrms.query(`
    SELECT id, "employeeId", "fullName", email, mobile, location, department, designation, status
    FROM "Employee"
    WHERE "fullName" ILIKE '%ritu%'
       OR "fullName" ILIKE '%reetu%'
       OR "fullName" ILIKE '%rithu%'
       OR lower("fullName") ~ '\\yritu\\y'
    ORDER BY "fullName"
  `)
  console.log(`Found ${r2.rows.length} matches for Ritu:`)
  r2.rows.forEach(r => console.log(' ', JSON.stringify(r, null, 0)))

  // ── HRMS: also pull all employees with empty/null email to spot duplicates ──
  console.log('\n═══ HRMS Employees with name starting P/R/A (active) ═══')
  const r3 = await hrms.query(`
    SELECT "employeeId", "fullName", location, designation, status
    FROM "Employee"
    WHERE ("fullName" ILIKE 'p%' OR "fullName" ILIKE 'r%' OR "fullName" ILIKE 'a%')
      AND status = 'Yes'
    ORDER BY "fullName"
  `)
  r3.rows.forEach(r => console.log(' ', JSON.stringify(r, null, 0)))

  // ── ERP: list existing users (using Neon production) ───────────────
  console.log('\n═══ ERP existing users (production Neon) ═══')
  const users = await erp.query(`
    SELECT id, name, role, "loginUsername", "hrmsId", "officeId", "isActive"
    FROM "User"
    ORDER BY name
  `)
  users.rows.forEach(r => console.log(' ', JSON.stringify(r, null, 0)))

  // ── ERP: list office locations ─────────────────────────────────────
  console.log('\n═══ ERP OfficeLocation rows ═══')
  try {
    const offices = await erp.query(`SELECT id, name, city FROM "OfficeLocation"`)
    offices.rows.forEach(r => console.log(' ', JSON.stringify(r, null, 0)))
  } catch (e) {
    console.log('  (no OfficeLocation table or error:', e.message, ')')
  }

  await hrms.end()
  await erp.end()
}

main().catch(e => { console.error(e); process.exit(1) })
