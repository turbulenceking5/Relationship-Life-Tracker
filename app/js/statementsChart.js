// Spending trend chart for the My Statements tab (Money tab) — a plain
// inline-SVG line chart (no canvas, no charting library, consistent with
// this app's no-build-step/zero-dependency approach) showing a signed-in
// user's total spent/received over time, bucketed by Month, Year, or a
// user-picked Custom date range.
//
// This is the first real chart in the app (everything else is the plain
// CSS `.contribution-bar` segmented bar used by expenses.js/statements.js),
// so there's no existing line-chart code to copy — but it still matches
// the app's existing visual language: `.segmented` for the mode switch,
// `.section-title`/`.meta`/`.empty-state`/`.contribution-legend` from
// styles.css, `formatMoney()` from format.js, and the `h()`/`mount()` DOM
// helpers from dom.js for every *non*-SVG element built here.
//
// `h()` (dom.js) builds elements via `document.createElement`, which only
// ever produces HTML-namespace elements — calling it with an SVG tag name
// (`svg`, `circle`, `polyline`, …) silently creates a useless
// HTMLUnknownElement instead of a real SVG node. `svgEl()` below is this
// module's own equivalent, built with `document.createElementNS` instead,
// kept local rather than added to the shared `h()` since this is meant to
// stay a self-contained module and dom.js isn't otherwise touched.
//
// Buckets are built purely from each transaction's own `txn_date`, never
// from `bank_statements.period_month/period_year` — a multi-month
// statement's individual transactions can land on real dates that don't
// all match that statement's own label (see splitIntoPeriods() in
// statements.js / docs/27-feature-bank-statements.md), so the transaction
// date is the ground truth for a time series. `statements` is accepted
// only to match the shape the caller already has on hand; this module
// doesn't read anything off it.
import { h, mount } from './dom.js';
import { formatMoney } from './format.js';
import { categoryColor } from './expenses.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// ---- Module-level state (persists across re-renders) ---------------------
// statements.js's render() rebuilds its whole tab from scratch after every
// save (see docs/14-ui-patterns.md "Section screens"), and whoever wires
// this chart in will call renderSpendingTrendChart() again on every one of
// those re-renders. A plain top-level `let` — not state scoped to one call
// — is what survives that, exactly the pattern money.js already uses for
// its own `activeSub` sub-tab variable.
let activeRange = 'month'; // 'month' | 'year' | 'custom' | 'category'
let customStart = null; // set to the earliest txn date the first time Custom is ever shown
let customEnd = null; // set to the latest txn date the first time Custom is ever shown
let categoryPeriodType = 'month'; // 'month' | 'year', for the "By Category" tab's single-period picker
let categoryPeriodValue = null; // "YYYY-MM" or "YYYY" depending on categoryPeriodType — set to the most recent period with data the first time "By Category" is ever shown

const RANGE_TABS = [
  { key: 'month', label: 'Month' },
  { key: 'year', label: 'Year' },
  { key: 'custom', label: 'Custom' },
  { key: 'category', label: 'By Category' },
];

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ---- Small SVG-building helper (see the file-top comment for why) --------
function svgEl(tag, attrs = {}, children = []) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value !== undefined && value !== null && value !== false) el.setAttribute(key, value);
  }
  for (const child of [].concat(children)) {
    if (child === null || child === undefined || child === false) continue;
    el.appendChild(typeof child === 'string' || typeof child === 'number' ? document.createTextNode(child) : child);
  }
  return el;
}

// ---- Bucketing -------------------------------------------------------------

function monthKey(dateStr) {
  return dateStr.slice(0, 7); // "YYYY-MM"
}
function monthLabel(key) {
  const [y, m] = key.split('-');
  return `${MONTH_ABBR[Number(m) - 1]} ${y}`;
}
function yearKey(dateStr) {
  return dateStr.slice(0, 4); // "YYYY"
}
function yearLabel(key) {
  return key;
}

// One bucket per distinct key actually present in `transactions` — never
// an invented/empty bucket for a month or year with no transactions, per
// the spec ("spanning the full range of data present," not a padded
// calendar). Spend is summed as a positive magnitude (abs of a negative
// amount); received is summed as-is (positive amounts only).
function bucketTransactions(transactions, keyFn, labelFn) {
  const map = new Map();
  for (const t of transactions) {
    const key = keyFn(t.txn_date);
    if (!map.has(key)) map.set(key, { key, spent: 0, received: 0 });
    const bucket = map.get(key);
    const amount = Number(t.amount) || 0;
    if (amount < 0) bucket.spent += Math.abs(amount);
    else bucket.received += amount;
  }
  return [...map.values()]
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .map((b) => ({ ...b, label: labelFn(b.key) }));
}

