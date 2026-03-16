// ============================================================================
// parser.js — Albanian Invoice PDF Parser (Coordinate-Based)
// ============================================================================
//
// Parses Albanian invoice PDFs and extracts tabular data using text coordinates.
//
// KEY CHALLENGE: In these PDFs, table headers (Nr, Barkod, Pershkrimi, etc.)
// are rendered as vector graphics — NOT extractable as text. Only the actual
// DATA VALUES in each row are extractable with their X,Y coordinates.
//
// APPROACH (Dynamic — no fixed coordinates):
//   1. Extract all text items with X,Y positions from the PDF
//   2. Find the first data row by locating a barcode pattern (7-14 digit number)
//   3. Classify items in the first row by content to detect column positions:
//        - Small integer at leftmost → Nr (row number, skipped)
//        - Long digit string → Barkod
//        - Long text → Emertim (product description)
//        - Short text (≤6 chars) → Njesia (unit: COP, KG, etc.)
//        - Numeric values left-to-right → Sasia, Cmim, Vlere pa/e/me Tvsh
//   4. Calculate column boundaries as midpoints between detected columns
//   5. Process all data rows using these boundaries
//   6. Merge multi-line product descriptions
//   7. Clean Albanian number format (1.500,50 → 1500.50)
//
// ============================================================================


// ---------------------------------------------------------------------------
// CONFIGURATION
// ---------------------------------------------------------------------------

// Excel output columns — exact order required
const OUTPUT_COLUMNS = [
  'Barkod',
  'Kod',                  // Always empty
  'Emertim',
  'Sasi',
  'Cmim',
  'Vlere',
  'Tvsh',
  'Total',
];

// Columns where Albanian number cleaning is applied
const NUMERIC_COLUMNS = ['Sasi', 'Cmim', 'Vlere', 'Tvsh', 'Total'];

// The 5 numeric columns in left-to-right order within the invoice table
const NUMERIC_COLUMN_NAMES = ['Sasi', 'Cmim', 'Vlere', 'Tvsh', 'Total'];

// Stop keywords — rows containing these mark the end of invoice data
const STOP_KEYWORDS = ['gjithsej', 'nentotal', 'total per', 'total:'];

// Y-axis tolerance: items within this many pixels vertically = same row
const Y_TOLERANCE = 3;


// ============================================================================
// SECTION 1: PDF TEXT EXTRACTION
// ============================================================================
//
// Uses pdfjs-dist to extract every text item from the PDF along with its
// position (X, Y coordinates). The PDF coordinate system has its origin at
// the bottom-left corner (Y increases upward), so we convert to a top-down
// system where Y increases downward — matching how we read a page.
//
// For multi-page PDFs, each page's Y values are offset by the cumulative
// page heights, so all items can be sorted top-to-bottom across pages.
//
// ============================================================================

async function extractTextItems(pdfBuffer) {
  // pdfjs-dist v5 is ESM-only — use dynamic import from CommonJS
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');

  const data = new Uint8Array(pdfBuffer);
  const doc = await pdfjsLib.getDocument({ data }).promise;

  const allItems = [];

  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.0 });
    const pageHeight = viewport.height;
    const textContent = await page.getTextContent();

    for (const item of textContent.items) {
      // Skip empty and whitespace-only items
      if (!item.str || item.str.trim() === '') continue;

      allItems.push({
        text: item.str.trim(),
        x: item.transform[4],
        // Convert bottom-up Y to top-down Y, with page offset for multi-page
        y: (pageNum - 1) * pageHeight + (pageHeight - item.transform[5]),
        width: item.width || 0,
        height: Math.abs(item.transform[3]) || 0,
        page: pageNum,
      });
    }
  }

  return allItems;
}


// ============================================================================
// SECTION 2: DYNAMIC COLUMN DETECTION FROM FIRST DATA ROW
// ============================================================================
//
// Since headers are non-text graphics, we identify columns by analyzing the
// content of items in the first data row. The classification works as follows:
//
//   Pass 1 — Nr: The leftmost item, if it's a small integer (1-999).
//            This is the row number. We detect it but skip it in output.
//
//   Pass 2 — Barkod: First item with 7-14 digits (EAN-8, EAN-13 barcode).
//
//   Pass 3 — Numerics: All items matching /^[\d.,]+$/ are decimal numbers.
//            Sorted left-to-right, they map to:
//            Sasia → Cmim → Vlere pa Tvsh → Vlere e Tvsh → Vlere me Tvsh
//
//   Pass 4 — Remaining items:
//            Short text (≤6 chars, alphanumeric) → Njesia (unit of measure)
//            Everything else → Emertim (product description)
//
// The X position of each classified item defines that column's anchor point.
//
// ============================================================================

