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
// ファン設定 自動提案ツール（目的・目標温度別カーブ生成）
// ==========================================
(function initAutoFanGenerator() {
  const chipBtns = document.querySelectorAll('#fanChipGroup .preset-btn');
  const styleBtns = document.querySelectorAll('#fanStyleGroup .preset-btn');
  const tempSlider = document.getElementById('targetTempSlider');
  const tempDisplay = document.getElementById('targetTempDisplay');
  const summaryBox = document.getElementById('autoFanSummary');
  const tableBody = document.getElementById('autoFanTableBody');
  const copyBtn = document.getElementById('copyAutoFanBtn');

  if (!tempSlider || !tableBody) return;

  let selectedChip = '90nm';
  let selectedStyle = 'balanced';

  // 機種とスタイルに応じた推奨目標温度の基準テーブル
  const defaultTargets = {
    '90nm': { cooling: 63, balanced: 67, quiet: 70 },
    '65nm': { cooling: 65, balanced: 70, quiet: 74 },
    '40nm': { cooling: 66, balanced: 72, quiet: 76 }
  };

  function toHex2(pct) {
    const clamped = Math.max(20, Math.min(100, Math.round(pct)));
    const dec = Math.round((clamped / 100) * 255);
    return {
      pct: clamped,
      dec,
      hex: '0x' + dec.toString(16).toUpperCase().padStart(2, '0')
    };
  }

  function generateFanCurve() {
    const targetTemp = parseInt(tempSlider.value, 10);
    tempDisplay.textContent = `${targetTemp} ℃`;

    // 目標温度が低いほど高いPWMを割り当てる計算ロジック
    // 基準: targetTemp = 68℃ のとき常用上限付近を 38〜42% 前後に設定
    const heatOffset = 68 - targetTemp; // 目標温度を1℃下げるごとに +1.6% 補正
    const chipBaseBoost = selectedChip === '90nm' ? 3 : (selectedChip === '65nm' ? 1 : 0);

    const idlePct = Math.max(20, Math.min(35, Math.round(22 + heatOffset * 0.6 + chipBaseBoost)));
    const lowLoadPct = Math.max(idlePct + 3, Math.min(45, Math.round(28 + heatOffset * 0.9 + chipBaseBoost)));
    const midLoadPct = Math.max(lowLoadPct + 4, Math.min(60, Math.round(34 + heatOffset * 1.3 + chipBaseBoost)));
    const targetLoadPct = Math.max(midLoadPct + 5, Math.min(75, Math.round(42 + heatOffset * 1.6 + chipBaseBoost)));
    const highLoadPct = Math.max(targetLoadPct + 8, Math.min(88, Math.round(55 + heatOffset * 1.5 + chipBaseBoost)));

    // 温度ステップの算出（目標上限温度 targetTemp を Step 3 の維持ラインに設定）
    const t1 = Math.max(45, targetTemp - 16);
    const t2 = Math.max(t1 + 4, targetTemp - 9);
    const t3 = Math.max(t2 + 4, targetTemp - 3);
    const t4 = Math.max(t3 + 3, targetTemp + 2);
    const t5 = Math.max(t4 + 4, targetTemp + 7);

    const steps = [
      {
        step: 'Step 0',
        tempRange: `〜 ${t1}℃ (起動・待機)`,
        ...toHex2(idlePct),
        role: 'アイドル・XMB待機時の最低回転'
      },
      {
        step: 'Step 1',
        tempRange: `${t1}℃ → ${t2}℃ (降温 ${t1 - 3}℃)`,
        ...toHex2(lowLoadPct),
        role: '軽負荷（PS1/PS2・動画再生など）'
      },
      {
        step: 'Step 2',
        tempRange: `${t2}℃ → ${t3}℃ (降温 ${t2 - 3}℃)`,
        ...toHex2(midLoadPct),
        role: '通常ゲームプレイ開始時'
      },
      {
        step: 'Step 3',
        tempRange: `${t3}℃ → ${t4}℃ (降温 ${t3 - 3}℃)`,
        ...toHex2(targetLoadPct),
        role: `目標上限（${targetTemp}℃前後）維持の主力回転`
      },
      {
        step: 'Step 4',
        tempRange: `${t4}℃ → ${t5}℃ (降温 ${t4 - 3}℃)`,
        ...toHex2(highLoadPct),
        role: '夏場・高負荷タイトル時の強冷却'
      },
      {
        step: 'Step 5',
        tempRange: `${t5}℃ 以上 (降温 ${t5 - 4}℃)`,
        ...toHex2(100),
        role: '緊急最大冷却（オーバーヒート防止）'
      }
    ];

    // 解説コメントの生成
    let advice = '';
    if (selectedChip === '90nm' && targetTemp >= 71) {
      advice = `⚠️ <strong>注意（90nm RSX）:</strong> 90nm世代のRSXは70℃を超えるとアンダーフィル劣化（エラー3034）のリスクが高まります。可能であれば目標温度を <strong>65〜68℃以下</strong> に設定することをおすすめします。`;
    } else if (selectedChip === '90nm') {
      advice = `✅ <strong>90nm RSX 保護設定:</strong> 高負荷時でも <strong>${targetTemp}℃前後</strong> に抑えるため、${t2}℃付近から早めに <strong>${steps[2].pct}% (${steps[2].hex}) 〜 ${steps[3].pct}% (${steps[3].hex})</strong> へ立ち上げる構成です。`;
    } else if (selectedChip === '40nm') {
      advice = `✅ <strong>40nm RSX 向け設定:</strong> 発熱が少ない40nmプロセス向けにアイドルを <strong>${steps[0].pct}% (${steps[0].hex})</strong> に抑え、高負荷時のみ <strong>${steps[3].pct}% (${steps[3].hex})</strong> 前後で静かに冷やすバランスです。`;
    } else {
      advice = `✅ <strong>65nm RSX 向け設定:</strong> アイドル <strong>${steps[0].pct}% (${steps[0].hex})</strong> から負荷に応じて段階的に引き上げ、高負荷時 <strong>${targetTemp}℃前後</strong> を維持する設定です。`;
    }

    summaryBox.innerHTML = advice;

    tableBody.innerHTML = steps.map(s => `
      <tr>
        <td class="mono">${s.step}</td>
        <td>${s.tempRange}</td>
        <td class="mono">${s.pct}%</td>
        <td class="mono">${s.hex}</td>
        <td class="mono">${s.dec}</td>
        <td>${s.role}</td>
      </tr>
    `).join('');

    // コピー用テキストを保存
    tableBody.dataset.copyText = [
      `【PS3 ファン設定提案】対象: ${selectedChip} / 目標上限: ${targetTemp}℃`,
      ...steps.map(s => `${s.step}: ${s.tempRange} -> ${s.pct}% (${s.hex} / DEC:${s.dec}) [${s.role}]`)
    ].join('\n');
  }

  // 機種選択ボタン
  chipBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      chipBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedChip = btn.getAttribute('data-chip');
      tempSlider.value = defaultTargets[selectedChip][selectedStyle];
      generateFanCurve();
    });
  });

  // スタイル選択ボタン
  styleBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      styleBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedStyle = btn.getAttribute('data-style');
      tempSlider.value = defaultTargets[selectedChip][selectedStyle];
      generateFanCurve();
    });
  });

  // スライダー手動操作
  tempSlider.addEventListener('input', generateFanCurve);

  // テーブルコピーボタン
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      const text = tableBody.dataset.copyText || '';
      if (!text) return;
      navigator.clipboard.writeText(text).then(() => {
        const orig = copyBtn.textContent;
        copyBtn.textContent = 'コピー完了!';
        setTimeout(() => { copyBtn.textContent = orig; }, 1200);
      });
    });
  }

  // 初回描画
  generateFanCurve();
})();