// ---- "Nice" axis numbers ---------------------------------------------------
// Standard nice-number algorithm so the y-axis gridlines land on round
// values (0 / 500 / 1,000 / …) rather than whatever the raw max happens to
// be — see dataviz skill guidance ("round to clean numbers").
function niceNumber(range, round) {
  if (!(range > 0)) return 1;
  const exponent = Math.floor(Math.log10(range));
  const fraction = range / 10 ** exponent;
  let niceFraction;
  if (round) {
    if (fraction < 1.5) niceFraction = 1;
    else if (fraction < 3) niceFraction = 2;
    else if (fraction < 7) niceFraction = 5;
    else niceFraction = 10;
  } else if (fraction <= 1) niceFraction = 1;
  else if (fraction <= 2) niceFraction = 2;
  else if (fraction <= 5) niceFraction = 5;
  else niceFraction = 10;
  return niceFraction * 10 ** exponent;
}

function niceScale(maxValue, tickCount = 4) {
  if (!(maxValue > 0)) return { max: 100, ticks: [0, 50, 100] };
  const niceRange = niceNumber(maxValue, false);
  const step = niceNumber(niceRange / (tickCount - 1), true);
  const niceMax = Math.ceil(maxValue / step) * step;
  const ticks = [];
  for (let v = 0; v <= niceMax + step / 1000; v += step) ticks.push(Math.round(v * 100) / 100);
  return { max: niceMax, ticks };
}

// ---- Chart rendering --------------------------------------------------------
// A `viewBox` + CSS `width: 100%` (set on `.spending-trend-chart` in
// styles.css) rather than a fixed pixel size, so it scales down cleanly to
// a ~360px-wide phone screen. All colors come from `var(--...)` custom
// properties — never a hardcoded hex — so light/dark/glow/forced-theme all
// adapt automatically with no extra work here (see docs/14-ui-patterns.md
// "Theming"). No hover tooltip: per the spec, a light gridline plus
// always-visible axis labels is simplest and most mobile-friendly, and
// sidesteps needing a touch-friendly tooltip at all. No CSS
// transitions/animations on the chart either, so there's nothing to gate
// behind `prefers-reduced-motion`.
function buildChartSvg(buckets, currency) {
  const width = 400;
  const height = 220;
  const padLeft = 60;
  const padRight = 14;
  const padTop = 14;
  const padBottom = 30;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const maxVal = Math.max(0, ...buckets.map((b) => Math.max(b.spent, b.received)));
  const { max: niceMax, ticks } = niceScale(maxVal);

  const n = buckets.length;
  const xFor = (i) => (n === 1 ? padLeft + plotW / 2 : padLeft + (i / (n - 1)) * plotW);
  const yFor = (v) => padTop + plotH - (v / niceMax) * plotH;

  const gridlines = ticks.map((t) => {
    const y = yFor(t);
    return svgEl('g', {}, [
      svgEl('line', { x1: padLeft, x2: width - padRight, y1: y, y2: y, stroke: 'var(--border)', 'stroke-width': 1 }),
      svgEl('text', { x: padLeft - 8, y: y + 3, 'text-anchor': 'end', class: 'chart-axis-label' }, formatMoney(t, currency)),
    ]);
  });

  // Thin x-axis labels down when there are more buckets than fit legibly
  // at phone width — always keep the first and last so the range's span
  // is still readable at a glance. The first/last labels anchor outward
  // (start/end) rather than centered, so they sit inside the viewBox
  // instead of overflowing past its left/right edge and getting clipped.
  const labelStep = Math.max(1, Math.ceil(n / 6));
  const xLabels = buckets
    .map((b, i) => {
      if (i % labelStep !== 0 && i !== n - 1) return null;
      const anchor = i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle';
      return svgEl('text', { x: xFor(i), y: height - padBottom + 18, 'text-anchor': anchor, class: 'chart-axis-label' }, b.label);
    })
    .filter(Boolean);

  const pointsFor = (key) => buckets.map((b, i) => `${xFor(i)},${yFor(b[key])}`).join(' ');
  const markersFor = (key, color) => buckets.map((b, i) => svgEl('circle', {
    cx: xFor(i), cy: yFor(b[key]), r: 4, fill: color, stroke: 'var(--surface)', 'stroke-width': 2,
  }));

  const axisLines = [
    svgEl('line', { x1: padLeft, x2: padLeft, y1: padTop, y2: height - padBottom, stroke: 'var(--border)', 'stroke-width': 1 }),
    svgEl('line', { x1: padLeft, x2: width - padRight, y1: height - padBottom, y2: height - padBottom, stroke: 'var(--border)', 'stroke-width': 1 }),
  ];

  // "Received" is dashed in addition to being the second color — identity
  // is never color-alone here even before the legend below, which matters
  // since --accent/--accent-2 (unlike --series-1..8) aren't a validated
  // color-blind-safe pair (see docs/14-ui-patterns.md "Color-by-person").
  const spentLine = svgEl('polyline', {
    points: pointsFor('spent'), fill: 'none', stroke: 'var(--accent)', 'stroke-width': 2,
    'stroke-linecap': 'round', 'stroke-linejoin': 'round',
  });
  const receivedLine = svgEl('polyline', {
    points: pointsFor('received'), fill: 'none', stroke: 'var(--accent-2)', 'stroke-width': 2,
    'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-dasharray': '6 4',
  });

  return svgEl('svg', {
    viewBox: `0 0 ${width} ${height}`,
    class: 'spending-trend-chart',
    role: 'img',
    'aria-label': 'Spending trend over time, showing total spent and received per period',
  }, [
    ...gridlines,
    ...axisLines,
    ...xLabels,
    spentLine,
    receivedLine,
    ...markersFor('spent', 'var(--accent)'),
    ...markersFor('received', 'var(--accent-2)'),
  ]);
}

