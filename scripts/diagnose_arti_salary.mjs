// ════════════════════════════════════════════════════════════════
// diagnose_arti_salary.mjs
// ════════════════════════════════════════════════════════════════
// Compare HRMS Payroll record (DB) vs ERP local computation for Arti.
// Goal: find why Arti's salary slip in Taskea (ERP) doesn't match HRMS.
//
// Safety: READ-ONLY. No INSERT/UPDATE/DELETE.
// ════════════════════════════════════════════════════════════════
import { PrismaClient } from '@prisma/client'
import pg from 'pg'

const ERP_DB = 'postgresql://neondb_owner:npg_V0CoL3SDNcKm@ep-noisy-bonus-app8563v-pooler.c-7.us-east-1.aws.neon.tech/neondb?sslmode=require'
const HRMS_DB = 'postgresql://neondb_owner:npg_pGbVon2mrZ3q@ep-empty-haze-aq8y1r98-pooler.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require'

const erp = new PrismaClient({ datasources: { db: { url: ERP_DB } } })
const hrmsPool = new pg.Pool({ connectionString: HRMS_DB, ssl: { rejectUnauthorized: false } })

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000

function getIstParts(date) {
  const ist = new Date(date.getTime() + IST_OFFSET_MS)
  return {
    year: ist.getUTCFullYear(),
    month: ist.getUTCMonth() + 1,
    day: ist.getUTCDate(),
    hour: ist.getUTCHours(),
    minute: ist.getUTCMinutes(),
    dayOfWeek: ist.getUTCDay(),
    dateStr: `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, '0')}-${String(ist.getUTCDate()).padStart(2, '0')}`,
  }
}

function istDateString(ts) { return getIstParts(new Date(ts)).dateStr }

function istMonthRange(year, month) {
  const startUtcMs = Date.UTC(year, month - 1, 1) - IST_OFFSET_MS
  const nextMonthStartUtcMs = Date.UTC(year, month, 1) - IST_OFFSET_MS
  return { start: new Date(startUtcMs), end: new Date(nextMonthStartUtcMs - 1) }
}

