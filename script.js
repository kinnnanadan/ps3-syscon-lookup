let errorData = [];
let selectedRanges = new Set(); // 空のときは「すべて」扱い
let selectedTags = new Set();   // 空のときは「すべて」扱い

// --- テーマ切替処理 ---
const themeToggle = document.getElementById('themeToggle');
const rootElement = document.documentElement;

const savedTheme = localStorage.getItem('theme');
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
const initialTheme = savedTheme || (prefersDark ? 'dark' : 'light');

applyTheme(initialTheme);

themeToggle.addEventListener('click', () => {
  const currentTheme = rootElement.getAttribute('data-theme');
  const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
  applyTheme(nextTheme);
  localStorage.setItem('theme', nextTheme);
});

function applyTheme(theme) {
  if (theme === 'dark') {
    rootElement.setAttribute('data-theme', 'dark');
    themeToggle.textContent = '☀️ ライト';
  } else {
    rootElement.removeAttribute('data-theme');
    themeToggle.textContent = '🌙 ダーク';
  }
}

// --- 全角英数字・記号を半角小文字へ正規化する関数 ---
function normalizeText(str) {
  if (!str) return '';
  return str
    // 全角英数字・記号（！〜～）を半角に変換
    .replace(/[！-～]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
    // 全角スペースを半角スペースに
    .replace(/ /g, ' ')
    .toLowerCase();
}

// --- DOM要素の取得 ---
const searchInput = document.getElementById('searchInput');
const clearBtn = document.getElementById('clearBtn');
const rangeFilterBtns = document.querySelectorAll('#rangeFilterBar .filter-btn');
const tagFilterBtns = document.querySelectorAll('#tagFilterBar .filter-btn');
const resultsDiv = document.getElementById('results');
const resultCount = document.getElementById('resultCount');

// JSONデータの読み込み
fetch('errors.json')
  .then(response => response.json())
  .then(data => {
    errorData = data;
    updateView();
  });

// 検索窓の入力イベント
searchInput.addEventListener('input', () => {
  toggleClearButton();
  updateView();
});

// クリアボタンのクリックイベント
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

// 複数選択トグルの共通セットアップ関数
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

      // ボタンのactive見た目を更新
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

// 部位・部品タグの判定ロジック
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

// 絞り込みと描画の統合処理
function updateView() {
  // カンマ（半角, 全角， 読点、）で分割し、各キーワードを正規化
  const rawInput = searchInput.value;
  const terms = rawInput
    .split(/[,，、]+/)
    .map(t => normalizeText(t).trim())
    .filter(t => t.length > 0);

  const filtered = errorData.filter(item => {
    // 1. 番台フィルタ判定（複数選択時はいずれかに一致）
    const shortCode = item.code.slice(-4);
    const matchesRange = (selectedRanges.size === 0) ||
      Array.from(selectedRanges).some(r => shortCode.startsWith(r));

    if (!matchesRange) return false;

    // 検索対象テキストを結合して正規化
    const searchableText = normalizeText([
      item.code,
      item.category,
      item.severityLabel,
      item.summary,
      item.cause,
      item.solution,
      item.warning
    ].filter(Boolean).join(' '));

    // 2. 部位・部品タグフィルタ判定
    if (!matchesTagFilter(item, searchableText)) return false;

    // 3. カンマ区切りキーワード検索判定（いずれかのキーワードを含む）
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
