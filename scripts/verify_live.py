#!/usr/bin/env python3
"""Verify live deployment fixes against the production API.
READ-ONLY: makes GET requests only, except for one Kamlesh test punch (which is what the user explicitly asked for).
"""
import json
import os
import sys
import urllib.request
import urllib.error

BASE = "https://task.ea.laxree.com"

# Kamlesh's userId (verified from previous audit in worklog)
KAMLESH_USER_ID = "user-emp7"
KAMLESH_HRMS_ID = "cmqj2urc00018l704533358hu"


def http_get(url, headers=None, timeout=30):
    req = urllib.request.Request(url, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", errors="replace")
    except Exception as e:
        return 0, str(e)


def http_post(url, body, headers=None, timeout=30):
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers={**(headers or {}), "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", errors="replace")
    except Exception as e:
        return 0, str(e)


def section(title):
    print("\n" + "=" * 70)
    print(f"  {title}")
    print("=" * 70)


def main():
    # 1. Health check
    section("1. PRODUCTION HEALTH CHECK")
    s, _ = http_get(f"{BASE}/")
    print(f"  GET / -> HTTP {s}")
    if s != 200:
        print("  FAIL: site not reachable")
        sys.exit(1)
    print("  OK: site is live")

    # 2. Salary slip bridge - July 2026 for Kamlesh
    section("2. SALARY SLIP BRIDGE — Kamlesh July 2026")
    s, body = http_get(
        f"{BASE}/api/salary-slip/bridge?userId={KAMLESH_USER_ID}&month=7&year=2026"
    )
    print(f"  HTTP {s}")
    if s == 200:
        try:
            d = json.loads(body)
            configured = d.get("configured")
            print(f"  configured: {configured}")
            if configured:
                emp = d.get("employee", {})
                pay = d.get("payroll", {})
                print(f"  employee: {emp.get('fullName', '?')} / {emp.get('employeeId', '?')}")
                print(f"  presentDays: {pay.get('presentDays', '?')}")
                print(f"  payableDays: {pay.get('payableDays', '?')}")
                print(f"  netSalary: Rs {pay.get('netSalary', '?')}")
                print(f"  inWords: {pay.get('netSalaryInWords', '?')[:80]}")
                print(f"  computed: {d.get('computed', '?')}")
                print(f"  source: {d.get('source', '?')}")
                if "bridge is not configured" in body.lower():
                    print("  FAIL: still seeing 'bridge is not configured' error")
                else:
                    print("  OK: salary slip works for Kamlesh July 2026")
            else:
                print(f"  FAIL: configured=false, full body: {body[:400]}")
        except Exception as e:
            print(f"  FAIL: cannot parse JSON: {e}")
            print(f"  body: {body[:400]}")
    else:
        print(f"  FAIL: HTTP {s}")
        print(f"  body: {body[:400]}")

    # 3. Salary slip bridge - June 2026 (last month from August view)
    section("3. SALARY SLIP BRIDGE — Kamlesh June 2026 (last month)")
    s, body = http_get(
        f"{BASE}/api/salary-slip/bridge?userId={KAMLESH_USER_ID}&month=6&year=2026"
    )
    print(f"  HTTP {s}")
    if s == 200:
        try:
            d = json.loads(body)
            configured = d.get("configured")
            print(f"  configured: {configured}")
            if configured:
                pay = d.get("payroll", {})
                print(f"  presentDays: {pay.get('presentDays', '?')}")
                print(f"  netSalary: Rs {pay.get('netSalary', '?')}")
                print(f"  inWords: {pay.get('netSalaryInWords', '?')[:80]}")
                print(f"  computed: {d.get('computed', '?')}")
                print("  OK: last month salary slip works")
            else:
                print(f"  FAIL: configured=false")
        except Exception as e:
            print(f"  FAIL: {e}")

    # 4. Attendance bridge - July 2026 for Kamlesh
    section("4. ATTENDANCE BRIDGE — Kamlesh July 2026")
    s, body = http_get(
        f"{BASE}/api/attendance/bridge?userId={KAMLESH_USER_ID}&month=7&year=2026"
    )
    print(f"  HTTP {s}")
    if s == 200:
        try:
            d = json.loads(body)
            configured = d.get("configured")
            print(f"  configured: {configured}")
            if configured:
                summary = d.get("summary", {})
                records = d.get("records", [])
                print(f"  records: {len(records)}")
                print(f"  summary: present={summary.get('present')}, absent={summary.get('absent')}, late={summary.get('late')}, halfDay={summary.get('halfDay')}, earlyOuts={summary.get('earlyOuts')}")
                print(f"  totalWorkHours: {summary.get('totalWorkHours')}")
                print(f"  meta.mode: {d.get('meta',{}).get('mode')}")
                if "bridge is not configured" in body.lower():
                    print("  FAIL: still seeing bridge error")
                else:
                    print("  OK: attendance bridge works for Kamlesh July 2026")
            else:
                print(f"  FAIL: configured=false. Body: {body[:400]}")
        except Exception as e:
            print(f"  FAIL: {e}")
            print(f"  body: {body[:400]}")
    else:
        print(f"  FAIL: HTTP {s}")
        print(f"  body: {body[:400]}")

    # 5. HR report - admin July 2026
    section("5. HR REPORT (admin) — July 2026")
    s, body = http_get(
        f"{BASE}/api/hr-report?month=7&year=2026"
    )
    print(f"  HTTP {s}")
    if s == 200:
        try:
            d = json.loads(body)
            print(f"  dataStatus: {d.get('dataStatus')}")
            print(f"  totalEmployees: {d.get('totalEmployees')}")
            print(f"  totalPresents: {d.get('totalPresents')}")
            print(f"  totalAbsents: {d.get('totalAbsents')}")
            print(f"  totalLate: {d.get('totalLate')}")
            print(f"  punchCount: {d.get('punchCount')}")
            print(f"  hrmsAttendanceCount: {d.get('hrmsAttendanceCount')}")
            employees = d.get("employees", [])
            if employees:
                print(f"  first 3 employees:")
                for e in employees[:3]:
                    print(f"    - {e.get('name')} | presents={e.get('presents')} | score={e.get('score')}")
            print("  OK: HR report admin July 2026 returns data")
        except Exception as e:
            print(f"  FAIL: {e}")
            print(f"  body: {body[:400]}")
    else:
        print(f"  FAIL: HTTP {s}")
        print(f"  body: {body[:400]}")

    # 6. HR report - self Kamlesh July 2026
    section("6. HR REPORT (self) — Kamlesh July 2026")
    s, body = http_get(
        f"{BASE}/api/hr-report?self=1&userId={KAMLESH_USER_ID}&month=7&year=2026"
    )
    print(f"  HTTP {s}")
    if s == 200:
        try:
            d = json.loads(body)
            print(f"  dataStatus: {d.get('dataStatus')}")
            print(f"  name: {d.get('name')}")
            print(f"  presents: {d.get('presents')}")
            print(f"  score: {d.get('score')}")
            print(f"  hrmsAttendanceCount: {d.get('hrmsAttendanceCount')}")
            print("  OK: HR report self Kamlesh July 2026 returns data")
        except Exception as e:
            print(f"  FAIL: {e}")
            print(f"  body: {body[:400]}")
    else:
        print(f"  FAIL: HTTP {s}")

    # 7. Existing punch status (already in DB from previous test)
    section("7. EXISTING PUNCH STATUS — Kamlesh")
    s, body = http_get(
        f"{BASE}/api/attendance/punch?userId={KAMLESH_USER_ID}"
    )
    print(f"  HTTP {s}")
    if s == 200:
        try:
            d = json.loads(body)
            print(f"  hasActivePunch: {d.get('hasActivePunch')}")
            if d.get("activePunch"):
                ap = d["activePunch"]
                print(f"  activePunch.id: {ap.get('id')}")
                print(f"  activePunch.punchIn: {ap.get('punchIn')}")
                print(f"  activePunch.office: {ap.get('officeName', ap.get('office',{}).get('name'))}")
            print("  OK: punch status retrieved")
        except Exception as e:
            print(f"  FAIL: {e}")

    print("\n" + "=" * 70)
    print("  VERIFICATION COMPLETE")
    print("=" * 70)


if __name__ == "__main__":
    main()