// Text-labeled legend, not just two differently-colored lines — per
// docs/14-ui-patterns.md's "identity is never color-alone" rule. Reuses
// `.contribution-legend`/`.swatch` from styles.css (the same visual
// language as the category-breakdown legend elsewhere in this tab) rather
// than inventing a near-duplicate class.
function buildLegend() {
  return h('div', { class: 'contribution-legend' }, [
    h('div', { class: 'item' }, [h('span', { class: 'swatch', style: 'background:var(--accent)' }), h('span', {}, 'Spent')]),
    h('div', { class: 'item' }, [h('span', { class: 'swatch', style: 'background:var(--accent-2)' }), h('span', {}, 'Received')]),
  ]);
}

// ---- "By Category" bar chart + PDF export ---------------------------------
// A separate view from the trend line above: one horizontal bar per
// category, for a single selected month or year, so two categories'
// totals are directly comparable by bar length — the stacked
// `.contribution-bar` used elsewhere in this tab (and in expenses.js) is
// good for "share of the whole" at a glance, but its segments start at
// different x-positions, which makes "which of these two categories was
// bigger" a width-estimation exercise, not a direct comparison. This is
// deliberately its own chart type for that reason, not a restyle of the
// existing one.
function categoryBarLabel(cat) {
  return cat.charAt(0).toUpperCase() + cat.slice(1);
}

function periodKeyLength(periodType) {
  return periodType === 'year' ? 4 : 7; // "YYYY" vs "YYYY-MM"
}

// Spend only (amount < 0, summed as a positive magnitude) — same
// convention as every other category breakdown in this app
// (statements.js's categoryBreakdown(), expenses.js's monthlyBreakdown()).
// `category` falls back to 'unknown' for anything still sitting in
// "Needs review", same fallback categoryBreakdown() already uses, so an
// uncategorized transaction still counts toward the period's real total
// instead of silently vanishing from it.
function categoryTotalsForPeriod(transactions, periodType, periodValue) {
  const keyLen = periodKeyLength(periodType);
  const inPeriod = transactions.filter((t) => t.txn_date && t.txn_date.slice(0, keyLen) === periodValue && Number(t.amount) < 0);
  const totals = new Map();
  for (const t of inPeriod) {
    const cat = t.category || 'unknown';
    totals.set(cat, (totals.get(cat) || 0) + Math.abs(Number(t.amount)));
  }
  const total = [...totals.values()].reduce((a, b) => a + b, 0);
  const entries = [...totals.entries()]
    .map(([cat, amount]) => ({ cat, amount, color: cat === 'unknown' ? 'var(--text-muted)' : categoryColor(cat) }))
    .sort((a, b) => b.amount - a.amount);
  return { entries, total, transactionCount: inPeriod.length };
}