function detectColumnsFromFirstRow(rowItems) {
  // Sort items left to right by X coordinate
  const sorted = [...rowItems].sort((a, b) => a.x - b.x);

  const result = [];
  const usedIndices = new Set();

  // --- Pass 1: Nr (row number) ---
  // Leftmost item, small integer
  if (sorted.length > 0 && /^\d{1,3}$/.test(sorted[0].text)) {
    result.push({
      name: 'Nr',
      x: sorted[0].x,
      width: sorted[0].width,
      skip: true, // Not included in Excel output
    });
    usedIndices.add(0);
  }

  // --- Pass 2: Barkod (barcode) ---
  // First item with 7-14 digits
  for (let i = 0; i < sorted.length; i++) {
    if (usedIndices.has(i)) continue;
    if (/^\d{7,14}$/.test(sorted[i].text)) {
      result.push({
        name: 'Barkod',
        x: sorted[i].x,
        width: sorted[i].width,
        skip: false,
      });
      usedIndices.add(i);
      break;
    }
  }

  // --- Pass 3: Numeric value columns ---
  // Items that look like decimal numbers (digits, dots, commas)
  const numericIndices = [];
  for (let i = 0; i < sorted.length; i++) {
    if (usedIndices.has(i)) continue;
    if (/^[\d.,]+$/.test(sorted[i].text)) {
      numericIndices.push(i);
    }
  }

  // Assign left-to-right: Sasi, Cmim, Vlere, Tvsh, Total
  numericIndices.forEach((idx, i) => {
    if (i < NUMERIC_COLUMN_NAMES.length) {
      result.push({
        name: NUMERIC_COLUMN_NAMES[i],
        x: sorted[idx].x,
        width: sorted[idx].width,
        skip: false,
      });
      usedIndices.add(idx);
    }
  });

  // --- Pass 4: Remaining → Njesia or Pershkrimi ---
  let njesiaFound = false;
  for (let i = 0; i < sorted.length; i++) {
    if (usedIndices.has(i)) continue;
    const text = sorted[i].text;

    // Short alphanumeric text that isn't purely digits → unit of measure (skipped in output)
    if (!njesiaFound && text.length <= 6 && /^[A-Za-z0-9/]+$/.test(text) && !/^\d+$/.test(text)) {
      result.push({
        name: 'Njesia',
        x: sorted[i].x,
        width: sorted[i].width,
        skip: true, // Detected for column boundaries but not included in output
      });
      njesiaFound = true;
    } else {
      // Everything else → product description
      result.push({
        name: 'Emertim',
        x: sorted[i].x,
        width: sorted[i].width,
        skip: false,
      });
    }
    usedIndices.add(i);
  }

  // Sort all detected columns left-to-right
  result.sort((a, b) => a.x - b.x);

  return result;
}


// ============================================================================
// SECTION 3: COLUMN BOUNDARY CALCULATION
// ============================================================================
//
// Calculates the X-axis range for each column using the midpoint approach.
// The boundary between two adjacent columns is the midpoint of their X positions.
//
// Example with columns at x=50, x=150, x=300:
//   Column A: range [0, 100)        ← midpoint(50, 150) = 100
//   Column B: range [100, 225)      ← midpoint(150, 300) = 225
//   Column C: range [225, ∞)
//
// When assigning a data item to a column, we check which range contains
// the item's X position (left edge). Using the left edge (not center) is
// important because wide items like descriptions would otherwise have their
// center fall into a neighboring column.
//
// ============================================================================

function calculateColumnBoundaries(columns) {
  const sorted = [...columns].sort((a, b) => a.x - b.x);

  return sorted.map((col, i) => {
    const prevCol = sorted[i - 1];
    const nextCol = sorted[i + 1];

    return {
      ...col,
      // Left boundary: midpoint between previous and current column X
      leftBound: prevCol ? (prevCol.x + col.x) / 2 : 0,
      // Right boundary: midpoint between current and next column X
      rightBound: nextCol ? (col.x + nextCol.x) / 2 : Infinity,
    };
  });
}


