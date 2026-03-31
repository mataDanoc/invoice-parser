// ============================================================================
// app.js — Frontend Logic for Invoice Parser
// ============================================================================

// --- DOM Elements ---
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const fileInfo = document.getElementById('fileInfo');
const fileName = document.getElementById('fileName');
const fileSize = document.getElementById('fileSize');
const exportBtn = document.getElementById('exportBtn');
const resetBtn = document.getElementById('resetBtn');
const clearFile = document.getElementById('clearFile');
const uploadIcon = document.getElementById('uploadIcon');
const uploadText = document.getElementById('uploadText');
const status = document.getElementById('status');
const exportResult = document.getElementById('exportResult');

// Combo mode elements
const modePdfBtn = document.getElementById('modePdf');
const modeComboBtn = document.getElementById('modeCombo');
const pdfLabel = document.getElementById('pdfLabel');
const excelLabel = document.getElementById('excelLabel');
const excelUploadArea = document.getElementById('excelUploadArea');
const excelInput = document.getElementById('excelInput');
const excelUploadIcon = document.getElementById('excelUploadIcon');
const excelUploadText = document.getElementById('excelUploadText');
const excelFileInfo = document.getElementById('excelFileInfo');
const excelFileName = document.getElementById('excelFileName');
const excelFileSize = document.getElementById('excelFileSize');
const clearExcel = document.getElementById('clearExcel');

// State
let selectedFile = null;
let selectedExcel = null;
let currentMode = 'pdf'; // 'pdf' or 'combo'


// ---------------------------------------------------------------------------
// UTILITY: Format file size for display
// ---------------------------------------------------------------------------

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}


// ---------------------------------------------------------------------------
// MODE TOGGLE
// ---------------------------------------------------------------------------

modePdfBtn.addEventListener('click', function() {
  if (currentMode === 'pdf') return;
  currentMode = 'pdf';
  modePdfBtn.classList.add('active');
  modeComboBtn.classList.remove('active');

  // Hide combo elements
  pdfLabel.style.display = 'none';
  excelLabel.style.display = 'none';
  excelUploadArea.style.display = 'none';
  uploadArea.classList.remove('compact');

  // Reset everything
  resetUI();
});

modeComboBtn.addEventListener('click', function() {
  if (currentMode === 'combo') return;
  currentMode = 'combo';
  modeComboBtn.classList.add('active');
  modePdfBtn.classList.remove('active');

  // Show combo elements
  pdfLabel.style.display = 'block';
  excelLabel.style.display = 'block';
  excelUploadArea.style.display = '';
  uploadArea.classList.add('compact');

  // Reset everything
  resetUI();
});


// ---------------------------------------------------------------------------
// RESET UI
// ---------------------------------------------------------------------------

function resetUI() {
  selectedFile = null;
  selectedExcel = null;
  fileName.textContent = '';
  fileSize.textContent = '';
  fileInfo.style.display = 'none';
  uploadArea.classList.remove('has-file');
  exportBtn.disabled = true;
  exportBtn.textContent = 'Eksporto ne Excel';
  resetBtn.style.display = 'none';
  clearFile.style.display = 'none';
  fileInput.value = '';
  exportResult.classList.remove('show');
  uploadIcon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="#475569" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>';
  uploadText.textContent = 'Kliko ose terhiq skedarin PDF ketu';
  hideStatus();

  // Reset Excel area
  excelFileName.textContent = '';
  excelFileSize.textContent = '';
  excelFileInfo.style.display = 'none';
  excelUploadArea.classList.remove('has-file');
  clearExcel.style.display = 'none';
  excelInput.value = '';
  excelUploadIcon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="#475569" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>';
  excelUploadText.textContent = 'Kliko ose terhiq skedarin Excel ketu';
}


// ---------------------------------------------------------------------------
// CHECK IF EXPORT SHOULD BE ENABLED
// ---------------------------------------------------------------------------

function checkReady() {
  if (currentMode === 'pdf') {
    exportBtn.disabled = !selectedFile;
  } else {
    exportBtn.disabled = !(selectedFile && selectedExcel);
  }
}


// ---------------------------------------------------------------------------
// PDF FILE SELECTION
// ---------------------------------------------------------------------------

uploadArea.addEventListener('click', function(e) {
  if (e.target === clearFile || clearFile.contains(e.target)) return;
  fileInput.click();
});

fileInput.addEventListener('change', function() {
  if (fileInput.files[0]) {
    selectFile(fileInput.files[0]);
  }
});

