// Verify Chaitanaya can log in via /api/auth (production)
// Run: node scripts/verify_chaitanya_login.js

const PROD_URL = 'https://erp-ea.vercel.app'

async function main() {
  console.log('=== Verify Chaitanaya login (production /api/auth) ===\n')

  const creds = [
    { username: 'chaitanaya', password: 'Chaitanaya@2025' },   // new fixed creds
    { username: 'Chaitanaya', password: 'Chaitanaya@2025' },   // case-insensitive check
    { username: 'chaitanaya', password: 'wrong' },             // negative test
  ]

  for (const { username, password } of creds) {
    try {
      const r = await fetch(`${PROD_URL}/api/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const data = await r.json()
      const ok = r.ok
      console.log(`  ${ok ? '✅ PASS' : '❌ FAIL'}  user="${username}" pass="${password}"  status=${r.status}`)
      if (ok) {
        console.log(`         → logged in as: id=${data.id}, name="${data.name}", role=${data.role}, dept="${data.department}"`)
      } else {
        console.log(`         → error: ${data.error}`)
      }
    } catch (e) {
      console.log(`   ⚠  user="${username}" pass="${password}"  error: ${e.message}`)
    }
  }

  // Note: the live production deploy is on Vercel — the code changes (auth fallback,
  // PATCH loginUsername) won't be live until the next deployment. But the DB fix
  // (loginUsername='chaitanaya', password='Chaitanaya@2025') is already applied,
  // so login should work with the CURRENT production code path (Step 1 of auth route).
}

main().catch(e => { console.error('Fatal:', e); process.exit(1) })
