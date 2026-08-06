// Diagnostic: Check Chaitanya user record in production DB
// Run: node scripts/check_chaitanya.js

const PROD_URL = 'https://erp-ea.vercel.app'

async function main() {
  console.log('=== Check Chaitanya user in production ===\n')

  // 1. Try to login as chaitanya with several common spellings/passwords
  const usernames = ['chaitanya', 'chaitanaya', 'Chaitanya', 'Chaitanaya']
  const passwords = ['Chaitanya@2025', 'Chaitanaya@2025', 'chaitanya@2025', 'Chaitanya', 'Chaitanya2025']

  for (const u of usernames) {
    for (const p of passwords) {
      try {
        const r = await fetch(`${PROD_URL}/api/auth`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: u, password: p }),
        })
        const data = await r.json()
        const ok = r.ok
        console.log(`  ${ok ? '✅' : '❌'} user="${u}" pass="${p}" → status=${r.status} ${ok ? JSON.stringify({ id: data.id, name: data.name, role: data.role }) : data.error}`)
        if (ok) return
      } catch (e) {
        console.log(`   ⚠ user="${u}" pass="${p}" → error: ${e.message}`)
      }
    }
  }

  // 2. List all users (we can use the FOUNDER endpoint with credentials? No — we need to be logged in.
  //    But /api/users is public — let's just see who exists)
  console.log('\n=== All users in DB (via /api/users) ===')
  try {
    const r = await fetch(`${PROD_URL}/api/users`, { cache: 'no-store' })
    const users = await r.json()
    if (Array.isArray(users)) {
      console.log(`Total users: ${users.length}`)
      const matches = users.filter(u =>
        (u.name || '').toLowerCase().includes('chait') ||
        (u.name || '').toLowerCase().includes('chaith') ||
        (u.email || '').toLowerCase().includes('chait')
      )
      console.log('\nChaitanya-like matches:')
      matches.forEach(u => {
        console.log(`  - id=${u.id}  name="${u.name}"  email="${u.email}"  role=${u.role}  dept="${u.department}"  active=${u.isActive}`)
      })
      if (matches.length === 0) {
        console.log('  (none found — listing all users alphabetically:)')
        users.forEach(u => {
          console.log(`  - name="${u.name}"  email="${u.email}"  role=${u.role}`)
        })
      }
    } else {
      console.log('Non-array response:', JSON.stringify(users).substring(0, 500))
    }
  } catch (e) {
    console.log('Error fetching users:', e.message)
  }
}

main().catch(e => { console.error('Fatal:', e); process.exit(1) })
