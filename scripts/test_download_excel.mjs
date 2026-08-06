// Local test: hit the HR report API and verify the Excel file is generated
// correctly with the logo embedded.

import fs from 'fs'
import https from 'https'

const OUT = '/home/z/my-project/download/test_admin_hr_report.xlsx'
const URL = 'https://task.ea.laxree.com/api/hr-report?month=7&year=2026&location=all&format=xlsx'

console.log(`Downloading: ${URL}`)

function download(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      console.log(`Status: ${res.statusCode}`)
      console.log(`Content-Type: ${res.headers['content-type']}`)
      console.log(`Content-Disposition: ${res.headers['content-disposition']}`)
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => resolve(Buffer.concat(chunks)))
      res.on('error', reject)
    }).on('error', reject)
  })
}

const buf = await download(URL)
console.log(`Downloaded ${buf.length} bytes`)

fs.mkdirSync('/home/z/my-project/download', { recursive: true })
fs.writeFileSync(OUT, buf)
console.log(`Saved to: ${OUT}`)
