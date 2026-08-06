// ════════════════════════════════════════════════════════════════════════
// Test script — verifies the IST helper logic matches expected behaviour
// for the HR Report route. Run with: node scripts/test-ist-logic.js
// ════════════════════════════════════════════════════════════════════════

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000 // IST = UTC + 5:30

function getIstParts(date) {
  const ist = new Date(date.getTime() + IST_OFFSET_MS)
  const y = ist.getUTCFullYear()
  const m = ist.getUTCMonth() + 1
  const d = ist.getUTCDate()
  return {
    year: y, month: m, day: d,
    hour: ist.getUTCHours(),
    minute: ist.getUTCMinutes(),
    dayOfWeek: ist.getUTCDay(),
    dateStr: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
  }
}

function istDateString(ts) {
  return getIstParts(new Date(ts)).dateStr
}

function istMonthRange(year, month) {
  const startUtcMs = Date.UTC(year, month - 1, 1) - IST_OFFSET_MS
  const nextMonthStartUtcMs = Date.UTC(year, month, 1) - IST_OFFSET_MS
  const endUtcMs = nextMonthStartUtcMs - 1
  return { start: new Date(startUtcMs), end: new Date(endUtcMs) }
}

// ─── Test constants ──────────────────────────────────────────────────────
const SHIFT_START_HOUR = 10
const SHIFT_END_HOUR = 19
const LATE_THRESHOLD_MINUTES = 15
const LATE_THRESHOLD_MIN = SHIFT_START_HOUR * 60 + LATE_THRESHOLD_MINUTES // 615
const SHIFT_END_MIN = SHIFT_END_HOUR * 60                                 // 1140

let passed = 0, failed = 0
function assert(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (ok) { passed++; console.log(`  ✓ ${name}`) }
  else {
    failed++
    console.log(`  ✗ ${name}`)
    console.log(`    expected: ${JSON.stringify(expected)}`)
    console.log(`    actual:   ${JSON.stringify(actual)}`)
  }
}

console.log('\n═══ IST Date String Conversion ═══')

// Punch at Aug 6 2026, 09:00 AM IST = Aug 5 2026, 23:30 UTC
const punch1 = new Date('2026-08-05T23:30:00.000Z')
assert('punch at 09:00 AM IST on Aug 6 → dateStr', istDateString(punch1), '2026-08-06')

// Punch at Aug 6 2026, 10:30 AM IST = Aug 6 2026, 05:00 UTC
const punch2 = new Date('2026-08-06T05:00:00.000Z')
assert('punch at 10:30 AM IST on Aug 6 → dateStr', istDateString(punch2), '2026-08-06')

// Punch at Aug 1 2026, 02:00 AM IST = Jul 31 2026, 20:30 UTC
const punch3 = new Date('2026-07-31T20:30:00.000Z')
assert('punch at 02:00 AM IST on Aug 1 → dateStr', istDateString(punch3), '2026-08-01')

// Punch at Jul 1 2026, 02:00 AM IST = Jun 30 2026, 20:30 UTC
const punch4 = new Date('2026-06-30T20:30:00.000Z')
assert('punch at 02:00 AM IST on Jul 1 → dateStr', istDateString(punch4), '2026-07-01')

console.log('\n═══ IST Hour/Minute (for late/early detection) ═══')

// Punch at 10:30 AM IST = 05:00 UTC
const p1 = getIstParts(new Date('2026-08-06T05:00:00.000Z'))
assert('10:30 AM IST → hour=10, minute=30', { h: p1.hour, m: p1.minute }, { h: 10, m: 30 })

// Punch at 09:50 AM IST = 04:20 UTC
const p2 = getIstParts(new Date('2026-08-06T04:20:00.000Z'))
assert('09:50 AM IST → hour=9, minute=50', { h: p2.hour, m: p2.minute }, { h: 9, m: 50 })

// Punch at 7:00 PM IST = 13:30 UTC
const p3 = getIstParts(new Date('2026-08-06T13:30:00.000Z'))
assert('7:00 PM IST → hour=19, minute=0', { h: p3.hour, m: p3.minute }, { h: 19, m: 0 })

// Punch at 6:50 PM IST = 13:20 UTC
const p4 = getIstParts(new Date('2026-08-06T13:20:00.000Z'))
assert('6:50 PM IST → hour=18, minute=50', { h: p4.hour, m: p4.minute }, { h: 18, m: 50 })

console.log('\n═══ Late Coming Detection (IST) ═══')

// Late = punchIn minutes > 615 (10:15 AM IST)
function isLate(utcIsoStr) {
  const parts = getIstParts(new Date(utcIsoStr))
  const minutes = parts.hour * 60 + parts.minute
  return minutes > LATE_THRESHOLD_MIN
}

