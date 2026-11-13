let errorData = [];
let selectedRanges = new Set();
let selectedTags = new Set();

// --- テーマ切替処理（PCサイドバー・スマホヘッダー両対応） ---
const themeToggle = document.getElementById('themeToggle');
const themeToggleMobile = document.getElementById('themeToggleMobile');
const rootElement = document.documentElement;

const savedTheme = localStorage.getItem('theme');
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
const initialTheme = savedTheme || (prefersDark ? 'dark' : 'light');

applyTheme(initialTheme);

function toggleTheme() {
  const currentTheme = rootElement.getAttribute('data-theme');
  const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
  applyTheme(nextTheme);
  localStorage.setItem('theme', nextTheme);
}

themeToggle.addEventListener('click', toggleTheme);
if (themeToggleMobile) {
  themeToggleMobile.addEventListener('click', toggleTheme);
}

function applyTheme(theme) {
  if (theme === 'dark') {
    rootElement.setAttribute('data-theme', 'dark');
    themeToggle.textContent = '☀️ ライト';
    if (themeToggleMobile) themeToggleMobile.textContent = '☀️';
  } else {
    rootElement.removeAttribute('data-theme');
    themeToggle.textContent = '🌙 ダーク';
    if (themeToggleMobile) themeToggleMobile.textContent = '🌙';
  }
}

// --- 文字・アイコンサイズ切替処理（中 -> 大 -> 小 の順で切替） ---
const fontSizeToggle = document.getElementById('fontSizeToggle');
const fontSizeToggleMobile = document.getElementById('fontSizeToggleMobile');
const fontSizes = ['medium', 'large', 'small'];
const fontSizeLabels = {
  small: '文字:小',
  medium: '文字:中',
  large: '文字:大'
};

const savedFontSize = localStorage.getItem('fontSize');
const initialFontSize = fontSizes.includes(savedFontSize) ? savedFontSize : 'medium';
applyFontSize(initialFontSize);

function cycleFontSize() {
  const current = rootElement.getAttribute('data-font-size') || 'medium';
  const nextIndex = (fontSizes.indexOf(current) + 1) % fontSizes.length;
  const nextSize = fontSizes[nextIndex];
  applyFontSize(nextSize);
  localStorage.setItem('fontSize', nextSize);
}

function applyFontSize(size) {
  rootElement.setAttribute('data-font-size', size);
  const label = fontSizeLabels[size] || '文字:中';
  if (fontSizeToggle) fontSizeToggle.textContent = label;
  if (fontSizeToggleMobile) fontSizeToggleMobile.textContent = label;
}

if (fontSizeToggle) fontSizeToggle.addEventListener('click', cycleFontSize);
if (fontSizeToggleMobile) fontSizeToggleMobile.addEventListener('click', cycleFontSize);

// --- スマホ用サイドメニュー開閉処理 ---
const sidebar = document.getElementById('sidebar');
const sidebarOverlay = document.getElementById('sidebarOverlay');
const menuToggle = document.getElementById('menuToggle');
const menuClose = document.getElementById('menuClose');

function openSidebar() {
  sidebar.classList.add('open');
  sidebarOverlay.classList.add('open');
}

function closeSidebar() {
  sidebar.classList.remove('open');
  sidebarOverlay.classList.remove('open');
}

if (menuToggle) menuToggle.addEventListener('click', openSidebar);
if (menuClose) menuClose.addEventListener('click', closeSidebar);
if (sidebarOverlay) sidebarOverlay.addEventListener('click', closeSidebar);

// --- 画面切り替え（ルーター）処理 ---
const navItems = document.querySelectorAll('.nav-item');
const pageViews = document.querySelectorAll('.page-view');

