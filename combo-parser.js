// ============================================================================
// combo-parser.js — PDF + Excel → Combined Excel (Alcon Invoice + Lot List)
// ============================================================================
//
// Completely independent module. Does NOT touch the existing parser.js.
//
// Inputs:
//   1. PDF buffer — Alcon commercial invoice (product prices + batch/lot details)
//   2. Excel buffer — Lot List (per-lot: qty, UPC/barcode, expiry, description)
//
// Matching: by Lot Number (found in both PDF batch lines and Excel rows)
//
// Output columns:
//   Kod (empty), Emertim, Sasi, Cmim, Vlere, Tvsh (0), Total, Barkod,
//   ExpirationDate, LotNo
//
// ============================================================================

const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.mjs');
const ExcelJS = require('exceljs');

const COMBO_COLUMNS = [
  'Kod', 'Emertim', 'Sasi', 'Cmim', 'Vlere', 'Tvsh', 'Total',
  'Barkod', 'ExpirationDate', 'LotNo'
];


// ---------------------------------------------------------------------------
// MAIN: Combine PDF + Excel → output rows
// ---------------------------------------------------------------------------

async function parseCombo(pdfBuffer, excelBuffer) {
  const pdfData = await extractFromPDF(pdfBuffer);
  const excelRows = await readLotList(excelBuffer);

  const output = [];
  let matched = 0;

  for (const row of excelRows) {
    const pdf = pdfData.get(row.lotNo);
    const cmim = pdf ? pdf.unitPrice : 0;
    const sasi = row.sasi;
    const vlere = +(sasi * cmim).toFixed(2);
    if (pdf) matched++;

    output.push({
      Kod: '',
      Emertim: row.emertim,
      Sasi: sasi,
      Cmim: cmim,
      Vlere: vlere,
      Tvsh: 0,
      Total: vlere,
      Barkod: row.barkod,
      ExpirationDate: pdf ? pdf.expDate : row.expiry,
      LotNo: row.lotNo,
    });
  }

  console.log(`  Combo: ${excelRows.length} lots from Excel, ${pdfData.size} lots from PDF, ${matched} matched`);
  return output;
}


// ---------------------------------------------------------------------------
// PDF: Extract lot number → { unitPrice, expDate } map from Alcon invoice
// ---------------------------------------------------------------------------

async function extractFromPDF(pdfBuffer) {
  const data = new Uint8Array(pdfBuffer);
  const doc = await pdfjsLib.getDocument({ data }).promise;
  const allItems = [];

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const vp = page.getViewport({ scale: 1 });

    for (const item of content.items) {
      if (!item.str.trim()) continue;
      allItems.push({
        text: item.str.trim(),
        x: item.transform[4],
        y: Math.round(vp.height - item.transform[5]) + (p - 1) * 10000,
      });
    }
  }

  // Group text items into lines by Y proximity (tolerance 4px)
  allItems.sort((a, b) => a.y - b.y || a.x - b.x);
  const lines = [];
  let lineItems = [];
  let lastY = -Infinity;

  for (const item of allItems) {
    if (Math.abs(item.y - lastY) > 4) {
      if (lineItems.length) {
        lineItems.sort((a, b) => a.x - b.x);
        lines.push(lineItems.map(i => i.text).join('  '));
      }
      lineItems = [item];
      lastY = item.y;
    } else {
      lineItems.push(item);
    }
  }
  if (lineItems.length) {
    lineItems.sort((a, b) => a.x - b.x);
    lines.push(lineItems.map(i => i.text).join('  '));
  }

  // Parse lines: find product unit prices and batch lot numbers
  const map = new Map();
  let currentPrice = 0;

  // Batch line pattern: LotNo  MfgDate  ExpDate  Qty  Origin
  const batchRe = /^([A-Z]?\d[\w]*)\s+(\d{2}\.\d{2}\.\d{4})\s+(\d{2}\.\d{2}\.\d{4})\s+(\d+)\s+([A-Z]{2})/;

  for (const line of lines) {
    // Product header — contains "Commercial" or "Trials" followed by unit price
    if (/\b(Commercial|Trials)\b/.test(line)) {
      const m = line.match(/(?:Commercial|Trials)\s+([\d,]+\.?\d*)/);
      if (m) {
        currentPrice = parseFloat(m[1].replace(/,/g, ''));
      }
    }

    // Batch line — lot number + dates + qty + origin
    // Don't overwrite: first occurrence (Commercial) takes precedence over Trials
    const bm = line.match(batchRe);
    if (bm && currentPrice > 0 && !map.has(bm[1])) {
      map.set(bm[1], { unitPrice: currentPrice, expDate: bm[3] });
    }
  }

  return map;
}


// ---------------------------------------------------------------------------
// EXCEL: Read lot rows from Lot List
// ---------------------------------------------------------------------------

async function readLotList(excelBuffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(excelBuffer);

  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error('Excel nuk ka sheets');

  // Find header row by looking for "LOT No."
  let headerRowNum = 0;
  const col = {};

  sheet.eachRow(function findHeader(row, rowNum) {
    if (headerRowNum) return;
    row.eachCell(function(cell) {
      const v = String(cell.value || '').trim().toLowerCase();
      if (v === 'lot no.' || v === 'lot no') headerRowNum = rowNum;
    });

    if (headerRowNum === rowNum) {
      row.eachCell(function(cell, colNum) {
        const v = String(cell.value || '').trim().toLowerCase();
        if (v.includes('lot')) col.lot = colNum;
        if (v === 'qty') col.qty = colNum;
        if (v.includes('expiry')) col.expiry = colNum;
        if (v.includes('upc')) col.upc = colNum;
        if (v.includes('description') || v.includes('product')) col.desc = colNum;
      });
    }
  });

  if (!headerRowNum) {
    throw new Error('Nuk u gjet rreshti header ne Excel (kerkon "LOT No.")');
  }

  const rows = [];
  sheet.eachRow(function readData(row, rowNum) {
    if (rowNum <= headerRowNum) return;

    const lotCell = row.getCell(col.lot);
    const lotNo = String(lotCell.text || lotCell.value || '').trim();
    if (!lotNo) return;

    const qty = Number(row.getCell(col.qty).value) || 0;
    if (qty <= 0) return;

    // Expiry date — may be Date object or string
    let expiry = '';
    const expiryCell = row.getCell(col.expiry);
    if (expiryCell.value instanceof Date) {
      const d = expiryCell.value;
      expiry = String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
    } else {
      expiry = String(expiryCell.text || expiryCell.value || '').trim();
    }

    // UPC / barcode
    const upcCell = row.getCell(col.upc);
    const upc = String(upcCell.text || upcCell.value || '').trim();

    // Product description
    const descCell = row.getCell(col.desc);
    const desc = String(descCell.text || descCell.value || '').trim();

    rows.push({
      lotNo: lotNo,
      sasi: qty,
      expiry: expiry,
      barkod: upc,
      emertim: desc,
    });
  });

  return rows;
}


module.exports = { parseCombo, COMBO_COLUMNS };
