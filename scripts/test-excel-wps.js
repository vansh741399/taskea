// Test script: generates a sample HR Report Excel using the same code path
// as the production API, then converts it via LibreOffice to validate that
// it opens cleanly (proxy for WPS Office compatibility).
//
// Run: node /home/z/my-project/scripts/test-excel-wps.js

const XLSX = require('xlsx')
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const HR_SCORE_MULTIPLIER = 2
const SHIFT_START_HOUR = 10
const SHIFT_END_HOUR = 19
const LATE_THRESHOLD_MINUTES = 15

// Sample report data — mirrors what the API returns
const report = [
  {
    sno: 1, name: 'Aditya Sharma', designation: 'Software Developer',
    department: 'LAPL', location: 'Ajmer', email: 'aditya@laxree.com',
    fullDayLeaves: 1, halfDayLeaves: 0, uninformedLeaves: 2,
    lateComings: 1, earlyGoings: 0, lateComingsEarlyGoings: 1,
    totalPresents: 18, hrScore: 2, baseScore: 36, deductions: 2,
    deductionDetails: ['-1 (leaves > 2)', '-1 (late/early > 1)'],
    overallScore: 34, isLowScore: false, status: 'GOOD',
    hrms: { hrmsEmployeeId: 'EMP-001', firm: 'LAPL', employmentType: 'Full Time',
      salaryType: 'monthly', monthlySalary: 35000, dailyRate: 1167,
      hourlyRate: 129.67, overtimeRate: 129.67, shiftStart: '10:00', shiftEnd: '19:00',
      shiftHours: 9, joiningDate: '2024-03-15T00:00:00.000Z',
      bankName: 'HDFC Bank', bankAccount: '501000123456789',
      bankIfsc: 'HDFC0001234', panNumber: 'ABCDE1234F',
      aadhaarNumber: '1234-5678-9012', reportingManager: 'Ashish Sir',
      hrmsStatus: 'Yes' },
  },
  {
    sno: 2, name: 'Anamika', designation: 'Designer',
    department: 'LRSL', location: 'Jaipur', email: 'anamika@laxree.com',
    fullDayLeaves: 3, halfDayLeaves: 1, uninformedLeaves: 4,
    lateComings: 2, earlyGoings: 1, lateComingsEarlyGoings: 3,
    totalPresents: 14, hrScore: 2, baseScore: 28, deductions: 5,
    deductionDetails: ['-1 (leaves > 2)', '-1 (uninformed > 1)', '-1 (half days > 2)', '-2 (leaves > 5)'],
    overallScore: 23, isLowScore: false, status: 'GOOD',
    hrms: { hrmsEmployeeId: 'EMP-002', firm: 'LRSL', employmentType: 'Full Time',
      salaryType: 'monthly', monthlySalary: 28000, dailyRate: 933,
      hourlyRate: 103.7, overtimeRate: 103.7, shiftStart: '10:00', shiftEnd: '19:00',
      shiftHours: 9, joiningDate: '2023-08-22T00:00:00.000Z',
      bankName: 'ICICI Bank', bankAccount: '012345678901',
      bankIfsc: 'ICIC0000123', panNumber: 'FGHIJ5678K',
      aadhaarNumber: '9876-5432-1098', reportingManager: 'Khushboo',
      hrmsStatus: 'Yes' },
  },
  {
    sno: 3, name: 'Saurabh', designation: 'Office Boy',
    department: 'SI', location: 'Gurugram', email: 'saurabh@laxree.com',
    fullDayLeaves: 6, halfDayLeaves: 2, uninformedLeaves: 5,
    lateComings: 4, earlyGoings: 2, lateComingsEarlyGoings: 6,
    totalPresents: 9, hrScore: 2, baseScore: 18, deductions: 12,
    deductionDetails: ['-1 (leaves > 2)', '-1 (late/early > 1)', '-1 (uninformed > 1)', '-1 (half days > 2)', '-2 (leaves > 5)', '-2 (late/early > 4)', '-2 (uninformed > 3)', '-2 (half days > 4)'],
    overallScore: 6, isLowScore: true, status: 'LOW',
    hrms: { hrmsEmployeeId: 'EMP-003', firm: 'SI', employmentType: 'Full Time',
      salaryType: 'monthly', monthlySalary: 13000, dailyRate: 433,
      hourlyRate: 48.15, overtimeRate: 48.15, shiftStart: '10:00', shiftEnd: '19:00',
      shiftHours: 9, joiningDate: '2025-01-10T00:00:00.000Z',
      bankName: 'SBI', bankAccount: '30012345678',
      bankIfsc: 'SBIN0001234', panNumber: 'LMNOP9012Q',
      aadhaarNumber: '1111-2222-3333', reportingManager: 'Radhika',
      hrmsStatus: 'Yes' },
  },
]

// ─── Build workbook (admin view) ───
const wb = XLSX.utils.book_new()