function switchView(viewName) {
  const targetView = document.getElementById(`view-${viewName}`);
  const activeName = targetView ? viewName : 'home';

  pageViews.forEach(view => {
    view.classList.toggle('active', view.id === `view-${activeName}`);
  });

  navItems.forEach(item => {
    item.classList.toggle('active', item.getAttribute('data-view') === activeName);
  });

  closeSidebar();
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function handleHashChange() {
  const hash = window.location.hash.replace('#', '');
  switchView(hash || 'home');
}

window.addEventListener('hashchange', handleHashChange);
handleHashChange();

// --- 全角英数字・記号を半角小文字へ正規化する関数 ---
function normalizeText(str) {
  if (!str) return '';
  return str
    .replace(/[！-～]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
    .replace(/　/g, ' ')
    .toLowerCase();
}

// --- Syscon エラー検索処理 ---
const searchInput = document.getElementById('searchInput');
const clearBtn = document.getElementById('clearBtn');
const rangeFilterBtns = document.querySelectorAll('#rangeFilterBar .filter-btn');
const tagFilterBtns = document.querySelectorAll('#tagFilterBar .filter-btn');
const resultsDiv = document.getElementById('results');
const resultCount = document.getElementById('resultCount');

fetch('errors.json', { cache: 'no-store' })
  .then(response => {
    if (!response.ok) {
      throw new Error(`HTTPエラー (${response.status}): errors.json が見つかりません`);
    }
    return response.json();
  })
  .then(data => {
    errorData = data;
    updateView();
  })
  .catch(err => {
    resultCount.textContent = '読み込みエラー';
    resultsDiv.innerHTML = `
      <div class="warning-box">
        <strong>データの読み込みに失敗しました（errors.json の書式ミスの可能性があります）</strong><br>
        詳細: ${err.message}
      </div>
    `;
  });

searchInput.addEventListener('input', () => {
  toggleClearButton();
  updateView();
});

clearBtn.addEventListener('click', () => {
  searchInput.value = '';
  toggleClearButton();
  searchInput.focus();
  updateView();
});

function toggleClearButton() {
  if (searchInput.value.length > 0) {
    clearBtn.classList.remove('hidden');
  } else {
    clearBtn.classList.add('hidden');
  }
}

function setupMultiFilter(buttons, attrName, selectedSet) {
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      const val = btn.getAttribute(attrName);

      if (val === 'all') {
        selectedSet.clear();
      } else {
        if (selectedSet.has(val)) {
          selectedSet.delete(val);
        } else {
          selectedSet.add(val);
        }
      }

      buttons.forEach(b => {
        const bVal = b.getAttribute(attrName);
        if (bVal === 'all') {
          b.classList.toggle('active', selectedSet.size === 0);
        } else {
          b.classList.toggle('active', selectedSet.has(bVal));
        }
      });

      updateView();
    });
  });
}

setupMultiFilter(rangeFilterBtns, 'data-range', selectedRanges);
setupMultiFilter(tagFilterBtns, 'data-tag', selectedTags);

function matchesTagFilter(item, fullTextNormalized) {
  if (selectedTags.size === 0) return true;

  for (const tag of selectedTags) {
    if (tag === 'cell' && fullTextNormalized.includes('cell')) return true;
    if (tag === 'rsx' && fullTextNormalized.includes('rsx')) return true;
    if (tag === 'capacitor' && (
      fullTextNormalized.includes('コンデンサ') ||
      fullTextNormalized.includes('プロードライザ') ||
      fullTextNormalized.includes('タンタル')
    )) return true;
  }
  return false;
}

function updateView() {
  const rawInput = searchInput.value;
  const terms = rawInput
    .split(/[,，、]+/)
    .map(t => normalizeText(t).trim())
    .filter(t => t.length > 0);

  const filtered = errorData.filter(item => {
    const shortCode = item.code.slice(-4);
    const matchesRange = (selectedRanges.size === 0) ||
      Array.from(selectedRanges).some(r => shortCode.startsWith(r));

    if (!matchesRange) return false;

    const searchableText = normalizeText([
      item.code,
      item.category,
      item.severityLabel,
      item.summary,
      item.cause,
      item.solution,
      item.warning
    ].filter(Boolean).join(' '));

    if (!matchesTagFilter(item, searchableText)) return false;

    if (terms.length === 0) return true;
    return terms.some(term => searchableText.includes(term));
  });

  renderResults(filtered);
}

function renderResults(items) {
  resultCount.textContent = `${items.length} 件表示`;

  if (items.length === 0) {
    resultsDiv.innerHTML = '<p class="no-result">該当するエラーコードが見つかりませんでした。</p>';
    return;
  }

  const allowedColors = ['red', 'orange', 'yellow', 'teal', 'green'];

  resultsDiv.innerHTML = items.map(item => {
    const color = allowedColors.includes(item.severityColor) ? item.severityColor : 'yellow';
    const label = item.severityLabel || '重症度: 未設定';
    const warningHtml = item.warning ? `<div class="warning-box">${item.warning}</div>` : '';

    return `
      <div class="card">
        <div class="card-header">
          <div class="code-group">
            <span class="code">${item.code}</span>
            <span class="severity-badge badge-${color}">${label}</span>
          </div>
          <span class="category">${item.category}</span>
        </div>
        <h2>${item.summary}</h2>
        <p><strong>【原因】</strong> ${item.cause}</p>
        <p><strong>【対処法】</strong> ${item.solution}</p>
        ${warningHtml}
      </div>
    `;
  }).join('');
}

