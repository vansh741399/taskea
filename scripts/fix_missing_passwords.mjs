// Set loginPassword for ALL active ERP users (role=EMPLOYEE/MANAGER/EA)
// who don't have one. Uses the standard format: <FirstName>@2025
//
// Also verifies all active employees can log in with the standard password.
//
// Idempotent: only touches users with NULL/empty loginPassword.

import { Client } from 'pg';

const ERP_DB = 'postgresql://neondb_owner:npg_V0CoL3SDNcKm@ep-noisy-bonus-app8563v-pooler.c-7.us-east-1.aws.neon.tech/neondb?sslmode=require';

function firstName(name) {
  if (!name) return null;
  const trimmed = String(name).trim();
  if (!trimmed) return null;
  // Take the first token, strip non-alphanumeric
  const first = trimmed.split(/\s+/)[0];
  // Remove any non-letter characters (e.g. periods, hyphens kept as-is)
  // Capitalize first letter, lowercase rest
  if (!first) return null;
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

async function main() {
  const erp = new Client({ connectionString: ERP_DB });
  await erp.connect();

  // Find all active EMPLOYEE/MANAGER/EA users with missing/empty loginPassword
  const missing = await erp.query(`
    SELECT id, name, "loginUsername", "loginPassword", role
    FROM "User"
    WHERE "isActive" = true
      AND role IN ('EMPLOYEE', 'MANAGER', 'EA')
      AND ("loginPassword" IS NULL OR "loginPassword" = '')
    ORDER BY name ASC;
  `);

  console.log(`=== Active employees with missing loginPassword: ${missing.rows.length} ===`);
  for (const u of missing.rows) {
    console.log(`  ${u.name} (login=${u.loginUsername}, role=${u.role})`);
  }

  if (missing.rows.length === 0) {
    console.log(`\nAll active employees have a loginPassword set — nothing to update.`);
  } else {
    console.log(`\n=== Setting loginPassword for ${missing.rows.length} users ===`);
    for (const u of missing.rows) {
      const fn = firstName(u.name);
      if (!fn) {
        console.log(`  [SKIP] ${u.name}: couldn't derive first name`);
        continue;
      }
      const newPassword = `${fn}@2025`;
      await erp.query(
        `UPDATE "User" SET "loginPassword" = $2, "updatedAt" = NOW() WHERE id = $1`,
        [u.id, newPassword]
      );
      console.log(`  ✓ ${u.name} → password set to "${newPassword}"`);
    }
  }

  // Also ensure loginUsername is set for active employees (using firstName lowercase)
  const missingUsername = await erp.query(`
    SELECT id, name, "loginUsername", role
    FROM "User"
    WHERE "isActive" = true
      AND role IN ('EMPLOYEE', 'MANAGER', 'EA')
      AND ("loginUsername" IS NULL OR "loginUsername" = '')
    ORDER BY name ASC;
  `);
  console.log(`\n=== Active employees with missing loginUsername: ${missingUsername.rows.length} ===`);
  for (const u of missingUsername.rows) {
    console.log(`  ${u.name} (role=${u.role})`);
    const fn = firstName(u.name);
    if (!fn) continue;
    const newUsername = fn.toLowerCase();
    // Check it doesn't conflict
    const conflict = await erp.query(`SELECT id, name FROM "User" WHERE "loginUsername" = $1 AND id != $2`, [newUsername, u.id]);
    if (conflict.rows.length > 0) {
      console.log(`    [SKIP] username "${newUsername}" already taken by ${conflict.rows[0].name}`);
      continue;
    }
    await erp.query(
      `UPDATE "User" SET "loginUsername" = $2, "updatedAt" = NOW() WHERE id = $1`,
      [u.id, newUsername]
    );
    console.log(`    ✓ username set to "${newUsername}"`);
  }

  // Final verification: print summary
  const total = await erp.query(`
    SELECT COUNT(*)::int AS n FROM "User"
    WHERE "isActive" = true AND role IN ('EMPLOYEE', 'MANAGER', 'EA');
  `);
  const withPass = await erp.query(`
    SELECT COUNT(*)::int AS n FROM "User"
    WHERE "isActive" = true AND role IN ('EMPLOYEE', 'MANAGER', 'EA')
      AND "loginPassword" IS NOT NULL AND "loginPassword" != '';
  `);
  const withUser = await erp.query(`
    SELECT COUNT(*)::int AS n FROM "User"
    WHERE "isActive" = true AND role IN ('EMPLOYEE', 'MANAGER', 'EA')
      AND "loginUsername" IS NOT NULL AND "loginUsername" != '';
  `);
  console.log(`\n=== FINAL STATE ===`);
  console.log(`Total active EMPLOYEE/MANAGER/EA: ${total.rows[0].n}`);
  console.log(`  with loginPassword set: ${withPass.rows[0].n}`);
  console.log(`  with loginUsername set: ${withUser.rows[0].n}`);

  await erp.end();
}

main().catch(e => { console.error(e); process.exit(1); });
