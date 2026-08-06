// Verify Deepak login + confirm role=ADMIN returned (so frontend routes to admin dashboard)
// Run: node scripts/verify_deepak_admin.js

const PROD_URL = 'https://erp-ea.vercel.app'

async function main() {
  console.log('=== Verify Deepak now logs in as ADMIN ===\n')

  const r = await fetch(`${PROD_URL}/api/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'deepak', password: 'Deepak@laxree' }),
  })
  const data = await r.json()

  if (r.ok) {
    console.log('  ✅ Login OK')
    console.log(`     id:         ${data.id}`)
    console.log(`     name:       ${data.name}`)
    console.log(`     role:       ${data.role}    ${data.role === 'ADMIN' ? '✅ (admin dashboard will load)' : '❌ (still wrong role!)'}`)
    console.log(`     department: ${data.department || '—'}`)
    console.log(`     email:      ${data.email}`)
    console.log('')
    console.log('  Frontend routing (per laxree-login.tsx):')
    if (data.role === 'EMPLOYEE' || data.role === 'MANAGER') {
      console.log('     → would land on: employee-dashboard  ❌')
    } else {
      console.log('     → will land on:   dashboard (admin view)  ✅')
    }
  } else {
    console.log('  ❌ Login failed:', data.error)
  }

  // Sanity check: founder still works
  console.log('\n=== Sanity: founder login ===')
  const r2 = await fetch(`${PROD_URL}/api/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'founder', password: 'Founder@2025' }),
  })
  const d2 = await r2.json()
  console.log(`  ${r2.ok ? '✅' : '❌'} founder → ${r2.ok ? `${d2.name} / ${d2.role}` : d2.error}`)
}

main().catch(e => { console.error('Fatal:', e); process.exit(1) })
