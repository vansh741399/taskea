#!/usr/bin/env python3
"""
Phase 2 — inspect HRMS Leave + Attendance + Payroll schemas, ERP OfficeLocation,
and find Kamlesh in HRMS. READ-ONLY.
"""
import psycopg2

ERP_DB = "postgresql://neondb_owner:npg_V0CoL3SDNcKm@ep-noisy-bonus-app8563v-pooler.c-7.us-east-1.aws.neon.tech/neondb?sslmode=require"
HRMS_DB = "postgresql://neondb_owner:npg_pGbVon2mrZ3q@ep-empty-haze-aq8y1r98-pooler.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require"

def section(t):
    print(f"\n{'='*70}\n{t}\n{'='*70}")

def query(conn_str, q, label=""):
    try:
        c = psycopg2.connect(conn_str, connect_timeout=15)
        cur = c.cursor()
        cur.execute(q)
        cols = [d[0] for d in cur.description] if cur.description else []
        rows = cur.fetchall()
        cur.close(); c.close()
        return cols, rows
    except Exception as e:
        print(f"  [ERROR {label}] {e}")
        return [], []

# ERP OfficeLocation schema
section("1. ERP — OfficeLocation columns")
cols, rows = query(ERP_DB, """
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_name='OfficeLocation' ORDER BY ordinal_position
""", label="erp-office-cols")
for r in rows: print(f"  - {r[0]}: {r[1]}")

section("2. ERP — OfficeLocation data")
cols, rows = query(ERP_DB, 'SELECT * FROM "OfficeLocation" ORDER BY name', label="erp-offices")
print(f"  Cols: {cols}")
for r in rows: print(f"  - {r}")

# HRMS Leave columns
section("3. HRMS — Leave table columns")
cols, rows = query(HRMS_DB, """
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_name='Leave' ORDER BY ordinal_position
""", label="hrms-leave-cols")
for r in rows: print(f"  - {r[0]}: {r[1]}")

# HRMS Attendance columns
section("4. HRMS — Attendance table columns")
cols, rows = query(HRMS_DB, """
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_name='Attendance' ORDER BY ordinal_position
""", label="hrms-attend-cols")
for r in rows: print(f"  - {r[0]}: {r[1]}")

# HRMS Payroll columns
section("5. HRMS — Payroll table columns")
cols, rows = query(HRMS_DB, """
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_name='Payroll' ORDER BY ordinal_position
""", label="hrms-payroll-cols")
for r in rows: print(f"  - {r[0]}: {r[1]}")

# Find Kamlesh in HRMS Employee
section("6. HRMS — Kamlesh in Employee")
cols, rows = query(HRMS_DB, """
    SELECT id, "employeeId", "fullName", mobile, email, firm, location,
           "monthlySalary", "dailyRate", "hourlyRate", designation, department,
           "joiningDate", "bankName", "bankAccount", "panNumber",
           "shiftStart", "shiftEnd", "employmentType", status
    FROM "Employee" WHERE LOWER("fullName") LIKE '%kamlesh%'
""", label="hrms-kamlesh")
print(f"  Cols: {cols}")
for r in rows: print(f"  >>> {r}")

# Also try by ID cmqj2urc00018l704533358hu (Kamlesh's hrmsId in ERP)
section("7. HRMS — Kamlesh by ERP hrmsId cmqj2urc00018l704533358hu")
cols, rows = query(HRMS_DB, """
    SELECT id, "employeeId", "fullName", mobile, email, firm, location,
           "monthlySalary", "dailyRate", "hourlyRate", designation, department,
           "joiningDate", "bankName", "bankAccount", "panNumber",
           "shiftStart", "shiftEnd", "employmentType", status
    FROM "Employee" WHERE id = 'cmqj2urc00018l704533358hu'
""", label="hrms-kamlesh-byid")
print(f"  Cols: {cols}")
for r in rows: print(f"  >>> {r}")

# All HRMS Employees quick list
section("8. HRMS — All employees (id, employeeId, fullName, location, status)")
cols, rows = query(HRMS_DB, """
    SELECT id, "employeeId", "fullName", location, designation, status
    FROM "Employee" ORDER BY "fullName"
""", label="hrms-all-emps")
print(f"  Total: {len(rows)}")
for r in rows: print(f"  - {r}")

# HRMS Leaves for Kamlesh
section("9. HRMS — All Leave records")
cols, rows = query(HRMS_DB, 'SELECT * FROM "Leave" ORDER BY 1 DESC LIMIT 30', label="hrms-leaves")
print(f"  Cols: {cols}")
print(f"  Total: {len(rows)}")
for r in rows[:10]: print(f"  - {r}")

# HRMS Attendance records
section("10. HRMS — All Attendance records")
cols, rows = query(HRMS_DB, 'SELECT * FROM "Attendance" ORDER BY 1 DESC LIMIT 30', label="hrms-attend")
print(f"  Cols: {cols}")
print(f"  Total: {len(rows)}")
for r in rows[:10]: print(f"  - {r}")

# HRMS Payroll records (for salary slip)
section("11. HRMS — All Payroll records")
cols, rows = query(HRMS_DB, 'SELECT * FROM "Payroll" ORDER BY 1 DESC LIMIT 30', label="hrms-payroll")
print(f"  Cols: {cols}")
print(f"  Total: {len(rows)}")
for r in rows[:10]: print(f"  - {r}")

# HRMS SalaryHistory
section("12. HRMS — SalaryHistory records")
cols, rows = query(HRMS_DB, 'SELECT * FROM "SalaryHistory" ORDER BY 1 DESC LIMIT 10', label="hrms-salhist")
print(f"  Cols: {cols}")
print(f"  Total: {len(rows)}")
for r in rows[:5]: print(f"  - {r}")
