import ExcelJS from 'exceljs'
import fs from 'fs'

const wb = new ExcelJS.Workbook()
const ws = wb.addWorksheet('test')
ws.columns = [{ width: 20 }, { width: 20 }]

// Try to embed image
const imgPath = '/home/z/my-project/public/laxree-logo-excel.png'
const imgBuf = fs.readFileSync(imgPath)
console.log('Image buffer size:', imgBuf.length, 'bytes')

const imgId = wb.addImage({
  buffer: imgBuf,
  extension: 'png',
})
console.log('Image added with id:', imgId)

// Place at A1, 4 columns wide x 2 rows tall
ws.addImage(imgId, 'A1:D2')
console.log('Image placed at A1:D2')

const out = await wb.xlsx.writeBuffer()
console.log('Buffer size:', out.length, 'bytes')
fs.writeFileSync('/tmp/test_exceljs_image.xlsx', out)
console.log('Saved test Excel to /tmp/test_exceljs_image.xlsx')
