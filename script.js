let errorData = [];

// --- テーマ切替処理 ---
const themeToggle = document.getElementById('themeToggle');
const rootElement = document.documentElement;

// 保存されたテーマ、またはOSの設定を確認
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

// --- エラー検索処理 ---
fetch('errors.json')
  .then(response => response.json())
  .then(data => {
    errorData = data;
    renderResults(errorData);
  });

const searchInput = document.getElementById('searchInput');
const resultsDiv = document.getElementById('results');

searchInput.addEventListener('input', (e) => {
  const query = e.target.value.trim().toLowerCase();
  
  if (!query) {
    renderResults(errorData);
    return;
  }

  const filtered = errorData.filter(item => 
    item.code.toLowerCase().includes(query) ||
    item.category.toLowerCase().includes(query) ||
    item.summary.toLowerCase().includes(query) ||
    item.cause.toLowerCase().includes(query) ||
    item.solution.toLowerCase().includes(query)
  );

  renderResults(filtered);
});

function renderResults(items) {
  if (items.length === 0) {
    resultsDiv.innerHTML = '<p class="no-result">該当するエラーコードが見つかりませんでした。</p>';
    return;
  }

  resultsDiv.innerHTML = items.map(item => `
    <div class="card">
      <div class="card-header">
        <span class="code">${item.code}</span>
        <span class="category">${item.category}</span>
      </div>
      <h2>${item.summary}</h2>
      <p><strong>【原因】</strong> ${item.cause}</p>
      <p><strong>【対処法】</strong> ${item.solution}</p>
    </div>
  `).join('');
}
