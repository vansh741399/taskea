// Sync ERP user active-state with HRMS employee active-state.
// RULE: ERP user.isActive should match HRMS employee.status=='Yes'.
//   - If HRMS record is INACTIVE (status != 'Yes' OR relievingDate set),
//     set ERP user.isActive = false (NO deletion — just deactivate).
//   - If HRMS record is ACTIVE (status=='Yes', no relievingDate),
//     set ERP user.isActive = true.
//
// Also updates the `location` text field for ERP users whose HRMS record
// has a location set, so the HR report location filter works for them.
//
// Idempotent: safe to re-run. Only touches users with a hrmsId link.

import { Client } from 'pg';

const ERP_DB = 'postgresql://neondb_owner:npg_V0CoL3SDNcKm@ep-noisy-bonus-app8563v-pooler.c-7.us-east-1.aws.neon.tech/neondb?sslmode=require';
const HRMS_DB = 'postgresql://neondb_owner:npg_pGbVon2mrZ3q@ep-empty-haze-aq8y1r98-pooler.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require';

// HRMS location → normalized city (used for ERP user.location text field)
// Anything that isn't a real city defaults to "Ajmer" (per existing convention
// for Roofing Factory and Palra Warehouse which are Ajmer-area facilities).
function normalizeLocation(hrmsLoc) {
  if (!hrmsLoc) return null;
  const s = String(hrmsLoc).trim().toLowerCase();
  if (!s) return null;
  if (s.includes('jaipur')) return 'Jaipur';
  if (s.includes('gurugram') || s.includes('gurgaon')) return 'Gurgaon';
  if (s.includes('ajmer')) return 'Ajmer';
  // Roofing Factory, Palra Warehouse, etc. → Ajmer (default for Ajmer area)
  return 'Ajmer';
}

async function main() {
  const hrms = new Client({ connectionString: HRMS_DB });
  const erp = new Client({ connectionString: ERP_DB });
  await hrms.connect();
  await erp.connect();

  // ── 1. Pull all HRMS employees ────────────────────────────────────────────
  const allHrms = await hrms.query(`
    SELECT id, "fullName", "employeeId", firm, location, status, "relievingDate"
    FROM "Employee";
  `);
  const hrmsById = new Map(allHrms.rows.map(r => [String(r.id), r]));

  const isActive = (r) => {
    if (!r) return false;
    const s = String(r.status || '').trim().toLowerCase();
    return (s === 'yes' || s === 'true' || s === '1' || s === 'active') && !r.relievingDate;
  };

  // ── 2. Pull all ERP users with hrmsId link ───────────────────────────────
  const erpUsers = await erp.query(`
    SELECT id, name, "loginUsername", role, "isActive", "hrmsId", location
    FROM "User"
    WHERE "hrmsId" IS NOT NULL;
  `);

  console.log(`Found ${erpUsers.rows.length} ERP users with hrmsId link.`);

  const toDeactivate = []; // HRMS inactive, ERP active — need to deactivate
  const toActivate = [];   // HRMS active, ERP inactive — need to reactivate
  const toUpdateLoc = [];  // HRMS location set, ERP location null/empty

  for (const u of erpUsers.rows) {
    const h = hrmsById.get(String(u.hrmsId));
    if (!h) {
      console.log(`  [SKIP] ${u.name} (login=${u.loginUsername}): hrmsId=${u.hrmsId} not found in HRMS — leaving as-is`);
      continue;
    }
    const hActive = isActive(h);
    const uActive = u.isActive === true;

    if (!hActive && uActive) {
      toDeactivate.push({ erp: u, hrms: h });
    } else if (hActive && !uActive) {
      toActivate.push({ erp: u, hrms: h });
    }

    // Location update (only for active users, only if missing in ERP)
    const normLoc = normalizeLocation(h.location);
    if (hActive && normLoc && (!u.location || String(u.location).trim() === '')) {
      toUpdateLoc.push({ erp: u, hrms: h, newLoc: normLoc });
    }
  }

  console.log(`\n=== PLAN ===`);
  console.log(`Deactivate (HRMS inactive, ERP active): ${toDeactivate.length}`);
  for (const x of toDeactivate) {
    console.log(`  - ${x.erp.name} (login=${x.erp.loginUsername}, erpId=${x.erp.id}) | HRMS status=${x.hrms.status} rel=${x.hrms.relievingDate ? x.hrms.relievingDate.toISOString().slice(0,10) : '-'}`);
  }
  console.log(`Reactivate (HRMS active, ERP inactive): ${toActivate.length}`);
  for (const x of toActivate) {
    console.log(`  + ${x.erp.name} (login=${x.erp.loginUsername}, erpId=${x.erp.id})`);
  }
  console.log(`Update location (ERP location empty, HRMS location set): ${toUpdateLoc.length}`);
  for (const x of toUpdateLoc) {
    console.log(`  ~ ${x.erp.name}: null → '${x.newLoc}' (from HRMS '${x.hrms.location}')`);
  }

  // ── 3. Execute updates ───────────────────────────────────────────────────
  const updates = [];
  for (const x of toDeactivate) {
    updates.push({
      sql: `UPDATE "User" SET "isActive" = false, "updatedAt" = NOW() WHERE id = $1`,
      params: [x.erp.id],
      label: `DEACTIVATE ${x.erp.name} (login=${x.erp.loginUsername})`,
    });
  }
  for (const x of toActivate) {
    updates.push({
      sql: `UPDATE "User" SET "isActive" = true, "updatedAt" = NOW() WHERE id = $1`,
      params: [x.erp.id],
      label: `REACTIVATE ${x.erp.name} (login=${x.erp.loginUsername})`,
    });
  }
  for (const x of toUpdateLoc) {
    updates.push({
      sql: `UPDATE "User" SET location = $2, "updatedAt" = NOW() WHERE id = $1`,
      params: [x.erp.id, x.newLoc],
      label: `SET-LOC ${x.erp.name} → '${x.newLoc}'`,
    });
  }

  if (updates.length === 0) {
    console.log(`\nNo updates needed — ERP users already in sync with HRMS active-state.`);
  } else {
    console.log(`\n=== EXECUTING ${updates.length} UPDATES ===`);
    for (const u of updates) {
      await erp.query(u.sql, u.params);
      console.log(`  ✓ ${u.label}`);
    }
  }

  // ── 4. Final verification ────────────────────────────────────────────────
  const finalActive = await erp.query(`
    SELECT COUNT(*)::int AS n FROM "User"
    WHERE "hrmsId" IS NOT NULL AND "isActive" = true AND role = 'EMPLOYEE';
  `);
  const finalInactive = await erp.query(`
    SELECT COUNT(*)::int AS n FROM "User"
    WHERE "hrmsId" IS NOT NULL AND "isActive" = false AND role = 'EMPLOYEE';
  `);
  console.log(`\n=== FINAL STATE ===`);
  console.log(`Active ERP employees (role=EMPLOYEE, hrmsId linked): ${finalActive.rows[0].n}`);
  console.log(`Inactive ERP employees (role=EMPLOYEE, hrmsId linked): ${finalInactive.rows[0].n}`);

  await hrms.end();
  await erp.end();
}

main().catch(e => { console.error(e); process.exit(1); });
