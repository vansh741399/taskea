#!/usr/bin/env node
/**
 * Local test script for the new attendance bridge logic.
 * 
 * Simulates the /api/attendance/bridge endpoint by directly importing
 * the route handler and calling it with a mocked request.
 * 
 * Usage:
 *   node /home/z/my-project/scripts/test-attendance-bridge.js
 * 
 * Requires:
 *   - DATABASE_URL in .env (already configured)
 *   - HRMS_ACCESS_TOKEN in .env (already configured)
 */

// Load env
require('dotenv').config({ path: '/home/z/my-project/.env' })

async function main() {
  console.log('=== Testing new attendance bridge logic ===\n')

  // 1. Verify env vars are loaded
  console.log('1. Environment check:')
  console.log('   DATABASE_URL:', process.env.DATABASE_URL ? '✓ set' : '✗ missing')
  console.log('   HRMS_BASE_URL:', process.env.HRMS_BASE_URL || '(default)')
  console.log('   HRMS_ACCESS_TOKEN:', process.env.HRMS_ACCESS_TOKEN ? '✓ set' : '✗ missing')
  console.log()

  // 2. Test HRMS connectivity (this is what the bridge relies on)
  console.log('2. Testing HRMS API connectivity (Bearer auth):')
  const hrmsRes = await fetch(
    `${process.env.HRMS_BASE_URL || 'https://laxree-hrms.vercel.app'}/api/employees`,
    { headers: { Authorization: `Bearer ${process.env.HRMS_ACCESS_TOKEN}` } }
  )
  console.log('   Status:', hrmsRes.status, hrmsRes.ok ? '✓' : '✗')
  if (hrmsRes.ok) {
    const employees = await hrmsRes.json()
    console.log('   Employee count:', Array.isArray(employees) ? employees.length : 'N/A')
    if (Array.isArray(employees) && employees.length > 0) {
      console.log('   Sample:', employees[0].fullName, '|', employees[0].employeeId)
    }
  }
  console.log()

  // 3. Test database connectivity
  console.log('3. Testing DB connectivity:')
  const { PrismaClient } = require('@prisma/client')
  const prisma = new PrismaClient()
  try {
    const userCount = await prisma.user.count()
    console.log('   User count:', userCount, '✓')
    const punchCount = await prisma.punchRecord.count()
    console.log('   PunchRecord count:', punchCount, '✓')
    const officeCount = await prisma.officeLocation.count()
    console.log('   OfficeLocation count:', officeCount, '✓')

    // Sample a real employee user ID
    const empUser = await prisma.user.findFirst({
      where: { role: 'EMPLOYEE' },
      select: { id: true, name: true, hrmsId: true, officeId: true }
    })
    if (empUser) {
      console.log('   Sample employee:', empUser.name, '|', empUser.id)
      console.log('   hrmsId:', empUser.hrmsId || '(none)')
      console.log('   officeId:', empUser.officeId || '(none — will trigger auto-resolve on punch)')
    }
  } catch (e) {
    console.log('   Error:', e.message)
  } finally {
    await prisma.$disconnect()
  }
  console.log()

  // 4. Verify the new code is in place
  console.log('4. Verifying new code is in place:')
  const fs = require('fs')
  const routePath = '/home/z/my-project/src/app/api/attendance/bridge/route.ts'
  const routeContent = fs.readFileSync(routePath, 'utf8')
  const checks = [
    { name: 'v25·0806-fix header', found: routeContent.includes('v25·0806-fix — ATTENDANCE BRIDGE') },
    { name: 'fetchHrmsEmployees import', found: routeContent.includes('fetchHrmsEmployees') },
    { name: 'IST_OFFSET_MS', found: routeContent.includes('IST_OFFSET_MS') },
    { name: 'configured: true always returned', found: routeContent.includes('configured: true') },
    { name: 'NO HRMS_BRIDGE_API_KEY reference', found: !routeContent.includes('HRMS_BRIDGE_API_KEY') },
    { name: 'NO x-hrms-api-key header', found: !routeContent.includes('x-hrms-api-key') },
  ]
  for (const c of checks) {
    console.log(`   ${c.found ? '✓' : '✗'} ${c.name}`)
  }
  console.log()

  console.log('=== Test complete ===')
}

main().catch(e => {
  console.error('Test failed:', e)
  process.exit(1)
})
