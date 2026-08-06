// Quick diagnostic: show actual loginUsername/loginPassword for specific users
import { Client } from 'pg';
const ERP_DB = 'postgresql://neondb_owner:npg_V0CoL3SDNcKm@ep-noisy-bonus-app8563v-pooler.c-7.us-east-1.aws.neon.tech/neondb?sslmode=require';
const erp = new Client({ connectionString: ERP_DB });
await erp.connect();

const r = await erp.query(`
  SELECT id, name, "loginUsername", "loginPassword", role, "isActive"
  FROM "User"
  WHERE name ILIKE '%kanishka%' OR name ILIKE '%girish%' OR name ILIKE '%aayush%' OR name ILIKE '%ayush%'
  ORDER BY name;
`);
console.log('id | name | loginUsername | loginPassword | role | isActive');
for (const u of r.rows) {
  console.log(`${u.id} | ${u.name} | ${u.loginUsername} | ${u.loginPassword} | ${u.role} | ${u.isActive}`);
}

await erp.end();