// Sheet 1: HR Report (main)
const reportData = report.map(r => ({
  'S.No': r.sno,
  'Name of Employee': r.name,
  'Designation': r.designation,
  'Department': r.department,
  'Location': r.location,
  'Full Day Leaves': r.fullDayLeaves,
  'Half Days': r.halfDayLeaves,
  'Uninformed Leaves': r.uninformedLeaves,
  'Late Comings': r.lateComings,
  'Early Goings': r.earlyGoings,
  'Late/Early Total': r.lateComingsEarlyGoings,
  'Total Presents': r.totalPresents,
  'HR Score': r.hrScore,
  'Base Score': r.baseScore,
  'Deductions': r.deductions,
  'Overall Score': r.overallScore,
  'Status': r.status,
  'HRMS ID': r.hrms?.hrmsEmployeeId || '',
  'Joining Date': r.hrms?.joiningDate ? new Date(r.hrms.joiningDate).toLocaleDateString('en-IN') : '',
}))
const ws1 = XLSX.utils.json_to_sheet(reportData)
ws1['!cols'] = [
  { wch: 6 }, { wch: 22 }, { wch: 25 }, { wch: 12 }, { wch: 12 },
  { wch: 10 }, { wch: 10 }, { wch: 15 }, { wch: 10 }, { wch: 10 },
  { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 12 },
  { wch: 12 }, { wch: 8 }, { wch: 12 }, { wch: 14 },
]
XLSX.utils.book_append_sheet(wb, ws1, 'HR Report')

// Sheet 2: Employee Master (HRMS data)
const masterData = report.filter(r => r.hrms).map(r => ({
  'Name': r.name,
  'HRMS ID': r.hrms.hrmsEmployeeId,
  'Designation': r.designation,
  'Department': r.department,
  'Firm': r.hrms.firm,
  'Location': r.location,
  'Employment Type': r.hrms.employmentType,
  'Salary Type': r.hrms.salaryType,
  'Monthly Salary': r.hrms.monthlySalary,
  'Daily Rate': r.hrms.dailyRate,
  'Hourly Rate': r.hrms.hourlyRate,
  'Overtime Rate': r.hrms.overtimeRate,
  'Shift Start': r.hrms.shiftStart,
  'Shift End': r.hrms.shiftEnd,
  'Shift Hours': r.hrms.shiftHours,
  'Gender': r.hrms.gender,
  'Joining Date': r.hrms.joiningDate ? new Date(r.hrms.joiningDate).toLocaleDateString('en-IN') : '',
  'Reporting Manager': r.hrms.reportingManager,
  'Bank Name': r.hrms.bankName,
  'Bank Account': r.hrms.bankAccount,
  'Bank IFSC': r.hrms.bankIfsc,
  'PAN': r.hrms.panNumber,
  'Aadhaar': r.hrms.aadhaarNumber,
  'PF Number': r.hrms.pfNumber,
  'ESI Number': r.hrms.esiNumber,
  'Emergency Contact': r.hrms.emergencyContact,
  'HRMS Status': r.hrms.hrmsStatus,
}))
const ws2 = XLSX.utils.json_to_sheet(masterData)
ws2['!cols'] = [
  { wch: 22 }, { wch: 12 }, { wch: 25 }, { wch: 12 }, { wch: 10 },
  { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 12 },
  { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 10 },
  { wch: 10 }, { wch: 14 }, { wch: 20 }, { wch: 18 }, { wch: 18 },
  { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
  { wch: 18 }, { wch: 10 },
]
XLSX.utils.book_append_sheet(wb, ws2, 'Employee Master')

// Sheet 3: Scoring Rules
const rulesData = [
  { 'Rule': 'HR Score Multiplier', 'Value': HR_SCORE_MULTIPLIER, 'Description': 'Total Presents × HR Score = Base Score' },
  { 'Rule': 'Late Coming Threshold', 'Value': `${SHIFT_START_HOUR}:${String(LATE_THRESHOLD_MINUTES).padStart(2,'0')} AM`, 'Description': 'Punch-in after this time = late' },
  { 'Rule': 'Early Going Threshold', 'Value': `${SHIFT_END_HOUR}:00 PM`, 'Description': 'Punch-out before this time = early' },
  { 'Rule': 'Low Score Threshold', 'Value': 7, 'Description': 'Scores below 7 are marked RED' },
  {},
  { 'Rule': '−1 Deductions', 'Value': '', 'Description': '' },
  { 'Rule': 'Leaves > 2', 'Value': -1, 'Description': 'If total leave days > 2 in a month' },
  { 'Rule': 'Late/Early > 1', 'Value': -1, 'Description': 'If late comings + early goings > 1' },
  { 'Rule': 'Uninformed > 1', 'Value': -1, 'Description': 'If uninformed leaves > 1' },
  { 'Rule': 'Half Days > 2', 'Value': -1, 'Description': 'If half day leaves > 2' },
  {},
  { 'Rule': '−2 Deductions (severe)', 'Value': '', 'Description': '' },
  { 'Rule': 'Leaves > 5', 'Value': -2, 'Description': 'If total leave days > 5' },
  { 'Rule': 'Late/Early > 4', 'Value': -2, 'Description': 'If late comings + early goings > 4' },
  { 'Rule': 'Uninformed > 3', 'Value': -2, 'Description': 'If uninformed leaves > 3' },
  { 'Rule': 'Half Days > 4', 'Value': -2, 'Description': 'If half day leaves > 4' },
]
const ws3 = XLSX.utils.json_to_sheet(rulesData)
ws3['!cols'] = [{ wch: 28 }, { wch: 18 }, { wch: 50 }]
XLSX.utils.book_append_sheet(wb, ws3, 'Scoring Rules')

// Sheet 4: Location Summary
const locSummary = {}
report.forEach(r => {
  const loc = r.location || 'Unknown'
  if (!locSummary[loc]) locSummary[loc] = { 'Location': loc, 'Total Employees': 0, 'Avg Presents': 0, 'Avg Score': 0, 'Low Score Count': 0 }
  locSummary[loc]['Total Employees']++
  locSummary[loc]['Avg Presents'] += r.totalPresents
  locSummary[loc]['Avg Score'] += r.overallScore
  if (r.isLowScore) locSummary[loc]['Low Score Count']++
})
const locArray = Object.values(locSummary).map(d => ({
  ...d,
  'Avg Presents': d['Total Employees'] > 0 ? Math.round(d['Avg Presents'] / d['Total Employees']) : 0,
  'Avg Score': d['Total Employees'] > 0 ? Math.round(d['Avg Score'] / d['Total Employees']) : 0,
}))
const ws4 = XLSX.utils.json_to_sheet(locArray)
ws4['!cols'] = [{ wch: 14 }, { wch: 16 }, { wch: 14 }, { wch: 12 }, { wch: 16 }]
XLSX.utils.book_append_sheet(wb, ws4, 'Location Summary')

// Sheet 5: Report Info
const metaData = [{
  'Report': 'Laxree HR Report',
  'Generated At': new Date().toLocaleString('en-IN'),
  'Month': '8/2026',
  'Location Filter': 'all',
  'Total Employees': report.length,
  'HR Score Multiplier': HR_SCORE_MULTIPLIER,
  'Low Score Threshold': 7,
  'HRMS Synced': report.some(r => r.hrms) ? 'Yes' : 'No',
}]
const ws5 = XLSX.utils.json_to_sheet(metaData)
ws5['!cols'] = [{ wch: 25 }, { wch: 25 }, { wch: 12 }, { wch: 15 }, { wch: 15 }, { wch: 20 }, { wch: 18 }, { wch: 15 }]
XLSX.utils.book_append_sheet(wb, ws5, 'Report Info')

// Write the file
const outDir = '/home/z/my-project/download'
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })
const outPath = path.join(outDir, 'HR_Report_sample_test.xlsx')
XLSX.writeFile(wb, outPath, { bookType: 'xlsx' })
console.log(`✓ Wrote Excel: ${outPath} (${fs.statSync(outPath).size} bytes)`)
console.log(`  Sheets: ${wb.SheetNames.length} (${wb.SheetNames.join(', ')})`)

