// ============================================================================
// app.js — Frontend Logic for Invoice Parser
// ============================================================================

// --- DOM Elements ---
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const fileName = document.getElementById('fileName');
const exportBtn = document.getElementById('exportBtn');
const resetBtn = document.getElementById('resetBtn');
const clearFile = document.getElementById('clearFile');
const uploadIcon = document.getElementById('uploadIcon');
const uploadText = document.getElementById('uploadText');
const status = document.getElementById('status');

// Currently selected file
let selectedFile = null;


// ---------------------------------------------------------------------------
// RESET UI
// ---------------------------------------------------------------------------

function resetUI() {
  selectedFile = null;
  fileName.textContent = '';
  uploadArea.classList.remove('has-file');
  exportBtn.disabled = true;
  exportBtn.textContent = 'Eksporto ne Excel';
  resetBtn.style.display = 'none';
  clearFile.style.display = 'none';
  fileInput.value = '';
  uploadIcon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="#475569" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>';
  uploadText.textContent = 'Kliko ose terhiq skedarin PDF ketu';
  hideStatus();
}


// ---------------------------------------------------------------------------
// FILE SELECTION
// ---------------------------------------------------------------------------

// Click on upload area → open file dialog
uploadArea.addEventListener('click', () => fileInput.click());

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
    showStatus('Ju lutem zgjidhni nje skedar PDF.', 'error');
  }
});

// Update UI when a file is selected
function selectFile(file) {
  selectedFile = file;
  fileName.textContent = file.name;
  uploadArea.classList.add('has-file');
  exportBtn.disabled = false;
  resetBtn.style.display = 'none';
  clearFile.style.display = 'block';
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
  status.style.display = '';          // clear inline hide so CSS class controls visibility
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
// EXPORT: Upload PDF → Download Excel
// ---------------------------------------------------------------------------

exportBtn.addEventListener('click', async () => {
  if (!selectedFile) return;

  // Disable button and show loading state
  exportBtn.disabled = true;
  showStatus('Duke procesuar faturen...', 'loading');

  try {
    // Upload the PDF to the server
    const formData = new FormData();
    formData.append('pdf', selectedFile);

    const response = await fetch('/api/parse', {
      method: 'POST',
      body: formData,
    });

    // Handle errors from server
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to parse PDF');
    }

    // Server returns an Excel file — download it
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);

    // Create a temporary link and click it to trigger download
    const link = document.createElement('a');
    link.href = url;
    link.download = selectedFile.name.replace(/\.pdf$/i, '') + '_parsed.xlsx';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    // Give browser time to start the download before cleanup
    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, 1000);

    showStatus('Skedari Excel u shkarkua me sukses!', 'success');
    resetBtn.style.display = 'block';
    exportBtn.disabled = true;
  } catch (error) {
    showStatus(error.message, 'error');
    exportBtn.disabled = false;
  }
});
