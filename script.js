// ==========================================
// PS3 Dev Wiki 日本語版 読み込み・描画処理
// ==========================================
let wikiArticles = [];
let activeWikiId = null;

const wikiArticleTabs = document.getElementById('wikiArticleTabs');
const wikiArticleContainer = document.getElementById('wikiArticleContainer');

if (wikiArticleTabs && wikiArticleContainer) {
  fetch('wiki.json', { cache: 'no-store' })
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTPエラー (${response.status}): wiki.json が見つかりません`);
      }
      return response.json();
    })
    .then(data => {
      wikiArticles = data;
      if (wikiArticles.length > 0) {
        activeWikiId = wikiArticles[0].id;
        renderWikiTabs();
        renderWikiArticle(activeWikiId);
      }
    })
    .catch(err => {
      wikiArticleContainer.innerHTML = `
        <div class="warning-box">
          <strong>Wikiデータの読み込みに失敗しました（wiki.json の書式を確認してください）</strong><br>
          詳細: ${err.message}
        </div>
      `;
    });
}

function renderWikiTabs() {
  wikiArticleTabs.innerHTML = wikiArticles.map(article => `
    <button
      type="button"
      class="wiki-tab-btn ${article.id === activeWikiId ? 'active' : ''}"
      data-wiki-id="${article.id}"
    >
      ${article.title}
    </button>
  `).join('');

  wikiArticleTabs.querySelectorAll('.wiki-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      activeWikiId = btn.getAttribute('data-wiki-id');
      renderWikiTabs();
      renderWikiArticle(activeWikiId);
    });
  });
}

function renderWikiArticle(articleId) {
  const article = wikiArticles.find(a => a.id === articleId);
  if (!article) return;

  // 目次の自動生成
  const tocHtml = article.sections && article.sections.length > 1
    ? `
      <nav class="wiki-toc" aria-label="目次">
        <div class="wiki-toc-title">目次</div>
        <ul>
          ${article.sections.map((sec, idx) => `
            <li><a href="#wiki-sec-${idx}">${sec.heading}</a></li>
          `).join('')}
        </ul>
      </nav>
    `
    : '';

  // 各セクションの描画
  const sectionsHtml = (article.sections || []).map((sec, idx) => {
    const paragraphsHtml = (sec.paragraphs || []).map(p => `<p>${p}</p>`).join('');

    let tableHtml = '';
    if (sec.table && sec.table.headers && sec.table.rows) {
      const ths = sec.table.headers.map(h => `<th>${h}</th>`).join('');
      const trs = sec.table.rows.map(row => `
        <tr>
          ${row.map((cell, cIdx) => `<td class="${cIdx === 0 ? 'mono' : ''}">${cell}</td>`).join('')}
        </tr>
      `).join('');
      tableHtml = `
        <div class="table-wrapper" style="margin: 12px 0;">
          <table class="ref-table">
            <thead><tr>${ths}</tr></thead>
            <tbody>${trs}</tbody>
          </table>
        </div>
      `;
    }

    const warningHtml = sec.warning
      ? `<div class="warning-box">${sec.warning}</div>`
      : '';

    return `
      <section class="wiki-section" id="wiki-sec-${idx}">
        <h2>${sec.heading}</h2>
        ${paragraphsHtml}
        ${tableHtml}
        ${warningHtml}
      </section>
    `;
  }).join('');

  wikiArticleContainer.innerHTML = `
    <article class="wiki-article">
      <h2 class="wiki-article-title">${article.title}</h2>
      <div class="wiki-meta-box">
        <strong>出典元:</strong> <a href="${article.sourceUrl}" target="_blank" rel="noopener noreferrer" class="wrap-link">${article.sourceTitle}</a><br>
        <strong>最終更新:</strong> ${article.lastUpdated} ／ <strong>ライセンス:</strong> <a href="https://www.gnu.org/licenses/old-licenses/fdl-1.2.html" target="_blank" rel="noopener noreferrer" class="wrap-link">GNU Free Documentation License 1.2 (GFDL 1.2)</a><br>
        ${article.licenseNote}
      </div>

      <p>${article.lead}</p>
      ${tocHtml}
      ${sectionsHtml}

      <div class="wiki-license-footer">
        本ページの内容は <a href="${article.sourceUrl}" target="_blank" rel="noopener noreferrer" class="wrap-link">${article.sourceTitle}</a> を翻訳・再構成したものであり、<a href="https://www.gnu.org/licenses/old-licenses/fdl-1.2.html" target="_blank" rel="noopener noreferrer" class="wrap-link">GNU Free Documentation License 1.2</a> の条件のもとで提供されます。
      </div>
    </article>
  `;
}
