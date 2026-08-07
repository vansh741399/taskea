const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  // Total punch records
  const total = await prisma.punchRecord.count()
  console.log(`Total punch records in DB: ${total}`)
  
  // Punches this month (Aug 2026)
  const startAug = new Date('2026-07-31T18:30:00.000Z') // Aug 1 00:00 IST
  const endAug = new Date('2026-08-31T18:29:59.999Z')   // Aug 31 23:59 IST
  const augPunches = await prisma.punchRecord.count({
    where: { punchIn: { gte: startAug, lte: endAug } }
  })
  console.log(`August 2026 punches: ${augPunches}`)
  
  // Today's punches (Aug 6 2026 IST)
  const startToday = new Date('2026-08-05T18:30:00.000Z') // Aug 6 00:00 IST
  const endToday = new Date('2026-08-06T18:29:59.999Z')   // Aug 6 23:59 IST
  const todayPunches = await prisma.punchRecord.count({
    where: { punchIn: { gte: startToday, lte: endToday } }
  })
  console.log(`Today (Aug 6 IST) punches: ${todayPunches}`)
  
  // Sample recent punches
  const recent = await prisma.punchRecord.findMany({
    take: 10,
    orderBy: { punchIn: 'desc' },
    include: {
      user: { select: { name: true, officeId: true, hrmsId: true } },
      office: { select: { name: true, city: true } },
    },
  })
  console.log('\n=== 10 Most Recent Punches ===')
  for (const p of recent) {
    console.log(`  ${p.punchIn.toISOString()} | ${p.user?.name} | office=${p.office?.name || 'NULL'} | dist=${p.punchInDistance}m | status=${p.status}`)
  }
  
  // Check users with no officeId
  const usersNoOffice = await prisma.user.findMany({
    where: { officeId: null, isActive: true },
    select: { id: true, name: true, role: true, hrmsId: true }
  })
  console.log(`\n=== Active users with NO officeId: ${usersNoOffice.length} ===`)
  for (const u of usersNoOffice) {
    console.log(`  - ${u.name} (${u.role}) | hrmsId=${u.hrmsId || 'null'}`)
  }
  
  // Check OfficeLocations
  const offices = await prisma.officeLocation.findMany()
  console.log(`\n=== OfficeLocations: ${offices.length} ===`)
  for (const o of offices) {
    console.log(`  - ${o.name} | city=${o.city} | lat=${o.latitude}, lng=${o.longitude} | radius=${o.radiusMeters}m`)
  }
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
