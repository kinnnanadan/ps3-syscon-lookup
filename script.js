let errorData = [];

// JSONデータの読み込み
fetch('errors.json')
  .then(response => response.json())
  .then(data => {
    errorData = data;
    renderResults(errorData); // 初期表示で全件表示（不要なら空配列 [] にする）
  });

const searchInput = document.getElementById('searchInput');
const resultsDiv = document.getElementById('results');

// 入力のたびにリアルタイム検索
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

// 結果の描画
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
