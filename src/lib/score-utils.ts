// ═══════════════════════════════════════════════════════════
// SHARED SCORE UTILITIES  (v10 · 2026-07-02)
// ═══════════════════════════════════════════════════════════
// Revision-penalty logic has been REMOVED.
//
// Score is now based ONLY on task timeliness & status:
//   COMPLETED on time            → 100
//   COMPLETED late (within 2d)   → 70
//   COMPLETED late (> 2d)        → 40
//   IN_PROGRESS / IN_REVIEW      → 70 (on track) or 20 (overdue)
//   PENDING / RE_OPENED          → 50 (on track) or 20 (overdue)
//   ON_HOLD / EXTERNAL_HOLD      → 60
//   ESCALATED                    → 20
//   REJECTED                     → 0
//   No due date set              → 80
//
// Revisions are still tracked (reviseCount, revisedAt, reviseReason)
// for reporting and audit purposes — but they NO LONGER affect score.
//
// This file is kept as a thin backwards-compat shim. The exported
// functions always return 0 / no-op so that older code paths that
// still import them do not break.
// ═══════════════════════════════════════════════════════════

import type { WorkflowStatusType } from './constants'

/**
 * @deprecated Penalty logic removed (v10). Always returns 0.
 * Kept for backwards-compatibility with older call sites.
 */
export function revisionPenalty(_reviseCount: number, _taskCreatedAt?: Date | string | null | undefined): number {
  return 0
}

/**
 * @deprecated Penalty logic removed (v10). Always returns 0.
 * Kept for backwards-compatibility with older call sites.
 */
export function nextRevisionIncrement(_currentReviseCount: number, _taskCreatedAt?: Date | string | null | undefined): number {
  return 0
}

/**
 * @deprecated Penalty logic removed (v10). Always returns false.
 * Kept for backwards-compatibility with older call sites.
 */
export function usesV2Scoring(_taskCreatedAt?: Date | string | null | undefined): boolean {
  return false
}

/**
 * @deprecated Penalty logic removed (v10). Returns a neutral label.
 * Kept for backwards-compatibility with older call sites.
 */
export function scoringSystemLabel(_taskCreatedAt?: Date | string | null | undefined): {
  version: 'v1' | 'v2'
  label: string
  description: string
  rules: { revision: string; penalty: string }[]
} {
  return {
    version: 'v2',
    label: 'Revisions do not affect score',
    description: 'Score is based only on task timeliness and status. Revisions are tracked for reporting only.',
    rules: [
      { revision: 'Any revision', penalty: 'No impact (0 pts)' },
    ],
  }
}

/**
 * Final per-task score floor is always 0.
 */
export function clampTaskScore(score: number): number {
  return Math.max(0, Math.round(score))
}

// ─── Re-export for backwards-compat (older code that imports from constants) ───
export type { WorkflowStatusType }
