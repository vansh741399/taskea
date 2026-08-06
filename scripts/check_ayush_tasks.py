#!/usr/bin/env python3
"""Check Ayush's user record and tasks in the local SQLite database."""
import sqlite3
import os

DB_PATH = '/home/z/my-project/db/custom.db'

if not os.path.exists(DB_PATH):
    print(f"DB not found at {DB_PATH}")
    # Try to find any sqlite db
    for root, dirs, files in os.walk('/home/z/my-project'):
        for f in files:
            if f.endswith('.db'):
                print(f"Found: {os.path.join(root, f)}")
    raise SystemExit(1)

conn = sqlite3.connect(DB_PATH)
conn.row_factory = sqlite3.Row
cur = conn.cursor()

print("=" * 60)
print("USER TABLE — Aayush / Ayush records")
print("=" * 60)
cur.execute("SELECT id, name, email, role, department, loginUsername, isActive FROM User WHERE name LIKE '%ayush%' OR loginUsername LIKE '%ayush%' OR loginUsername LIKE '%aayush%'")
rows = cur.fetchall()
for r in rows:
    print(dict(r))
if not rows:
    print("(no records found with 'ayush' in name or loginUsername)")
    print("\nAll users in DB:")
    cur.execute("SELECT id, name, email, role, department, loginUsername, isActive FROM User ORDER BY name")
    for r in cur.fetchall():
        print(dict(r))

print("\n" + "=" * 60)
print("ALL EMPLOYEES (role=EMPLOYEE)")
print("=" * 60)
cur.execute("SELECT id, name, email, department, loginUsername, isActive FROM User WHERE role = 'EMPLOYEE' ORDER BY name")
for r in cur.fetchall():
    print(dict(r))

print("\n" + "=" * 60)
print("TASKS — count by ownerId")
print("=" * 60)
cur.execute("SELECT ownerId, COUNT(*) as cnt FROM Task GROUP BY ownerId ORDER BY cnt DESC")
for r in cur.fetchall():
    print(dict(r))

print("\n" + "=" * 60)
print("TASK STEPS — count by assigneeId")
print("=" * 60)
cur.execute("SELECT assigneeId, COUNT(*) as cnt FROM TaskStep GROUP BY assigneeId ORDER BY cnt DESC")
for r in cur.fetchall():
    print(dict(r))

# For each Ayush found, show their tasks
print("\n" + "=" * 60)
print("TASKS OWNED BY EACH AYUSH")
print("=" * 60)
for r in rows:
    uid = r['id']
    cur.execute("SELECT id, title, status, ownerId, parentTaskId FROM Task WHERE ownerId = ?", (uid,))
    tasks = cur.fetchall()
    print(f"\nUser {r['name']} ({uid}) owns {len(tasks)} tasks:")
    for t in tasks:
        print(f"  - {dict(t)}")

    cur.execute("SELECT ts.id, ts.title, ts.assigneeId, t.id as taskId, t.title as taskTitle, t.ownerId FROM TaskStep ts JOIN Task t ON ts.taskId = t.id WHERE ts.assigneeId = ?", (uid,))
    steps = cur.fetchall()
    print(f"  Step-assignee on {len(steps)} steps:")
    for s in steps:
        print(f"    - {dict(s)}")

conn.close()
print("\nDone.")
