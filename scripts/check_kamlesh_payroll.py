#!/usr/bin/env python3
"""Check if Kamlesh (EMP-021) has HRMS Payroll + Attendance records for July 2026."""
import psycopg2

HRMS_DB = "postgresql://neondb_owner:npg_pGbVon2mrZ3q@ep-empty-haze-aq8y1r98-pooler.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require"

c = psycopg2.connect(HRMS_DB)
cur = c.cursor()

print("=== Kamlesh (EMP-021) Payroll records ===")
cur.execute('SELECT "employeeId", month, year, "netSalary", "grossSalary", "presentDays", "paidLeaves", "sundayCount", status FROM "Payroll" WHERE "employeeId" = %s ORDER BY year, month', ('EMP-021',))
for r in cur.fetchall():
    print(f"  {r}")

print("\n=== All Payroll records for July 2026 (month=7, year=2026) ===")
cur.execute('SELECT "employeeId", "netSalary", "presentDays", "paidLeaves", status FROM "Payroll" WHERE month = 7 AND year = 2026 ORDER BY "employeeId"')
rows = cur.fetchall()
print(f"  Total: {len(rows)}")
for r in rows[:20]:
    print(f"  {r}")

print("\n=== Kamlesh (EMP-021) Attendance for July 2026 ===")
cur.execute('SELECT date, "checkIn", "checkOut", "totalHours", status, "lateEntry", "earlyOut", "isSunday", "isWeeklyOff" FROM "Attendance" WHERE "employeeId" = %s AND date >= %s AND date <= %s ORDER BY date', ('EMP-021', '2026-07-01', '2026-07-31'))
rows = cur.fetchall()
print(f"  Total: {len(rows)}")
for r in rows:
    print(f"  {r}")

print("\n=== All Attendance records for July 2026 (any employee) ===")
cur.execute('SELECT "employeeId", date, "checkIn", "checkOut", status FROM "Attendance" WHERE date >= %s AND date <= %s ORDER BY date DESC LIMIT 20', ('2026-07-01', '2026-07-31'))
rows = cur.fetchall()
print(f"  Total in July: {len(rows)}")
for r in rows[:15]:
    print(f"  {r}")

print("\n=== Distinct dates in Attendance table ===")
cur.execute('SELECT DISTINCT date FROM "Attendance" ORDER BY date DESC LIMIT 20')
for r in cur.fetchall():
    print(f"  {r}")

cur.close(); c.close()
