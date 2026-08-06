// Diagnose why /api/tasks returns empty array on production
// Run: node scripts/diagnose_tasks.js

const PROD_URL = 'https://erp-ea.vercel.app'

async function main() {
  console.log('=== Production API diagnosis ===\n')

  // 1. Check /api/tasks (no params)
  console.log('1) GET /api/tasks (no params)')
  try {
    const r1 = await fetch(`${PROD_URL}/api/tasks`, { cache: 'no-store' })
    const t1 = await r1.json()
    console.log('   Status:', r1.status)
    if (Array.isArray(t1)) {
      console.log('   Returned array of length:', t1.length)
      if (t1.length > 0) {
        console.log('   First task:', JSON.stringify(t1[0], null, 2).substring(0, 500))
      }
    } else {
      console.log('   Returned non-array:', JSON.stringify(t1).substring(0, 500))
    }
  } catch (e) {
    console.log('   Error:', e.message)
  }

  // 2. Check /api/dashboard (we know this works)
  console.log('\n2) GET /api/dashboard?userId=test')
  try {
    const r2 = await fetch(`${PROD_URL}/api/dashboard?userId=test`, { cache: 'no-store' })
    const d2 = await r2.json()
    console.log('   Status:', r2.status)
    console.log('   totalTasks:', d2.totalTasks)
    console.log('   completedTasks:', d2.completedTasks)
    console.log('   inProgressTasks:', d2.inProgressTasks)
    console.log('   todayTasks:', d2.todayTasks)
    console.log('   upcomingTasks:', d2.upcomingTasks)
    console.log('   overdueTasks:', d2.overdueTasks)
    if (Array.isArray(d2.allTasks)) {
      console.log('   allTasks array length:', d2.allTasks.length)
      if (d2.allTasks.length > 0) {
        console.log('   First allTasks entry:', JSON.stringify(d2.allTasks[0]).substring(0, 300))
        console.log('   parentTaskId of first:', d2.allTasks[0].parentTaskId)
      }
    }
  } catch (e) {
    console.log('   Error:', e.message)
  }

  // 3. Check /api/task-activity
  console.log('\n3) GET /api/task-activity?limit=5')
  try {
    const r3 = await fetch(`${PROD_URL}/api/task-activity?limit=5`, { cache: 'no-store' })
    const d3 = await r3.json()
    console.log('   Status:', r3.status)
    if (Array.isArray(d3.activities)) {
      console.log('   Activities count:', d3.activities.length)
      if (d3.activities.length > 0) {
        console.log('   First activity:', JSON.stringify(d3.activities[0]).substring(0, 300))
      }
    }
  } catch (e) {
    console.log('   Error:', e.message)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
