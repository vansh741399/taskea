import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// ════════════════════════════════════════════════════════════════════════
// v24·0625-salary — SALARY SLIP BRIDGE (ERP → HRMS, READ-ONLY)
// ════════════════════════════════════════════════════════════════════════
// ERP employees can view/download their HRMS salary slip (read-only) without
// leaving ERP. The slip is computed live from HRMS attendance + payroll data
// and rendered using the EXACT same layout as the HRMS SalarySlipGenerator.
//
// FLOW:
//   1. ERP frontend calls this endpoint with the logged-in user's `userId`.
//   2. ERP backend looks up the user's email + phone + name.
//   3. ERP backend calls HRMS: GET {HRMS_URL}/api/external/salary-slip
//        with header `x-hrms-api-key: <HRMS_BRIDGE_API_KEY>`
//        and query `?email=X&phone=Y&name=Z&month=M&year=Y`
//   4. HRMS returns employee + computed payroll + firm details.
//   5. ERP passes the response through to the frontend unchanged.
//
// SAFETY: PURELY READ-ONLY. This endpoint NEVER writes to either database.
// It does not modify payroll, attendance, employees, or any other table.
// ════════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const month = searchParams.get('month') || String(new Date().getMonth() + 1)
    const year = searchParams.get('year') || String(new Date().getFullYear())

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 })
    }

    // Look up the ERP user — we need their email/phone/name to match against HRMS employee
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, phone: true, department: true },
    })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // HRMS bridge config (env vars + hardcoded fallbacks — same pattern as attendance bridge)
    const hrmsUrl = process.env.HRMS_BRIDGE_URL || 'https://laxree-hrms.vercel.app'
    const hrmsKey = process.env.HRMS_BRIDGE_API_KEY || process.env.ERP_BRIDGE_API_KEY
    if (!hrmsKey) {
      return NextResponse.json({
        configured: false,
        message: 'HRMS bridge not configured. Set HRMS_BRIDGE_API_KEY (or ERP_BRIDGE_API_KEY as fallback) on the ERP server.',
        employee: null,
        payroll: null,
        firm: null,
      })
    }

    // Build query params — send all three identifiers so HRMS can match via email → phone → name
    const params = new URLSearchParams({
      month: String(month),
      year: String(year),
    })
    if (user.email) params.set('email', user.email)
    if (user.phone) params.set('phone', user.phone)
    if (user.name) params.set('name', user.name)

    const hrmsResponse = await fetch(
      `${hrmsUrl.replace(/\/$/, '')}/api/external/salary-slip?${params.toString()}`,
      {
        method: 'GET',
        headers: {
          'x-hrms-api-key': hrmsKey,
          'Content-Type': 'application/json',
        },
        // Cache for 60s to avoid hammering HRMS on every render
        next: { revalidate: 60 },
      }
    )

    if (!hrmsResponse.ok) {
      const errText = await hrmsResponse.text().catch(() => '')
      console.error('HRMS salary-slip bridge fetch failed:', hrmsResponse.status, errText)
      return NextResponse.json({
        configured: true,
        error: `HRMS returned status ${hrmsResponse.status}`,
        employee: null,
        payroll: null,
        firm: null,
      })
    }

    const hrmsData = await hrmsResponse.json()
    return NextResponse.json({
      configured: true,
      ...hrmsData,
    })
  } catch (error: any) {
    console.error('Salary slip bridge error:', error)
    return NextResponse.json({
      configured: true,
      error: error?.message || 'Server error',
      employee: null,
      payroll: null,
      firm: null,
    })
  }
}
