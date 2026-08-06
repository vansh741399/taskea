// diagnose_arti_salary_v2.mjs — Check ALL Arti-related data in HRMS DB
import pg from 'pg'

const HRMS_DB = 'postgresql://neondb_owner:npg_pGbVon2mrZ3q@ep-empty-haze-aq8y1r98-pooler.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require'
const pool = new pg.Pool({ connectionString: HRMS_DB, ssl: { rejectUnauthorized: false } })

async function main() {
  const client = await pool.connect()
  try {
    // 1. Get Arti's HRMS record
    const r = await client.query(`SELECT id, "employeeId", "fullName", "monthlySalary", "dailyRate", firm FROM "Employee" WHERE "employeeId" = 'EMP-420'`)
    const arti = r.rows[0]
    console.log('═══ Arti HRMS record ═══')
    console.log(arti)

    if (!arti) { console.log('❌ Not found'); return }

    // 2. Check ALL payroll records in HRMS (any employee, any month)
    console.log('\n═══ HRMS Payroll table — ALL records ═══')
    const allPayroll = await client.query(`SELECT p.id, p.month, p.year, p."netSalary", p."grossSalary", p."presentDays", p."paidLeaves", e."employeeId", e."fullName" FROM "Payroll" p LEFT JOIN "Employee" e ON e.id = p."employeeId" ORDER BY p.year DESC, p.month DESC LIMIT 30`)
    console.log(`Total payroll records: ${allPayroll.rows.length}`)
    allPayroll.rows.forEach(r => {
      console.log(`   ${r.year}-${String(r.month).padStart(2,'0')}: ${r.employeeId || '?'} | ${r.fullName || '?'} | net=₹${r.netSalary} gross=₹${r.grossSalary} present=${r.presentDays} paidLeaves=${r.paidLeaves}`)
    })

    // 3. Specifically check Arti's payroll
    console.log('\n═══ Arti Payroll records ═══')
    const artiPayroll = await client.query(`SELECT * FROM "Payroll" WHERE "employeeId" = $1 ORDER BY year DESC, month DESC`, [arti.id])
    console.log(`Count: ${artiPayroll.rows.length}`)
    artiPayroll.rows.forEach(r => console.log('   ', r))

    // 4. List all tables in HRMS DB
    console.log('\n═══ HRMS DB — All tables ═══')
    const tables = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' ORDER BY table_name
    `)
    tables.rows.forEach(t => console.log(`   - ${t.table_name}`))

    // 5. Check Attendance — ALL records for Arti (any month)
    console.log('\n═══ Arti Attendance — ALL records ═══')
    const artiAtt = await client.query(`
      SELECT date, status, "checkIn", "checkOut", "totalHours", "lateEntry", "earlyOut", "halfDay", "isWeeklyOff", "isHoliday"
      FROM "Attendance"
      WHERE "employeeId" = $1
      ORDER BY date DESC
      LIMIT 20
    `, [arti.id])
    console.log(`Total: ${artiAtt.rows.length}`)
    artiAtt.rows.forEach(r => console.log(`   ${r.date} | status=${r.status} in=${r.checkIn} out=${r.checkOut} hrs=${r.totalHours} late=${r.lateEntry} early=${r.earlyOut} halfDay=${r.halfDay} weeklyOff=${r.isWeeklyOff} holiday=${r.isHoliday}`))

    // 6. Check what months Arti has attendance for
    console.log('\n═══ Arti Attendance — Month distribution ═══')
    const monthDist = await client.query(`
      SELECT to_char(date, 'YYYY-MM') as ym, count(*) as cnt
      FROM "Attendance"
      WHERE "employeeId" = $1
      GROUP BY to_char(date, 'YYYY-MM')
      ORDER BY ym DESC
    `, [arti.id])
    monthDist.rows.forEach(r => console.log(`   ${r.ym}: ${r.cnt} records`))

  } finally {
    client.release()
  }
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => pool.end())
