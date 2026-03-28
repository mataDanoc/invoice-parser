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
const fs = require('fs');
const ExcelJS = require('exceljs');
const { parsePDF, OUTPUT_COLUMNS } = require('./parser');

const app = express();
const PORT = process.env.PORT || 3000;


// ---------------------------------------------------------------------------
// NGROK TUNNEL — only used locally when tunnel.json exists
// ---------------------------------------------------------------------------

let tunnelUrl = null;

async function startTunnel() {
  // Skip tunnel in production or when config is missing
  const configPath = path.join(__dirname, 'tunnel.json');
  if (!fs.existsSync(configPath)) {
    console.log('  Tunnel: skipped (no tunnel.json)');
    return;
  }

  try {
    const ngrok = require('@ngrok/ngrok');
    const tunnelConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const listener = await ngrok.forward({
      addr: PORT,
      authtoken: tunnelConfig.authtoken,
      domain: tunnelConfig.domain,
    });
    tunnelUrl = listener.url();
    console.log(`  Public:  ${tunnelUrl}`);
  } catch (e) {
    console.error('  Tunnel error:', e.message);
    setTimeout(startTunnel, 10000);
  }
}

startTunnel();


// ---------------------------------------------------------------------------
// FILE UPLOAD CONFIGURATION
// ---------------------------------------------------------------------------
// multer stores the uploaded file in memory (as a Buffer) so we can
// pass it directly to the parser without writing to disk.

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
      cb(null, true);
    } else {
      cb(new Error('Vetem skedare PDF lejohen'));
    }
  },
});


// ---------------------------------------------------------------------------
// SERVE FRONTEND
// ---------------------------------------------------------------------------

app.use(express.static(path.join(__dirname, 'public')));


// ---------------------------------------------------------------------------
// API: Health check — used by UptimeRobot to keep the service alive
// ---------------------------------------------------------------------------

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: Math.floor(process.uptime()) });
});


// ---------------------------------------------------------------------------
// API: Get current public tunnel URL (local mode only)
// ---------------------------------------------------------------------------

app.get('/api/tunnel-url', (req, res) => {
  res.json({ url: tunnelUrl });
});


// ---------------------------------------------------------------------------
// API: Parse Invoice PDF → Excel Download
// ---------------------------------------------------------------------------

app.post('/api/parse', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Asnje skedar PDF nuk u ngarkua' });
    }

    const sizeKB = (req.file.size / 1024).toFixed(1);
    console.log(`Processing: ${req.file.originalname} (${sizeKB} KB)`);

    // Parse the invoice PDF → array of row objects
    const rows = await parsePDF(req.file.buffer);

    if (rows.length === 0) {
      return res.status(400).json({ error: 'Nuk u gjeten te dhena fature ne PDF' });
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
    const numericCols = ['Sasi', 'Cmim', 'Vlere', 'Tvsh', 'Total'];
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

    // Send as downloadable Excel file with row count metadata
    const filename = req.file.originalname.replace(/\.pdf$/i, '') + '_parsed.xlsx';
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.setHeader('X-Row-Count', rows.length.toString());
    res.setHeader('Access-Control-Expose-Headers', 'X-Row-Count');
    res.send(Buffer.from(buffer));

    console.log(`Sent: ${filename} (${rows.length} rows)`);
  } catch (error) {
    console.error('Parse error:', error.message);
    res.status(500).json({ error: error.message || 'Gabim gjate procesimit te PDF' });
  }
});


// ---------------------------------------------------------------------------
// MULTER ERROR HANDLER
// ---------------------------------------------------------------------------

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'Skedari eshte shume i madh (max 50 MB)' });
    }
    return res.status(400).json({ error: `Gabim ngarkimi: ${err.message}` });
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
