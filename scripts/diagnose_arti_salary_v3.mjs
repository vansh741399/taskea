// diagnose_arti_salary_v3.mjs — Find Arti's actual July salary data
import pg from 'pg'

const HRMS_DB = 'postgresql://neondb_owner:npg_pGbVon2mrZ3q@ep-empty-haze-aq8y1r98-pooler.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require'
const pool = new pg.Pool({ connectionString: HRMS_DB, ssl: { rejectUnauthorized: false } })

async function main() {
  const client = await pool.connect()
  try {
    // 1. Payroll table schema
    console.log('═══ Payroll table columns ═══')
    const cols = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'Payroll' ORDER BY ordinal_position
    `)
    cols.rows.forEach(c => console.log(`   ${c.column_name} (${c.data_type})`))

    // 2. Sample Payroll row
    console.log('\n═══ Sample Payroll row (first) ═══')
    const sample = await client.query(`SELECT * FROM "Payroll" LIMIT 1`)
    console.log(sample.rows[0])

    // 3. SalaryHistory table schema
    console.log('\n═══ SalaryHistory table columns ═══')
    const shCols = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'SalaryHistory' ORDER BY ordinal_position
    `)
    shCols.rows.forEach(c => console.log(`   ${c.column_name} (${c.data_type})`))

    // 4. Look up Arti's SalaryHistory
    console.log('\n═══ Arti SalaryHistory ═══')
    const sh = await client.query(`
      SELECT * FROM "SalaryHistory" sh
      LEFT JOIN "Employee" e ON e.id = sh."employeeId"
      WHERE e."employeeId" = 'EMP-420'
      ORDER BY sh.year DESC, sh.month DESC LIMIT 10
    `)
    console.log(`Rows: ${sh.rows.length}`)
    sh.rows.forEach(r => console.log('   ', r))

    // 5. Check if Payroll table has direct employeeCuid or similar
    console.log('\n═══ Payroll records — joined differently ═══')
    const joined = await client.query(`
      SELECT p.id, p.month, p.year, p."netSalary", p."grossSalary",
             p."presentDays", p."paidLeaves", p."sundayCount",
             p."employeeId" as payroll_emp_cuid,
             e."employeeId" as emp_code, e."fullName"
      FROM "Payroll" p
      LEFT JOIN "Employee" e ON e.id = p."employeeId"
      WHERE p."netSalary" > 0
      ORDER BY p.year DESC, p.month DESC LIMIT 20
    `)
    joined.rows.forEach(r => console.log(`   ${r.year}-${String(r.month).padStart(2,'0')} | emp_code=${r.emp_code || '?'} | name=${r.fullName || '?'} | net=₹${r.netSalary} | present=${r.presentDays} | payroll_emp_cuid=${r.payroll_emp_cuid ? r.payroll_emp_cuid.substring(0,12)+'...' : 'NULL'}`))

    // 6. ALL payroll records for Arti (search by name match too)
    console.log('\n═══ Search Arti in Payroll by partial employeeId cuid match ═══')
    const artiCuid = 'cmqj2unet000hl704z48o4is4'
    const artiPayroll2 = await client.query(`
      SELECT p.*, e."employeeId" as emp_code, e."fullName"
      FROM "Payroll" p
      LEFT JOIN "Employee" e ON e.id = p."employeeId"
      WHERE p."employeeId" = $1
         OR e."fullName" ILIKE '%Arti%'
         OR e."fullName" ILIKE '%Aarti%'
      ORDER BY p.year DESC, p.month DESC
    `, [artiCuid])
    console.log(`Found ${artiPayroll2.rows.length} rows for Arti`)

    // 7. Distinct employees in Payroll
    console.log('\n═══ Distinct employees with payroll records ═══')
    const distinctEmps = await client.query(`
      SELECT DISTINCT e."employeeId", e."fullName"
      FROM "Payroll" p
      LEFT JOIN "Employee" e ON e.id = p."employeeId"
      WHERE e."employeeId" IS NOT NULL
      ORDER BY e."employeeId"
    `)
    distinctEmps.rows.forEach(r => console.log(`   ${r.employeeId} | ${r.fullName}`))

    // 8. Payroll records with NULL employeeId
    console.log('\n═══ Payroll records with NULL employeeId (orphan) ═══')
    const orphans = await client.query(`
      SELECT count(*) as cnt FROM "Payroll" p
      LEFT JOIN "Employee" e ON e.id = p."employeeId"
      WHERE e."employeeId" IS NULL
    `)
    console.log(`Orphan payroll records: ${orphans.rows[0].cnt}`)

    // 9. Direct sample: show raw employeeId values in Payroll
    console.log('\n═══ Payroll raw employeeId sample (first 5) ═══')
    const rawEmpIds = await client.query(`SELECT "employeeId" FROM "Payroll" LIMIT 5`)
    rawEmpIds.rows.forEach(r => console.log(`   employeeId=${r.employeeId ? r.employeeId.substring(0,30)+'...' : 'NULL'}`))
  } finally {
    client.release()
  }
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => pool.end())
