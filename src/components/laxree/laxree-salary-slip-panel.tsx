'use client'

// ════════════════════════════════════════════════════════════════════════
// v24·0625-salary — LaxreeSalarySlipPanel
// ════════════════════════════════════════════════════════════════════════
// Embedded inside the Employee Dashboard "Salary Slip" tab. Provides:
//   1. Month/year picker
//   2. Read-only salary slip preview rendered using the EXACT same layout as
//      HRMS SalarySlipGenerator.tsx (blue header, info grids, earnings/deductions
//      table with color coding, in-words, signature section, footer)
//   3. "Download as PDF" button — opens a new window with the same HTML+CSS
//      and triggers browser print dialog (user picks "Save as PDF" → exact
//      same output as HRMS print)
//
// SAFETY: This component NEVER writes to anything. It only:
//   - READS from /api/salary-slip/bridge (which reads from HRMS, read-only)
//   - Opens a NEW browser window with the slip HTML for printing
// ════════════════════════════════════════════════════════════════════════

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useWorkflowStore } from '@/stores/workflow-store'
import { useState } from 'react'

export function LaxreeSalarySlipPanel() {
  const { currentUserId, addToast } = useWorkflowStore()
  const queryClient = useQueryClient()

  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())

  // ─── Live salary slip data (read-only from HRMS via bridge) ───
  const { data: slipData, isLoading } = useQuery({
    queryKey: ['salary-slip-bridge', currentUserId, month, year],
    queryFn: () =>
      fetch(`/api/salary-slip/bridge?userId=${currentUserId}&month=${month}&year=${year}`).then(r => r.json()),
    enabled: !!currentUserId,
  })

  const slip: any = slipData || {}
  const employee: any = slip.employee || null
  const payroll: any = slip.payroll || null
  const firm: any = slip.firm || null
  const monthName: string = slip.monthName || ['January','February','March','April','May','June','July','August','September','October','November','December'][month - 1]

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

  // ─── Print handler — opens a new window with the slip HTML and triggers print ───
  // This produces a PDF that is IDENTICAL to what HRMS generates (same HTML+CSS).
  // User picks "Save as PDF" in the print dialog → exact HRMS-matching PDF.
  const handlePrint = () => {
    if (!employee || !payroll || !firm) {
      addToast('err', 'Salary slip data not available to print')
      return
    }

    const perDayRate = payroll.perDayRate || (payroll.monthlySalary / (new Date(year, month, 0).getDate()))
    const baseSalary = payroll.baseSalary != null ? payroll.baseSalary : Math.round((perDayRate * ((payroll.presentDays || 0) + (payroll.paidLeaves || 0))) * 100) / 100
    const sundayEarn = payroll.sundayEarnings || 0
    const totalEarnings = payroll.totalEarnings || (payroll.grossSalary + (payroll.bonus || 0) + (payroll.incentive || 0) + (payroll.arrear || 0))

    // Resolve firm logo absolute URL (HRMS hosts the logos at /logos/...)
    const hrmsUrl = 'https://laxree-hrms.vercel.app'
    const logoAbsUrl = `${hrmsUrl}${firm.logo || '/laxree-logo.png'}`

    const printWin = window.open('', '_blank', 'width=800,height=1000')
    if (!printWin) {
      addToast('err', 'Could not open print window — please allow pop-ups for this site')
      return
    }

    printWin.document.write(`<!DOCTYPE html><html><head><title>Salary Slip - ${employee.fullName}</title>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Merriweather:wght@300;400;700;900&display=swap');
      @page { size: A4; margin: 10mm; }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: 'Merriweather', 'Georgia', 'Liberation Serif', serif; font-size: 11px; color: #222; background: #fff; }
      .payslip { max-width: 750px; margin: 0 auto; border: 2px solid #1E3A5F; border-radius: 8px; overflow: hidden; }
      .title { text-align: center; font-size: 20px; font-weight: 800; padding: 10px; color: #1A1A1A; border-bottom: 2px solid #1E3A5F; }
      .company-header { background: #1E3A5F; color: white; padding: 14px 20px; display: flex; align-items: center; justify-content: space-between; }
      .company-header .left h2 { font-size: 16px; font-weight: 700; margin-bottom: 2px; }
      .company-header .left p { font-size: 10px; color: #b0c4de; }
      .company-header .logo-box { width: 70px; height: 70px; background: white; border-radius: 8px; overflow: hidden; display: flex; align-items: center; justify-content: center; }
      .company-header .logo-box img { width: 100%; height: 100%; object-fit: contain; }
      .section-header { background: #1E3A5F; color: white; padding: 6px 20px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; }
      .info-grid { display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; padding: 10px 20px; background: #DBEAFE; }
      .info-grid .label { font-weight: 600; font-size: 10px; color: #1E3A5F; }
      .info-grid .value { font-size: 10px; }
      .emp-section { background: white; }
      .emp-section .info-grid { background: #f8f9fa; }
      .table-section { padding: 0; }
      table { width: 100%; border-collapse: collapse; }
      th { background: #059669; color: white; font-size: 11px; font-weight: 700; padding: 8px 12px; text-align: left; }
      th.ded { background: #DC2626; }
      td { padding: 6px 12px; font-size: 10px; border-bottom: 1px solid #e5e7eb; }
      tr:nth-child(even) td { background: #ECFDF5; }
      tr:nth-child(even) td.ded-cell { background: #FEF2F2; }
      tr.total-row td { font-weight: 700; border-top: 2px solid #333; background: #f0fdf4 !important; font-size: 12px; }
      tr.total-row td.ded-cell { background: #fef2f2 !important; color: #DC2626; }
      tr.total-row td.earn-total { color: #059669; }
      .net-pay-row td { font-weight: 800; background: #FEF2F2 !important; color: #DC2626; font-size: 13px; border-top: 2px solid #DC2626; }
      .in-words { padding: 8px 20px; background: #DBEAFE; font-size: 10px; color: #1E3A5F; }
      .in-words .label { font-weight: 700; }
      .in-words .value { font-style: italic; }
      .signature-section { background: #1E3A5F; color: white; padding: 12px 20px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; }
      .sig-line { border-top: 1px solid white; padding-top: 4px; text-align: center; font-size: 9px; margin-top: 20px; }
      .footer { padding: 6px 20px; text-align: center; font-size: 8px; color: #999; border-top: 1px solid #eee; }
    </style></head><body>
    <div class="payslip">
      <div class="title">PAY SLIP — ${monthName} ${year}</div>
      <div class="company-header">
        <div class="left">
          <h2>Salary Slip</h2>
          <p>${firm.name}</p>
        </div>
        <div class="logo-box"><img src="${logoAbsUrl}" alt="${firm.code}" onerror="this.style.display='none'" /></div>
      </div>
      <div class="info-grid">
        <span class="label">Company Name :</span><span class="value">${firm.name}</span>
        <span class="label">Company Address :</span><span class="value">${firm.address}</span>
        <span class="label">Company Phone no :</span><span class="value">${firm.phone}</span>
        <span class="label">Company Email Address :</span><span class="value">${firm.email}</span>
      </div>
      <div class="section-header">Employee Information</div>
      <div class="emp-section">
        <div class="info-grid">
          <span class="label">Employee Name :</span><span class="value">${employee.fullName}</span>
          <span class="label">Employee Code :</span><span class="value">${employee.employeeId}</span>
          <span class="label">Designation :</span><span class="value">${employee.designation || 'N/A'}</span>
          <span class="label">Department :</span><span class="value">${employee.department || firm.code || 'N/A'}</span>
          <span class="label">Pay Period :</span><span class="value">${monthName} ${year}</span>
          <span class="label">Location :</span><span class="value">${employee.location || 'N/A'}</span>
          <span class="label">Monthly Salary :</span><span class="value" style="font-weight:700;color:#059669;">${payroll.monthlySalary ? '₹ ' + Number(payroll.monthlySalary).toLocaleString('en-IN') : 'N/A'}</span>
          <span class="label">Per Day Rate :</span><span class="value" style="font-weight:700;color:#059669;">${payroll.perDayRate ? '₹ ' + Number(payroll.perDayRate).toLocaleString('en-IN') : 'N/A'}</span>
          <span class="label">Employee Address :</span><span class="value">${employee.address || employee.location || 'N/A'}</span>
          <span class="label">Employee Phone no :</span><span class="value">${employee.mobile || 'N/A'}</span>
          <span class="label">Employee Email ID :</span><span class="value">${employee.email || 'N/A'}</span>
        </div>
      </div>
      <div class="table-section">
        <table>
          <tr><th>Earnings</th><th>Amount</th><th class="ded">Deductions</th><th class="ded">Amount</th></tr>
          <tr><td>Basic</td><td>₹${baseSalary.toLocaleString('en-IN')}</td><td class="ded-cell">Provident Fund</td><td class="ded-cell">₹0</td></tr>
          <tr><td>Sunday Earnings</td><td>₹${sundayEarn.toLocaleString('en-IN')}</td><td class="ded-cell">ESI</td><td class="ded-cell">₹0</td></tr>
          <tr><td>Special Allowance</td><td>₹0</td><td class="ded-cell">Professional Tax</td><td class="ded-cell">₹0</td></tr>
          <tr><td>Gross Salary</td><td>₹${payroll.grossSalary.toLocaleString('en-IN')}</td><td class="ded-cell">Salary Advance</td><td class="ded-cell">₹${(payroll.advanceDeduction || 0).toLocaleString('en-IN')}</td></tr>
          <tr><td>Other Earnings</td><td>₹${(payroll.arrear || 0).toLocaleString('en-IN')}</td><td class="ded-cell">TDS</td><td class="ded-cell">₹${(payroll.tdsDeduction || 0).toLocaleString('en-IN')}</td></tr>
          <tr><td>Incentives</td><td>₹${(payroll.incentive || 0).toLocaleString('en-IN')}</td><td class="ded-cell">Loan</td><td class="ded-cell">₹${(payroll.loanDeduction || 0).toLocaleString('en-IN')}</td></tr>
          <tr><td>Bonus</td><td>₹${(payroll.bonus || 0).toLocaleString('en-IN')}</td><td class="ded-cell">Security Deposit</td><td class="ded-cell">₹${(payroll.securityDeposit || 0).toLocaleString('en-IN')}</td></tr>
          <tr><td>Over Time Pay</td><td>₹${(payroll.otAmount || 0).toLocaleString('en-IN')}</td><td class="ded-cell">Other Deduction</td><td class="ded-cell">₹${(payroll.otherDeductions || 0).toLocaleString('en-IN')}</td></tr>
          <tr class="total-row"><td class="earn-total">Total Earnings</td><td class="earn-total">₹${totalEarnings.toLocaleString('en-IN')}</td><td class="ded-cell net-pay-label">Net Pay</td><td class="ded-cell" style="font-size:14px;font-weight:800;color:#1E3A5F;">₹${payroll.netSalary.toLocaleString('en-IN')}</td></tr>
        </table>
      </div>
      <div class="in-words">
        <span class="label">In Words : </span><span class="value">${payroll.netSalaryInWords || ''}</span>
      </div>
      <div class="signature-section">
        <div class="sig-line">Prepared By</div>
        <div class="sig-line">Received By</div>
      </div>
      <div class="footer">
        This is a computer-generated payslip by ${firm.name}. For queries contact HR at ${firm.phone}
      </div>
    </div>
    <script>window.onload=function(){window.print();}</script>
    </body></html>`)
    printWin.document.close()
  }

  // Computed display values for the on-page preview
  const perDayRateCalc = payroll ? (payroll.perDayRate || (payroll.monthlySalary / (new Date(year, month, 0).getDate()))) : 0
  const baseSalaryCalc = payroll ? (payroll.baseSalary != null ? payroll.baseSalary : Math.round((perDayRateCalc * ((payroll.presentDays || 0) + (payroll.paidLeaves || 0))) * 100) / 100) : 0
  const sundayEarningsCalc = payroll ? (payroll.sundayEarnings || 0) : 0
  const totalEarningsCalc = payroll ? (payroll.totalEarnings || payroll.grossSalary + (payroll.bonus || 0) + (payroll.incentive || 0) + (payroll.arrear || 0)) : 0

  return (
    <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'minmax(0, 1fr)' }}>
      {/* ─── Header + month picker ─── */}
      <div className="lcard">
        <div className="ch">
          <div className="ct">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--g2)' }}>
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            My Salary Slip
            <span style={{ fontSize: 10, color: 'var(--t3)', fontWeight: 500, marginLeft: 4 }}>
              (read-only · from HRMS · exact HRMS format)
            </span>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <select
              value={month}
              onChange={e => setMonth(Number(e.target.value))}
              style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid var(--b1)', background: 'var(--bg)', color: 'var(--t1)', fontSize: 11, fontWeight: 600, cursor: 'pointer', outline: 'none' }}
            >
              {months.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
            <select
              value={year}
              onChange={e => setYear(Number(e.target.value))}
              style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid var(--b1)', background: 'var(--bg)', color: 'var(--t1)', fontSize: 11, fontWeight: 600, cursor: 'pointer', outline: 'none' }}
            >
              {[0, 1, 2].map(off => {
                const y = now.getFullYear() - off
                return <option key={y} value={y}>{y}</option>
              })}
            </select>
            {employee && payroll && (
              <button
                className="btn btn-gold"
                onClick={handlePrint}
                style={{ padding: '5px 14px', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="6 9 6 2 18 2 18 9" />
                  <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                  <rect x="6" y="14" width="12" height="8" />
                </svg>
                Download PDF
              </button>
            )}
          </div>
        </div>
        <div className="cb">
          {isLoading ? (
            <div style={{ padding: 30, textAlign: 'center', color: 'var(--t3)', fontSize: 12 }}>Loading salary slip…</div>
          ) : slip.error ? (
            <div style={{
              padding: 18, fontSize: 12, background: 'var(--red-l)', borderRadius: 8,
              border: '1px solid var(--red-m)', color: 'var(--t1)',
            }}>
              <div style={{ fontWeight: 800, color: 'var(--red)', marginBottom: 6, fontSize: 13 }}>
                ⚠ Could not generate salary slip
              </div>
              <div style={{ color: 'var(--t2)', marginBottom: 8 }}>{slip.error}</div>
              <div style={{ color: 'var(--t3)', fontSize: 11, lineHeight: 1.6 }}>
                The server may be cold-starting or the database connection may have timed out. Please retry in a few seconds.
              </div>
              <button
                className="btn"
                style={{ marginTop: 10, padding: '5px 12px', fontSize: 11, fontWeight: 700 }}
                onClick={() => queryClient.invalidateQueries({ queryKey: ['salary-slip-bridge', currentUserId, month, year] })}
              >
                ↻ Retry now
              </button>
            </div>
          ) : !employee || !payroll ? (
            <div style={{
              padding: 18, textAlign: 'center', color: 'var(--t3)', fontSize: 12,
              background: 'var(--bg2)', borderRadius: 8,
            }}>
              <div style={{ fontSize: 22, marginBottom: 6 }}>🔍</div>
              <div style={{ fontWeight: 700, color: 'var(--t2)', marginBottom: 4 }}>No HRMS record linked</div>
              <div>
                No HRMS employee matches your ERP email, phone, or name. Please contact HR to verify your details in HRMS.
              </div>
            </div>
          ) : (
            <>
              {/* ─── Quick stats summary ─── */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginBottom: 16 }}>
                <SalaryStatTile label="Net Salary" value={`₹${payroll.netSalary.toLocaleString('en-IN')}`} bg="linear-gradient(135deg, #FEF3C7, #FDE68A)" color="#92400E" big />
                <SalaryStatTile label="Monthly Salary" value={payroll.monthlySalary ? `₹${Number(payroll.monthlySalary).toLocaleString('en-IN')}` : '—'} bg="linear-gradient(135deg, #EDE9FE, #DDD6FE)" color="#6D28D9" />
                <SalaryStatTile label="Gross Salary" value={`₹${payroll.grossSalary.toLocaleString('en-IN')}`} bg="var(--green-l)" color="var(--green)" />
                <SalaryStatTile label="Total Earnings" value={`₹${totalEarningsCalc.toLocaleString('en-IN')}`} bg="var(--blue-l)" color="var(--blue)" />
                <SalaryStatTile label="Total Deductions" value={`₹${(payroll.totalDeductions || 0).toLocaleString('en-IN')}`} bg="var(--red-l)" color="var(--red)" />
                <SalaryStatTile label="Present Days" value={`${payroll.presentDays || 0}`} bg="var(--green-l)" color="var(--green)" />
                <SalaryStatTile label="Total Working Hrs" value={`${payroll.totalWorkedHrsDisplay || payroll.totalWorkedHrs || 0}`} bg="var(--bg2)" color="var(--t1)" />
              </div>

              {/* ─── Salary slip preview (same HTML structure as HRMS SalarySlipGenerator) ─── */}
              <div style={{
                border: '2px solid #1E3A5F', borderRadius: 8, overflow: 'hidden',
                background: '#fff', color: '#222',
                fontFamily: "'Merriweather', 'Georgia', 'Liberation Serif', serif",
              }}>
                {/* Title */}
                <div style={{ textAlign: 'center', fontSize: 20, fontWeight: 800, padding: '10px 16px', color: '#1A1A1A', borderBottom: '2px solid #1E3A5F', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#1E3A5F', fontSize: 18 }}>PAY SLIP</span>
                  <span style={{ fontSize: 11, color: '#666' }}>{monthName} {year}</span>
                </div>

                {/* Company Header */}
                <div style={{ background: '#1E3A5F', color: 'white', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 700 }}>{firm.name}</div>
                    <div style={{ fontSize: 10, color: '#b0c4de' }}>{monthName} {year}</div>
                  </div>
                  <div style={{ width: 56, height: 56, background: 'white', borderRadius: 8, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 4 }}>
                    {/* Inline logo via image tag - same as HRMS */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`https://laxree-hrms.vercel.app${firm.logo || '/laxree-logo.png'}`}
                      alt={firm.code}
                      style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                    />
                  </div>
                </div>

                {/* Company Info Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px', padding: '10px 20px', background: '#DBEAFE', fontSize: 13 }}>
                  <span style={{ fontWeight: 600, color: '#1E3A5F', fontSize: 11 }}>Company Name :</span>
                  <span style={{ fontSize: 11 }}>{firm.name}</span>
                  <span style={{ fontWeight: 600, color: '#1E3A5F', fontSize: 11 }}>Company Address :</span>
                  <span style={{ fontSize: 11 }}>{firm.address}</span>
                  <span style={{ fontWeight: 600, color: '#1E3A5F', fontSize: 11 }}>Company Phone no :</span>
                  <span style={{ fontSize: 11 }}>{firm.phone}</span>
                  <span style={{ fontWeight: 600, color: '#1E3A5F', fontSize: 11 }}>Company Email Address :</span>
                  <span style={{ fontSize: 11 }}>{firm.email}</span>
                </div>

                {/* Employee Info Section */}
                <div style={{ background: '#1E3A5F', color: 'white', padding: '6px 20px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>
                  Employee Information
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto 1fr', gap: '4px 12px', padding: '10px 20px', background: '#f8f9fa', fontSize: 13 }}>
                  <span style={{ fontWeight: 600, color: '#1E3A5F', fontSize: 11 }}>Employee Name :</span>
                  <span style={{ fontSize: 11 }}>{employee.fullName}</span>
                  <span style={{ fontWeight: 600, color: '#1E3A5F', fontSize: 11 }}>Employee Code :</span>
                  <span style={{ fontSize: 11 }}>{employee.employeeId}</span>
                  <span style={{ fontWeight: 600, color: '#1E3A5F', fontSize: 11 }}>Designation :</span>
                  <span style={{ fontSize: 11 }}>{employee.designation || 'N/A'}</span>
                  <span style={{ fontWeight: 600, color: '#1E3A5F', fontSize: 11 }}>Department :</span>
                  <span style={{ fontSize: 11 }}>{employee.department || firm.code || 'N/A'}</span>
                  <span style={{ fontWeight: 600, color: '#1E3A5F', fontSize: 11 }}>Pay Period :</span>
                  <span style={{ fontSize: 11 }}>{monthName} {year}</span>
                  <span style={{ fontWeight: 600, color: '#1E3A5F', fontSize: 11 }}>Location :</span>
                  <span style={{ fontSize: 11 }}>{employee.location || 'N/A'}</span>
                  <span style={{ fontWeight: 600, color: '#1E3A5F', fontSize: 11 }}>Monthly Salary :</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#059669' }}>{payroll.monthlySalary ? `₹ ${Number(payroll.monthlySalary).toLocaleString('en-IN')}` : 'N/A'}</span>
                  <span style={{ fontWeight: 600, color: '#1E3A5F', fontSize: 11 }}>Per Day Rate :</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#059669' }}>{payroll.perDayRate ? `₹ ${Number(payroll.perDayRate).toLocaleString('en-IN')}` : 'N/A'}</span>
                  <span style={{ fontWeight: 600, color: '#1E3A5F', fontSize: 11 }}>Employee Address :</span>
                  <span style={{ fontSize: 11 }}>{employee.address || employee.location || 'N/A'}</span>
                  <span style={{ fontWeight: 600, color: '#1E3A5F', fontSize: 11 }}></span>
                  <span style={{ fontSize: 11 }}></span>
                  <span style={{ fontWeight: 600, color: '#1E3A5F', fontSize: 11 }}>Employee Phone :</span>
                  <span style={{ fontSize: 11 }}>{employee.mobile || 'N/A'}</span>
                  <span style={{ fontWeight: 600, color: '#1E3A5F', fontSize: 11 }}>Employee Email :</span>
                  <span style={{ fontSize: 11 }}>{employee.email || 'N/A'}</span>
                </div>

                {/* Earnings & Deductions Table */}
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead>
                    <tr>
                      <th style={{ background: '#059669', color: 'white', padding: '8px 12px', textAlign: 'left', fontWeight: 700, fontSize: 11 }}>Earnings</th>
                      <th style={{ background: '#059669', color: 'white', padding: '8px 12px', textAlign: 'left', fontWeight: 700, fontSize: 11 }}>Amount</th>
                      <th style={{ background: '#DC2626', color: 'white', padding: '8px 12px', textAlign: 'left', fontWeight: 700, fontSize: 11 }}>Deductions</th>
                      <th style={{ background: '#DC2626', color: 'white', padding: '8px 12px', textAlign: 'left', fontWeight: 700, fontSize: 11 }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { earn: 'Basic', earnVal: baseSalaryCalc, ded: 'Provident Fund', dedVal: 0 },
                      { earn: 'Sunday Earnings', earnVal: sundayEarningsCalc, ded: 'ESI', dedVal: 0 },
                      { earn: 'Special Allowance', earnVal: 0, ded: 'Professional Tax', dedVal: 0 },
                      { earn: 'Gross Salary', earnVal: payroll.grossSalary, ded: 'Salary Advance', dedVal: payroll.advanceDeduction || 0 },
                      { earn: 'Other Earnings', earnVal: payroll.arrear || 0, ded: 'TDS', dedVal: payroll.tdsDeduction || 0 },
                      { earn: 'Incentives', earnVal: payroll.incentive || 0, ded: 'Loan', dedVal: payroll.loanDeduction || 0 },
                      { earn: 'Bonus', earnVal: payroll.bonus || 0, ded: 'Security Deposit', dedVal: payroll.securityDeposit || 0 },
                      { earn: 'Over Time Pay', earnVal: payroll.otAmount || 0, ded: 'Other Deduction', dedVal: payroll.otherDeductions || 0 },
                    ].map((row, idx) => (
                      <tr key={idx} style={{ background: idx % 2 === 0 ? '#ECFDF5' : 'transparent' }}>
                        <td style={{ padding: '6px 12px', fontSize: 11, borderBottom: '1px solid #e5e7eb', background: idx % 2 === 0 ? '#ECFDF5' : 'transparent' }}>{row.earn}</td>
                        <td style={{ padding: '6px 12px', fontSize: 11, borderBottom: '1px solid #e5e7eb', textAlign: 'right', background: idx % 2 === 0 ? '#ECFDF5' : 'transparent' }}>₹{row.earnVal.toLocaleString('en-IN')}</td>
                        <td style={{ padding: '6px 12px', fontSize: 11, borderBottom: '1px solid #e5e7eb', background: idx % 2 === 0 ? '#FEF2F2' : 'transparent' }}>{row.ded}</td>
                        <td style={{ padding: '6px 12px', fontSize: 11, borderBottom: '1px solid #e5e7eb', textAlign: 'right', background: idx % 2 === 0 ? '#FEF2F2' : 'transparent' }}>₹{row.dedVal.toLocaleString('en-IN')}</td>
                      </tr>
                    ))}
                    {/* Total row */}
                    <tr style={{ borderTop: '2px solid #333' }}>
                      <td style={{ padding: '8px 12px', fontWeight: 700, color: '#059669', background: '#f0fdf4', fontSize: 12 }}>Total Earnings</td>
                      <td style={{ padding: '8px 12px', fontWeight: 700, color: '#059669', background: '#f0fdf4', textAlign: 'right', fontSize: 12 }}>₹{totalEarningsCalc.toLocaleString('en-IN')}</td>
                      <td style={{ padding: '8px 12px', fontWeight: 700, color: '#DC2626', background: '#fef2f2', fontSize: 12 }}>Net Pay</td>
                      <td style={{ padding: '8px 12px', fontWeight: 800, color: '#1E3A5F', background: '#fef2f2', textAlign: 'right', fontSize: 14 }}>₹{payroll.netSalary.toLocaleString('en-IN')}</td>
                    </tr>
                  </tbody>
                </table>

                {/* In Words */}
                <div style={{ padding: '8px 20px', background: '#DBEAFE', fontSize: 11, color: '#1E3A5F' }}>
                  <span style={{ fontWeight: 700 }}>In Words : </span>
                  <span style={{ fontStyle: 'italic' }}>{payroll.netSalaryInWords}</span>
                </div>

                {/* Signature Section */}
                <div style={{ background: '#1E3A5F', color: 'white', padding: '12px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40 }}>
                  <div style={{ borderTop: '1px solid white', paddingTop: 4, textAlign: 'center', fontSize: 10, marginTop: 20 }}>Prepared By</div>
                  <div style={{ borderTop: '1px solid white', paddingTop: 4, textAlign: 'center', fontSize: 10, marginTop: 20 }}>Received By</div>
                </div>

                {/* Footer */}
                <div style={{ padding: '6px 20px', textAlign: 'center', fontSize: 9, color: '#999', borderTop: '1px solid #eee' }}>
                  This is a computer-generated payslip by {firm.name}. For queries contact HR at {firm.phone}
                </div>
              </div>

              {/* Helper text */}
              <div style={{ marginTop: 12, padding: '10px 14px', background: 'var(--bg2)', borderRadius: 8, fontSize: 11, color: 'var(--t3)', lineHeight: 1.5 }}>
                <strong style={{ color: 'var(--t2)' }}>💡 Tip:</strong> Click <strong>Download PDF</strong> above to open the print dialog. Choose <strong>“Save as PDF”</strong> as the destination to get an exact HRMS-format payslip PDF. The layout, colors, and amounts are identical to what HRMS generates.
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Small stat tile ───
function SalaryStatTile({ label, value, bg, color, big }: { label: string; value: string; bg: string; color: string; big?: boolean }) {
  return (
    <div style={{
      padding: big ? '14px 16px' : '10px 12px', borderRadius: 8, background: bg,
      border: `1px solid ${color}22`,
    }}>
      <div style={{ fontSize: big ? 10 : 9.5, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: 0.5, opacity: 0.85 }}>{label}</div>
      <div style={{ fontSize: big ? 22 : 18, fontWeight: 800, color, marginTop: 2 }}>{value}</div>
    </div>
  )
}
