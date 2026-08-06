import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// ════════════════════════════════════════════════════════════════════════
// v24·0625 — ATTENDANCE BRIDGE (ERP → HRMS, READ-ONLY)
// ════════════════════════════════════════════════════════════════════════
// ERP employees can view their HRMS attendance (read-only) without leaving ERP.
//
// FLOW:
//   1. ERP frontend calls this endpoint with the logged-in user's `userId`.
//   2. ERP backend looks up the user's email + phone.
//   3. ERP backend calls HRMS: GET {HRMS_URL}/api/external/attendance
//        with header `x-hrms-api-key: <HRMS_BRIDGE_API_KEY>`
//        and query `?email=X&phone=Y&month=M&year=Y`
//   4. HRMS returns attendance records + summary.
//   5. ERP passes the response through to the frontend unchanged.
//
// SAFETY: PURELY READ-ONLY. This endpoint NEVER writes to either database.
// It does not modify attendance, employees, or any other table.
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

    // Look up the ERP user — we need their email/phone to match against HRMS employee
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, phone: true, department: true },
    })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // HRMS bridge config (env vars only — no DB lookup)
    // v24·0625-fix: fall back to ERP_BRIDGE_API_KEY if HRMS_BRIDGE_API_KEY is missing,
    // and to a hardcoded production HRMS URL if HRMS_BRIDGE_URL is missing. This makes
    // the bridge resilient to partial env var configuration on Vercel.
    const hrmsUrl = process.env.HRMS_BRIDGE_URL || 'https://laxree-hrms.vercel.app'
    const hrmsKey = process.env.HRMS_BRIDGE_API_KEY || process.env.ERP_BRIDGE_API_KEY
    if (!hrmsKey) {
      // Soft-fail: return empty structure so frontend doesn't crash, with a clear flag
      return NextResponse.json({
        configured: false,
        message: 'HRMS bridge not configured. Set HRMS_BRIDGE_API_KEY (or ERP_BRIDGE_API_KEY as fallback) on the ERP server.',
        records: [],
        summary: null,
        employee: null,
      })
    }

    // Call HRMS external attendance endpoint
    // v24·0625-fix: also send the user's `name` as a fallback matching signal.
    // HRMS employees frequently have null/empty email AND mobile fields (the
    // operator hasn't populated them), so email+phone matching alone always
    // fails. Name matching (case-insensitive, partial) bridges this gap without
    // requiring any data modification on either side.
    const params = new URLSearchParams({
      month: String(month),
      year: String(year),
    })
    if (user.email) params.set('email', user.email)
    if (user.phone) params.set('phone', user.phone)
    if (user.name) params.set('name', user.name)

    const hrmsResponse = await fetch(
      `${hrmsUrl.replace(/\/$/, '')}/api/external/attendance?${params.toString()}`,
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
      console.error('HRMS bridge fetch failed:', hrmsResponse.status, errText)
      // Soft-fail so the ERP UI still renders
      return NextResponse.json({
        configured: true,
        error: `HRMS returned status ${hrmsResponse.status}`,
        records: [],
        summary: null,
        employee: null,
      })
    }

    const hrmsData = await hrmsResponse.json()
    return NextResponse.json({
      configured: true,
      ...hrmsData,
    })
  } catch (error: any) {
    console.error('Attendance bridge error:', error)
    return NextResponse.json({
      configured: true,
      error: error?.message || 'Server error',
      records: [],
      summary: null,
      employee: null,
    })
  }
}
