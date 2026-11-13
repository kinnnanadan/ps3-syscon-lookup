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
    themeToggle.textContent = '☀️ ライトモード';
    if (themeToggleMobile) themeToggleMobile.textContent = '☀️';
  } else {
    rootElement.removeAttribute('data-theme');
    themeToggle.textContent = '🌙 ダークモード';
    if (themeToggleMobile) themeToggleMobile.textContent = '🌙';
  }
}

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
  // 存在しないビュー名が指定された場合は home に戻す
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

// ハッシュURL（#home, #search など）の変化を監視
function handleHashChange() {
  const hash = window.location.hash.replace('#', '');
  switchView(hash || 'home');
}

window.addEventListener('hashchange', handleHashChange);
// 初回読み込み時にも現在のURLハッシュを反映
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