// ============================================================================
// SECTION 4: TEXT OVERFLOW CLIPPING
// ============================================================================
//
// Some PDFs render the product description as one long text item that visually
// extends past its column into the next column (e.g., Njesia). For example:
//
//   Text item: "Regina Provence mix peceta letre 38x38 2v 44cp"
//   Starts at x=123, width=179, extends to x=302
//   But the next column (COP) starts at x=251
//
// The portion "38x38 2v 44cp" overflows into the Njesia column area.
// This function clips the text to only keep the portion within its column,
// using proportional width estimation and snapping to the nearest word boundary.
//
// ============================================================================

function clipOverflowText(text, itemX, itemWidth, nextColumnX) {
  const textEndX = itemX + itemWidth;

  // If text doesn't extend past the next column, return as-is (+2 tolerance)
  if (textEndX <= nextColumnX + 2) return text;

  // Calculate what proportion of the text width fits within this column
  const fittingWidth = nextColumnX - itemX;
  const proportion = Math.max(0, Math.min(1, fittingWidth / itemWidth));

  // Estimate character cutoff based on the proportion
  const cutoffIndex = Math.floor(text.length * proportion);

  // If cutoff falls on a space or at end of text → clean cut, keep all words up to here
  if (cutoffIndex >= text.length || text[cutoffIndex] === ' ') {
    return text.substring(0, cutoffIndex).trim();
  }

  // Cutoff falls in the middle of a word → snap back to last complete word
  const partial = text.substring(0, cutoffIndex);
  const lastSpace = partial.lastIndexOf(' ');

  if (lastSpace > 0) {
    return partial.substring(0, lastSpace).trim();
  }
  return partial.trim();
}


// ============================================================================
// SECTION 5: ITEM-TO-COLUMN ASSIGNMENT
// ============================================================================
//
// Given a text item's X position, finds which column it belongs to.
// Uses the item's LEFT EDGE (x position), not center, to avoid misassignment
// of wide items like product descriptions whose center might fall into the
// next column's range.
//
// ============================================================================

function assignToColumn(itemX, boundaries) {
  // Check which column's range [leftBound, rightBound) contains this X
  for (const col of boundaries) {
    if (itemX >= col.leftBound && itemX < col.rightBound) {
      return col;
    }
  }

  // Fallback: nearest column by X distance
  let nearest = boundaries[0];
  let minDist = Infinity;
  for (const col of boundaries) {
    const dist = Math.abs(itemX - col.x);
    if (dist < minDist) {
      minDist = dist;
      nearest = col;
    }
  }
  return nearest;
}


// ============================================================================
// SECTION 6: ROW GROUPING BY Y COORDINATE
// ============================================================================
//
// Groups text items into rows based on their vertical position (Y coordinate).
// Items within Y_TOLERANCE pixels of each other are considered part of the
// same horizontal row.
//
// Example: items at y=259.08 and y=259.10 → same row (diff = 0.02 < 3)
//          items at y=277.56 → new row (diff = 18.48 > 3)
//
// ============================================================================

function groupItemsIntoRows(items, tolerance = Y_TOLERANCE) {
  // Sort top-to-bottom
  const sorted = [...items].sort((a, b) => a.y - b.y);

  const rows = [];
  let currentRowItems = [];
  let currentY = null;

  for (const item of sorted) {
    if (currentY === null || Math.abs(item.y - currentY) > tolerance) {
      // Start a new row
      if (currentRowItems.length > 0) {
        rows.push({ y: currentY, items: [...currentRowItems] });
      }
      currentRowItems = [item];
      currentY = item.y;
    } else {
      // Same row
      currentRowItems.push(item);
    }
  }

  // Don't forget the last row
  if (currentRowItems.length > 0) {
    rows.push({ y: currentY, items: currentRowItems });
  }

  return rows;
}


// ============================================================================
// SECTION 7: MULTI-LINE DESCRIPTION MERGE
// ============================================================================
//
// Some product descriptions are too long to fit on one line and wrap onto
// a second (or third) line. These continuation lines only have text in the
// description column — the Sasia and Cmim columns are empty.
//
// Detection: If a row has description text but NO Sasia and NO Cmim values,
// it's a continuation of the previous row's description.
//
// Example:
//   Row 1: Barkod=8004260420839, Desc="Regina Provence mix peceta",
//          Njesia=COP, Sasia=1.00, Cmim=183.33, ...
//   Row 2: Desc="letre 38x38 2v 44cp"  (no Sasia, no Cmim)
//   → Merged: Desc="Regina Provence mix peceta letre 38x38 2v 44cp"
//
// ============================================================================

