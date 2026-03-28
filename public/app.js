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

// Currently selected file
let selectedFile = null;


// ---------------------------------------------------------------------------
// UTILITY: Format file size for display
// ---------------------------------------------------------------------------

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}


// ---------------------------------------------------------------------------
// RESET UI
// ---------------------------------------------------------------------------

function resetUI() {
  selectedFile = null;
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
}


// ---------------------------------------------------------------------------
// FILE SELECTION
// ---------------------------------------------------------------------------

// Click on upload area → open file dialog
uploadArea.addEventListener('click', (e) => {
  if (e.target === clearFile || clearFile.contains(e.target)) return;
  fileInput.click();
});

// File selected via dialog
fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) {
    selectFile(fileInput.files[0]);
  }
});

// Drag & drop support
uploadArea.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadArea.classList.add('dragover');
});

uploadArea.addEventListener('dragleave', () => {
  uploadArea.classList.remove('dragover');
});

uploadArea.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadArea.classList.remove('dragover');

  const file = e.dataTransfer.files[0];
  if (file && file.name.toLowerCase().endsWith('.pdf')) {
    selectFile(file);
  } else {
    showStatus('Vetem skedare PDF pranohen.', 'error');
  }
});

// Update UI when a file is selected
function selectFile(file) {
  // Client-side size check
  if (file.size > 50 * 1024 * 1024) {
    showStatus('Skedari eshte shume i madh (max 50 MB).', 'error');
    return;
  }

  selectedFile = file;
  fileName.textContent = file.name;
  fileSize.textContent = formatSize(file.size);
  fileInfo.style.display = 'block';
  uploadArea.classList.add('has-file');
  exportBtn.disabled = false;
  resetBtn.style.display = 'none';
  clearFile.style.display = 'block';
  exportResult.classList.remove('show');
  uploadIcon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
  uploadText.textContent = 'PDF u zgjodh';
  hideStatus();
}


// ---------------------------------------------------------------------------
// CLEAR & RESET BUTTONS
// ---------------------------------------------------------------------------

clearFile.addEventListener('click', (e) => {
  e.stopPropagation();
  resetUI();
});

resetBtn.addEventListener('click', () => {
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
  const urlEl = document.getElementById('publicUrl');
  const copyBtn = document.getElementById('copyBtn');

  // If accessed via HTTPS → already deployed, show current URL
  if (window.location.protocol === 'https:') {
    urlEl.textContent = window.location.origin;
    urlEl.classList.remove('loading');
    copyBtn.disabled = false;
    return;
  }

  // Local mode → poll for ngrok tunnel URL
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch('/api/tunnel-url');
      const data = await res.json();
      if (data.url) {
        urlEl.textContent = data.url;
        urlEl.classList.remove('loading');
        copyBtn.disabled = false;
        return;
      }
    } catch (_) {}
    await new Promise(r => setTimeout(r, 3000));
  }
  urlEl.textContent = 'Nuk u krijua linku';
}

function copyLink() {
  const url = document.getElementById('publicUrl').textContent;
  navigator.clipboard.writeText(url).then(() => {
    const btn = document.getElementById('copyBtn');
    btn.textContent = 'U kopjua!';
    setTimeout(() => { btn.textContent = 'Kopjo'; }, 2000);
  });
}

loadPublicUrl();


// ---------------------------------------------------------------------------
// EXPORT: Upload PDF → Download Excel
// ---------------------------------------------------------------------------

exportBtn.addEventListener('click', async () => {
  if (!selectedFile) return;

  exportBtn.disabled = true;
  exportResult.classList.remove('show');
  showStatus('Duke procesuar faturen...', 'loading');

  try {
    const formData = new FormData();
    formData.append('pdf', selectedFile);

    const response = await fetch('/api/parse', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Gabim gjate procesimit te PDF');
    }

    // Read row count from response header
    const rowCount = response.headers.get('X-Row-Count') || '?';

    // Download the Excel file
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const outputName = selectedFile.name.replace(/\.pdf$/i, '') + '_parsed.xlsx';

    const link = document.createElement('a');
    link.href = url;
    link.download = outputName;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, 1000);

    // Show success
    showStatus('Skedari Excel u shkarkua me sukses!', 'success');

    // Show export results card
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
});
