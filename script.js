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
  const metaTheme = document.getElementById('metaThemeColor');
  if (theme === 'dark') {
    rootElement.setAttribute('data-theme', 'dark');
    themeToggle.textContent = '☀️ ライト';
    if (themeToggleMobile) themeToggleMobile.textContent = '☀️';
    if (metaTheme) metaTheme.setAttribute('content', '#1e293b');
  } else {
    rootElement.removeAttribute('data-theme');
    themeToggle.textContent = '🌙 ダーク';
    if (themeToggleMobile) themeToggleMobile.textContent = '🌙';
    if (metaTheme) metaTheme.setAttribute('content', '#f4f5f7');
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
const ENABLE_SYSCON_INTERNAL_PAGE = false;
let currentActiveView = 'home';
let uartDisclaimerAccepted = false;

function switchView(viewName) {
  const targetView = document.getElementById(`view-${viewName}`);
  let activeName = targetView ? viewName : 'home';

  if (activeName === 'syscon-internal' && !ENABLE_SYSCON_INTERNAL_PAGE) {
    activeName = 'home';
  }

  if (activeName === 'uart-monitor' && !uartDisclaimerAccepted) {
    const agreed = window.confirm(
      '【重要・免責事項】Syscon UART 接続機能について\n\n' +
      '本機能は Web Serial API を使用して PS3 の Syscon と直接通信を行います。\n' +
      '・必ず 3.3V TTL アダプタを使用してください（5V 印加は破損の原因になります）。\n' +
      '・EEPROM 書き換え（w / fantbl setini 等）や電圧変更の操作を誤ると、PS3 本体が起動不能（ブリック）になる恐れがあります。\n' +
      '・作業前の EEPROM バックアップ取得を強く推奨します。\n\n' +
      '本機能の使用により発生したいかなる損害についても、制作者は一切の責任を負いません。\n' +
      'すべて自己責任で利用することに同意して画面を開きますか？'
    );
    if (!agreed) {
      const fallback = (currentActiveView && currentActiveView !== 'uart-monitor') ? currentActiveView : 'home';
      if (window.location.hash !== `#${fallback}`) {
        history.replaceState(null, '', `#${fallback}`);
      }
      activeName = fallback;
    } else {
      uartDisclaimerAccepted = true;
    }
  }

  currentActiveView = activeName;

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
let currentWikiArticleKey = null;

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
      if (typeof buildWikiSearchIndex === 'function') {
        buildWikiSearchIndex(data);
      }
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
  currentWikiArticleKey = null;

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
  currentWikiArticleKey = null;

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
  currentWikiArticleKey = null;

  wikiArticleTabs.style.display = 'none';
  const articlesMap = data.articles || {};

  const buildNavboxLink = ({ label, wikiSlug, articleKey, targetSec, note, redLink }) => {
    const resolvedKey = articleKey || wikiSlug;
    const hasArticle = Boolean(articlesMap[resolvedKey]);
    const hasNoteClass = note ? 'has-note' : '';
    const hasJpClass = hasArticle ? 'has-jp-article' : '';
    const redLinkClass = redLink ? 'red-link' : '';
    const wikiUrl = `https://www.psdevwiki.com/ps3/${encodeURIComponent(wikiSlug)}`;
    const plainName = String(label).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const noteAttr = note ? `data-note="${note.replace(/"/g, '&quot;')}"` : '';
    const secAttr = (targetSec !== undefined && targetSec !== null) ? `data-target-sec="${targetSec}"` : '';

    return `<a href="${wikiUrl}" target="_blank" rel="noopener noreferrer" class="psdev-item-link ${hasNoteClass} ${hasJpClass} ${redLinkClass}" data-item-name="${plainName.replace(/"/g, '&quot;')}" data-slug="${wikiSlug}" data-article-key="${resolvedKey}" ${secAttr} ${noteAttr}>${label}</a>`;
  };

  const navboxesHtml = data.navboxes.map(box => {
    const groupsRowsHtml = box.groups.map(group => {
      const rowCount = group.rows.length;

      return group.rows.map((row, idx) => {
        let catCells = '';
        if (idx === 0) {
          const catHtml = group.categorySlug
            ? buildNavboxLink({
                label: group.category,
                wikiSlug: group.categorySlug,
                articleKey: group.categoryArticleKey,
                targetSec: group.categoryTargetSec,
                note: group.categoryNote
              })
            : group.category;

          if (group.subCategory) {
            const subCatHtml = group.subCategorySlug
              ? buildNavboxLink({
                  label: group.subCategory,
                  wikiSlug: group.subCategorySlug,
                  articleKey: group.subCategoryArticleKey,
                  targetSec: group.subCategoryTargetSec,
                  note: group.subCategoryNote
                })
              : group.subCategory;

            catCells = `
              <th class="psdev-cat-cell" rowspan="${rowCount}">${catHtml}</th>
              <th class="psdev-subcat-cell" rowspan="${rowCount}">${subCatHtml}</th>
            `;
          } else {
            catCells = `
              <th class="psdev-cat-cell" colspan="2" rowspan="${rowCount}">${catHtml}</th>
            `;
          }
        }

        const labelHtml = row.labelSlug
          ? buildNavboxLink({
              label: row.label,
              wikiSlug: row.labelSlug,
              articleKey: row.labelArticleKey,
              targetSec: row.labelTargetSec,
              note: row.labelNote
            })
          : row.label;

        const itemsHtml = row.items.map(item => buildNavboxLink({
          label: item.name,
          wikiSlug: item.wikiSlug,
          articleKey: item.articleKey,
          targetSec: item.targetSec,
          note: item.note,
          redLink: item.redLink
        })).join('<span class="psdev-dot">•</span>');

        return `
          <tr>
            ${catCells}
            <th class="psdev-row-label">${labelHtml}</th>
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
      ※ <strong>下線付きの項目</strong>（コンソール情報・マザーボード・Blu-rayドライブ・電源ユニット・マザーボード構成部品全般・Syscon Error Codes）はサイト内に日本語翻訳記事があります。上のスイッチで「日本語翻訳ページ」と「本家（英語）」をいつでも切り替えられます。
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

  currentWikiArticleKey = article ? articleKey : null;
  if (typeof applyWikiSearchHighlightsOnly === 'function') {
    applyWikiSearchHighlightsOnly();
  }
}

// ==========================================
// PS3 Dev Wiki ページ内検索 ＆ 横断検索機能
// ==========================================
let wikiSearchEntries = [];

function stripHtmlTags(html) {
  if (!html) return '';
  return String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toHalfWidthLower(str) {
  return normalizeText(String(str || ''));
}

function buildSearchHighlightRegex(terms) {
  const patterns = [];
  terms.forEach(t => {
    const clean = t.trim();
    if (!clean) return;
    patterns.push(escapeRegExp(clean));
  });
  if (patterns.length === 0) return null;
  return new RegExp(`(${patterns.join('|')})`, 'gi');
}

function highlightEscapedText(text, terms) {
  const escaped = escapeHtml(text);
  const regex = buildSearchHighlightRegex(terms);
  if (!regex) return escaped;
  return escaped.replace(regex, '<mark class="wiki-search-mark">$1</mark>');
}

function makeSearchSnippet(text, terms) {
  const clean = stripHtmlTags(text);
  if (!clean) return '';
  const normClean = toHalfWidthLower(clean);
  let matchIdx = -1;
  for (const t of terms) {
    const idx = normClean.indexOf(t);
    if (idx !== -1 && (matchIdx === -1 || idx < matchIdx)) {
      matchIdx = idx;
    }
  }
  if (matchIdx === -1) {
    return clean.length > 95 ? clean.slice(0, 95) + '...' : clean;
  }
  const start = Math.max(0, matchIdx - 28);
  const end = Math.min(clean.length, matchIdx + 72);
  let snippet = clean.slice(start, end);
  if (start > 0) snippet = '...' + snippet;
  if (end < clean.length) snippet = snippet + '...';
  return snippet;
}

function buildWikiSearchIndex(data) {
  const articlesMap = data.articles || {};
  const entriesByKey = new Map();

  Object.entries(articlesMap).forEach(([key, art]) => {
    const leadPlain = stripHtmlTags(art.lead || '');
    const specsPlain = (art.specs || []).map(([k, v]) => `${stripHtmlTags(k)}: ${stripHtmlTags(v)}`).join(' / ');
    const sections = (art.sections || []).map((sec, idx) => {
      const pText = (sec.paragraphs || []).map(stripHtmlTags).join(' ');
      const tText = sec.table
        ? [...(sec.table.headers || []), ...((sec.table.rows || []).flat())].map(stripHtmlTags).join(' ')
        : '';
      const wText = stripHtmlTags(sec.warning || '');
      const fullSec = [pText, tText, wText].filter(Boolean).join(' ');
      return {
        idx,
        heading: sec.heading || '',
        headingNorm: toHalfWidthLower(sec.heading || ''),
        text: fullSec,
        textNorm: toHalfWidthLower(fullSec)
      };
    });

    const slugFromUrl = (art.sourceUrl || '').split('/ps3/')[1] || key;
    const bodyPlain = [leadPlain, specsPlain, ...sections.map(s => `${s.heading} ${s.text}`)].filter(Boolean).join(' ');

    entriesByKey.set(key, {
      key,
      slug: decodeURIComponent(slugFromUrl),
      title: art.title || key,
      titleNorm: toHalfWidthLower(`${art.title || ''} ${key}`),
      hasArticle: true,
      categoryLabel: '日本語記事',
      notesNorm: '',
      bodyPlain,
      bodyNorm: toHalfWidthLower(bodyPlain),
      sections
    });
  });

  // Navbox 上のカテゴリ名・未翻訳項目もインデックスに追加
  (data.navboxes || []).forEach(box => {
    (box.groups || []).forEach(group => {
      (group.rows || []).forEach(row => {
        const ctxLabel = `${box.title} › ${row.label}`;
        (row.items || []).forEach(item => {
          const resolvedKey = item.articleKey || item.wikiSlug;
          const plainName = stripHtmlTags(item.name || resolvedKey);
          const notePlain = stripHtmlTags(item.note || '');
          const existing = entriesByKey.get(resolvedKey);
          if (existing) {
            existing.categoryLabel = ctxLabel;
            existing.notesNorm += ' ' + toHalfWidthLower(`${plainName} ${item.wikiSlug} ${notePlain} ${ctxLabel}`);
          } else {
            entriesByKey.set(resolvedKey, {
              key: resolvedKey,
              slug: item.wikiSlug,
              title: plainName,
              titleNorm: toHalfWidthLower(`${plainName} ${item.wikiSlug}`),
              hasArticle: false,
              categoryLabel: `${ctxLabel}（準備中）`,
              notesNorm: toHalfWidthLower(`${notePlain} ${ctxLabel}`),
              bodyPlain: notePlain || `${ctxLabel} の項目`,
              bodyNorm: toHalfWidthLower(`${notePlain} ${ctxLabel}`),
              sections: []
            });
          }
        });
      });
    });
  });

  wikiSearchEntries = Array.from(entriesByKey.values());
}

function clearWikiInlineHighlights() {
  if (!wikiArticleContainer) return;
  const marks = wikiArticleContainer.querySelectorAll('mark.wiki-inline-mark');
  if (marks.length === 0) return;
  marks.forEach(mark => {
    const parent = mark.parentNode;
    if (!parent) return;
    parent.replaceChild(document.createTextNode(mark.textContent), mark);
    parent.normalize();
  });
}

function applyWikiSearchHighlightsOnly() {
  clearWikiInlineHighlights();
  const input = document.getElementById('wikiSearchInput');
  if (!input) return;
  const rawQuery = input.value.trim();
  if (!rawQuery || !currentWikiArticleKey) return;

  const terms = toHalfWidthLower(rawQuery).split(/\s+/).filter(Boolean);
  const rawTerms = rawQuery.split(/\s+/).filter(Boolean);
  const regexTerms = Array.from(new Set([...rawTerms, ...terms]));
  const regex = buildSearchHighlightRegex(regexTerms);
  if (!regex) return;

  const articleEl = wikiArticleContainer.querySelector('.wiki-article');
  if (!articleEl) return;

  const walker = document.createTreeWalker(articleEl, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (parent.closest('.wiki-meta-box, .wiki-license-footer, mark')) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    }
  });

  const textNodes = [];
  let cur;
  while ((cur = walker.nextNode())) {
    textNodes.push(cur);
  }

  textNodes.forEach(node => {
    const text = node.nodeValue;
    regex.lastIndex = 0;
    if (!regex.test(text)) return;
    regex.lastIndex = 0;

    const frag = document.createDocumentFragment();
    let lastIdx = 0;
    let m;
    while ((m = regex.exec(text)) !== null) {
      if (m.index > lastIdx) {
        frag.appendChild(document.createTextNode(text.slice(lastIdx, m.index)));
      }
      const mark = document.createElement('mark');
      mark.className = 'wiki-inline-mark';
      mark.textContent = m[0];
      frag.appendChild(mark);
      lastIdx = regex.lastIndex;
      if (m[0].length === 0) break;
    }
    if (lastIdx < text.length) {
      frag.appendChild(document.createTextNode(text.slice(lastIdx)));
    }
    node.parentNode.replaceChild(frag, node);
  });
}

(function initWikiSearchController() {
  const input = document.getElementById('wikiSearchInput');
  const clearBtnEl = document.getElementById('wikiSearchClearBtn');
  const metaEl = document.getElementById('wikiSearchMeta');
  const resultsEl = document.getElementById('wikiSearchResults');
  if (!input || !clearBtnEl || !metaEl || !resultsEl) return;

  function hideResultsPanel() {
    resultsEl.classList.add('hidden');
  }

  function runWikiSearch(openDropdown = true) {
    const rawQuery = input.value.trim();
    clearBtnEl.classList.toggle('hidden', input.value.length === 0);

    if (!rawQuery) {
      metaEl.classList.add('hidden');
      metaEl.textContent = '';
      resultsEl.innerHTML = '';
      hideResultsPanel();
      clearWikiInlineHighlights();
      return;
    }

    const terms = toHalfWidthLower(rawQuery).split(/\s+/).filter(Boolean);
    const rawTerms = rawQuery.split(/\s+/).filter(Boolean);
    const displayTerms = Array.from(new Set([...rawTerms, ...terms]));

    // 記事閲覧中のハイライト反映＆ページ内一致スキャン
    applyWikiSearchHighlightsOnly();
    const inPageMatches = [];
    if (currentWikiArticleKey && wikiArticleContainer) {
      const targets = wikiArticleContainer.querySelectorAll('.wiki-spec-table tr, .wiki-section');
      targets.forEach((el, idx) => {
        const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
        const normText = toHalfWidthLower(text);
        if (terms.every(t => normText.includes(t))) {
          const isSpec = el.tagName === 'TR';
          const headingEl = isSpec ? el.querySelector('th') : el.querySelector('h2');
          const label = headingEl ? headingEl.textContent.trim() : `箇所 ${idx + 1}`;
          inPageMatches.push({ el, label, snippet: makeSearchSnippet(text, terms) });
        }
      });
    }

    // Wiki 全体（全記事＋Navbox項目）を検索
    const globalMatches = [];
    wikiSearchEntries.forEach(entry => {
      const combinedNorm = `${entry.titleNorm} ${entry.notesNorm} ${entry.bodyNorm}`;
      if (!terms.every(t => combinedNorm.includes(t))) return;

      let score = entry.hasArticle ? 10 : 0;
      let matchedSec = null;
      let snippetSource = entry.bodyPlain;

      terms.forEach(t => {
        if (entry.key.toLowerCase() === t) score += 120;
        else if (entry.titleNorm.includes(t)) score += 60;
        if (entry.notesNorm.includes(t)) score += 20;
      });

      for (const sec of entry.sections) {
        if (terms.every(t => `${sec.headingNorm} ${sec.textNorm}`.includes(t))) {
          if (matchedSec === null) {
            matchedSec = sec.idx;
            snippetSource = `${sec.heading} — ${sec.text}`;
          }
          if (terms.some(t => sec.headingNorm.includes(t))) score += 30;
          else score += 8;
        }
      }

      globalMatches.push({
        entry,
        score,
        matchedSec,
        snippet: makeSearchSnippet(snippetSource, terms)
      });
    });

    globalMatches.sort((a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title, 'ja'));
    const topGlobal = globalMatches.slice(0, 25);

    const parts = [];
    if (currentWikiArticleKey) {
      parts.push(`この記事内: ${inPageMatches.length}件`);
    }
    parts.push(`Wiki全体: ${globalMatches.length}件ヒット${globalMatches.length > 25 ? '（上位25件を表示）' : ''}`);
    metaEl.textContent = parts.join(' ／ ');
    metaEl.classList.remove('hidden');

    if (!openDropdown) return;

    let html = '';
    if (currentWikiArticleKey && inPageMatches.length > 0) {
      html += `<div class="wiki-search-group-title">📄 この記事内の一致 (${inPageMatches.length}件)</div>`;
      html += inPageMatches.map((m, i) => `
        <button type="button" class="wiki-search-item" data-inpage-idx="${i}">
          <div class="wiki-search-item-head">
            <span class="wiki-search-item-title">${highlightEscapedText(m.label, displayTerms)}</span>
            <span class="wiki-search-badge is-ready">記事内へ移動 ↓</span>
          </div>
          <div class="wiki-search-snippet">${highlightEscapedText(m.snippet, displayTerms)}</div>
        </button>
      `).join('');
    }

    if (topGlobal.length > 0) {
      html += `<div class="wiki-search-group-title">📚 Wiki全体からの検索結果 (${globalMatches.length}件)</div>`;
      html += topGlobal.map((item, i) => `
        <button type="button" class="wiki-search-item" data-global-idx="${i}">
          <div class="wiki-search-item-head">
            <span class="wiki-search-item-title">${highlightEscapedText(item.entry.title, displayTerms)}</span>
            <span class="wiki-search-badge ${item.entry.hasArticle ? 'is-ready' : ''}">${escapeHtml(item.entry.categoryLabel)}</span>
          </div>
          <div class="wiki-search-snippet">${highlightEscapedText(item.snippet, displayTerms)}</div>
        </button>
      `).join('');
    }

    if (!html) {
      html = '<div class="wiki-search-snippet" style="padding:14px;">一致する項目・記事は見つかりませんでした。</div>';
    }

    resultsEl.innerHTML = html;
    resultsEl.classList.remove('hidden');

    resultsEl.querySelectorAll('[data-inpage-idx]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-inpage-idx'), 10);
        const target = inPageMatches[idx];
        if (target && target.el) {
          hideResultsPanel();
          target.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          target.el.classList.remove('wiki-jump-flash');
          void target.el.offsetWidth;
          target.el.classList.add('wiki-jump-flash');
        }
      });
    });

    resultsEl.querySelectorAll('[data-global-idx]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-global-idx'), 10);
        const target = topGlobal[idx];
        if (!target) return;
        hideResultsPanel();
        renderInternalWikiArticle(target.entry.key, target.entry.title, target.entry.slug, target.matchedSec);
      });
    });
  }

  input.addEventListener('input', () => runWikiSearch(true));
  input.addEventListener('focus', () => {
    if (input.value.trim()) runWikiSearch(true);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const firstBtn = resultsEl.querySelector('.wiki-search-item');
      if (firstBtn && !resultsEl.classList.contains('hidden')) {
        e.preventDefault();
        firstBtn.click();
      }
    } else if (e.key === 'Escape') {
      hideResultsPanel();
    }
  });

  clearBtnEl.addEventListener('click', () => {
    input.value = '';
    runWikiSearch(false);
    input.focus();
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('#wikiSearchBox')) {
      hideResultsPanel();
    }
  });
})();
// ==========================================
// Syscon 内部モードページの公開フラグ制御
// ==========================================
(function initInternalPageVisibility() {
  const sysconNavLink = document.querySelector('.sidebar-nav .nav-item[data-view="syscon-internal"]');
  if (!ENABLE_SYSCON_INTERNAL_PAGE && sysconNavLink) {
    sysconNavLink.style.display = 'none';
  }
})();

// ==========================================
// PWA (Service Worker 登録 ＆ インストール案内)
// ==========================================
(function initPwaSupport() {
  const isSecureHost =
    window.location.protocol === 'https:' ||
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1';

  if ('serviceWorker' in navigator && isSecureHost) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {});
    });
  }

  const installBtn = document.getElementById('pwaInstallBtn');
  let deferredPrompt = null;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (installBtn) {
      installBtn.classList.remove('hidden');
    }
  });

  if (installBtn) {
    installBtn.addEventListener('click', async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      try {
        await deferredPrompt.userChoice;
      } catch (_) {}
      deferredPrompt = null;
      installBtn.classList.add('hidden');
    });
  }

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    if (installBtn) {
      installBtn.classList.add('hidden');
    }
  });
})();