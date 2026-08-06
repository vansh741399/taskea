// Quick check: fetch production tasks and count by date category
const https = require('https')

function fetchTasks() {
  return new Promise((resolve, reject) => {
    https.get('https://erp-ea.vercel.app/api/tasks', (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try { resolve(JSON.parse(data)) } catch (e) { reject(e) }
      })
    }).on('error', reject)
  })
}

;(async () => {
  const tasks = await fetchTasks()
  console.log(`Total tasks: ${tasks.length}`)

  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const tomorrowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  console.log('now:', now.toISOString())
  console.log('todayStart (local):', todayStart.toISOString())
  console.log('tomorrowStart (local):', tomorrowStart.toISOString())

  let todayList = [], upcomingList = [], overdueList = [], noDate = []
  for (const t of tasks) {
    if (!t.dueDate) { noDate.push(t); continue }
    if (t.status === 'COMPLETED' || t.status === 'CANCELLED') continue

    const d = new Date(t.dueDate)
    const dueDayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate())

    const isToday = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
    const isUpcoming = d >= tomorrowStart
    const isOverdue = dueDayStart < todayStart

    if (isToday) todayList.push(t)
    else if (isUpcoming) upcomingList.push(t)
    else if (isOverdue) overdueList.push(t)
    else console.log('UNCLASSIFIED:', t.id, t.dueDate)
  }

  console.log('\n--- COUNTS ---')
  console.log('Today:', todayList.length)
  console.log('Upcoming:', upcomingList.length)
  console.log('Overdue:', overdueList.length)
  console.log('No date (skipped):', noDate.length)

  console.log('\n--- OVERLAP CHECK ---')
  const todayIds = new Set(todayList.map(t => t.id))
  const overdueIds = new Set(overdueList.map(t => t.id))
  const overlap = [...todayIds].filter(id => overdueIds.has(id))
  console.log('Overlap (Today AND Overdue):', overlap.length)

  console.log('\n--- TODAY TASK DATES ---')
  for (const t of todayList) console.log(t.dueDate, '|', t.title)

  console.log('\n--- OVERDUE TASK DATES ---')
  for (const t of overdueList) console.log(t.dueDate, '|', t.title)
})().catch(console.error)