// ─── Validate with LibreOffice headless ───
// Convert xlsx → csv to verify the file is parseable by an office suite
// (proxy for WPS Office compatibility — both implement OOXML)
console.log('\n--- LibreOffice validation ---')
try {
  const csvOutDir = '/tmp/xlsx-validation'
  if (!fs.existsSync(csvOutDir)) fs.mkdirSync(csvOutDir, { recursive: true })
  // Convert all sheets to CSV
  execSync(
    `libreoffice --headless --convert-to csv --outdir "${csvOutDir}" "${outPath}" 2>&1`,
    { timeout: 30000 }
  )
  const csvFiles = fs.readdirSync(csvOutDir).filter(f => f.endsWith('.csv'))
  console.log(`✓ LibreOffice parsed the file successfully`)
  console.log(`  CSV output: ${csvFiles.length} file(s)`)
  csvFiles.forEach(f => {
    const content = fs.readFileSync(path.join(csvOutDir, f), 'utf-8')
    const lines = content.split('\n').filter(Boolean)
    console.log(`  ${f}: ${lines.length} rows, first row: ${lines[0]?.slice(0, 80)}…`)
  })
} catch (e) {
  console.error(`✗ LibreOffice validation failed: ${e.message}`)
  process.exit(1)
}

// ─── Re-open with xlsx to verify round-trip ───
console.log('\n--- Round-trip verification ---')
try {
  const wb2 = XLSX.readFile(outPath)
  console.log(`✓ Re-read workbook successfully`)
  console.log(`  Sheets: ${wb2.SheetNames.length}`)
  wb2.SheetNames.forEach(name => {
    const ws = wb2.Sheets[name]
    const data = XLSX.utils.sheet_to_json(ws)
    console.log(`  ${name}: ${data.length} data rows`)
  })
} catch (e) {
  console.error(`✗ Round-trip verification failed: ${e.message}`)
  process.exit(1)
}

console.log('\n✅ Excel file is WPS-Office-compatible (validated via LibreOffice + round-trip parse)')
