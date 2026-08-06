// ════════════════════════════════════════════════════════════════════════
// v25·0806 — HRMS API Client
// ════════════════════════════════════════════════════════════════════════
// Thin wrapper around the Laxree HRMS app (https://laxree-hrms.vercel.app).
// Reads base URL + access token from env. Falls back gracefully (returns
// empty arrays) when the token is missing — never blocks the ERP UI.
//
// Endpoints used:
//   GET /api/employees           — full employee master list (54+ records)
//   GET /api/employees?employeeId=EMP-438 — single employee by HRMS ID
//   GET /api/leaves               — all leaves (with employee info embedded)
//   GET /api/attendance           — attendance records + summary
// ════════════════════════════════════════════════════════════════════════

export interface HrmsEmployee {
  id: string
  employeeId: string // e.g. "EMP-438"
  fullName: string
  mobile?: string | null
  email?: string | null
  firm?: string // LAPL, LRSL, SI
  location?: string // Ajmer, Jaipur, Gurugram
  salaryType?: 'hourly' | 'monthly' | 'daily'
  monthlySalary?: number
  dailyRate?: number
  hourlyRate?: number
  overtimeRate?: number
  employmentType?: string // Full Time, Part Time, Intern
  shiftStart?: string // "10:00"
  shiftEnd?: string // "19:00"
  shiftHours?: number
  designation?: string
  gender?: string
  dateOfBirth?: string | null
  department?: string
  joiningDate?: string
  address?: string | null
  bankName?: string | null
  bankAccount?: string | null
  bankIfsc?: string | null
  panNumber?: string | null
  aadhaarNumber?: string | null
  pfNumber?: string | null
  esiNumber?: string | null
  status?: string // "Yes" = active
  relievingDate?: string | null
  reportingManager?: string | null
  emergencyContact?: string | null
  profilePhoto?: string | null
}

export interface HrmsLeave {
  id: string
  employeeId: string
  type: string
  startDate: string
  endDate: string
  days: number
  reason: string
  status: string // pending, approved, rejected
  approvedBy?: string | null
  createdAt: string
  updatedAt: string
  employee?: {
    fullName: string
    employeeId: string
    department?: string
    location?: string
    designation?: string
  }
}

const HRMS_BASE = process.env.HRMS_BASE_URL || 'https://laxree-hrms.vercel.app'
const HRMS_TOKEN = process.env.HRMS_ACCESS_TOKEN || ''

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (HRMS_TOKEN) h['Authorization'] = `Bearer ${HRMS_TOKEN}`
  return h
}

/**
 * Fetch all employees from HRMS.
 * Returns [] if the request fails or token is missing — never throws.
 */
export async function fetchHrmsEmployees(): Promise<HrmsEmployee[]> {
  try {
    if (!HRMS_TOKEN) {
      console.warn('[HRMS] HRMS_ACCESS_TOKEN not set — returning empty employee list')
      return []
    }
    const res = await fetch(`${HRMS_BASE}/api/employees`, {
      headers: authHeaders(),
      next: { revalidate: 300 }, // cache 5 min
    })
    if (!res.ok) {
      console.error(`[HRMS] /api/employees returned ${res.status}`)
      return []
    }
    const data = await res.json()
    return Array.isArray(data) ? data : []
  } catch (e) {
    console.error('[HRMS] fetchHrmsEmployees error:', e)
    return []
  }
}

/**
 * Fetch a single HRMS employee by employeeId (e.g. "EMP-438").
 * Returns null if not found or on error.
 */
export async function fetchHrmsEmployeeById(employeeId: string): Promise<HrmsEmployee | null> {
  try {
    if (!HRMS_TOKEN || !employeeId) return null
    const res = await fetch(
      `${HRMS_BASE}/api/employees?employeeId=${encodeURIComponent(employeeId)}`,
      { headers: authHeaders(), next: { revalidate: 300 } }
    )
    if (!res.ok) return null
    const data = await res.json()
    if (Array.isArray(data) && data.length > 0) return data[0]
    if (data && !Array.isArray(data)) return data
    return null
  } catch (e) {
    console.error('[HRMS] fetchHrmsEmployeeById error:', e)
    return null
  }
}

/**
 * Fetch all leaves from HRMS (with employee info embedded).
 * Returns [] on error.
 */
export async function fetchHrmsLeaves(): Promise<HrmsLeave[]> {
  try {
    if (!HRMS_TOKEN) return []
    const res = await fetch(`${HRMS_BASE}/api/leaves`, {
      headers: authHeaders(),
      next: { revalidate: 60 }, // cache 1 min — leaves are more dynamic
    })
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data) ? data : []
  } catch (e) {
    console.error('[HRMS] fetchHrmsLeaves error:', e)
    return []
  }
}

/**
 * Find an HRMS employee by matching against an ERP user's name (case-insensitive).
 * Useful when the ERP user has an `hrmsId` set but we want to confirm/fallback by name.
 */
export function findHrmsEmployeeByName(
  hrmsEmployees: HrmsEmployee[],
  name: string
): HrmsEmployee | null {
  if (!name) return null
  const target = name.trim().toLowerCase()
  return (
    hrmsEmployees.find(e => (e.fullName || '').trim().toLowerCase() === target) ||
    hrmsEmployees.find(e => (e.fullName || '').trim().toLowerCase().includes(target)) ||
    hrmsEmployees.find(e => target.includes((e.fullName || '').trim().toLowerCase())) ||
    null
  )
}

/**
 * Find an HRMS employee by their ERP hrmsId field (if set).
 */
export function findHrmsEmployeeByHrmsId(
  hrmsEmployees: HrmsEmployee[],
  hrmsId: string | null | undefined
): HrmsEmployee | null {
  if (!hrmsId) return null
  return (
    hrmsEmployees.find(e => e.employeeId === hrmsId) ||
    hrmsEmployees.find(e => e.id === hrmsId) ||
    null
  )
}