assert('10:00 AM IST → NOT late', isLate('2026-08-06T04:30:00.000Z'), false)
assert('10:15 AM IST → NOT late (boundary, > not >=)', isLate('2026-08-06T04:45:00.000Z'), false)
assert('10:16 AM IST → LATE', isLate('2026-08-06T04:46:00.000Z'), true)
assert('11:00 AM IST → LATE', isLate('2026-08-06T05:30:00.000Z'), true)
assert('09:00 AM IST → NOT late', isLate('2026-08-06T03:30:00.000Z'), false)

console.log('\n═══ Early Going Detection (IST, fixed bug) ═══')

// Early = punchOut minutes < 1140 (7:00 PM IST)
// Bug fix: previously a punch at EXACTLY 19:00 was marked early (=== 0 condition)
function isEarly(utcIsoStr) {
  const parts = getIstParts(new Date(utcIsoStr))
  const minutes = parts.hour * 60 + parts.minute
  return minutes < SHIFT_END_MIN
}

assert('6:50 PM IST → EARLY', isEarly('2026-08-06T13:20:00.000Z'), true)
assert('7:00 PM IST → NOT early (bug fix)', isEarly('2026-08-06T13:30:00.000Z'), false)
assert('7:01 PM IST → NOT early', isEarly('2026-08-06T13:31:00.000Z'), false)
assert('7:30 PM IST → NOT early', isEarly('2026-08-06T14:00:00.000Z'), false)
assert('5:00 PM IST → EARLY', isEarly('2026-08-06T11:30:00.000Z'), true)

console.log('\n═══ IST Month Range (date filter) ═══')

// July 2026 in IST
const july = istMonthRange(2026, 7)
assert('July 2026 IST range start UTC', july.start.toISOString(), '2026-06-30T18:30:00.000Z')
assert('July 2026 IST range end UTC', july.end.toISOString(), '2026-07-31T18:29:59.999Z')

// August 2026 in IST
const aug = istMonthRange(2026, 8)
assert('Aug 2026 IST range start UTC', aug.start.toISOString(), '2026-07-31T18:30:00.000Z')
assert('Aug 2026 IST range end UTC', aug.end.toISOString(), '2026-08-31T18:29:59.999Z')

// Punch at Aug 1 02:00 IST = Jul 31 20:30 UTC → should be in AUGUST range, not July
const boundaryPunch = new Date('2026-07-31T20:30:00.000Z')
assert('Aug 1 02:00 IST punch is in August range',
  boundaryPunch >= aug.start && boundaryPunch <= aug.end, true)
assert('Aug 1 02:00 IST punch is NOT in July range',
  boundaryPunch >= july.start && boundaryPunch <= july.end, false)

// Punch at Jul 1 02:00 IST = Jun 30 20:30 UTC → should be in JULY range, not June
const jul1Punch = new Date('2026-06-30T20:30:00.000Z')
assert('Jul 1 02:00 IST punch is in July range',
  jul1Punch >= july.start && jul1Punch <= july.end, true)

console.log('\n═══ Day of Week (IST) ═══')

// Aug 6 2026 is Thursday in IST
const thu = getIstParts(new Date('2026-08-06T05:00:00.000Z')) // 10:30 AM IST
assert('Aug 6 2026 IST is Thursday (dayOfWeek=4)', thu.dayOfWeek, 4)

// Aug 9 2026 is Sunday in IST
const sun = getIstParts(new Date('2026-08-09T05:00:00.000Z')) // 10:30 AM IST
assert('Aug 9 2026 IST is Sunday (dayOfWeek=0)', sun.dayOfWeek, 0)

// Aug 8 2026 is Saturday in IST
const sat = getIstParts(new Date('2026-08-08T05:00:00.000Z')) // 10:30 AM IST
assert('Aug 8 2026 IST is Saturday (dayOfWeek=6)', sat.dayOfWeek, 6)

// CRITICAL: a punch at Sat Aug 8 11:30 PM IST = Sat Aug 8 18:00 UTC → still Saturday in IST
// but if read with UTC getters it would be Sun Aug 9 in UTC!
const satLate = getIstParts(new Date('2026-08-08T18:30:00.000Z')) // Aug 9 00:00 IST
assert('Aug 8 18:30 UTC = Aug 9 00:00 IST (Sunday, dayOfWeek=0)', satLate.dayOfWeek, 0)
assert('Aug 8 18:30 UTC = Aug 9 00:00 IST (dateStr)', satLate.dateStr, '2026-08-09')

console.log(`\n═══ Results: ${passed} passed, ${failed} failed ═══`)
process.exit(failed === 0 ? 0 : 1)
