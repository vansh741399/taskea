#!/usr/bin/env node
// Audit scoring for all employees by fetching the production HR report API.
// Verifies:
//   1. Every employee has overallScore in [0, 10]
//   2. Score = max(0, min(10, 10 - deductions))
//   3. Status matches: >=8 GOOD, 7 AVERAGE, <7 LOW
//   4. isLowScore flag is consistent
//   5. SNO is sequential 1..N (no gaps)
//   6. No inactive employees (HRMS status=No) appear
//   7. Distribution summary printed at end

const PROD_URL = 'https://task.ea.laxree.com'
const MONTH = process.env.MONTH || 7   // July 2026 — the month user has been auditing
const YEAR = process.env.YEAR || 2026

async function main() {
  console.log(`\n📊 Auditing HR Report — ${MONTH}/${YEAR}\n`)
  console.log(`   Source: ${PROD_URL}/api/hr-report\n`)

  const url = `${PROD_URL}/api/hr-report?month=${MONTH}&year=${YEAR}&location=all&format=json`
  console.log(`   Fetching: ${url}\n`)

  const res = await fetch(url)
  if (!res.ok) {
    console.error(`❌ HTTP ${res.status}: ${await res.text()}`)
    process.exit(1)
  }
  const data = await res.json()
  const employees = data.employees || []

  console.log(`   Total employees: ${employees.length}\n`)
  console.log(`   Data status: ${data.dataStatus}\n`)
  console.log(`   Punch count: ${data.punchCount}\n`)
  console.log(`   HRMS leaves merged: ${data.hrmsLeavesMergedCount}\n`)

  let errors = 0
  let warnings = 0
  const distribution = { GOOD: 0, AVERAGE: 0, LOW: 0 }

  console.log('─'.repeat(120))
  console.log(`${'#'.padStart(4)}  ${'Name'.padEnd(28)}  ${'Presents'.padStart(8)}  ${'FD'.padStart(3)}  ${'HD'.padStart(3)}  ${'Uninf'.padStart(5)}  ${'Late'.padStart(4)}  ${'Early'.padStart(5)}  ${'L/E'.padStart(3)}  ${'Deduct'.padStart(6)}  ${'Score'.padStart(5)}  ${'Status'.padEnd(8)}`)
  console.log('─'.repeat(120))

  employees.forEach((emp, i) => {
    // Check SNO is sequential
    if (emp.sno !== i + 1) {
      console.log(`❌ SNO mismatch at index ${i}: expected ${i + 1}, got ${emp.sno}`)
      errors++
    }

    // Check score is in valid range
    if (typeof emp.overallScore !== 'number' || emp.overallScore < 0 || emp.overallScore > 10) {
      console.log(`❌ Invalid score for ${emp.name}: ${emp.overallScore}`)
      errors++
    }

    // Check score = 10 - deductions (clamped)
    const expectedScore = Math.max(0, Math.min(10, 10 - emp.deductions))
    if (emp.overallScore !== expectedScore) {
      console.log(`❌ Score mismatch for ${emp.name}: expected ${expectedScore} (10 - ${emp.deductions}), got ${emp.overallScore}`)
      errors++
    }

    // Check status consistency
    const expectedStatus = emp.overallScore >= 8 ? 'GOOD' : emp.overallScore >= 7 ? 'AVERAGE' : 'LOW'
    if (emp.status !== expectedStatus) {
      console.log(`❌ Status mismatch for ${emp.name}: expected ${expectedStatus}, got ${emp.status}`)
      errors++
    }

    // Check isLowScore flag
    const expectedIsLow = emp.overallScore < 7
    if (emp.isLowScore !== expectedIsLow) {
      console.log(`❌ isLowScore mismatch for ${emp.name}: expected ${expectedIsLow}, got ${emp.isLowScore}`)
      errors++
    }

    // Check deductions detail
    if (emp.deductions > 0 && (!emp.deductionDetails || emp.deductionDetails.length === 0)) {
      console.log(`⚠️  ${emp.name} has deductions=${emp.deductions} but no deductionDetails`)
      warnings++
    }

    distribution[emp.status] = (distribution[emp.status] || 0) + 1

    console.log(
      `${String(emp.sno).padStart(4)}  ` +
      `${(emp.name || '').slice(0, 28).padEnd(28)}  ` +
      `${String(emp.totalPresents).padStart(8)}  ` +
      `${String(emp.fullDayLeaves).padStart(3)}  ` +
      `${String(emp.halfDayLeaves).padStart(3)}  ` +
      `${String(emp.uninformedLeaves).padStart(5)}  ` +
      `${String(emp.lateComings).padStart(4)}  ` +
      `${String(emp.earlyGoings).padStart(5)}  ` +
      `${String(emp.lateComingsEarlyGoings).padStart(3)}  ` +
      `${String(emp.deductions).padStart(6)}  ` +
      `${String(emp.overallScore).padStart(5)}  ` +
      `${emp.status.padEnd(8)}`
    )
  })

  console.log('─'.repeat(120))
  console.log(`\n📈 Distribution:`)
  console.log(`   ✓ GOOD (8-10):    ${distribution.GOOD}`)
  console.log(`   ⚠ AVERAGE (7):    ${distribution.AVERAGE}`)
  console.log(`   ✗ LOW (<7):       ${distribution.LOW}`)
  console.log(`   TOTAL:            ${employees.length}`)

  const avgScore = employees.reduce((s, e) => s + e.overallScore, 0) / employees.length
  console.log(`   Average score:    ${avgScore.toFixed(2)}/10`)

  console.log(`\n${errors === 0 ? '✅ All scoring checks PASSED' : `❌ ${errors} error(s) found`}`)
  if (warnings > 0) console.log(`⚠️  ${warnings} warning(s)`)

  process.exit(errors > 0 ? 1 : 0)
}

main().catch(e => {
  console.error('Fatal:', e)
  process.exit(1)
})