// Fixed label/value columns either side of the bar area (see the
// gridlines in buildChartSvg() above for the equivalent "nice number"
// idea on the trend chart) means a bar's length can never collide with
// its own value label, regardless of how long that bar is — simpler and
// more robust here than computing per-row label placement.
function buildCategoryBarsSvg(entries, currency) {
  const width = 400;
  const rowH = 22;
  const gap = 8;
  const padTop = 6;
  const padLeft = 4;
  const padRight = 4;
  const labelW = 104;
  const valueColW = 70;
  const barAreaW = width - padLeft - labelW - valueColW - padRight;
  const height = padTop * 2 + entries.length * (rowH + gap) - gap;
  const maxAmount = Math.max(...entries.map((e) => e.amount), 1);
  const barX = padLeft + labelW;

  const rows = entries.flatMap((e, i) => {
    const y = padTop + i * (rowH + gap);
    const barW = Math.max(3, (e.amount / maxAmount) * barAreaW);
    return [
      svgEl('text', { x: padLeft, y: y + rowH / 2 + 4, 'text-anchor': 'start', class: 'chart-axis-label' }, categoryBarLabel(e.cat)),
      svgEl('rect', { x: barX, y, width: barW, height: rowH - 4, rx: 4, ry: 4, fill: e.color }),
      svgEl('text', { x: width - padRight, y: y + rowH / 2 + 4, 'text-anchor': 'end', class: 'chart-axis-label' }, formatMoney(e.amount, currency)),
    ];
  });

  return svgEl('svg', {
    viewBox: `0 0 ${width} ${height}`,
    class: 'category-bars-chart',
    role: 'img',
    'aria-label': 'Spending by category for the selected period',
  }, rows);
}

// Escapes untrusted text (a category name, a transaction description)
// before it's dropped into the print report via document.write() below —
// this is a real injection risk otherwise, not just a style nitpick: a
// manually-typed description containing `<script>`-like text must never
// execute in that new document.
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Opens a plain, self-contained HTML document in a new tab/window and
// triggers the browser's native print dialog on it — "Save as PDF" from
// there is what actually produces a PDF file, same as any other
// print-to-PDF flow, rather than this app generating one directly (no
// PDF-writing library, consistent with the rest of this app's
// no-build-step/zero-dependency approach). The new document defines its
// own `:root` with the same `--series-1..8`/`--text-muted` values
// styles.css's LIGHT theme uses (never the user's current dark/glow
// theme — a printed report should stay light/ink-friendly regardless),
// so `categoryColor()`'s `var(--series-N)` strings resolve correctly
// here too even though this is a completely separate document.
// `window.open()` is called synchronously from the button's own click
// handler (never after an `await`), since calling it any later is what
// trips a popup blocker.
function exportCategoryPdf(periodLabel, entries, total, currency, transactions) {
  const win = window.open('', '_blank');
  if (!win) {
    alert('Your browser blocked the new tab this report opens in — allow popups for this site and try again.');
    return;
  }
  const rows = entries.map((e) => `
    <div class="row">
      <div class="label">${escapeHtml(categoryBarLabel(e.cat))}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.max(2, (e.amount / entries[0].amount) * 100)}%;background:${e.color}"></div></div>
      <div class="value">${escapeHtml(formatMoney(e.amount, currency))}</div>
      <div class="pct">${total ? Math.round((e.amount / total) * 100) : 0}%</div>
    </div>`).join('');
  const txnRows = [...transactions]
    .sort((a, b) => (a.txn_date < b.txn_date ? -1 : 1))
    .map((t) => `<tr><td>${escapeHtml(t.txn_date || '')}</td><td>${escapeHtml(t.description)}</td><td>${escapeHtml(categoryBarLabel(t.category || 'unknown'))}</td><td class="num">${escapeHtml(formatMoney(Number(t.amount), currency))}</td></tr>`)
    .join('');

  win.document.write(`<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Spending report — ${escapeHtml(periodLabel)}</title>
<style>
  :root {
    --series-1: #2a78d6; --series-2: #eb6834; --series-3: #1baf7a; --series-4: #eda100;
    --series-5: #e87ba4; --series-6: #008300; --series-7: #4a3aa7; --series-8: #e34948;
    --text: #241f1a; --text-muted: #766e63; --border: #e4ddd1;
  }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, system-ui, sans-serif; color: var(--text); margin: 32px; }
  h1 { font-size: 1.4rem; margin: 0 0 4px; }
  .meta { color: var(--text-muted); font-size: 0.9rem; margin-bottom: 20px; }
  .total { font-size: 1.1rem; font-weight: 700; margin-bottom: 20px; }
  .row { display: flex; align-items: center; gap: 10px; margin: 8px 0; font-size: 0.85rem; }
  .label { width: 130px; flex-shrink: 0; }
  .bar-track { flex: 1; background: #eee; border-radius: 4px; height: 14px; overflow: hidden; }
  .bar-fill { height: 100%; border-radius: 4px; }
  .value { width: 90px; text-align: right; flex-shrink: 0; }
  .pct { width: 48px; text-align: right; color: var(--text-muted); flex-shrink: 0; }
  table { width: 100%; border-collapse: collapse; margin-top: 28px; font-size: 0.82rem; }
  th, td { text-align: left; padding: 5px 8px; border-bottom: 1px solid var(--border); }
  .num { text-align: right; }
  @media print { body { margin: 12px; } }
</style>
</head>
<body>
  <h1>Spending report</h1>
  <div class="meta">${escapeHtml(periodLabel)}</div>
  <div class="total">Total spent: ${escapeHtml(formatMoney(total, currency))}</div>
  ${rows}
  ${transactions.length ? `<table><thead><tr><th>Date</th><th>Description</th><th>Category</th><th class="num">Amount</th></tr></thead><tbody>${txnRows}</tbody></table>` : ''}
</body>
</html>`);
  win.document.close();
  win.focus();
  // A brief delay so the new document has actually laid out before
  // print() runs — calling it immediately after document.write()/close()
  // can otherwise print a blank/partial page in some browsers.
  setTimeout(() => win.print(), 250);
}

