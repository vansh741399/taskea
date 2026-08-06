// Quick check: what OfficeLocations exist in the DB?
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const offices = await prisma.officeLocation.findMany()
  console.log(`Total offices: ${offices.length}`)
  for (const o of offices) {
    console.log(`  - ${o.name} | city=${o.city} | lat=${o.latitude}, lng=${o.longitude} | radius=${o.radiusMeters}m | active=${o.isActive}`)
  }
  console.log('')
  console.log('=== Users with officeId ===')
  const users = await prisma.user.findMany({ select: { id: true, name: true, role: true, officeId: true } })
  const withOffice = users.filter(u => u.officeId)
  console.log(`Total users: ${users.length} | with officeId: ${withOffice.length}`)
  for (const u of withOffice) {
    console.log(`  - ${u.name} (${u.role}) → officeId=${u.officeId}`)
  }
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