uploadArea.addEventListener('dragover', function(e) {
  e.preventDefault();
  uploadArea.classList.add('dragover');
});

uploadArea.addEventListener('dragleave', function() {
  uploadArea.classList.remove('dragover');
});

uploadArea.addEventListener('drop', function(e) {
  e.preventDefault();
  uploadArea.classList.remove('dragover');

  var file = e.dataTransfer.files[0];
  if (file && file.name.toLowerCase().endsWith('.pdf')) {
    selectFile(file);
  } else {
    showStatus('Vetem skedare PDF pranohen.', 'error');
  }
});

function selectFile(file) {
  if (file.size > 50 * 1024 * 1024) {
    showStatus('Skedari eshte shume i madh (max 50 MB).', 'error');
    return;
  }

  selectedFile = file;
  fileName.textContent = file.name;
  fileSize.textContent = formatSize(file.size);
  fileInfo.style.display = 'block';
  uploadArea.classList.add('has-file');
  resetBtn.style.display = 'none';
  clearFile.style.display = 'block';
  exportResult.classList.remove('show');
  uploadIcon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
  uploadText.textContent = 'PDF u zgjodh';
  hideStatus();
  checkReady();
}


// ---------------------------------------------------------------------------
// EXCEL FILE SELECTION (combo mode)
// ---------------------------------------------------------------------------

excelUploadArea.addEventListener('click', function(e) {
  if (e.target === clearExcel || clearExcel.contains(e.target)) return;
  excelInput.click();
});

excelInput.addEventListener('change', function() {
  if (excelInput.files[0]) {
    selectExcel(excelInput.files[0]);
  }
});

excelUploadArea.addEventListener('dragover', function(e) {
  e.preventDefault();
  excelUploadArea.classList.add('dragover');
});

excelUploadArea.addEventListener('dragleave', function() {
  excelUploadArea.classList.remove('dragover');
});

excelUploadArea.addEventListener('drop', function(e) {
  e.preventDefault();
  excelUploadArea.classList.remove('dragover');

  var file = e.dataTransfer.files[0];
  if (file && /\.(xlsx|xls)$/i.test(file.name)) {
    selectExcel(file);
  } else {
    showStatus('Vetem skedare Excel (.xlsx, .xls) pranohen.', 'error');
  }
});

function selectExcel(file) {
  if (file.size > 50 * 1024 * 1024) {
    showStatus('Skedari eshte shume i madh (max 50 MB).', 'error');
    return;
  }

  selectedExcel = file;
  excelFileName.textContent = file.name;
  excelFileSize.textContent = formatSize(file.size);
  excelFileInfo.style.display = 'block';
  excelUploadArea.classList.add('has-file');
  clearExcel.style.display = 'block';
  exportResult.classList.remove('show');
  excelUploadIcon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
  excelUploadText.textContent = 'Excel u zgjodh';
  hideStatus();
  checkReady();
}


// ---------------------------------------------------------------------------
// CLEAR & RESET BUTTONS
// ---------------------------------------------------------------------------

clearFile.addEventListener('click', function(e) {
  e.stopPropagation();
  selectedFile = null;
  fileName.textContent = '';
  fileSize.textContent = '';
  fileInfo.style.display = 'none';
  uploadArea.classList.remove('has-file');
  clearFile.style.display = 'none';
  fileInput.value = '';
  uploadIcon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="#475569" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>';
  uploadText.textContent = 'Kliko ose terhiq skedarin PDF ketu';
  checkReady();
});

clearExcel.addEventListener('click', function(e) {
  e.stopPropagation();
  selectedExcel = null;
  excelFileName.textContent = '';
  excelFileSize.textContent = '';
  excelFileInfo.style.display = 'none';
  excelUploadArea.classList.remove('has-file');
  clearExcel.style.display = 'none';
  excelInput.value = '';
  excelUploadIcon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="#475569" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>';
  excelUploadText.textContent = 'Kliko ose terhiq skedarin Excel ketu';
  checkReady();
});

resetBtn.addEventListener('click', function() {
  resetUI();
});


// ---------------------------------------------------------------------------
// STATUS MESSAGES
// ---------------------------------------------------------------------------

function showStatus(message, type) {
  status.className = 'status ' + type;
  status.style.display = '';
  if (type === 'loading') {
    status.innerHTML = '<span class="spinner"></span>' + message;
  } else {
    status.textContent = message;
  }
}

