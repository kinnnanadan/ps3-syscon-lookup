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
    .replace(/ /g, ' ')
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
// ==========================================
// 本家 PS3 Dev Wiki 風 Navbox ＆ 日本語記事切り替え機能
// ==========================================
let psdevWikiData = null;
let wikiLinkMode = localStorage.getItem('wikiLinkMode') || 'jp'; // 'jp' または 'en'

if (wikiArticleTabs && wikiArticleContainer) {
  fetch('wiki.json', { cache: 'no-store' })
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTPエラー (${response.status}): wiki.json が見つかりません`);
      }
      return response.json();
    })
    .then(data => {
      if (!data || !data.navboxes) return;
      psdevWikiData = data;
      renderPsdevWikiHome();
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

function renderPsdevWikiHome() {
  const data = psdevWikiData;
  if (!data) return;

  wikiArticleTabs.style.display = 'none';
  const articlesMap = data.articles || {};

  const navboxesHtml = data.navboxes.map(box => {
    const groupsRowsHtml = box.groups.map(group => {
      const rowCount = group.rows.length;

      return group.rows.map((row, idx) => {
        let catCells = '';
        if (idx === 0) {
          if (group.subCategory) {
            catCells = `
              <th class="psdev-cat-cell" rowspan="${rowCount}">${group.category}</th>
              <th class="psdev-subcat-cell" rowspan="${rowCount}">${group.subCategory}</th>
            `;
          } else {
            catCells = `
              <th class="psdev-cat-cell" colspan="2" rowspan="${rowCount}">${group.category}</th>
            `;
          }
        }

        const itemsHtml = row.items.map(item => {
          const hasArticle = Boolean(articlesMap[item.wikiSlug]);
          const hasNoteClass = item.note ? 'has-note' : '';
          const hasJpClass = hasArticle ? 'has-jp-article' : '';
          const redLinkClass = item.redLink ? 'red-link' : '';
          const wikiUrl = `https://www.psdevwiki.com/ps3/${encodeURIComponent(item.wikiSlug)}`;
          const noteAttr = item.note ? `data-note="${item.note.replace(/"/g, '&quot;')}"` : '';

          return `<a href="${wikiUrl}" target="_blank" rel="noopener noreferrer" class="psdev-item-link ${hasNoteClass} ${hasJpClass} ${redLinkClass}" data-item-name="${item.name}" data-slug="${item.wikiSlug}" ${noteAttr}>${item.name}</a>`;
        }).join('<span class="psdev-dot">•</span>');

        return `
          <tr>
            ${catCells}
            <th class="psdev-row-label">${row.label}</th>
            <td class="psdev-items-cell">${itemsHtml}</td>
          </tr>
        `;
      }).join('');
    }).join('');

    return `
      <div class="psdev-navbox">
        <div class="psdev-navbox-header">
          <span class="psdev-ve-links">v • e</span>
          <span class="psdev-navbox-title">${box.originalTitle}</span>
          <span style="width: 24px;"></span>
        </div>
        <div class="psdev-table-wrap">
          <table class="psdev-table">
            <tbody>
              ${groupsRowsHtml}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }).join('');

  wikiArticleContainer.innerHTML = `
    <div class="wiki-mode-bar">
      <span class="wiki-mode-label">項目クリック時の移動先：</span>
      <div class="wiki-mode-switch" role="group" aria-label="リンク遷移先切り替え">
        <button type="button" class="wiki-mode-btn ${wikiLinkMode === 'jp' ? 'active' : ''}" data-mode="jp">🇯🇵 日本語翻訳ページ</button>
        <button type="button" class="wiki-mode-btn ${wikiLinkMode === 'en' ? 'active' : ''}" data-mode="en">🌐 本家 Dev Wiki（英語）</button>
      </div>
    </div>

    <div class="wiki-meta-box">
      <strong>出典元:</strong> <a href="${data.sourceUrl}" target="_blank" rel="noopener noreferrer" class="wrap-link">${data.sourceTitle}</a><br>
      <strong>最終更新:</strong> ${data.lastUpdated} ／ <strong>ライセンス:</strong> <a href="https://www.gnu.org/licenses/old-licenses/fdl-1.2.html" target="_blank" rel="noopener noreferrer" class="wrap-link">GNU Free Documentation License 1.2 (GFDL 1.2)</a><br>
      ※ <strong>下線付きの項目</strong>（CECHAxx / COK-001 など）はサイト内に日本語翻訳記事があります。上のスイッチで「日本語翻訳ページ」と「本家（英語）」をいつでも切り替えられます。
    </div>

    <div id="psdevNoteBanner" class="psdev-note-banner hidden">
      <div id="psdevNoteText"></div>
      <div style="display:flex; gap:6px;">
        <button type="button" id="psdevNoteJpBtn" class="copy-btn">日本語解説を開く</button>
        <a id="psdevNoteExtLink" href="#" target="_blank" rel="noopener noreferrer" class="theme-btn" style="text-decoration:none; padding:7px 10px;">本家Wiki ↗</a>
      </div>
    </div>

    ${navboxesHtml}

    <div class="wiki-license-footer">
      本ページの構成・データは <a href="${data.sourceUrl}" target="_blank" rel="noopener noreferrer" class="wrap-link">${data.sourceTitle}</a> をベースに作成しており、<a href="https://www.gnu.org/licenses/old-licenses/fdl-1.2.html" target="_blank" rel="noopener noreferrer" class="wrap-link">GNU Free Documentation License 1.2</a> の条件のもとで提供されます。
    </div>
  `;

  // モード切替スイッチのイベント
  wikiArticleContainer.querySelectorAll('.wiki-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      wikiLinkMode = btn.getAttribute('data-mode');
      localStorage.setItem('wikiLinkMode', wikiLinkMode);
      wikiArticleContainer.querySelectorAll('.wiki-mode-btn').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-mode') === wikiLinkMode);
      });
    });
  });

  // 各リンクのホバー（簡易メモ表示）＆クリック挙動
  const noteBanner = document.getElementById('psdevNoteBanner');
  const noteText = document.getElementById('psdevNoteText');
  const noteJpBtn = document.getElementById('psdevNoteJpBtn');
  const noteExtLink = document.getElementById('psdevNoteExtLink');

  wikiArticleContainer.querySelectorAll('.psdev-item-link').forEach(link => {
    const slug = link.getAttribute('data-slug');
    const name = link.getAttribute('data-item-name');
    const note = link.getAttribute('data-note');
    const href = link.getAttribute('href');

    if (note) {
      link.addEventListener('mouseenter', () => {
        noteText.innerHTML = `<strong>【${name}】</strong> ${note}`;
        noteExtLink.href = href;
        noteJpBtn.onclick = () => renderInternalWikiArticle(slug, name);
        noteBanner.classList.remove('hidden');
      });
    }

    link.addEventListener('click', (e) => {
      if (wikiLinkMode === 'jp') {
        e.preventDefault();
        renderInternalWikiArticle(slug, name);
      }
      // wikiLinkMode === 'en' の場合はそのまま外部リンク（target="_blank"）が開く
    });
  });
}

// サイト内日本語翻訳ページの描画
function renderInternalWikiArticle(slug, fallbackName) {
  const data = psdevWikiData;
  const article = data && data.articles ? data.articles[slug] : null;
  const extUrl = `https://www.psdevwiki.com/ps3/${encodeURIComponent(slug)}`;

  window.scrollTo({ top: 0, behavior: 'instant' });

  // まだ翻訳記事が登録されていない項目の場合
  if (!article) {
    wikiArticleContainer.innerHTML = `
      <div class="wiki-article-topbar">
        <button type="button" class="wiki-back-btn" id="wikiBackBtn">← 一覧（Navbox）に戻る</button>
        <a href="${extUrl}" target="_blank" rel="noopener noreferrer" class="copy-btn" style="text-decoration:none;">本家 Dev Wiki（英語）を開く ↗</a>
      </div>

      <article class="wiki-article">
        <h2 class="wiki-article-title">${fallbackName || slug}（日本語ページ準備中）</h2>
        <p>この項目の日本語翻訳ページはまだ作成されていません。右上のボタンから本家 PS3 Developer Wiki（英語）の該当ページを直接閲覧できます。</p>
      </article>
    `;

    document.getElementById('wikiBackBtn').addEventListener('click', renderPsdevWikiHome);
    return;
  }

  // スペック表の生成
  let specsHtml = '';
  if (article.specs && article.specs.length > 0) {
    const rowsHtml = article.specs.map(([k, v]) => `
      <tr>
        <th>${k}</th>
        <td>${v}</td>
      </tr>
    `).join('');
    specsHtml = `
      <table class="wiki-spec-table">
        <tbody>${rowsHtml}</tbody>
      </table>
    `;
  }

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

  // 本文セクションの生成
  const sectionsHtml = (article.sections || []).map((sec, idx) => {
    const paragraphsHtml = (sec.paragraphs || []).map(p => `<p>${p}</p>`).join('');
    const warningHtml = sec.warning ? `<div class="warning-box">${sec.warning}</div>` : '';
    return `
      <section class="wiki-section" id="wiki-sec-${idx}">
        <h2>${sec.heading}</h2>
        ${paragraphsHtml}
        ${warningHtml}
      </section>
    `;
  }).join('');

  wikiArticleContainer.innerHTML = `
    <div class="wiki-article-topbar">
      <button type="button" class="wiki-back-btn" id="wikiBackBtn">← 一覧（Navbox）に戻る</button>
      <a href="${article.sourceUrl || extUrl}" target="_blank" rel="noopener noreferrer" class="copy-btn" style="text-decoration:none;">本家 Dev Wiki（英語）で見る ↗</a>
    </div>

    <article class="wiki-article">
      <h2 class="wiki-article-title">${article.title}</h2>
      <div class="wiki-meta-box">
        <strong>出典元:</strong> <a href="${article.sourceUrl || extUrl}" target="_blank" rel="noopener noreferrer" class="wrap-link">${article.sourceUrl || extUrl}</a><br>
        <strong>最終更新:</strong> ${article.lastUpdated || data.lastUpdated} ／ <strong>ライセンス:</strong> <a href="https://www.gnu.org/licenses/old-licenses/fdl-1.2.html" target="_blank" rel="noopener noreferrer" class="wrap-link">GNU Free Documentation License 1.2 (GFDL 1.2)</a>
      </div>

      <p>${article.lead}</p>
      ${specsHtml}
      ${tocHtml}
      ${sectionsHtml}

      <div class="wiki-license-footer">
        本ページの内容は <a href="${article.sourceUrl || extUrl}" target="_blank" rel="noopener noreferrer" class="wrap-link">PS3 Developer Wiki</a> を翻訳・再構成したものであり、<a href="https://www.gnu.org/licenses/old-licenses/fdl-1.2.html" target="_blank" rel="noopener noreferrer" class="wrap-link">GNU Free Documentation License 1.2</a> の条件のもとで提供されます。
      </div>
    </article>
  `;

  document.getElementById('wikiBackBtn').addEventListener('click', renderPsdevWikiHome);
}
// ==========================================
// Navbox ヘッダーの日本語タイトル化 ＆ v・e 削除（追記上書き）
// ==========================================
function renderPsdevWikiHome() {
  const data = psdevWikiData;
  if (!data) return;

  wikiArticleTabs.style.display = 'none';
  const articlesMap = data.articles || {};

  const navboxesHtml = data.navboxes.map(box => {
    const groupsRowsHtml = box.groups.map(group => {
      const rowCount = group.rows.length;

      return group.rows.map((row, idx) => {
        let catCells = '';
        if (idx === 0) {
          if (group.subCategory) {
            catCells = `
              <th class="psdev-cat-cell" rowspan="${rowCount}">${group.category}</th>
              <th class="psdev-subcat-cell" rowspan="${rowCount}">${group.subCategory}</th>
            `;
          } else {
            catCells = `
              <th class="psdev-cat-cell" colspan="2" rowspan="${rowCount}">${group.category}</th>
            `;
          }
        }

        const itemsHtml = row.items.map(item => {
          const hasArticle = Boolean(articlesMap[item.wikiSlug]);
          const hasNoteClass = item.note ? 'has-note' : '';
          const hasJpClass = hasArticle ? 'has-jp-article' : '';
          const redLinkClass = item.redLink ? 'red-link' : '';
          const wikiUrl = `https://www.psdevwiki.com/ps3/${encodeURIComponent(item.wikiSlug)}`;
          const noteAttr = item.note ? `data-note="${item.note.replace(/"/g, '&quot;')}"` : '';

          return `<a href="${wikiUrl}" target="_blank" rel="noopener noreferrer" class="psdev-item-link ${hasNoteClass} ${hasJpClass} ${redLinkClass}" data-item-name="${item.name}" data-slug="${item.wikiSlug}" ${noteAttr}>${item.name}</a>`;
        }).join('<span class="psdev-dot">•</span>');

        return `
          <tr>
            ${catCells}
            <th class="psdev-row-label">${row.label}</th>
            <td class="psdev-items-cell">${itemsHtml}</td>
          </tr>
        `;
      }).join('');
    }).join('');

    return `
      <div class="psdev-navbox">
        <div class="psdev-navbox-header">
          <span class="psdev-navbox-title">${box.title}</span>
        </div>
        <div class="psdev-table-wrap">
          <table class="psdev-table">
            <tbody>
              ${groupsRowsHtml}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }).join('');

  wikiArticleContainer.innerHTML = `
    <div class="wiki-mode-bar">
      <span class="wiki-mode-label">項目クリック時の移動先：</span>
      <div class="wiki-mode-switch" role="group" aria-label="リンク遷移先切り替え">
        <button type="button" class="wiki-mode-btn ${wikiLinkMode === 'jp' ? 'active' : ''}" data-mode="jp">🇯🇵 日本語翻訳ページ</button>
        <button type="button" class="wiki-mode-btn ${wikiLinkMode === 'en' ? 'active' : ''}" data-mode="en">🌐 本家 Dev Wiki（英語）</button>
      </div>
    </div>

    <div class="wiki-meta-box">
      <strong>出典元:</strong> <a href="${data.sourceUrl}" target="_blank" rel="noopener noreferrer" class="wrap-link">${data.sourceTitle}</a><br>
      <strong>最終更新:</strong> ${data.lastUpdated} ／ <strong>ライセンス:</strong> <a href="https://www.gnu.org/licenses/old-licenses/fdl-1.2.html" target="_blank" rel="noopener noreferrer" class="wrap-link">GNU Free Documentation License 1.2 (GFDL 1.2)</a><br>
      ※ <strong>下線付きの項目</strong>（CECHAxx / COK-001 など）はサイト内に日本語翻訳記事があります。上のスイッチで「日本語翻訳ページ」と「本家（英語）」をいつでも切り替えられます。
    </div>

    <div id="psdevNoteBanner" class="psdev-note-banner hidden">
      <div id="psdevNoteText"></div>
      <div style="display:flex; gap:6px;">
        <button type="button" id="psdevNoteJpBtn" class="copy-btn">日本語解説を開く</button>
        <a id="psdevNoteExtLink" href="#" target="_blank" rel="noopener noreferrer" class="theme-btn" style="text-decoration:none; padding:7px 10px;">本家Wiki ↗</a>
      </div>
    </div>

    ${navboxesHtml}

    <div class="wiki-license-footer">
      本ページの構成・データは <a href="${data.sourceUrl}" target="_blank" rel="noopener noreferrer" class="wrap-link">${data.sourceTitle}</a> をベースに作成しており、<a href="https://www.gnu.org/licenses/old-licenses/fdl-1.2.html" target="_blank" rel="noopener noreferrer" class="wrap-link">GNU Free Documentation License 1.2</a> の条件のもとで提供されます。
    </div>
  `;

  wikiArticleContainer.querySelectorAll('.wiki-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      wikiLinkMode = btn.getAttribute('data-mode');
      localStorage.setItem('wikiLinkMode', wikiLinkMode);
      wikiArticleContainer.querySelectorAll('.wiki-mode-btn').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-mode') === wikiLinkMode);
      });
    });
  });

  const noteBanner = document.getElementById('psdevNoteBanner');
  const noteText = document.getElementById('psdevNoteText');
  const noteJpBtn = document.getElementById('psdevNoteJpBtn');
  const noteExtLink = document.getElementById('psdevNoteExtLink');

  wikiArticleContainer.querySelectorAll('.psdev-item-link').forEach(link => {
    const slug = link.getAttribute('data-slug');
    const name = link.getAttribute('data-item-name');
    const note = link.getAttribute('data-note');
    const href = link.getAttribute('href');

    if (note) {
      link.addEventListener('mouseenter', () => {
        noteText.innerHTML = `<strong>【${name}】</strong> ${note}`;
        noteExtLink.href = href;
        noteJpBtn.onclick = () => renderInternalWikiArticle(slug, name);
        noteBanner.classList.remove('hidden');
      });
    }

    link.addEventListener('click', (e) => {
      if (wikiLinkMode === 'jp') {
        e.preventDefault();
        renderInternalWikiArticle(slug, name);
      }
    });
  });
}
// ==========================================
// 共通記事キー（COK-00x）対応 ＆ 目次スクロールバグ修正（追記上書き）
// ==========================================
function renderPsdevWikiHome() {
  const data = psdevWikiData;
  if (!data) return;

  wikiArticleTabs.style.display = 'none';
  const articlesMap = data.articles || {};

  const navboxesHtml = data.navboxes.map(box => {
    const groupsRowsHtml = box.groups.map(group => {
      const rowCount = group.rows.length;

      return group.rows.map((row, idx) => {
        let catCells = '';
        if (idx === 0) {
          if (group.subCategory) {
            catCells = `
              <th class="psdev-cat-cell" rowspan="${rowCount}">${group.category}</th>
              <th class="psdev-subcat-cell" rowspan="${rowCount}">${group.subCategory}</th>
            `;
          } else {
            catCells = `
              <th class="psdev-cat-cell" colspan="2" rowspan="${rowCount}">${group.category}</th>
            `;
          }
        }

        const itemsHtml = row.items.map(item => {
          const articleKey = item.articleKey || item.wikiSlug;
          const hasArticle = Boolean(articlesMap[articleKey]);
          const hasNoteClass = item.note ? 'has-note' : '';
          const hasJpClass = hasArticle ? 'has-jp-article' : '';
          const redLinkClass = item.redLink ? 'red-link' : '';
          const wikiUrl = `https://www.psdevwiki.com/ps3/${encodeURIComponent(item.wikiSlug)}`;
          const noteAttr = item.note ? `data-note="${item.note.replace(/"/g, '&quot;')}"` : '';
          const secAttr = (item.targetSec !== undefined) ? `data-target-sec="${item.targetSec}"` : '';

          return `<a href="${wikiUrl}" target="_blank" rel="noopener noreferrer" class="psdev-item-link ${hasNoteClass} ${hasJpClass} ${redLinkClass}" data-item-name="${item.name}" data-slug="${item.wikiSlug}" data-article-key="${articleKey}" ${secAttr} ${noteAttr}>${item.name}</a>`;
        }).join('<span class="psdev-dot">•</span>');

        return `
          <tr>
            ${catCells}
            <th class="psdev-row-label">${row.label}</th>
            <td class="psdev-items-cell">${itemsHtml}</td>
          </tr>
        `;
      }).join('');
    }).join('');

    return `
      <div class="psdev-navbox">
        <div class="psdev-navbox-header">
          <span class="psdev-navbox-title">${box.title}</span>
        </div>
        <div class="psdev-table-wrap">
          <table class="psdev-table">
            <tbody>
              ${groupsRowsHtml}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }).join('');

  wikiArticleContainer.innerHTML = `
    <div class="wiki-mode-bar">
      <span class="wiki-mode-label">項目クリック時の移動先：</span>
      <div class="wiki-mode-switch" role="group" aria-label="リンク遷移先切り替え">
        <button type="button" class="wiki-mode-btn ${wikiLinkMode === 'jp' ? 'active' : ''}" data-mode="jp">🇯🇵 日本語翻訳ページ</button>
        <button type="button" class="wiki-mode-btn ${wikiLinkMode === 'en' ? 'active' : ''}" data-mode="en">🌐 本家 Dev Wiki（英語）</button>
      </div>
    </div>

    <div class="wiki-meta-box">
      <strong>出典元:</strong> <a href="${data.sourceUrl}" target="_blank" rel="noopener noreferrer" class="wrap-link">${data.sourceTitle}</a><br>
      <strong>最終更新:</strong> ${data.lastUpdated} ／ <strong>ライセンス:</strong> <a href="https://www.gnu.org/licenses/old-licenses/fdl-1.2.html" target="_blank" rel="noopener noreferrer" class="wrap-link">GNU Free Documentation License 1.2 (GFDL 1.2)</a><br>
      ※ <strong>下線付きの項目</strong>（CECHAxx / COK-001〜002W）はサイト内に日本語翻訳記事があります。上のスイッチで「日本語翻訳ページ」と「本家（英語）」をいつでも切り替えられます。
    </div>

    <div id="psdevNoteBanner" class="psdev-note-banner hidden">
      <div id="psdevNoteText"></div>
      <div style="display:flex; gap:6px;">
        <button type="button" id="psdevNoteJpBtn" class="copy-btn">日本語解説を開く</button>
        <a id="psdevNoteExtLink" href="#" target="_blank" rel="noopener noreferrer" class="theme-btn" style="text-decoration:none; padding:7px 10px;">本家Wiki ↗</a>
      </div>
    </div>

    ${navboxesHtml}

    <div class="wiki-license-footer">
      本ページの構成・データは <a href="${data.sourceUrl}" target="_blank" rel="noopener noreferrer" class="wrap-link">${data.sourceTitle}</a> をベースに作成しており、<a href="https://www.gnu.org/licenses/old-licenses/fdl-1.2.html" target="_blank" rel="noopener noreferrer" class="wrap-link">GNU Free Documentation License 1.2</a> の条件のもとで提供されます。
    </div>
  `;

  wikiArticleContainer.querySelectorAll('.wiki-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      wikiLinkMode = btn.getAttribute('data-mode');
      localStorage.setItem('wikiLinkMode', wikiLinkMode);
      wikiArticleContainer.querySelectorAll('.wiki-mode-btn').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-mode') === wikiLinkMode);
      });
    });
  });

  const noteBanner = document.getElementById('psdevNoteBanner');
  const noteText = document.getElementById('psdevNoteText');
  const noteJpBtn = document.getElementById('psdevNoteJpBtn');
  const noteExtLink = document.getElementById('psdevNoteExtLink');

  wikiArticleContainer.querySelectorAll('.psdev-item-link').forEach(link => {
    const slug = link.getAttribute('data-slug');
    const articleKey = link.getAttribute('data-article-key');
    const name = link.getAttribute('data-item-name');
    const note = link.getAttribute('data-note');
    const href = link.getAttribute('href');
    const targetSec = link.hasAttribute('data-target-sec') ? parseInt(link.getAttribute('data-target-sec'), 10) : null;

    if (note) {
      link.addEventListener('mouseenter', () => {
        noteText.innerHTML = `<strong>【${name}】</strong> ${note}`;
        noteExtLink.href = href;
        noteJpBtn.onclick = () => renderInternalWikiArticle(articleKey, name, slug, targetSec);
        noteBanner.classList.remove('hidden');
      });
    }

    link.addEventListener('click', (e) => {
      if (wikiLinkMode === 'jp') {
        e.preventDefault();
        renderInternalWikiArticle(articleKey, name, slug, targetSec);
      }
    });
  });
}

function renderInternalWikiArticle(articleKey, fallbackName, extSlug, targetSecIndex = null) {
  const data = psdevWikiData;
  const article = data && data.articles ? data.articles[articleKey] : null;
  const slugForUrl = extSlug || articleKey;
  const extUrl = `https://www.psdevwiki.com/ps3/${encodeURIComponent(slugForUrl)}`;

  window.scrollTo({ top: 0, behavior: 'instant' });

  if (!article) {
    wikiArticleContainer.innerHTML = `
      <div class="wiki-article-topbar">
        <button type="button" class="wiki-back-btn" id="wikiBackBtn">← 一覧に戻る</button>
        <a href="${extUrl}" target="_blank" rel="noopener noreferrer" class="copy-btn" style="text-decoration:none;">本家 Dev Wiki（英語）を開く ↗</a>
      </div>

      <article class="wiki-article">
        <h2 class="wiki-article-title">${fallbackName || articleKey}（日本語ページ準備中）</h2>
        <p>この項目の日本語翻訳ページはまだ作成されていません。右上のボタンから本家 PS3 Developer Wiki（英語）の該当ページを直接閲覧できます。</p>
      </article>
    `;

    document.getElementById('wikiBackBtn').addEventListener('click', renderPsdevWikiHome);
    return;
  }

  let specsHtml = '';
  if (article.specs && article.specs.length > 0) {
    const rowsHtml = article.specs.map(([k, v]) => `
      <tr>
        <th>${k}</th>
        <td>${v}</td>
      </tr>
    `).join('');
    specsHtml = `
      <table class="wiki-spec-table">
        <tbody>${rowsHtml}</tbody>
      </table>
    `;
  }

  const tocHtml = article.sections && article.sections.length > 1
    ? `
      <nav class="wiki-toc" aria-label="目次">
        <div class="wiki-toc-title">目次</div>
        <ul>
          ${article.sections.map((sec, idx) => `
            <li><a href="#wiki-sec-${idx}" class="wiki-toc-link" data-sec-target="wiki-sec-${idx}">${sec.heading}</a></li>
          `).join('')}
        </ul>
      </nav>
    `
    : '';

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

    const warningHtml = sec.warning ? `<div class="warning-box">${sec.warning}</div>` : '';

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
    <div class="wiki-article-topbar">
      <button type="button" class="wiki-back-btn" id="wikiBackBtn">← 一覧に戻る</button>
      <a href="${extUrl}" target="_blank" rel="noopener noreferrer" class="copy-btn" style="text-decoration:none;">本家 Dev Wiki（英語）で見る ↗</a>
    </div>

    <article class="wiki-article">
      <h2 class="wiki-article-title">${article.title}</h2>
      <div class="wiki-meta-box">
        <strong>出典元:</strong> <a href="${article.sourceUrl || extUrl}" target="_blank" rel="noopener noreferrer" class="wrap-link">${article.sourceUrl || extUrl}</a><br>
        <strong>最終更新:</strong> ${article.lastUpdated || data.lastUpdated} ／ <strong>ライセンス:</strong> <a href="https://www.gnu.org/licenses/old-licenses/fdl-1.2.html" target="_blank" rel="noopener noreferrer" class="wrap-link">GNU Free Documentation License 1.2 (GFDL 1.2)</a>
      </div>

      <p>${article.lead}</p>
      ${specsHtml}
      ${tocHtml}
      ${sectionsHtml}

      <div class="wiki-license-footer">
        本ページの内容は <a href="${article.sourceUrl || extUrl}" target="_blank" rel="noopener noreferrer" class="wrap-link">PS3 Developer Wiki</a> を翻訳・再構成したものであり、<a href="https://www.gnu.org/licenses/old-licenses/fdl-1.2.html" target="_blank" rel="noopener noreferrer" class="wrap-link">GNU Free Documentation License 1.2</a> の条件のもとで提供されます。
      </div>
    </article>
  `;

  document.getElementById('wikiBackBtn').addEventListener('click', renderPsdevWikiHome);

  // 目次リンクのページ内スムーズスクロール（ハッシュ変更によるTOP遷移を防止）
  wikiArticleContainer.querySelectorAll('.wiki-toc-link').forEach(tocLink => {
    tocLink.addEventListener('click', (e) => {
      e.preventDefault();
      const targetId = tocLink.getAttribute('data-sec-target');
      const targetEl = document.getElementById(targetId);
      if (targetEl) {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  // COK-002 や COK-002W を押した際に該当見出しへ自動スクロール
  if (targetSecIndex !== null && !Number.isNaN(targetSecIndex)) {
    const targetSection = document.getElementById(`wiki-sec-${targetSecIndex}`);
    if (targetSection) {
      setTimeout(() => {
        targetSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 50);
    }
  }
}
// ==========================================
// Syscon ファンテーブル（p0〜p9）自動生成ツール
// ==========================================
// ▼ この機能をページに表示する場合は true、隠す場合は false に変更してください ▼
const ENABLE_AUTO_FAN_CURVE = true;

(function initAutoFanGenerator() {
  const cardEl = document.getElementById('autoFanCard');
  if (!cardEl) return;

  // フラグが false の場合は非表示のまま処理を終了
  if (!ENABLE_AUTO_FAN_CURVE) {
    cardEl.style.display = 'none';
    return;
  }
  cardEl.style.display = 'block';

  const zoneBtns = document.querySelectorAll('#fanZoneGroup .preset-btn');
  const chipBtns = document.querySelectorAll('#fanChipGroup .preset-btn');
  const styleBtns = document.querySelectorAll('#fanStyleGroup .preset-btn');
  const tempSlider = document.getElementById('targetTempSlider');
  const tempDisplay = document.getElementById('targetTempDisplay');
  const summaryBox = document.getElementById('autoFanSummary');
  const commandBox = document.getElementById('autoFanCommandBox');
  const tableBody = document.getElementById('autoFanTableBody');
  const copyBtn = document.getElementById('copyAutoFanBtn');

  let selectedZone = '1'; // '1': RSX, '0': CELL, 'both': 両方
  let selectedChip = '90nm';
  let selectedStyle = 'balanced';

  const defaultTargets = {
    '90nm': { cooling: 63.0, balanced: 67.0, quiet: 70.0 },
    '65nm': { cooling: 65.0, balanced: 70.0, quiet: 74.0 },
    '40nm': { cooling: 66.0, balanced: 72.0, quiet: 76.0 }
  };

  function fmtTemp(val) {
    const snapped = Math.round(val * 2) / 2;
    return snapped.toFixed(2).padStart(5, '0');
  }

  function pctToPwm(pct) {
    const clamped = Math.max(20, Math.min(100, pct));
    const dec = Math.round((clamped / 100) * 255);
    const hex = '0x' + dec.toString(16).toLowerCase().padStart(2, '0');
    const actualPct = ((dec / 255) * 100).toFixed(1);
    return { dec, hex, actualPct };
  }

  function generateFanCurve() {
    const targetTemp = parseFloat(tempSlider.value);
    tempDisplay.textContent = `${fmtTemp(targetTemp)} ℃`;

    // 基準67℃からの差分に応じてPWM全体をシフト
    const heatOffset = 67.0 - targetTemp;
    const chipBoost = selectedChip === '90nm' ? 2.0 : (selectedChip === '65nm' ? 0.5 : 0);

    // p0〜p8 の目標パーセント算出（p0は最低20%以上、滑らかに上昇）
    const baseP0 = Math.max(20, Math.min(34, 24.5 + heatOffset * 0.6 + chipBoost));
    const baseP7 = Math.max(baseP0 + 6, Math.min(72, 32.2 + heatOffset * 1.4 + chipBoost));
    const baseP8 = Math.max(baseP7 + 2.5, Math.min(82, baseP7 + 3.0 + Math.max(0, heatOffset * 0.2)));

    // p0〜p7 まで緩やかな二次曲線で補間
    const pctList = [];
    for (let i = 0; i <= 7; i++) {
      const ratio = Math.pow(i / 7, 1.35);
      pctList.push(baseP0 + (baseP7 - baseP0) * ratio);
    }
    pctList.push(baseP8); // p8
    pctList.push(100);    // p9 (0xff)

    // 温度しきい値（p7 の tempU = targetTemp を基準に 0.50℃ 刻みで逆算）
    const u0 = targetTemp - 5.0;
    const u1 = targetTemp - 8.0;
    const u2 = targetTemp - 7.0;
    const u3 = targetTemp - 6.0;
    const u4 = targetTemp - 5.0;
    const u5 = targetTemp - 4.0;
    const u6 = targetTemp - 2.0;
    const u7 = targetTemp;
    const u8 = targetTemp + 3.0;
    const u9 = selectedChip === '90nm' ? 80.0 : 85.0;

    const rawSteps = [
      { p: 'p0', d: 0.0,      u: u0 },
      { p: 'p1', d: u1 - 2.0, u: u1 },
      { p: 'p2', d: u2 - 1.5, u: u2 },
      { p: 'p3', d: u3 - 1.5, u: u3 },
      { p: 'p4', d: u4 - 2.0, u: u4 },
      { p: 'p5', d: u5 - 2.0, u: u5 },
      { p: 'p6', d: u6 - 3.0, u: u6 },
      { p: 'p7', d: u7 - 3.5, u: u7 },
      { p: 'p8', d: u8 - 4.0, u: u8 },
      { p: 'p9', d: u0,       u: u9 }
    ];

    const steps = rawSteps.map((st, idx) => {
      const pwm = pctToPwm(pctList[idx]);
      return {
        p: st.p,
        tempD: fmtTemp(st.d),
        tempU: fmtTemp(st.u),
        hex: pwm.hex,
        pct: pwm.actualPct
      };
    });

    // コマンド文字列生成
    const zones = selectedZone === 'both' ? ['0', '1'] : [selectedZone];
    const cmdLines = [];
    zones.forEach((z, zIdx) => {
      if (zones.length > 1) {
        cmdLines.push(z === '0' ? '# --- CELL (0) ---' : '\n# --- RSX (1) ---');
      }
      steps.forEach(s => {
        cmdLines.push(`fantbl setini ${z} ${s.p} ${s.tempD} ${s.tempU} ${s.hex}`);
      });
    });
    const commandText = cmdLines.join('\n');
    commandBox.textContent = commandText;

    // 解説メッセージ
    const targetName = selectedZone === '1' ? 'RSX (1)' : (selectedZone === '0' ? 'CELL (0)' : 'CELL (0) & RSX (1)');
    if (selectedChip === '90nm' && targetTemp >= 70.5) {
      summaryBox.innerHTML = `⚠️ <strong>注意（90nm RSX）:</strong> 90nm世代のRSXは70℃を超えるとバンプ劣化（3034）のリスクが高まります。RSX側の目標温度は <strong>65.00〜68.00℃以下</strong> を推奨します。`;
    } else {
      summaryBox.innerHTML = `✅ <strong>対象: ${targetName}（${selectedChip}）</strong> ／ <strong>p7（${fmtTemp(targetTemp)}℃）で ${steps[7].hex}（${steps[7].pct}%）</strong> に到達し、p8（${steps[8].tempU}℃）で <strong>${steps[8].hex}（${steps[8].pct}%）</strong>、p9（${steps[9].tempU}℃）でフル回転（<code>0xff</code>）に入る10段階カーブです。`;
    }

    // 確認テーブル描画
    tableBody.innerHTML = steps.map(s => `
      <tr>
        <td class="mono">${s.p}</td>
        <td class="mono">${s.tempD} ℃</td>
        <td class="mono">${s.tempU} ℃</td>
        <td class="mono">${s.hex}</td>
        <td class="mono">${s.pct}%</td>
      </tr>
    `).join('');
  }

  zoneBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      zoneBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedZone = btn.getAttribute('data-zone');
      // CELL (0) 単体選択時はやや高め、RSX (1) 時はRSX基準のデフォルト値へ調整
      const base = defaultTargets[selectedChip][selectedStyle];
      tempSlider.value = (selectedZone === '0' && selectedChip === '90nm') ? Math.min(78, base + 3.0) : base;
      generateFanCurve();
    });
  });

  chipBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      chipBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedChip = btn.getAttribute('data-chip');
      const base = defaultTargets[selectedChip][selectedStyle];
      tempSlider.value = (selectedZone === '0' && selectedChip === '90nm') ? Math.min(78, base + 3.0) : base;
      generateFanCurve();
    });
  });

  styleBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      styleBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedStyle = btn.getAttribute('data-style');
      const base = defaultTargets[selectedChip][selectedStyle];
      tempSlider.value = (selectedZone === '0' && selectedChip === '90nm') ? Math.min(78, base + 3.0) : base;
      generateFanCurve();
    });
  });

  tempSlider.addEventListener('input', generateFanCurve);

  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      const text = commandBox.textContent || '';
      if (!text) return;
      navigator.clipboard.writeText(text).then(() => {
        const orig = copyBtn.textContent;
        copyBtn.textContent = 'コピー完了!';
        setTimeout(() => { copyBtn.textContent = orig; }, 1200);
      });
    });
  }

  generateFanCurve();
})();
// ==========================================
// 上級者モード（サイレント解放 ＋ 別途保存コマンド）制御
// ==========================================
(function initExpertMode() {
  const rootEl = document.documentElement;
  const disableBtn = document.getElementById('disableExpertBtn');
  const autoFanCard = document.getElementById('autoFanCard');
  const navLinks = document.querySelectorAll('.sidebar-nav .nav-item');

  if (autoFanCard) {
    autoFanCard.style.display = '';
  }

  // 保存済みの設定がある場合のみ復元
  if (localStorage.getItem('expertMode') === 'true') {
    rootEl.setAttribute('data-expert-mode', 'true');
  }

  // 1. 一時解放コマンド：「TOP・はじめに」5回 → 「Dev Wiki 日本語版」5回（途中の通知なし）
  const UNLOCK_SEQUENCE = [
    { view: 'home', count: 5 },
    { view: 'wiki', count: 5 }
  ];

  // 2. ブラウザ保存コマンド：上級者モード有効中に「参考資料・ライセンス」を10回
  const PERSIST_VIEW = 'references';
  const PERSIST_COUNT = 10;

  let stepIndex = 0;
  let currentCount = 0;
  let persistCount = 0;
  let resetTimer = null;

  function showToast(msg) {
    let toast = document.getElementById('expertToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'expertToast';
      toast.className = 'expert-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.display = 'block';
    clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(() => {
      toast.style.display = 'none';
    }, 2400);
  }

  function resetAllCounters() {
    stepIndex = 0;
    currentCount = 0;
    persistCount = 0;
  }

  navLinks.forEach(link => {
    link.addEventListener('click', () => {
      const clickedView = link.getAttribute('data-view');
      const isExpertActive = rootEl.getAttribute('data-expert-mode') === 'true';
      const isAlreadySaved = localStorage.getItem('expertMode') === 'true';

      clearTimeout(resetTimer);
      // 4秒間操作がなければカウントをリセット
      resetTimer = setTimeout(resetAllCounters, 4000);

      // --- パターンA: まだ上級者モードが有効化されていない場合（一時解放判定） ---
      if (!isExpertActive) {
        const expectedStep = UNLOCK_SEQUENCE[stepIndex];

        if (clickedView === expectedStep.view) {
          currentCount++;

          // スマホ表示時：3回目以降はメニューが閉じないよう開き直す
          if (currentCount >= 3 && typeof openSidebar === 'function' && window.innerWidth <= 768) {
            setTimeout(openSidebar, 10);
          }

          if (currentCount >= expectedStep.count) {
            stepIndex++;
            currentCount = 0;

            // 全ステップ完了（途中ステップ完了時は何も出さない）
            if (stepIndex >= UNLOCK_SEQUENCE.length) {
              resetAllCounters();
              if (typeof closeSidebar === 'function') closeSidebar();

              setTimeout(() => {
                const agreed = window.confirm(
                  '【上級者向け機能の表示確認】\n\n' +
                  'これより先は、Sysconの熱制御テーブル書き換え（fantbl setini）など、設定やコマンドを誤るとPS3本体が起動不能（ブリック）になる可能性がある応用機能が含まれます。\n\n' +
                  'リスクを理解したうえで、このセッション中のみ上級者向け機能を表示しますか？\n' +
                  '（※ページを再読み込みすると自動的に非表示へ戻ります）'
                );

                if (agreed) {
                  rootEl.setAttribute('data-expert-mode', 'true');
                  showToast('🔓 上級者モードを有効にしました（再読み込みで戻ります）');
                }
              }, 50);
            }
          }
        } else {
          resetAllCounters();
          if (clickedView === UNLOCK_SEQUENCE[0].view) {
            currentCount = 1;
          }
        }
        return;
      }

      // --- パターンB: 上級者モード有効中かつ未保存の場合（永続保存判定） ---
      if (isExpertActive && !isAlreadySaved) {
        if (clickedView === PERSIST_VIEW) {
          persistCount++;

          if (persistCount >= 3 && typeof openSidebar === 'function' && window.innerWidth <= 768) {
            setTimeout(openSidebar, 10);
          }

          if (persistCount >= PERSIST_COUNT) {
            resetAllCounters();
            if (typeof closeSidebar === 'function') closeSidebar();

            setTimeout(() => {
              const agreedSave = window.confirm(
                '【警告：上級者モードの常時有効化（ブラウザ保存）】\n\n' +
                '上級者向け機能の表示状態をこのブラウザに保存します。\n' +
                '保存すると、次回以降このサイトを開いた際も確認メッセージなしで危険度の高いSyscon書き換え用コマンド生成機能が常に表示された状態になります。\n\n' +
                '・誤ったコマンドの実行はPS3の完全な起動不能（ブリック）を招きます。\n' +
                '・他人に端末を操作される場合や、誤操作のリスクを十分に理解していますか？\n\n' +
                '本当に上級者モードをブラウザに保存して常時表示にしますか？'
              );

              if (agreedSave) {
                localStorage.setItem('expertMode', 'true');
                showToast('💾 上級者モードをブラウザに保存しました');
              }
            }, 50);
          }
        } else {
          persistCount = 0;
        }
      }
    });
  });

  // 解除ボタン（一時有効・ブラウザ保存のどちらの状態からも即座に解除）
  if (disableBtn) {
    disableBtn.addEventListener('click', () => {
      rootEl.removeAttribute('data-expert-mode');
      localStorage.removeItem('expertMode');
      resetAllCounters();
      showToast('🔒 上級者モードを解除しました');
    });
  }
})();
// ==========================================
// Syscon 内部モードページの公開フラグ ＆ アクセス保護制御
// ==========================================
// ▼ true にすると上級者モード時に表示、false にすると上級者モードでも完全に非表示になります ▼
const ENABLE_SYSCON_INTERNAL_PAGE = false;

(function protectExpertViews() {
  const EXPERT_VIEWS = ['syscon-internal'];
  const sysconNavLink = document.querySelector('.sidebar-nav .nav-item[data-view="syscon-internal"]');

  // 公開フラグが false の場合はサイドバーのリンクを強制非表示にする
  if (!ENABLE_SYSCON_INTERNAL_PAGE && sysconNavLink) {
    sysconNavLink.style.display = 'none';
  }

  function enforceExpertViewGuard() {
    const currentHash = window.location.hash.replace('#', '');
    if (!EXPERT_VIEWS.includes(currentHash)) return;

    const isExpert = document.documentElement.getAttribute('data-expert-mode') === 'true';
    const isPageEnabled = (currentHash === 'syscon-internal') ? ENABLE_SYSCON_INTERNAL_PAGE : true;

    // 公開フラグが false、または上級者モードが無効な場合は TOP へ戻す
    if (!isPageEnabled || !isExpert) {
      window.location.hash = '#home';
    }
  }

  window.addEventListener('hashchange', enforceExpertViewGuard);
  enforceExpertViewGuard();

  const disableBtn = document.getElementById('disableExpertBtn');
  if (disableBtn) {
    disableBtn.addEventListener('click', () => {
      const currentHash = window.location.hash.replace('#', '');
      if (EXPERT_VIEWS.includes(currentHash)) {
        window.location.hash = '#home';
      }
    });
  }
})();