function mergeMultiLineDescriptions(dataRows) {
  const merged = [];

  for (const row of dataRows) {
    const hasSasia = row['Sasi'] && row['Sasi'].trim() !== '';
    const hasCmim = row['Cmim'] && row['Cmim'].trim() !== '';
    const hasDescription = row['Emertim'] && row['Emertim'].trim() !== '';

    // Continuation line: has description but no quantity and no price
    if (!hasSasia && !hasCmim && hasDescription && merged.length > 0) {
      const prevRow = merged[merged.length - 1];
      prevRow['Emertim'] =
        (prevRow['Emertim'] || '') + ' ' + row['Emertim'];
    } else {
      // New data row
      merged.push({ ...row });
    }
  }

  return merged;
}


// ============================================================================
// SECTION 8: ALBANIAN NUMBER FORMAT CLEANING
// ============================================================================
//
// Albanian invoices use European number format:
//   Thousands separator: "." (period)    →  removed
//   Decimal separator:   "," (comma)     →  replaced with "."
//
// Example: "1.500,50" → 1500.50
//
// Some PDFs already store numbers in standard format (period as decimal):
//   "183.33" → 183.33  (no change needed)
//
// Logic:
//   - If the string contains a comma → Albanian format → clean it
//   - If no comma → already standard format → parse as-is
//
// ============================================================================

function cleanAlbanianNumber(str) {
  if (!str || typeof str !== 'string') return str;

  let cleaned = str.trim();

  // Only process strings that look like numbers (digits, dots, commas, spaces)
  if (!/^-?[\d.,\s]+$/.test(cleaned)) return cleaned;

  // Remove whitespace (handles space-as-thousands-separator, used in some locales)
  cleaned = cleaned.replace(/\s/g, '');

  if (cleaned.includes(',') && cleaned.includes('.')) {
    // Both separators present — detect format by which comes last
    const lastComma = cleaned.lastIndexOf(',');
    const lastDot = cleaned.lastIndexOf('.');
    if (lastComma > lastDot) {
      // Albanian format: "1.500,50" → comma is decimal
      cleaned = cleaned.replace(/\./g, '');
      cleaned = cleaned.replace(',', '.');
    } else {
      // English format: "1,080.00" → dot is decimal
      cleaned = cleaned.replace(/,/g, '');
    }
  } else if (cleaned.includes(',')) {
    // Only comma → Albanian decimal separator: "500,50"
    cleaned = cleaned.replace(',', '.');
  }

  const num = parseFloat(cleaned);
  return isNaN(num) ? str : num;
}

// Apply number cleaning to all numeric columns in a data row
function cleanRowNumbers(row) {
  const cleaned = { ...row };
  for (const col of NUMERIC_COLUMNS) {
    if (cleaned[col]) {
      cleaned[col] = cleanAlbanianNumber(cleaned[col]);
    }
  }
  return cleaned;
}


// ============================================================================
// SECTION 9: MAIN PARSE FUNCTION
// ============================================================================
//
// Orchestrates the full parsing pipeline:
//   1. Extract text items from PDF with coordinates
//   2. Locate stop marker ("Gjithsej:") to know where data ends
//   3. Find first data row via barcode pattern
//   4. Detect column positions from first row's content
//   5. Calculate column boundaries (midpoints)
//   6. Extract all data rows, assigning items to columns
//   7. Merge multi-line descriptions
//   8. Clean number formats
//   9. Format output with exact column order + empty Kod column
//
// ============================================================================

