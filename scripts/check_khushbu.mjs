import { Client } from 'pg';
const ERP_DB = 'postgresql://neondb_owner:npg_V0CoL3SDNcKm@ep-noisy-bonus-app8563v-pooler.c-7.us-east-1.aws.neon.tech/neondb?sslmode=require';
const erp = new Client({ connectionString: ERP_DB });
await erp.connect();
const r = await erp.query(`SELECT id, name, "loginUsername", "loginPassword", role, "isActive" FROM "User" WHERE name ILIKE '%khush%' ORDER BY name;`);
console.log('Khush* users:');
for (const u of r.rows) console.log(`  ${u.id} | ${u.name} | login=${u.loginUsername} | pass=${u.loginPassword} | role=${u.role} | active=${u.isActive}`);
await erp.end();
