// verify_arti_payroll.mjs — Confirm Arti's July payroll via the same query path ERP uses
import pg from 'pg'

const HRMS_DB = 'postgresql://neondb_owner:npg_pGbVon2mrZ3q@ep-empty-haze-aq8y1r98-pooler.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require'
const pool = new pg.Pool({ connectionString: HRMS_DB, ssl: { rejectUnauthorized: false } })

async function main() {
  const client = await pool.connect()
  try {
    // ERP calls: fetchHrmsPayroll('EMP-420', 7, 2026)
    console.log('═══ Direct query: Payroll WHERE "employeeId" = $1 AND month=7 AND year=2026 ═══')
    const r = await client.query(
      `SELECT id, "employeeId", month, year, "monthlySalary", "grossSalary", "netSalary", "presentDays", "paidLeaves", "sundayCount", "totalWorkedHrs", "sundayEarnings", "otAmount", bonus, incentive, arrear, "advanceDeduction", "tdsDeduction", "loanDeduction", "otherDeductions", "totalDeductions", status, "generatedAt"
       FROM "Payroll"
       WHERE "employeeId" = $1 AND month = $2 AND year = $3
       LIMIT 1`,
      ['EMP-420', 7, 2026]
    )
    if (r.rows.length === 0) {
      console.log('❌ No payroll found for EMP-420 / 2026-07')
    } else {
      console.log('✅ Found:')
      console.log(r.rows[0])
    }

    // What if ERP is accidentally passing the cuid?
    console.log('\n═══ Query with CUID (wrong — to confirm ERP isn\'t doing this) ═══')
    const r2 = await client.query(
      `SELECT id, "employeeId", month, year, "netSalary" FROM "Payroll" WHERE "employeeId" = $1 LIMIT 1`,
      ['cmqj2unet000hl704z48o4is4']
    )
    console.log(`Rows: ${r2.rows.length} (expected 0 if ERP is using EMP-code correctly)`)

    // Check Arti's HRMS attendance for July
    console.log('\n═══ Arti Attendance — July 2026 ═══')
    const att = await client.query(
      `SELECT date, status, "checkIn", "checkOut", "totalHours", "lateEntry", "earlyOut", "isWeeklyOff", "isHoliday"
       FROM "Attendance"
       WHERE "employeeId" = $1 AND date >= '2026-07-01' AND date <= '2026-07-31'
       ORDER BY date ASC`,
      ['EMP-420']
    )
    console.log(`Rows: ${att.rows.length}`)
    att.rows.forEach(r => console.log(`   ${r.date} | ${r.status} | in=${r.checkIn} out=${r.checkOut} hrs=${r.totalHours}`))

    // What does the HRMS app's salary slip API actually return? Let me check
    // what other data the HRMS might be using (SalaryHistory?)
    console.log('\n═══ Arti SalaryHistory ═══')
    const sh = await client.query(`SELECT * FROM "SalaryHistory" WHERE "employeeId" = $1 ORDER BY year DESC, month DESC LIMIT 5`, ['EMP-420'])
    console.log(`Rows: ${sh.rows.length}`)
    sh.rows.forEach(r => console.log('   ', r))

    // Also try with cuid
    const sh2 = await client.query(`SELECT * FROM "SalaryHistory" WHERE "employeeId" = $1 ORDER BY year DESC, month DESC LIMIT 5`, ['cmqj2unet000hl704z48o4is4'])
    console.log(`\n═══ Arti SalaryHistory by cuid: ${sh2.rows.length} rows ═══`)
    sh2.rows.forEach(r => console.log('   ', r))

    // Sanity: list all employees that have July 2026 payroll
    console.log('\n═══ All employees with July 2026 payroll (count by employeeId) ═══')
    const cnt = await client.query(`
      SELECT "employeeId" as emp_code, count(*) as cnt, max("netSalary") as max_net
      FROM "Payroll" WHERE month = 7 AND year = 2026
      GROUP BY "employeeId"
      ORDER BY emp_code
      LIMIT 30
    `)
    cnt.rows.forEach(r => console.log(`   ${r.emp_code}: ${r.cnt} records, max net=₹${r.max_net}`))
  } finally {
    client.release()
  }
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => pool.end())