async function parsePDF(pdfBuffer) {
  // Step 1: Extract all text items with coordinates
  const items = await extractTextItems(pdfBuffer);

  if (items.length === 0) {
    throw new Error('No text found in PDF. The file may be image-only or corrupted.');
  }

  // Step 2: Find the stop marker ("Gjithsej:") — marks end of invoice data
  const stopItem = items.find(i => i.text.toLowerCase().includes('gjithsej'));
  const stopY = stopItem ? stopItem.y : Infinity;

  // Step 3: Find the first data row — try ALL strategies, pick topmost match
  const candidateYs = [];

  // Strategy 1: Barcode (7-14 digit number before Gjithsej)
  const barcodeItem = items.find(i => /^\d{7,14}$/.test(i.text) && i.y < stopY - Y_TOLERANCE);
  if (barcodeItem) {
    candidateYs.push(barcodeItem.y);
  }

  // Strategy 2: Row number "1" as leftmost item with text + numbers
  const oneItems = items.filter(i =>
    i.text === '1' && i.y < stopY - Y_TOLERANCE
  );
  for (const oneItem of oneItems) {
    const rowItems = items.filter(i =>
      Math.abs(i.y - oneItem.y) <= Y_TOLERANCE
    );
    const sorted = [...rowItems].sort((a, b) => a.x - b.x);
    if (sorted[0].text !== '1') continue;
    const numericCount = rowItems.filter(i =>
      /^[\d.,]+$/.test(i.text) && i !== oneItem
    ).length;
    const hasText = rowItems.some(i => /[a-zA-Z]/.test(i.text));
    if (numericCount >= 2 && hasText && rowItems.length >= 3) {
      candidateYs.push(oneItem.y);
      break;
    }
  }

  let firstDataY = candidateYs.length > 0 ? Math.min(...candidateYs) : null;

  // Strategy 3: Any row before Gjithsej with text + multiple numbers (data pattern)
  if (firstDataY === null) {
    const preStopItems = items.filter(i => i.y < stopY - Y_TOLERANCE);
    const candidateRows = groupItemsIntoRows(preStopItems);
    for (const row of candidateRows) {
      const numericCount = row.items.filter(i => /^[\d.,]+$/.test(i.text)).length;
      const hasText = row.items.some(i => /[a-zA-Z]/.test(i.text));
      if (numericCount >= 3 && hasText && row.items.length >= 4) {
        firstDataY = row.y;
        break;
      }
    }
  }

  if (firstDataY === null) {
    throw new Error('Nuk u gjet tabela e fatures ne PDF.');
  }

  // Step 4: Collect items in the first data row (same Y ± tolerance)
  const firstRowItems = items.filter(i =>
    Math.abs(i.y - firstDataY) <= Y_TOLERANCE
  );

  // Step 5: Detect column positions by classifying first row items
  const columns = detectColumnsFromFirstRow(firstRowItems);

  if (columns.length < 2) {
    throw new Error('Nuk u gjeten kolona te mjaftueshme ne tabelen e fatures.');
  }

  // Step 6: Calculate column boundaries (midpoint between adjacent columns)
  const boundaries = calculateColumnBoundaries(columns);

  // Step 7: Collect all items in the data area (first row → stop marker)
  const dataItems = items.filter(i =>
    i.y >= firstDataY - Y_TOLERANCE &&
    i.y < stopY - Y_TOLERANCE
  );

  // Step 8: Group data items into rows by Y coordinate
  const rows = groupItemsIntoRows(dataItems);

  // Step 9: For each row, assign items to columns
  const dataRows = [];

  for (const row of rows) {
    // Check for stop keywords in row text
    const rowText = row.items.map(i => i.text.toLowerCase()).join(' ');
    const isStopRow = STOP_KEYWORDS.some(kw => rowText.includes(kw));
    if (isStopRow) break;

    // Sort items left-to-right for correct text concatenation order
    row.items.sort((a, b) => a.x - b.x);

    // Assign each item to its column based on X position
    const rowData = {};
    for (const item of row.items) {
      const col = assignToColumn(item.x, boundaries);
      if (col.skip) continue; // Skip Nr column

      // Clip text if it overflows into the next column
      // This handles cases where the PDF renders a description as one long
      // text item that visually extends past its column boundary
      let text = item.text;
      if (item.width > 0) {
        const colIndex = boundaries.indexOf(col);
        const nextCol = boundaries[colIndex + 1];
        if (nextCol) {
          text = clipOverflowText(text, item.x, item.width, nextCol.x);
        }
      }

      if (!text) continue;

      // Concatenate if multiple items in the same column
      // (e.g., multi-word description split into separate PDF text items)
      if (rowData[col.name]) {
        rowData[col.name] += ' ' + text;
      } else {
        rowData[col.name] = text;
      }
    }

    // Skip empty rows
    if (Object.keys(rowData).length === 0) continue;

    // Stop if row has only numeric values (summary/total row)
    // Emertim is enough — Barkod can be empty
    const hasTextContent = rowData['Emertim'];
    if (!hasTextContent) break;

    dataRows.push(rowData);
  }

  // Step 10: Merge multi-line descriptions
  const mergedRows = mergeMultiLineDescriptions(dataRows);

  // Step 11: Clean Albanian number format in numeric columns
  const cleanedRows = mergedRows.map(row => cleanRowNumbers(row));

  // Step 12: Build final output with exact column order
  const finalRows = cleanedRows.map(row => {
    const output = {};
    for (const col of OUTPUT_COLUMNS) {
      if (col === 'Kod') {
        output[col] = ''; // Kod is always empty
      } else {
        output[col] = row[col] !== undefined ? row[col] : '';
      }
    }
    return output;
  });

  return finalRows;
}


module.exports = { parsePDF, OUTPUT_COLUMNS };
