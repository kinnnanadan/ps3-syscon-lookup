let errorData = [];
let selectedRange = 'all';

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

// --- 重症度ラベル定義 ---
const severityMap = {
  critical: { label: '重症度: 高（重度/BGA・内部）', className: 'severity-critical' },
  high:     { label: '重症度: 中〜高（電源・起動系）', className: 'severity-high' },
  medium:   { label: '重症度: 中（熱・外部要因）', className: 'severity-medium' }
};

// --- DOM要素の取得 ---
const searchInput = document.getElementById('searchInput');
const clearBtn = document.getElementById('clearBtn');
const filterBtns = document.querySelectorAll('.filter-btn');
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

// 番台フィルタボタンのクリックイベント
filterBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    filterBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedRange = btn.getAttribute('data-range');
    updateView();
  });
});

// 絞り込みと描画の統合処理
function updateView() {
  const query = searchInput.value.trim().toLowerCase();

  const filtered = errorData.filter(item => {
    // 1. 番台フィルタ判定（下4桁の先頭1文字で判定: 例 A0803034 -> "3"）
    const shortCode = item.code.slice(-4);
    const matchesRange = (selectedRange === 'all') || shortCode.startsWith(selectedRange);

    // 2. キーワード検索判定
    const matchesQuery = !query || (
      item.code.toLowerCase().includes(query) ||
      item.category.toLowerCase().includes(query) ||
      item.summary.toLowerCase().includes(query) ||
      item.cause.toLowerCase().includes(query) ||
      item.solution.toLowerCase().includes(query)
    );

    return matchesRange && matchesQuery;
  });

  renderResults(filtered);
}

function renderResults(items) {
  resultCount.textContent = `${items.length} 件表示`;

  if (items.length === 0) {
    resultsDiv.innerHTML = '<p class="no-result">該当するエラーコードが見つかりませんでした。</p>';
    return;
  }

  resultsDiv.innerHTML = items.map(item => {
    const sev = severityMap[item.severity] || { label: '重症度: 未設定', className: 'severity-medium' };
    return `
      <div class="card">
        <div class="card-header">
          <div class="code-group">
            <span class="code">${item.code}</span>
            <span class="severity-badge ${sev.className}">${sev.label}</span>
          </div>
          <span class="category">${item.category}</span>
        </div>
        <h2>${item.summary}</h2>
        <p><strong>【原因】</strong> ${item.cause}</p>
        <p><strong>【対処法】</strong> ${item.solution}</p>
      </div>
    `;
  }).join('');
}