function hideStatus() {
  status.className = 'status';
  status.style.display = 'none';
}


// ---------------------------------------------------------------------------
// PUBLIC URL — shows deployed URL or ngrok tunnel for local mode
// ---------------------------------------------------------------------------

async function loadPublicUrl() {
  var urlEl = document.getElementById('publicUrl');
  var copyBtn = document.getElementById('copyBtn');

  if (window.location.protocol === 'https:') {
    urlEl.textContent = window.location.origin;
    urlEl.classList.remove('loading');
    copyBtn.disabled = false;
    return;
  }

  for (var i = 0; i < 30; i++) {
    try {
      var res = await fetch('/api/tunnel-url');
      var data = await res.json();
      if (data.url) {
        urlEl.textContent = data.url;
        urlEl.classList.remove('loading');
        copyBtn.disabled = false;
        return;
      }
    } catch (_) {}
    await new Promise(function(r) { setTimeout(r, 3000); });
  }
  urlEl.textContent = 'Nuk u krijua linku';
}

function copyLink() {
  var url = document.getElementById('publicUrl').textContent;
  navigator.clipboard.writeText(url).then(function() {
    var btn = document.getElementById('copyBtn');
    btn.textContent = 'U kopjua!';
    setTimeout(function() { btn.textContent = 'Kopjo'; }, 2000);
  });
}

loadPublicUrl();


// ---------------------------------------------------------------------------
// EXPORT: Upload PDF (or PDF + Excel) → Download Excel
// ---------------------------------------------------------------------------

exportBtn.addEventListener('click', async function() {
  if (currentMode === 'pdf') {
    await exportPdfOnly();
  } else {
    await exportCombo();
  }
});

// --- PDF-only export ---
async function exportPdfOnly() {
  if (!selectedFile) return;

  exportBtn.disabled = true;
  exportResult.classList.remove('show');
  showStatus('Duke procesuar faturen...', 'loading');

  try {
    var formData = new FormData();
    formData.append('pdf', selectedFile);

    var response = await fetch('/api/parse', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      var errorData = await response.json().catch(function() { return {}; });
      throw new Error(errorData.error || 'Gabim gjate procesimit te PDF');
    }

    var rowCount = response.headers.get('X-Row-Count') || '?';

    var blob = await response.blob();
    var url = URL.createObjectURL(blob);
    var outputName = selectedFile.name.replace(/\.pdf$/i, '') + '_parsed.xlsx';

    downloadBlob(url, outputName);

    showStatus('Skedari Excel u shkarkua me sukses!', 'success');
    document.getElementById('resultRowCount').textContent = rowCount;
    document.getElementById('resultFileName').textContent = outputName;
    exportResult.classList.add('show');

    resetBtn.style.display = 'block';
    exportBtn.disabled = true;
  } catch (error) {
    console.error('Export error:', error);
    showStatus(error.message || 'Gabim gjate procesimit', 'error');
    exportBtn.disabled = false;
  }
}

// --- Combo export (PDF + Excel) ---
async function exportCombo() {
  if (!selectedFile || !selectedExcel) return;

  exportBtn.disabled = true;
  exportResult.classList.remove('show');
  showStatus('Duke kombinuar PDF + Excel...', 'loading');

  try {
    var formData = new FormData();
    formData.append('pdf', selectedFile);
    formData.append('excel', selectedExcel);

    var response = await fetch('/api/parse-combo', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      var errorData = await response.json().catch(function() { return {}; });
      throw new Error(errorData.error || 'Gabim gjate procesimit te PDF + Excel');
    }

    var rowCount = response.headers.get('X-Row-Count') || '?';

    var blob = await response.blob();
    var url = URL.createObjectURL(blob);
    var outputName = selectedFile.name.replace(/\.pdf$/i, '') + '_combined.xlsx';

    downloadBlob(url, outputName);

    showStatus('Skedari Excel u shkarkua me sukses!', 'success');
    document.getElementById('resultRowCount').textContent = rowCount;
    document.getElementById('resultFileName').textContent = outputName;
    exportResult.classList.add('show');

    resetBtn.style.display = 'block';
    exportBtn.disabled = true;
  } catch (error) {
    console.error('Combo error:', error);
    showStatus(error.message || 'Gabim gjate procesimit', 'error');
    exportBtn.disabled = false;
  }
}

// --- Shared download helper ---
function downloadBlob(url, filename) {
  var link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  setTimeout(function() {
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, 1000);
}
