/**
 * Date utilities for consistent task date categorization.
 *
 * IMPORTANT: All "overdue" comparisons in this app MUST use date-only
 * comparison (start of day), NOT timestamp comparison against `new Date()`.
 *
 * Why: a task with dueDate "2026-06-16T00:00:00.000Z" (today at midnight UTC)
 * is a TODAY task. But `new Date(dueDate) < new Date()` is TRUE once any time
 * has passed on 2026-06-16, because midnight UTC < current timestamp. This
 * caused Today and Overdue lists to show the same tasks.
 *
 * The fix: compare the START OF the due day against the START OF today.
 *   - today      → dueDay === today
 *   - upcoming   → dueDay >= tomorrow
 *   - overdue    → dueDay < today
 *   - completed/cancelled → excluded from all three
 */

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

export function isToday(dateStr: string | Date | null | undefined): boolean {
  if (!dateStr) return false
  const d = new Date(dateStr)
  const now = new Date()
  return d.getFullYear() === now.getFullYear()
    && d.getMonth() === now.getMonth()
    && d.getDate() === now.getDate()
}

export function isUpcoming(dateStr: string | Date | null | undefined): boolean {
  if (!dateStr) return false
  const d = new Date(dateStr)
  const now = new Date()
  const tomorrowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  return d >= tomorrowStart
}

export function isOverdue(dateStr: string | Date | null | undefined): boolean {
  if (!dateStr) return false
  const d = new Date(dateStr)
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const dueDayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  return dueDayStart < todayStart
}

/** Returns true if task is "active" (not completed / not cancelled) */
export function isActiveStatus(status: string): boolean {
  return status !== 'COMPLETED' && status !== 'CANCELLED'
}