// Renders the "By Category" tab's whole body — period-type toggle
// (Month/Year), the matching native picker, the "Export PDF" button, and
// the bar chart itself — into `parts` (statementsChart.js's caller below
// mounts whatever this pushes, same as the trend-chart branches do for
// their own controls).
function buildCategoryView(parts, transactions, currency, rerender) {
  const valid = transactions.filter((t) => t && t.txn_date);
  if (!valid.length) {
    parts.push(h('div', { class: 'empty-state' }, 'No transactions yet.'));
    return;
  }
  const sortedDates = valid.map((t) => t.txn_date).sort();
  const minDate = sortedDates[0];
  const maxDate = sortedDates[sortedDates.length - 1];
  if (categoryPeriodValue === null) {
    categoryPeriodValue = maxDate.slice(0, periodKeyLength(categoryPeriodType));
  }

  const typeToggle = h('div', { class: 'segmented' }, [
    h('button', {
      class: categoryPeriodType === 'month' ? 'active' : '',
      type: 'button',
      onclick: () => { categoryPeriodType = 'month'; categoryPeriodValue = maxDate.slice(0, 7); rerender(); },
    }, 'Month'),
    h('button', {
      class: categoryPeriodType === 'year' ? 'active' : '',
      type: 'button',
      onclick: () => { categoryPeriodType = 'year'; categoryPeriodValue = maxDate.slice(0, 4); rerender(); },
    }, 'Year'),
  ]);

  const periodInput = categoryPeriodType === 'year'
    ? h('input', {
        type: 'number', inputmode: 'numeric', min: minDate.slice(0, 4), max: maxDate.slice(0, 4), value: categoryPeriodValue,
        onchange: (e) => { categoryPeriodValue = e.target.value; rerender(); },
      })
    : h('input', {
        type: 'month', min: minDate.slice(0, 7), max: maxDate.slice(0, 7), value: categoryPeriodValue,
        onchange: (e) => { if (e.target.value) { categoryPeriodValue = e.target.value; rerender(); } },
      });

  const { entries, total, transactionCount } = categoryTotalsForPeriod(valid, categoryPeriodType, categoryPeriodValue);
  const periodLabel = categoryPeriodType === 'year'
    ? categoryPeriodValue
    : new Date(`${categoryPeriodValue}-01T00:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  const exportBtn = h('button', {
    class: 'btn secondary small',
    type: 'button',
    disabled: !transactionCount,
    onclick: () => exportCategoryPdf(
      periodLabel,
      entries,
      total,
      currency,
      valid.filter((t) => t.txn_date.slice(0, periodKeyLength(categoryPeriodType)) === categoryPeriodValue),
    ),
  }, 'Export PDF');

  parts.push(h('div', { class: 'field-row' }, [
    h('div', { class: 'field' }, [h('label', {}, 'View by'), typeToggle]),
    h('div', { class: 'field' }, [h('label', {}, categoryPeriodType === 'year' ? 'Year' : 'Month'), periodInput]),
  ]));
  parts.push(h('div', { class: 'actions-row' }, [exportBtn]));

  if (!entries.length) {
    parts.push(h('div', { class: 'empty-state' }, `No spending in ${periodLabel}.`));
    return;
  }
  parts.push(h('div', { class: 'total-banner' }, [
    h('span', {}, `Spent in ${periodLabel}`),
    h('span', { class: 'value' }, formatMoney(total, currency)),
  ]));
  parts.push(buildCategoryBarsSvg(entries, currency));
}

/**
 * Renders a line chart of the signed-in user's bank-statement spending
 * (and income) over time into `container`, with Month/Year/Custom
 * bucketing controls. See the file-top comment for the bucketing/state
 * rules.
 *
 * @param {HTMLElement} container - mounted into via mount() (clears first)
 * @param {Array} statements - the user's bank_statements rows (unused for
 *   bucketing — accepted so callers can pass what they already have; see
 *   file-top comment for why txn_date is the ground truth instead)
 * @param {Array} transactions - the user's bank_transactions rows
 * @param {string} currency - the household's currency code, passed straight
 *   through to formatMoney()
 */
export function renderSpendingTrendChart(container, statements, transactions, currency) {
  const valid = (transactions || []).filter((t) => t && t.txn_date);

  if (!valid.length) {
    mount(container, h('div', { class: 'empty-state' }, 'No transactions yet — your spending trend will appear here once a statement has transactions.'));
    return;
  }

  const sortedDates = valid.map((t) => t.txn_date).sort();
  const minDate = sortedDates[0];
  const maxDate = sortedDates[sortedDates.length - 1];
  // Only ever set on first use (module-level state, see above) — never
  // overwritten on a later re-render, so an already-applied Custom range
  // isn't silently reset back to the full data span.
  if (customStart === null) customStart = minDate;
  if (customEnd === null) customEnd = maxDate;

  const rerender = () => renderSpendingTrendChart(container, statements, transactions, currency);

  const subNav = h('div', { class: 'segmented' }, RANGE_TABS.map((tab) => h('button', {
    class: tab.key === activeRange ? 'active' : '',
    type: 'button',
    onclick: () => { activeRange = tab.key; rerender(); },
  }, tab.label)));

  const parts = [h('div', { class: 'section-title' }, 'Spending'), subNav];

  if (activeRange === 'category') {
    buildCategoryView(parts, valid, currency, rerender);
    mount(container, parts);
    return;
  }

  let buckets;
  if (activeRange === 'year') {
    buckets = bucketTransactions(valid, yearKey, yearLabel);
  } else if (activeRange === 'custom') {
    const startInput = h('input', { type: 'date', value: customStart });
    const endInput = h('input', { type: 'date', value: customEnd });
    const errorEl = h('div', { class: 'error-msg', style: 'display:none' }, 'Start date must be on or before the end date.');
    const applyBtn = h('button', {
      class: 'btn secondary small',
      type: 'button',
      onclick: () => {
        const s = startInput.value;
        const e = endInput.value;
        if (!s || !e || s > e) {
          errorEl.style.display = 'block';
          return;
        }
        customStart = s;
        customEnd = e;
        rerender();
      },
    }, 'Apply');
    parts.push(h('div', { class: 'field-row' }, [
      h('div', { class: 'field' }, [h('label', {}, 'Start'), startInput]),
      h('div', { class: 'field' }, [h('label', {}, 'End'), endInput]),
    ]));
    parts.push(h('div', { class: 'actions-row' }, [applyBtn]));
    parts.push(errorEl);

    const inRange = valid.filter((t) => t.txn_date >= customStart && t.txn_date <= customEnd);
    buckets = bucketTransactions(inRange, monthKey, monthLabel);
  } else {
    buckets = bucketTransactions(valid, monthKey, monthLabel);
  }

  if (!buckets.length) {
    parts.push(h('div', { class: 'empty-state' }, 'No transactions in that date range.'));
  } else {
    parts.push(buildChartSvg(buckets, currency));
    parts.push(buildLegend());
  }

  mount(container, parts);
}
