// ============================================================================
// server.js — Invoice Parser Express Server
// ============================================================================
//
// Local Express server that:
//   1. Serves the frontend UI from /public
//   2. Accepts PDF uploads via POST /api/parse
//   3. Parses the invoice using parser.js
//   4. Generates an Excel file with ExcelJS
//   5. Returns the Excel as a downloadable response
//
// Usage:
//   node server.js
//   Open http://localhost:3000
//
// ============================================================================

const express = require('express');
const multer = require('multer');
const path = require('path');
const os = require('os');
const ExcelJS = require('exceljs');
const { parsePDF, OUTPUT_COLUMNS } = require('./parser');

const app = express();
const PORT = 3000;


// ---------------------------------------------------------------------------
// FILE UPLOAD CONFIGURATION
// ---------------------------------------------------------------------------
// multer stores the uploaded file in memory (as a Buffer) so we can
// pass it directly to the parser without writing to disk.

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB max
  fileFilter: (req, file, cb) => {
    // Only accept PDF files
    if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  },
});


// ---------------------------------------------------------------------------
// SERVE FRONTEND
// ---------------------------------------------------------------------------

app.use(express.static(path.join(__dirname, 'public')));


// ---------------------------------------------------------------------------
// API: Parse Invoice PDF → Excel Download
// ---------------------------------------------------------------------------

app.post('/api/parse', upload.single('pdf'), async (req, res) => {
  try {
    // Validate that a file was uploaded
    if (!req.file) {
      return res.status(400).json({ error: 'No PDF file uploaded' });
    }

    console.log(`Processing: ${req.file.originalname} (${(req.file.size / 1024).toFixed(1)} KB)`);

    // Parse the invoice PDF → array of row objects
    const rows = await parsePDF(req.file.buffer);

    if (rows.length === 0) {
      return res.status(400).json({ error: 'No invoice data found in PDF' });
    }

    console.log(`Extracted ${rows.length} invoice row(s)`);

    // --- Create Excel Workbook ---
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Invoice Data');

    // Define columns with headers and widths
    worksheet.columns = OUTPUT_COLUMNS.map(name => ({
      header: name,
      key: name,
      width:
        name === 'Emertim' ? 45 :
        name === 'Barkod' ? 18 :
        name === 'Kod' ? 8 : 15,
    }));

    // Style header row: bold, centered, light blue background
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, size: 11 };
    headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD9E1F2' },
    };

    // Add data rows
    for (const row of rows) {
      worksheet.addRow(row);
    }

    // Number format for numeric columns (2 decimal places)
    const numericCols = ['Sasia', 'Cmim', 'Vlere pa Tvsh', 'Vlere e Tvsh', 'Vlere me Tvsh'];
    for (const colName of numericCols) {
      const colIndex = OUTPUT_COLUMNS.indexOf(colName) + 1;
      if (colIndex > 0) {
        worksheet.getColumn(colIndex).numFmt = '#,##0.00';
      }
    }

    // Freeze the header row so it stays visible while scrolling
    worksheet.views = [{ state: 'frozen', ySplit: 1 }];

    // Write workbook to memory buffer
    const buffer = await workbook.xlsx.writeBuffer();

    // Send as downloadable Excel file
    const filename = req.file.originalname.replace(/\.pdf$/i, '') + '_parsed.xlsx';
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.send(Buffer.from(buffer));

    console.log(`Sent: ${filename}`);
  } catch (error) {
    console.error('Parse error:', error.message);
    res.status(500).json({ error: error.message || 'Failed to parse invoice PDF' });
  }
});


// ---------------------------------------------------------------------------
// MULTER ERROR HANDLER
// ---------------------------------------------------------------------------

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: `Upload error: ${err.message}` });
  }
  if (err) {
    return res.status(400).json({ error: err.message });
  }
  next();
});


// ---------------------------------------------------------------------------
// START SERVER
// ---------------------------------------------------------------------------

app.listen(PORT, '0.0.0.0', () => {
  let lanIP = 'localhost';
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        lanIP = iface.address;
        break;
      }
    }
  }
  console.log('');
  console.log('  Invoice Parser is running!');
  console.log(`  Local:   http://localhost:${PORT}`);
  console.log(`  Network: http://${lanIP}:${PORT}`);
  console.log('');
});
