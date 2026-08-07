// Cross-check HRMS active/inactive employees vs ERP users with hrmsId.
// READ-ONLY diagnostic. Does NOT modify either database.

import { Client } from 'pg';

const ERP_DB = 'postgresql://neondb_owner:npg_V0CoL3SDNcKm@ep-noisy-bonus-app8563v-pooler.c-7.us-east-1.aws.neon.tech/neondb?sslmode=require';
const HRMS_DB = 'postgresql://neondb_owner:npg_pGbVon2mrZ3q@ep-empty-haze-aq8y1r98-pooler.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require';

async function main() {
  const hrms = new Client({ connectionString: HRMS_DB });
  const erp = new Client({ connectionString: ERP_DB });
  await hrms.connect();
  await erp.connect();

  // ── 1. Pull ALL HRMS employees (active + inactive) ─────────────────────────
  // First inspect schema to know which columns exist
  const cols = await hrms.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'Employee'
    ORDER BY ordinal_position;
  `);
  console.log('=== HRMS Employee columns ===');
  for (const r of cols.rows) console.log(`  ${r.column_name}  (${r.data_type})`);

  // Pull everyone with their status fields
  const allHrms = await hrms.query(`
    SELECT
      id,
      "fullName",
      "employeeId",
      firm,
      location,
      status,
      "relievingDate",
      "joiningDate"
    FROM "Employee"
    ORDER BY status DESC, "fullName" ASC;
  `);

  // status column is text. Active = 'Yes' (and no relievingDate)
  const isActive = (r) => {
    const s = String(r.status || '').trim().toLowerCase();
    return (s === 'yes' || s === 'true' || s === '1' || s === 'active') && !r.relievingDate;
  };
  const active = allHrms.rows.filter(isActive);
  const inactive = allHrms.rows.filter(r => !isActive(r));

  console.log(`\n=== HRMS summary ===`);
  console.log(`Total HRMS employees: ${allHrms.rows.length}`);
  console.log(`Active (status=Yes, no relievingDate): ${active.length}`);
  console.log(`Inactive: ${inactive.length}`);

  // Show distribution of status values
  const statusCounts = {};
  for (const r of allHrms.rows) {
    const key = String(r.status ?? 'NULL');
    statusCounts[key] = (statusCounts[key] || 0) + 1;
  }
  console.log('Status value distribution:', statusCounts);

  console.log(`\n=== ACTIVE HRMS employees (${active.length}) ===`);
  for (const r of active) {
    console.log(`  [${r.id}] ${r.fullName} | empId=${r.employeeId} | firm=${r.firm} | loc=${r.location}`);
  }

  console.log(`\n=== INACTIVE HRMS employees (${inactive.length}) ===`);
  for (const r of inactive) {
    console.log(`  [${r.id}] ${r.fullName} | empId=${r.employeeId} | status=${r.status} | rel=${r.relievingDate ? r.relievingDate.toISOString().slice(0,10) : '-'}`);
  }

  // ── 2. Pull all ERP users that have a hrmsId link ─────────────────────────
  const erpUsers = await erp.query(`
    SELECT
      id,
      name,
      email,
      "loginUsername",
      role,
      "isActive",
      "hrmsId",
      location
    FROM "User"
    WHERE "hrmsId" IS NOT NULL
    ORDER BY "isActive" DESC, name ASC;
  `);

  console.log(`\n=== ERP users with hrmsId (${erpUsers.rows.length}) ===`);
  for (const u of erpUsers.rows) {
    console.log(`  [erp:${u.id}] ${u.name} | login=${u.loginUsername} | role=${u.role} | active=${u.isActive} | hrmsId=${u.hrmsId} | loc=${u.location}`);
  }

  // ── 3. Cross-match: ERP users whose HRMS record is INACTIVE ──────────────
  const inactiveIds = new Set(inactive.map(r => String(r.id)));
  const activeIds = new Set(active.map(r => String(r.id)));

  const erpLinkedToInactiveHrms = erpUsers.rows.filter(u => inactiveIds.has(String(u.hrmsId)));
  const erpLinkedToActiveHrms = erpUsers.rows.filter(u => activeIds.has(String(u.hrmsId)));
  const erpLinkedToMissingHrms = erpUsers.rows.filter(u => !inactiveIds.has(String(u.hrmsId)) && !activeIds.has(String(u.hrmsId)));

  console.log(`\n=== CROSS-MATCH ===`);
  console.log(`ERP users linked to ACTIVE HRMS records: ${erpLinkedToActiveHrms.length}`);
  console.log(`ERP users linked to INACTIVE HRMS records: ${erpLinkedToInactiveHrms.length}`);
  console.log(`ERP users linked to MISSING HRMS records (hrmsId stale): ${erpLinkedToMissingHrms.length}`);

  if (erpLinkedToInactiveHrms.length > 0) {
    console.log(`\n--- ERP users whose HRMS record is INACTIVE (need to deactivate in ERP) ---`);
    for (const u of erpLinkedToInactiveHrms) {
      const h = inactive.find(r => String(r.id) === String(u.hrmsId));
      console.log(`  ERP [${u.id}] ${u.name} (login=${u.loginUsername}, active=${u.isActive}) → HRMS [${u.hrmsId}] ${h?.fullName} (status=${h?.status}, rel=${h?.relievingDate ? h.relievingDate.toISOString().slice(0,10) : '-'})`);
    }
  }

  if (erpLinkedToMissingHrms.length > 0) {
    console.log(`\n--- ERP users with stale hrmsId (HRMS record no longer exists) ---`);
    for (const u of erpLinkedToMissingHrms) {
      console.log(`  ERP [${u.id}] ${u.name} (login=${u.loginUsername}, active=${u.isActive}) → hrmsId=${u.hrmsId} (NOT FOUND in HRMS)`);
    }
  }

  // ── 4. Reverse: ACTIVE HRMS employees with NO ERP dashboard ───────────────
  const erpHrmsIds = new Set(erpUsers.rows.map(u => String(u.hrmsId)));
  const activeWithoutErp = active.filter(r => !erpHrmsIds.has(String(r.id)));

  console.log(`\n=== ACTIVE HRMS employees WITHOUT an ERP dashboard (${activeWithoutErp.length}) ===`);
  for (const r of activeWithoutErp) {
    console.log(`  HRMS [${r.id}] ${r.fullName} | empId=${r.employeeId} | firm=${r.firm} | loc=${r.location}`);
  }

  await hrms.end();
  await erp.end();
}

main().catch(e => { console.error(e); process.exit(1); });
