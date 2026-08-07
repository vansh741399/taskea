import { Pool } from 'pg'
const ERP_URL = 'postgresql://neondb_owner:npg_V0CoL3SDNcKm@ep-noisy-bonus-app8563v.c-7.us-east-1.aws.neon.tech/neondb?sslmode=require'
const erp = new Pool({ connectionString: ERP_URL, max: 2, ssl: { rejectUnauthorized: false } })

const users = await erp.query(`
  SELECT id, name, email, role, "loginUsername", "loginPassword", "isActive"
  FROM "User"
  ORDER BY role DESC, name ASC
`)
console.log('All Taskea users with DB credentials:')
console.table(users.rows.map(r => ({
  name: r.name,
  email: r.email,
  role: r.role,
  loginUsername: r.loginUsername || '(NULL — uses fallback)',
  loginPassword: r.loginPassword || '(NULL — uses fallback)',
  isActive: r.isActive,
})))

// List the fallback credentials
const FALLBACK = {
  founder: 'Founder@2025',
  admin: 'Laxree@2025',
  ea: 'EA@Laxree',
  ashish: 'Ashish@2025',
  samarth: 'Samarth@2025',
  aditya: 'Aditya@2025',
  aakash: 'Aakash@2025',
  anamika: 'Anamika@2025',
  saurabh: 'Saurabh@2025',
  ruchi: 'Ruchi@2025',
  aayush: 'Aayush@2025',
  kamlesh: 'Kamlesh@2025',
  hitesh: 'Hitesh@2025',
  khushboo: 'Khushboo@2025',
  radhika: 'Radhika@2025',
  tanuja: 'Tanuja@2025',
}
console.log('\nFallback credentials (used when DB loginUsername/loginPassword is NULL):')
console.table(Object.entries(FALLBACK).map(([u, p]) => ({ username: u, password: p })))

await erp.end()