async function main() {
  // ── 1. Find Arti in ERP ──
  const arti = await erp.user.findFirst({
    where: {
      OR: [
        { name: { contains: 'Arti', mode: 'insensitive' } },
        { name: { contains: 'Aarti', mode: 'insensitive' } },
        { email: { contains: 'arti', mode: 'insensitive' } },
        { loginUsername: { contains: 'arti', mode: 'insensitive' } },
      ],
    },
    select: { id: true, name: true, email: true, role: true, hrmsId: true, department: true, designation: true },
  })
  console.log('\n═══ ERP USER (Arti) ═══')
  console.log(arti)

  if (!arti) {
    console.log('❌ Arti not found in ERP — aborting')
    return
  }

  // ── 2. Find Arti in HRMS (by hrmsId first, then by name) ──
  const hrmsClient = await hrmsPool.connect()
  try {
    let hrmsEmp = null
    if (arti.hrmsId) {
      const r = await hrmsClient.query(`SELECT id, "employeeId", "fullName", "monthlySalary", "dailyRate", "hourlyRate", "overtimeRate", firm, "shiftStart", "shiftEnd", "joiningDate", "bankName", "bankAccount", "panNumber" FROM "Employee" WHERE id = $1`, [arti.hrmsId])
      hrmsEmp = r.rows[0]
    }
    if (!hrmsEmp) {
      const r = await hrmsClient.query(`SELECT id, "employeeId", "fullName", "monthlySalary", "dailyRate", "hourlyRate", "overtimeRate", firm, "shiftStart", "shiftEnd", "joiningDate", "bankName", "bankAccount", "panNumber" FROM "Employee" WHERE "fullName" ILIKE '%Arti%' OR "fullName" ILIKE '%Aarti%' LIMIT 5`)
      hrmsEmp = r.rows[0]
      console.log(`\n[Fall-back] HRMS employees matching Arti:`)
      r.rows.forEach(row => console.log(`   - ${row.employeeId} | ${row.fullName} | id=${row.id}`))
    }
    console.log('\n═══ HRMS EMPLOYEE ═══')
    console.log(hrmsEmp)

    if (!hrmsEmp) {
      console.log('❌ Arti not found in HRMS — aborting')
      return
    }

    // ── 3. Check HRMS Payroll records for past 3 months ──
    console.log('\n═══ HRMS PAYROLL RECORDS (past 3 months) ═══')
    const payroll = await hrmsClient.query(`
      SELECT id, month, year, "monthlySalary", "grossSalary", "netSalary",
             "sundayEarnings", bonus, incentive, arrear, "otAmount",
             "advanceDeduction", "tdsDeduction", "loanDeduction",
             "otherDeductions", "totalDeductions",
             "presentDays", "paidLeaves", "sundayCount", "totalWorkedHrs",
             "createdAt", "updatedAt"
      FROM "Payroll"
      WHERE "employeeId" = $1
      ORDER BY year DESC, month DESC
      LIMIT 6
    `, [hrmsEmp.id])
    payroll.rows.forEach(r => {
      console.log(`   ${r.year}-${String(r.month).padStart(2, '0')}: gross=${r.grossSalary} net=${r.netSalary} present=${r.presentDays} paidLeave=${r.paidLeaves} sunday=${r.sundayCount} workedHrs=${r.totalWorkedHrs}`)
    })

    // ── 4. Check HRMS Attendance for last month ──
    const now = new Date()
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const lastMonth = lastMonthDate.getMonth() + 1
    const lastMonthYear = lastMonthDate.getFullYear()
    const daysInLastMonth = new Date(lastMonthYear, lastMonth, 0).getDate()
    const lastMonthStart = `${lastMonthYear}-${String(lastMonth).padStart(2, '0')}-01`
    const lastMonthEnd = `${lastMonthYear}-${String(lastMonth).padStart(2, '0')}-${String(daysInLastMonth).padStart(2, '0')}`

    console.log(`\n═══ HRMS ATTENDANCE — ${lastMonthYear}-${String(lastMonth).padStart(2, '0')} (last month) ═══`)
    const hrmsAtt = await hrmsClient.query(`
      SELECT date, status, "checkIn", "checkOut", "totalHours", "lateEntry", "earlyOut", "halfDay", "isWeeklyOff", "isHoliday"
      FROM "Attendance"
      WHERE "employeeId" = $1
        AND date >= to_date($2, 'YYYY-MM-DD')
        AND date <= to_date($3, 'YYYY-MM-DD')
      ORDER BY date ASC
    `, [hrmsEmp.id, lastMonthStart, lastMonthEnd])
    console.log(`   Total records: ${hrmsAtt.rows.length}`)
    let presentCnt = 0, lateCnt = 0, earlyOutCnt = 0, halfDayCnt = 0, weeklyOffCnt = 0, holidayCnt = 0
    hrmsAtt.rows.forEach(r => {
      if (r.isWeeklyOff) weeklyOffCnt++
      else if (r.isHoliday) holidayCnt++
      else if (r.status === 'late' || r.lateEntry) lateCnt++
      else if (r.status === 'early_out' || r.earlyOut) earlyOutCnt++
      else if (r.status === 'half_day' || r.halfDay) halfDayCnt++
      else if (r.status === 'present' || r.checkIn) presentCnt++
    })
    console.log(`   Summary: present=${presentCnt} late=${lateCnt} earlyOut=${earlyOutCnt} halfDay=${halfDayCnt} weeklyOff=${weeklyOffCnt} holiday=${holidayCnt}`)

    // ── 5. Check ERP punches for last month ──
    const { start, end } = istMonthRange(lastMonthYear, lastMonth)
    console.log(`\n═══ ERP PUNCHES — ${lastMonthYear}-${String(lastMonth).padStart(2, '0')} (last month) ═══`)
    const erpPunches = await erp.punchRecord.findMany({
      where: {
        userId: arti.id,
        punchIn: { gte: start, lte: end },
      },
      select: { punchIn: true, punchOut: true, status: true },
      orderBy: { punchIn: 'asc' },
    })
    console.log(`   Total ERP punches: ${erpPunches.length}`)
    if (erpPunches.length > 0) {
      const presentDates = new Set(erpPunches.map(p => istDateString(p.punchIn)))
      console.log(`   Distinct present days: ${presentDates.size}`)
      console.log(`   Sample dates: ${[...presentDates].slice(0, 5).join(', ')}${presentDates.size > 5 ? '...' : ''}`)
    }

    // ── 6. Check ERP leaves for last month ──
    console.log(`\n═══ ERP LEAVES — ${lastMonthYear}-${String(lastMonth).padStart(2, '0')} (last month) ═══`)
    const erpLeaves = await erp.leave.findMany({
      where: {
        userId: arti.id,
        OR: [
          { fromDate: { gte: start, lte: end } },
          { toDate: { gte: start, lte: end } },
          { AND: [{ fromDate: { lte: start } }, { toDate: { gte: end } }] },
        ],
      },
      select: { leaveType: true, fromDate: true, toDate: true, status: true, totalDays: true, reason: true },
    })
    erpLeaves.forEach(l => {
      console.log(`   ${l.status} ${l.leaveType} ${istDateString(l.fromDate)}→${istDateString(l.toDate)} (${l.totalDays}d): ${l.reason}`)
    })

    // ── 7. Check HRMS leaves for last month ──
    console.log(`\n═══ HRMS LEAVES — ${lastMonthYear}-${String(lastMonth).padStart(2, '0')} (last month) ═══`)
    const hrmsLeaves = await hrmsClient.query(`
      SELECT l.type, l.status, l."startDate", l."endDate", l.days, l.reason,
             e."fullName" as emp_name, e."employeeId" as emp_code
      FROM "Leave" l
      LEFT JOIN "Employee" e ON e.id = l."employeeId"
      WHERE (e."employeeId" = $1 OR e."fullName" ILIKE '%Arti%' OR e."fullName" ILIKE '%Aarti%')
        AND l.status = 'approved'
        AND l."startDate" <= to_date($3, 'YYYY-MM-DD')
        AND l."endDate" >= to_date($2, 'YYYY-MM-DD')
      ORDER BY l."startDate" ASC
    `, [hrmsEmp.employeeId, lastMonthStart, lastMonthEnd])
    hrmsLeaves.rows.forEach(l => {
      console.log(`   ${l.status} ${l.type} ${l.startDate}→${l.endDate} (${l.days}d): ${l.reason}`)
    })

    // ── 8. Compute expected salary LOCALLY (mirror ERP route logic) ──
    console.log('\n═══ ERP LOCAL COMPUTATION (if no HRMS payroll) ═══')
    const daysInMonth = daysInLastMonth
    const presentDates = new Set(erpPunches.map(p => istDateString(p.punchIn)))
    const presentDays = presentDates.size
    const approvedLeaves = erpLeaves.filter(l => l.status === 'APPROVED')
    const paidLeaveDays = approvedLeaves.reduce((sum, l) => {
      if (l.leaveType === 'HALF_DAY' || (l.totalDays || 0) === 0.5) return sum + 0.5
      return sum + (l.totalDays || 0)
    }, 0)
    // Sunday count
    let sundayCount = 0
    for (let day = 1; day <= daysInMonth; day++) {
      const checkDate = new Date(Date.UTC(lastMonthYear, lastMonth - 1, day) - IST_OFFSET_MS)
      const parts = getIstParts(checkDate)
      if (parts.dayOfWeek === 0 && presentDates.has(parts.dateStr)) {
        sundayCount++
      }
    }
    const monthlySalary = hrmsEmp.monthlySalary || 0
    const perDayRate = hrmsEmp.dailyRate && hrmsEmp.dailyRate > 0
      ? hrmsEmp.dailyRate
      : (monthlySalary > 0 ? Math.round((monthlySalary / daysInMonth) * 100) / 100 : 0)
    const payableDays = presentDays + paidLeaveDays
    const baseSalary = Math.round(perDayRate * payableDays * 100) / 100
    const sundayEarnings = Math.round(perDayRate * sundayCount * 100) / 100
    const grossSalary = Math.round((baseSalary + sundayEarnings) * 100) / 100
    const netSalary = grossSalary // no ERP deductions

    console.log(`   monthlySalary=${monthlySalary} perDayRate=${perDayRate}`)
    console.log(`   presentDays=${presentDays} paidLeaveDays=${paidLeaveDays} payableDays=${payableDays}`)
    console.log(`   sundayCount=${sundayCount}`)
    console.log(`   baseSalary=${baseSalary} sundayEarnings=${sundayEarnings}`)
    console.log(`   LOCAL grossSalary=${grossSalary} LOCAL netSalary=${netSalary}`)

    // ── 9. Compare to HRMS payroll for the same month ──
    console.log('\n═══ COMPARISON: HRMS PAYROLL vs ERP LOCAL ═══')
    const hrmsPayrollRow = payroll.rows.find(r => r.month === lastMonth && r.year === lastMonthYear)
    if (hrmsPayrollRow) {
      console.log(`   HRMS  presentDays=${hrmsPayrollRow.presentDays} paidLeaves=${hrmsPayrollRow.paidLeaves} sundayCount=${hrmsPayrollRow.sundayCount} totalWorkedHrs=${hrmsPayrollRow.totalWorkedHrs}`)
      console.log(`   ERP   presentDays=${presentDays} paidLeaves=${paidLeaveDays} sundayCount=${sundayCount}`)
      console.log(`   HRMS  grossSalary=${hrmsPayrollRow.grossSalary} netSalary=${hrmsPayrollRow.netSalary}`)
      console.log(`   ERP   grossSalary=${grossSalary} netSalary=${netSalary}`)
      const diff = Math.abs(hrmsPayrollRow.netSalary - netSalary)
      if (diff > 1) {
        console.log(`   ⚠️  MISMATCH of ₹${diff} — HRMS DB payroll will be shown (per code path: hrmsPayroll.netSalary > 0 takes precedence)`)
      } else {
        console.log(`   ✅ Match within rounding`)
      }
    } else {
      console.log(`   ❌ No HRMS Payroll record for ${lastMonthYear}-${String(lastMonth).padStart(2, '0')} — ERP will compute locally`)
    }
  } finally {
    hrmsClient.release()
  }
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(async () => { await erp.$disconnect(); await hrmsPool.end() })
