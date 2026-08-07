#!/usr/bin/env python3
"""
READ-ONLY audit of both Neon databases (ERP-ea + HRMS) to investigate:
1. Kamlesh's data in ERP (punches, leaves, salary slip)
2. Kamlesh's data in HRMS (employee master, attendance, leaves)
3. July 2026 attendance data in HRMS DB
4. Whether punch-in is failing due to officeId/coordinates

SAFETY: READ-ONLY. No INSERT/UPDATE/DELETE. Only SELECT queries.
"""
import psycopg2
import json
from datetime import datetime

# Connection strings (provided by user)
ERP_DB = "postgresql://neondb_owner:npg_V0CoL3SDNcKm@ep-noisy-bonus-app8563v-pooler.c-7.us-east-1.aws.neon.tech/neondb?sslmode=require"
HRMS_DB = "postgresql://neondb_owner:npg_pGbVon2mrZ3q@ep-empty-haze-aq8y1r98-pooler.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require"

def section(title):
    print(f"\n{'='*70}\n{title}\n{'='*70}")

def query_db(conn_str, query, params=None, label=""):
    try:
        conn = psycopg2.connect(conn_str, connect_timeout=15)
        cur = conn.cursor()
        cur.execute(query, params or ())
        cols = [d[0] for d in cur.description] if cur.description else []
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return cols, rows
    except Exception as e:
        print(f"  [ERROR {label}] {e}")
        return [], []

# ============================================================
# 1. ERP DATABASE AUDIT
# ============================================================
section("1. ERP DATABASE — Table list")
cols, rows = query_db(ERP_DB, """
    SELECT table_name FROM information_schema.tables
    WHERE table_schema='public' ORDER BY table_name
""", label="erp-tables")
for r in rows:
    print(f"  - {r[0]}")

section("2. ERP — All users (look for Kamlesh)")
cols, rows = query_db(ERP_DB, """
    SELECT id, name, email, role, "hrmsId", "officeId", location, designation
    FROM "User" ORDER BY name
""", label="erp-users")
print(f"  Columns: {cols}")
for r in rows:
    name_lc = (r[1] or "").lower()
    if "kamlesh" in name_lc or "kamlesh" in name_lc:
        print(f"  >>> KAMLESH: {r}")
    else:
        print(f"  - {r[0]} | {r[1]} | {r[2]} | {r[3]} | hrmsId={r[5]} | officeId={r[6]} | loc={r[7]}")

section("3. ERP — Office locations")
cols, rows = query_db(ERP_DB, """
    SELECT id, name, address, city, lat, lng, "radiusMeters", "isActive"
    FROM "OfficeLocation" ORDER BY name
""", label="erp-offices")
print(f"  Columns: {cols}")
for r in rows:
    print(f"  - {r}")

section("4. ERP — ALL punch records (any user, any date)")
cols, rows = query_db(ERP_DB, """
    SELECT id, "userId", "officeId", "punchIn", "punchOut",
           "punchInLat", "punchInLng", "punchInDistance", "punchInAccuracy",
           status, "punchInDevice"
    FROM "PunchRecord" ORDER BY "punchIn" DESC LIMIT 50
""", label="erp-punches")
print(f"  Columns: {cols}")
print(f"  Total rows: {len(rows)}")
for r in rows:
    print(f"  - {r}")

section("5. ERP — Leaves table (any user)")
cols, rows = query_db(ERP_DB, """
    SELECT * FROM "Leave" ORDER BY "fromDate" DESC LIMIT 30
""", label="erp-leaves")
print(f"  Columns: {cols}")
print(f"  Total rows: {len(rows)}")
for r in rows[:10]:
    print(f"  - {r}")

# ============================================================
# 2. HRMS DATABASE AUDIT
# ============================================================
section("6. HRMS DATABASE — Table list")
cols, rows = query_db(HRMS_DB, """
    SELECT table_name FROM information_schema.tables
    WHERE table_schema='public' ORDER BY table_name
""", label="hrms-tables")
for r in rows:
    print(f"  - {r[0]}")

section("7. HRMS — Employees (look for Kamlesh)")
cols, rows = query_db(HRMS_DB, """
    SELECT * FROM "Employee" ORDER BY name LIMIT 60
""", label="hrms-employees")
print(f"  Columns: {cols}")
print(f"  Total rows: {len(rows)}")
for r in rows:
    # find Kamlesh
    row_str = str(r).lower()
    if "kamlesh" in row_str:
        print(f"  >>> KAMLESH FOUND: {r}")

# Try to find Kamlesh specifically
section("8. HRMS — Search Kamlesh specifically")
cols, rows = query_db(HRMS_DB, """
    SELECT * FROM "Employee" WHERE LOWER(name) LIKE '%kamlesh%'
""", label="hrms-kamlesh")
print(f"  Columns: {cols}")
for r in rows:
    print(f"  >>> {r}")

# Get column names of Employee table
section("9. HRMS — Employee table columns")
cols, rows = query_db(HRMS_DB, """
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_name='Employee' AND table_schema='public'
    ORDER BY ordinal_position
""", label="hrms-emp-cols")
for r in rows:
    print(f"  - {r[0]}: {r[1]}")

section("10. HRMS — Attendance table (if exists)")
# Check if Attendance table exists
cols, rows = query_db(HRMS_DB, """
    SELECT table_name FROM information_schema.tables
    WHERE table_schema='public' AND table_name ILIKE '%attend%'
""", label="hrms-attend-tables")
print(f"  Attendance-related tables: {[r[0] for r in rows]}")

if rows:
    for tbl in [r[0] for r in rows]:
        c, r2 = query_db(HRMS_DB, f'SELECT * FROM "{tbl}" ORDER BY 1 DESC LIMIT 30', label=f"hrms-{tbl}")
        print(f"\n  --- {tbl} (cols: {c}, total: {len(r2)}) ---")
        for row in r2[:10]:
            print(f"  - {row}")

section("11. HRMS — Leaves table (July 2026 specifically)")
cols, rows = query_db(HRMS_DB, """
    SELECT * FROM "Leave" WHERE "fromDate" >= '2026-07-01' AND "fromDate" <= '2026-07-31'
    ORDER BY "fromDate" DESC LIMIT 30
""", label="hrms-leaves-july")
print(f"  Columns: {cols}")
print(f"  July leaves: {len(rows)}")
for r in rows:
    print(f"  - {r}")

# Also try generic leave query
section("12. HRMS — All leaves (any date)")
cols, rows = query_db(HRMS_DB, """
    SELECT * FROM "Leave" ORDER BY "fromDate" DESC LIMIT 30
""", label="hrms-leaves-all")
print(f"  Columns: {cols}")
print(f"  Total: {len(rows)}")
for r in rows[:10]:
    print(f"  - {r}")

section("13. HRMS — All leave-like tables")
cols, rows = query_db(HRMS_DB, """
    SELECT table_name FROM information_schema.tables
    WHERE table_schema='public' AND table_name ILIKE '%leave%'
""", label="hrms-leave-tables")
print(f"  Leave tables: {[r[0] for r in rows]}")

section("DONE — Audit complete")