// ==========================================
// ファン制御値計算ツール（% ⇄ 16進数）
// ==========================================
const pctInput = document.getElementById('pctInput');
const hexInput = document.getElementById('hexInput');
const hexOutWithPrefix = document.getElementById('hexOutWithPrefix');
const hexOutPlain = document.getElementById('hexOutPlain');
const decOutFromPct = document.getElementById('decOutFromPct');
const pctOutExact = document.getElementById('pctOutExact');
const pctOutRound = document.getElementById('pctOutRound');
const decOutFromHex = document.getElementById('decOutFromHex');

function convertPctToHex() {
  const normalized = normalizeText(pctInput.value).replace(/%/g, '').trim();
  const val = parseFloat(normalized);

  if (normalized === '' || Number.isNaN(val) || val < 0 || val > 100) {
    hexOutWithPrefix.textContent = '0〜100の数値を入力';
    hexOutWithPrefix.classList.add('error-text');
    hexOutPlain.textContent = '-';
    decOutFromPct.textContent = '-';
    return;
  }

  hexOutWithPrefix.classList.remove('error-text');
  const dec = Math.round((val / 100) * 255);
  const hexPlain = dec.toString(16).toUpperCase().padStart(2, '0');

  hexOutWithPrefix.textContent = `0x${hexPlain}`;
  hexOutPlain.textContent = hexPlain;
  decOutFromPct.textContent = `${dec}`;
}

function convertHexToPct() {
  let normalized = normalizeText(hexInput.value).trim();
  if (normalized.startsWith('0x')) {
    normalized = normalized.slice(2);
  }

  if (normalized === '' || !/^[0-9a-f]+$/.test(normalized)) {
    pctOutExact.textContent = '00〜FFの16進数を入力';
    pctOutExact.classList.add('error-text');
    pctOutRound.textContent = '-';
    decOutFromHex.textContent = '-';
    return;
  }

  const dec = parseInt(normalized, 16);
  if (dec < 0 || dec > 255) {
    pctOutExact.textContent = '0x00〜0xFFの範囲で入力';
    pctOutExact.classList.add('error-text');
    pctOutRound.textContent = '-';
    decOutFromHex.textContent = '-';
    return;
  }

  pctOutExact.classList.remove('error-text');
  const exactPct = (dec / 255) * 100;
  const roundPct = Math.round(exactPct);

  pctOutExact.textContent = `${exactPct.toFixed(1)}%`;
  pctOutRound.textContent = `${roundPct}%`;
  decOutFromHex.textContent = `${dec}`;
}

if (pctInput && hexInput) {
  pctInput.addEventListener('input', convertPctToHex);
  hexInput.addEventListener('input', convertHexToPct);

  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.hasAttribute('data-pct')) {
        pctInput.value = btn.getAttribute('data-pct');
        convertPctToHex();
      } else if (btn.hasAttribute('data-hex')) {
        hexInput.value = btn.getAttribute('data-hex');
        convertHexToPct();
      }
    });
  });

  document.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-copy-target');
      const targetEl = document.getElementById(targetId);
      if (!targetEl || targetEl.classList.contains('error-text')) return;

      navigator.clipboard.writeText(targetEl.textContent).then(() => {
        const originalText = btn.textContent;
        btn.textContent = 'コピー完了!';
        setTimeout(() => {
          btn.textContent = originalText;
        }, 1200);
      });
    });
  });

  convertPctToHex();
  convertHexToPct();
}

const fanRefTableBody = document.getElementById('fanRefTableBody');
if (fanRefTableBody) {
  const presets = [
    { pct: 20, note: '最低回転目安（SYSCON標準アイドル付近）' },
    { pct: 25, note: '静音重視' },
    { pct: 30, note: '標準冷却目安' },
    { pct: 35, note: 'CFW / 冷却強化目安' },
    { pct: 40, note: '高負荷・夏場向け' },
    { pct: 50, note: '半分出力（かなり風切り音あり）' },
    { pct: 60, note: '強力冷却' },
    { pct: 80, note: '最大付近テスト用' },
    { pct: 100, note: 'フル回転（最大出力）' }
  ];

  fanRefTableBody.innerHTML = presets.map(row => {
    const dec = Math.round((row.pct / 100) * 255);
    const hex = dec.toString(16).toUpperCase().padStart(2, '0');
    return `
      <tr>
        <td class="mono">${row.pct}%</td>
        <td class="mono">0x${hex}</td>
        <td class="mono">${hex}</td>
        <td class="mono">${dec}</td>
        <td>${row.note}</td>
      </tr>
    `;
  }).join('');
}
