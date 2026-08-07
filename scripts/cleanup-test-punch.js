// Delete the test punch I made during verification (punchId cmshak0ea0001jx049t0sy83l)
// This is the ONLY safe deletion — it removes a punch I created myself, NOT user data.
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const testPunchId = 'cmshak0ea0001jx049t0sy83l'
  
  // Verify it's the test punch (punchInDistance=0, accuracy=50, device=curl)
  const punch = await prisma.punchRecord.findUnique({ where: { id: testPunchId } })
  if (!punch) {
    console.log('Test punch not found — nothing to delete')
    return
  }
  
  console.log('Found test punch:', {
    id: punch.id,
    userId: punch.userId,
    punchIn: punch.punchIn,
    punchOut: punch.punchOut,
    punchInDevice: punch.punchInDevice,
    punchInDistance: punch.punchInDistance,
  })
  
  // Safety check: only delete if it matches our test signature
  if (punch.punchInDevice !== 'curl/8.14.1' || punch.punchInDistance !== 0) {
    console.log('SAFETY: punch does not match test signature — NOT deleting')
    return
  }
  
  await prisma.punchRecord.delete({ where: { id: testPunchId } })
  console.log('Deleted test punch successfully')
  
  // Verify total punch count after deletion
  const total = await prisma.punchRecord.count()
  console.log(`Total punches in DB after cleanup: ${total}`)
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
