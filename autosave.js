// Auto-backup to GitHub on file changes
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = __dirname;
const WATCH_FILES = ['server.js', 'parser.js', 'public/app.js', 'public/index.html', 'start.bat', 'stop.bat'];

let timer = null;

function backup() {
  try {
    execSync('git add -A', { cwd: ROOT, stdio: 'ignore' });
    const status = execSync('git status --porcelain', { cwd: ROOT }).toString().trim();
    if (!status) return; // nothing changed
    const date = new Date().toLocaleString('sq-AL');
    execSync(`git commit -m "Auto-backup: ${date}"`, { cwd: ROOT, stdio: 'ignore' });
    execSync('git push origin master', { cwd: ROOT, stdio: 'ignore' });
    console.log(`[${date}] U ruajt ne GitHub.`);
  } catch (e) {
    // silent fail
  }
}

function scheduleBackup() {
  clearTimeout(timer);
  timer = setTimeout(backup, 5000); // prit 5 sekonda mbas ndryshimit
}

// Monitoro skedarët kryesorë
for (const file of WATCH_FILES) {
  const fullPath = path.join(ROOT, file);
  if (fs.existsSync(fullPath)) {
    fs.watch(fullPath, () => scheduleBackup());
  }
}

console.log('Auto-backup aktiv. Cdo ndryshim ruhet automatikisht ne GitHub.');
