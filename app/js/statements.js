// Statement overview (Money tab segment) — upload a bank statement
// (CSV or PDF), store it in the household's shared Google Drive folder
// renamed to its period, parse it into individual transactions, and
// auto-categorize what it confidently can. Anything it can't lands in
// "Needs review" for a partner to assign a category to by hand. See
// docs/27-feature-bank-statements.md for the full design, in particular
// why this reuses the one existing shared Drive folder rather than a
// separate "Bank Statements" subfolder.
import { h, mount, openSheet, closeSheet, makeSheet, withBusyLabel } from './dom.js';
import { fetchRows, insertRow, insertRows, updateRow, deleteRow } from './crud.js';
import { formatMoney, formatDate, todayStr } from './format.js';
import { isConfigured, isDriveConnected, hasLocalDriveAccess, uploadFileToDrive, deleteDriveFile, folderUrl } from './googleDrive.js';
import { CATEGORIES } from './expenses.js';

const STATEMENTS_TABLE = 'bank_statements';
const TRANSACTIONS_TABLE = 'bank_transactions';
const DRIVE_PREFIX = '[Bank Statement]';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function statementLabel(month, year) {
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

function categoryLabel(category) {
  return category.charAt(0).toUpperCase() + category.slice(1);
}

// ---- Auto-categorization ---------------------------------------------
// Plain keyword matching against the same CATEGORIES taxonomy expenses
// use — deliberately not a "smart"/ML classifier. Anything that doesn't
// match a keyword stays uncategorized ('unknown') rather than guessing
// wrong silently; a partner assigns it by hand in "Needs review" below,
// which both fixes that transaction and gives a place to extend this
// list from real statements over time.
const CATEGORY_KEYWORDS = {
  groceries: ['woolworths', 'coles', 'aldi', 'iga ', 'foodworks', 'supermarket', 'costco'],
  bills: ['energy', 'electricity', 'telstra', 'optus', 'vodafone', 'origin', 'agl', 'water corp', 'internet', 'insurance', 'council rates'],
  rent: ['real estate', 'rental', 'strata', 'body corporate', 'property mgmt', 'property management'],
  transport: ['fuel', 'petrol', 'bp ', 'shell', 'caltex', '7-eleven', 'uber trip', 'myki', 'opal', 'translink', 'parking', 'toll'],
  household: ['bunnings', 'officeworks', 'ikea', 'kmart', 'big w', 'target', 'harvey norman', 'jb hi-fi'],
  leisure: ['netflix', 'spotify', 'cinema', 'restaurant', 'cafe', 'bar ', 'pub ', 'uber eats', 'menulog', 'doordash', 'deliveroo'],
};

function guessCategory(description) {
  const d = description.toLowerCase();
  for (const cat of CATEGORIES) {
    const words = CATEGORY_KEYWORDS[cat];
    if (words && words.some((w) => d.includes(w))) return cat;
  }
  return null;
}

// ---- Shared date/amount parsing helpers -------------------------------

function parseDateLoose(str) {
  if (!str) return null;
  const s = String(str).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    let [, d, mo, y] = m;
    if (y.length === 2) y = `20${y}`;
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return null;
}

// Whether a whole CSV cell is money-shaped (optionally $-prefixed,
// comma-grouped digits, optional decimal) — deliberately stricter than
// "contains a number," since a quoted description cell like "WOOLWORTHS
// 1234 BRISBANE" contains digits too and must never be mistaken for the
// amount or balance column.
function looksNumeric(str) {
  return /^-?\$?\d[\d,]*\.?\d*$/.test(String(str).trim());
}

function parseAmount(str) {
  if (!str || !looksNumeric(str)) return null;
  const cleaned = String(str).replace(/[^0-9.\-]/g, '');
  if (!cleaned || cleaned === '-' || cleaned === '.') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

// ---- CSV parsing --------------------------------------------------------
// Most bank CSV exports are "Date, Description, Amount[, Balance]" (one
// signed amount column) or "Date, Description, Debit, Credit[, Balance]"
// (two). We don't try to support every bank's exact column order or
// locale — we look for a header row naming Debit/Credit explicitly (and
// use those fixed column positions if found), otherwise fall back to
// "first numeric cell after the date is the amount," which covers the
// common single signed-Amount-column case. Negative = money out, same
// convention used throughout the app. This is inherently best-effort;
// the "Needs review" workflow below is the safety net for anything it
// gets wrong, but a flipped sign on a whole statement wouldn't be
// caught by category review alone — spot-check the totals after
// uploading. See docs/27-feature-bank-statements.md.
function splitCsvLine(line) {
  const cells = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else cur += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { cells.push(cur); cur = ''; }
    else cur += c;
  }
  cells.push(cur);
  return cells.map((c) => c.trim());
}

export function parseCsvStatement(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length);
  if (!lines.length) return [];

  const headerCells = splitCsvLine(lines[0]).map((c) => c.toLowerCase());
  const debitIdx = headerCells.findIndex((c) => c.includes('debit'));
  const creditIdx = headerCells.findIndex((c) => c.includes('credit'));
  const hasDebitCredit = debitIdx !== -1 && creditIdx !== -1;
  const looksLikeHeader = hasDebitCredit || headerCells.some((c) => /date|amount|description|narrative/.test(c));
  const dataLines = looksLikeHeader ? lines.slice(1) : lines;

  const transactions = [];
  for (const line of dataLines) {
    const cells = splitCsvLine(line);
    let date = null;
    let dateIdx = -1;
    for (let i = 0; i < cells.length; i++) {
      const d = parseDateLoose(cells[i]);
      if (d) { date = d; dateIdx = i; break; }
    }
    if (!date) continue; // not a transaction row (stray header/footer/balance line)

    let amount = null;
    const usedIdx = new Set([dateIdx]);
    if (hasDebitCredit) {
      const debit = parseAmount(cells[debitIdx]) || 0;
      const credit = parseAmount(cells[creditIdx]) || 0;
      if (debit || credit) amount = credit - debit;
      usedIdx.add(debitIdx);
      usedIdx.add(creditIdx);
    } else {
      for (let i = 0; i < cells.length; i++) {
        if (i === dateIdx) continue;
        const a = parseAmount(cells[i]);
        if (a !== null && cells[i] !== '') { amount = a; usedIdx.add(i); break; }
      }
    }
    if (amount === null) continue;

    // Drop any other purely-numeric cell (most commonly a trailing
    // running-balance column) from the description too — otherwise a
    // stray balance figure ends up glued onto the end of every
    // transaction's description, which is worse than occasionally
    // dropping a numeric reference number.
    for (let i = 0; i < cells.length; i++) {
      if (!usedIdx.has(i) && cells[i] !== '' && parseAmount(cells[i]) !== null) usedIdx.add(i);
    }

    const description = cells.filter((_, i) => !usedIdx.has(i)).join(' ').replace(/\s+/g, ' ').trim() || '(no description)';
    transactions.push({ txn_date: date, description, amount });
  }
  return transactions;
}

// ---- PDF parsing ---------------------------------------------------------
// Lazily loads pdf.js from cdnjs the first time a PDF is uploaded — most
// sessions never touch this, so it isn't worth a static <script> tag in
// index.html the way the always-relevant Google Drive scripts are.
// Extracts page text, then scans line by line for a "<date> ...
// <amount>" shape. This only ever works on a text-based PDF (the kind
// most banks generate); a scanned/photographed statement has no
// extractable text and will just come back with zero transactions — the
// upload still succeeds and "+ Add transaction" covers filling it in by
// hand, no dead end.
//
// Loaded as a dynamic import() of the .mjs build, not a classic <script
// src>: cdnjs only publishes the ES-module build (pdf.min.mjs/
// pdf.worker.min.mjs) for this pdf.js version — the old pdf.min.js/
// pdf.worker.min.js URLs 404, which (since extractPdfText()'s caller
// wraps everything in a broad try/catch, see parseStatementFile() below)
// used to fail completely silently: every PDF upload "succeeded" with
// zero transactions found, indistinguishable from a genuinely
// unreadable scanned PDF. Caught via a real statement file reproducing
// it end to end, not a scanned-PDF edge case.
let pdfJsModule = null;
let pdfJsLoading = null;
function ensurePdfJsLoaded() {
  if (pdfJsModule) return Promise.resolve(pdfJsModule);
  if (pdfJsLoading) return pdfJsLoading;
  pdfJsLoading = import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.mjs')
    .then((mod) => {
      mod.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.mjs';
      pdfJsModule = mod;
      return mod;
    })
    .catch(() => {
      pdfJsLoading = null;
      throw new Error('Could not load the PDF reader library — check your connection.');
    });
  return pdfJsLoading;
}

async function extractPdfText(file) {
  const pdfjsLib = await ensurePdfJsLoaded();
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  let text = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    let lastY = null;
    let line = '';
    for (const item of content.items) {
      const y = item.transform[5];
      if (lastY !== null && Math.abs(y - lastY) > 2) { text += line + '\n'; line = ''; }
      line += item.str + ' ';
      lastY = y;
    }
    text += line + '\n';
  }
  return text;
}

const MONTH_ABBR = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const DATE_PATTERNS = [
  /(\d{4})-(\d{1,2})-(\d{1,2})/,
  /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/,
  /(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{2,4})/,
];

function findDateToken(line) {
  for (let p = 0; p < DATE_PATTERNS.length; p++) {
    const m = line.match(DATE_PATTERNS[p]);
    if (!m) continue;
    let iso = null;
    if (p === 0) iso = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    else if (p === 1) { let y = m[3]; if (y.length === 2) y = `20${y}`; iso = `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
    else {
      const mo = MONTH_ABBR[m[2].slice(0, 3).toLowerCase()];
      if (!mo) continue;
      let y = m[3]; if (y.length === 2) y = `20${y}`;
      iso = `${y}-${String(mo).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    }
    return { date: iso, match: m[0], index: m.index };
  }
  return null;
}

export function parsePdfTransactions(text) {
  const transactions = [];
  const amountRe = /-?\$?\d[\d,]*\.\d{2}\s*(?:CR|DR)?/gi;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const dateTok = findDateToken(line);
    if (!dateTok) continue;
    const amounts = [...line.matchAll(amountRe)];
    if (!amounts.length) continue;
    // A trailing running-balance column (Date/Description/Withdrawal/
    // Deposit/Balance is a very standard AU bank statement shape, ING's
    // among them — confirmed against a real statement) means the LAST
    // number on the line is the balance, not the transaction amount,
    // whenever there's more than one number present; with exactly one,
    // there's no balance column to exclude and it IS the amount. Picking
    // "last" unconditionally (as this used to) silently recorded the
    // running balance as every transaction's amount instead.
    const chosen = amounts.length > 1 ? amounts[amounts.length - 2] : amounts[0];
    const isDebit = /dr\s*$/i.test(chosen[0]);
    const isCredit = /cr\s*$/i.test(chosen[0]);
    // parseAmount()/looksNumeric() are deliberately strict (no trailing
    // letters) so they don't mistake CSV description text for a number
    // — strip the CR/DR suffix before handing it the bare number.
    let amount = parseAmount(chosen[0].replace(/\s*(?:CR|DR)\s*$/i, ''));
    if (amount === null) continue;
    if (isDebit) amount = -Math.abs(amount);
    if (isCredit) amount = Math.abs(amount);
    // Slicing up to the chosen amount's own start (not literally "the
    // last match") naturally drops both that amount's own text and
    // anything after it on the line — the trailing balance included —
    // from the description, with no separate trim step needed for it.
    const description = line.slice(dateTok.index + dateTok.match.length, chosen.index).replace(/\s+/g, ' ').trim();
    if (!description) continue;
    transactions.push({ txn_date: dateTok.date, description, amount });
  }
  return transactions;
}

async function parseStatementFile(file) {
  const name = file.name.toLowerCase();
  try {
    if (name.endsWith('.csv') || file.type.includes('csv')) {
      return parseCsvStatement(await file.text());
    }
    if (name.endsWith('.pdf') || file.type === 'application/pdf') {
      return parsePdfTransactions(await extractPdfText(file));
    }
  } catch (err) {
    // best-effort — falls back to "add transactions manually" rather
    // than blocking the upload, but logged (not fully silent) so a real
    // tooling failure (a broken library URL, say — see
    // ensurePdfJsLoaded() above) doesn't masquerade as just another
    // unreadable scanned PDF with no trace left behind.
    console.warn('Could not parse statement file:', err.message);
    return [];
  }
  return [];
}

// Splits parsed transactions into one group per calendar month they
// actually fall in, sorted chronologically — a single uploaded
// statement file can cover more than one month (a billing-cycle export
// running e.g. the 15th to the 15th, or a multi-month history dump), so
// forcing the whole upload under one guessed month would file the
// transactions from the "wrong" end of that range under an inaccurate
// label. Each group becomes its own bank_statements row (see
// openUploadStatementSheet() below) — multiple rows can share the same
// underlying Drive file when they came from the same upload. Falls back
// to a single empty current-month group when nothing parsed (a scanned
// PDF, say), so there's always at least one row for the uploaded file
// to attach to.
function splitIntoPeriods(transactions) {
  if (!transactions.length) {
    const d = new Date();
    return [{ month: d.getMonth() + 1, year: d.getFullYear(), transactions: [] }];
  }
  const groups = new Map();
  for (const t of transactions) {
    const key = t.txn_date.slice(0, 7);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  }
  return [...groups.entries()]
    .map(([key, txns]) => {
      const [y, m] = key.split('-');
      return { month: Number(m), year: Number(y), transactions: txns };
    })
    .sort((a, b) => (a.year - b.year) || (a.month - b.month));
}

// ---- Report: category breakdown + trend vs the previous statement ------

function categoryBreakdown(transactions, currency) {
  const spend = transactions.filter((t) => Number(t.amount) < 0);
  if (!spend.length) return null;
  const totals = new Map();
  for (const t of spend) {
    const cat = t.category || 'unknown';
    totals.set(cat, (totals.get(cat) || 0) + Math.abs(Number(t.amount)));
  }
  const total = [...totals.values()].reduce((a, b) => a + b, 0);
  const entries = [...totals.entries()].map(([cat, amount]) => {
    const idx = CATEGORIES.indexOf(cat);
    return { cat, amount, colorIndex: (idx >= 0 ? idx : CATEGORIES.length) % 8 };
  }).sort((a, b) => b.amount - a.amount);

  return h('div', {}, [
    h('div', { class: 'contribution-bar' }, entries.map((e) => h('div', {
      class: 'segment',
      style: `width:${(e.amount / total) * 100}%;background:var(--series-${e.colorIndex + 1})`,
    }))),
    h('div', { class: 'contribution-legend' }, entries.map((e) => h('div', { class: 'item' }, [
      h('span', { class: 'swatch', style: `background:var(--series-${e.colorIndex + 1})` }),
      h('span', {}, `${e.cat === 'unknown' ? 'Uncategorized' : categoryLabel(e.cat)} · ${formatMoney(e.amount, currency)} (${Math.round((e.amount / total) * 100)}%)`),
    ]))),
  ]);
}

function categoryTotals(transactions) {
  const totals = new Map();
  for (const t of transactions) {
    if (Number(t.amount) >= 0 || !t.category) continue;
    totals.set(t.category, (totals.get(t.category) || 0) + Math.abs(Number(t.amount)));
  }
  return totals;
}

// A lightweight "did this get better or worse" readout, Buddy-style:
// per category, compares this statement's spend to the immediately
// preceding one. A >15% rise is flagged as worth a look; a drop is
// shown as a quiet win. Categories with no spend in either statement
// are skipped entirely rather than shown as a meaningless 0% change.
function trendVsPrevious(current, previous, currency) {
  if (!previous) return null;
  const curTotals = categoryTotals(current);
  const prevTotals = categoryTotals(previous);
  const cats = new Set([...curTotals.keys(), ...prevTotals.keys()]);
  const rows = [];
  for (const cat of cats) {
    const cur = curTotals.get(cat) || 0;
    const prev = prevTotals.get(cat) || 0;
    if (!cur && !prev) continue;
    const diff = cur - prev;
    const pct = prev > 0 ? Math.round((diff / prev) * 100) : (cur > 0 ? 100 : 0);
    rows.push({ cat, cur, prev, diff, pct });
  }
  if (!rows.length) return null;
  rows.sort((a, b) => b.diff - a.diff);

  return h('div', {}, rows.map((r) => {
    const up = r.diff > 0;
    const flagged = up && r.pct >= 15;
    const color = flagged ? 'var(--danger)' : (r.diff < 0 ? 'var(--accent-2)' : 'var(--text-muted)');
    const arrow = r.diff > 0 ? '↑' : r.diff < 0 ? '↓' : '→';
    return h('div', { class: 'meta', style: `color:${color};margin-bottom:4px` },
      `${arrow} ${categoryLabel(r.cat)}: ${formatMoney(r.cur, currency)} (${r.diff === 0 ? 'no change' : `${r.pct > 0 ? '+' : ''}${r.pct}% vs last statement`})${flagged ? ' — worth a look' : ''}`);
  }));
}

// ---- Upload sheet --------------------------------------------------------

function openUploadStatementSheet(ctx, onSaved) {
  const { dialog, body } = makeSheet('Upload bank statement');
  document.body.appendChild(dialog);
  dialog.addEventListener('close', () => dialog.remove());

  if (!isConfigured()) {
    mount(body, h('p', { class: 'meta' }, 'Google Drive isn’t set up for this deployment yet — see docs/21-google-drive-documents.md.'));
    openSheet(dialog);
    return;
  }
  if (!isDriveConnected(ctx.household) || !hasLocalDriveAccess(ctx)) {
    mount(body, h('p', { class: 'meta' }, 'Connect Google Drive first, from ⚙️ Account & household → Documents storage, then come back here to upload.'));
    openSheet(dialog);
    return;
  }

  const errorEl = h('div', { class: 'error-msg', style: 'display:none' });
  const fileInput = h('input', { type: 'file', required: true, accept: '.csv,.pdf,text/csv,application/pdf' });
  const statusEl = h('p', { class: 'meta' }, 'Choose a CSV or PDF export from your bank.');
  const submitBtn = h('button', { class: 'btn primary', type: 'submit', disabled: true }, 'Upload statement');

  // One group per calendar month actually represented in the file
  // (splitIntoPeriods()), not asked for: this used to be a single
  // editable "Statement month"/"Year" pair the uploader had to check on
  // every upload, which both added friction and was simply wrong for a
  // statement spanning more than one month (a billing-cycle export, a
  // multi-month history dump) — forcing everything under one guessed
  // label would file some transactions under the wrong month. Still
  // shown, just as a status line rather than something to confirm.
  let periods = splitIntoPeriods([]);

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    submitBtn.disabled = true;
    statusEl.textContent = 'Reading statement…';
    const parsedTransactions = await parseStatementFile(file);
    periods = splitIntoPeriods(parsedTransactions);
    if (!parsedTransactions.length) {
      const only = statementLabel(periods[0].month, periods[0].year);
      statusEl.textContent = `Couldn’t automatically read any transactions from this file (common for scanned PDFs) — filing it under ${only}. It’ll still upload, and you can add transactions by hand afterwards.`;
    } else if (periods.length === 1) {
      const only = statementLabel(periods[0].month, periods[0].year);
      statusEl.textContent = `Found ${parsedTransactions.length} transaction${parsedTransactions.length === 1 ? '' : 's'} for ${only}.`;
    } else {
      const breakdown = periods.map((p) => `${statementLabel(p.month, p.year)} (${p.transactions.length})`).join(', ');
      statusEl.textContent = `Found ${parsedTransactions.length} transactions across ${periods.length} periods: ${breakdown}.`;
    }
    submitBtn.disabled = false;
  });

  const form = h('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      errorEl.style.display = 'none';
      const file = fileInput.files[0];
      if (!file) return;
      const restore = withBusyLabel(submitBtn, 'Uploading…');
      try {
        const ext = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')) : '';
        // One uploaded file can produce several bank_statements rows
        // (one per represented month) that all point at this same Drive
        // file — its name reflects the full span, not just one of them.
        const driveLabel = periods.length === 1
          ? statementLabel(periods[0].month, periods[0].year)
          : `${statementLabel(periods[0].month, periods[0].year)} – ${statementLabel(periods[periods.length - 1].month, periods[periods.length - 1].year)}`;
        const fileName = `${DRIVE_PREFIX} ${driveLabel}${ext}`;
        const uploaded = await uploadFileToDrive(ctx, file, fileName);
        await Promise.all(periods.map(async (period) => {
          const label = statementLabel(period.month, period.year);
          const statement = await insertRow(STATEMENTS_TABLE, {
            household_id: ctx.household.id,
            period_month: period.month,
            period_year: period.year,
            label,
            original_filename: file.name,
            drive_file_id: uploaded.id,
            drive_web_view_link: uploaded.webViewLink,
            file_name: fileName,
            mime_type: file.type,
            uploaded_by: ctx.user.id,
          });
          if (period.transactions.length) {
            await insertRows(TRANSACTIONS_TABLE, period.transactions.map((t) => {
              const category = guessCategory(t.description);
              return {
                household_id: ctx.household.id,
                statement_id: statement.id,
                txn_date: t.txn_date,
                description: t.description,
                amount: t.amount,
                category,
                status: category ? 'categorized' : 'unknown',
              };
            }));
          }
        }));
        closeSheet(dialog);
        onSaved();
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.style.display = 'block';
        restore();
      }
    },
  }, [
    h('div', { class: 'field' }, [h('label', {}, 'File'), fileInput]),
    statusEl,
    h('p', { class: 'meta' }, 'Uploads to the household’s shared Google Drive folder, renamed to its period.'),
    errorEl,
    submitBtn,
  ]);
  mount(body, form);
  openSheet(dialog);
}

// ---- Manual "add transaction" sheet (parsing fallback / corrections) ---

function openAddTransactionSheet(ctx, statement, onSaved) {
  const { dialog, body } = makeSheet('Add transaction');
  document.body.appendChild(dialog);
  dialog.addEventListener('close', () => dialog.remove());

  const errorEl = h('div', { class: 'error-msg', style: 'display:none' });
  const amountInput = h('input', { type: 'number', inputmode: 'decimal', step: '0.01', required: true, placeholder: 'e.g. -45.00 (negative = money out)' });
  const descInput = h('input', { type: 'text', required: true, placeholder: 'e.g. Woolworths' });
  const dateInput = h('input', { type: 'date', value: todayStr() });
  const categorySelect = h('select', {}, [h('option', { value: '' }, 'Unknown — categorize later'), ...CATEGORIES.map((c) => h('option', { value: c }, categoryLabel(c)))]);
  const submitBtn = h('button', { class: 'btn primary', type: 'submit' }, 'Add transaction');

  const form = h('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      errorEl.style.display = 'none';
      const restore = withBusyLabel(submitBtn, 'Saving…');
      try {
        await insertRow(TRANSACTIONS_TABLE, {
          household_id: ctx.household.id,
          statement_id: statement.id,
          txn_date: dateInput.value || null,
          description: descInput.value.trim(),
          amount: Number(amountInput.value),
          category: categorySelect.value || null,
          status: categorySelect.value ? 'categorized' : 'unknown',
          categorized_by: categorySelect.value ? ctx.user.id : null,
        });
        closeSheet(dialog);
        onSaved();
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.style.display = 'block';
        restore();
      }
    },
  }, [
    h('div', { class: 'field' }, [h('label', {}, 'Amount (negative = money out)'), amountInput]),
    h('div', { class: 'field' }, [h('label', {}, 'Description'), descInput]),
    h('div', { class: 'field-row' }, [
      h('div', { class: 'field' }, [h('label', {}, 'Date'), dateInput]),
      h('div', { class: 'field' }, [h('label', {}, 'Category'), categorySelect]),
    ]),
    errorEl,
    submitBtn,
  ]);
  mount(body, form);
  openSheet(dialog);
}

// ---- Transaction row (shared by "Needs review" and "All transactions") -

function transactionRow(ctx, txn, currency, onSaved) {
  const categorySelect = h('select', {}, [h('option', { value: '' }, 'Unknown'), ...CATEGORIES.map((c) => h('option', { value: c, selected: c === txn.category }, categoryLabel(c)))]);
  const saveBtn = h('button', {
    class: 'btn secondary small',
    type: 'button',
    onclick: async () => {
      const restore = withBusyLabel(saveBtn, 'Saving…');
      try {
        await updateRow(TRANSACTIONS_TABLE, txn.id, {
          category: categorySelect.value || null,
          status: categorySelect.value ? 'categorized' : 'unknown',
          categorized_by: categorySelect.value ? ctx.user.id : null,
        });
        onSaved();
      } catch (err) {
        alert(err.message);
        restore();
      }
    },
  }, 'Save');

  return h('div', { class: 'card' }, [
    h('div', { class: 'card-row' }, [
      h('div', {}, [
        h('h3', {}, txn.description),
        h('div', { class: 'meta' }, `${txn.txn_date ? formatDate(txn.txn_date) + ' · ' : ''}${formatMoney(Math.abs(Number(txn.amount)), currency)}${Number(txn.amount) < 0 ? ' out' : ' in'}`),
      ]),
    ]),
    h('div', { class: 'actions-row' }, [categorySelect, saveBtn]),
  ]);
}

// ---- One statement's collapsible section --------------------------------

function statementSection(ctx, statement, allStatements, transactions, previousTransactions, currency, open, onSaved) {
  const spent = transactions.filter((t) => Number(t.amount) < 0).reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
  const received = transactions.filter((t) => Number(t.amount) > 0).reduce((s, t) => s + Number(t.amount), 0);
  const unknown = transactions.filter((t) => t.status === 'unknown');
  const categorized = transactions.filter((t) => t.status !== 'unknown');

  const content = [
    h('div', { class: 'actions-row' }, [
      h('a', { href: statement.drive_web_view_link || `https://drive.google.com/file/d/${statement.drive_file_id}/view`, target: '_blank', class: 'btn secondary small' }, 'Open file in Drive'),
      h('button', { class: 'btn secondary small', type: 'button', onclick: () => openAddTransactionSheet(ctx, statement, onSaved) }, '+ Add transaction'),
      h('button', {
        class: 'btn danger-text small',
        type: 'button',
        onclick: async () => {
          if (!confirm('Delete this statement and all its transactions? This can’t be undone.')) return;
          // A multi-month upload (splitIntoPeriods()) produces several
          // statement rows sharing one Drive file — only delete that
          // file once nothing else still points at it, or every sibling
          // period's "Open file in Drive" link breaks.
          const sharedByOthers = allStatements.some((s) => s.id !== statement.id && s.drive_file_id === statement.drive_file_id);
          if (!sharedByOthers) await deleteDriveFile(statement.drive_file_id).catch(() => {});
          await deleteRow(STATEMENTS_TABLE, statement.id);
          onSaved();
        },
      }, 'Delete'),
    ]),
    h('div', { class: 'total-banner' }, [
      h('span', {}, 'Spent this statement'),
      h('span', { class: 'value' }, formatMoney(spent, currency)),
    ]),
    received > 0 ? h('div', { class: 'total-banner' }, [
      h('span', {}, 'Received this statement'),
      h('span', { class: 'value' }, formatMoney(received, currency)),
    ]) : null,
  ];

  const breakdown = categoryBreakdown(transactions, currency);
  if (breakdown) {
    content.push(h('div', { class: 'section-title' }, 'Category breakdown'));
    content.push(breakdown);
  }

  const trend = trendVsPrevious(transactions, previousTransactions, currency);
  if (trend) {
    content.push(h('div', { class: 'section-title' }, 'Compared to last statement'));
    content.push(trend);
  }

  if (unknown.length) {
    content.push(h('details', { class: 'goal-section', open: true }, [
      h('summary', {}, `Needs review (${unknown.length})`),
      h('div', { class: 'goal-section-body' }, unknown.map((t) => transactionRow(ctx, t, currency, onSaved))),
    ]));
  }

  if (categorized.length) {
    content.push(h('details', { class: 'goal-section' }, [
      h('summary', {}, `All categorized transactions (${categorized.length})`),
      h('div', { class: 'goal-section-body' }, categorized.map((t) => transactionRow(ctx, t, currency, onSaved))),
    ]));
  }

  if (!transactions.length) {
    content.push(h('div', { class: 'empty-state' }, 'No transactions yet — add them by hand with "+ Add transaction" above.'));
  }

  return h('details', { class: 'goal-section', open }, [
    h('summary', {}, statement.label),
    h('div', { class: 'goal-section-body' }, content),
  ]);
}

// ---- Top-level render ----------------------------------------------------

export async function render(container, ctx) {
  const [statements, allTransactions] = await Promise.all([
    fetchRows(STATEMENTS_TABLE, ctx.household.id, 'created_at', false),
    fetchRows(TRANSACTIONS_TABLE, ctx.household.id, 'txn_date', false),
  ]);
  const currency = ctx.household.default_currency || 'AUD';

  const sorted = [...statements].sort((a, b) => (b.period_year - a.period_year) || (b.period_month - a.period_month));
  const txnsByStatement = (id) => allTransactions.filter((t) => t.statement_id === id);

  const driveLinkRow = isDriveConnected(ctx.household)
    ? h('p', { class: 'meta' }, [h('a', { href: folderUrl(ctx.household), target: '_blank' }, 'Open the shared Drive folder')])
    : null;

  const sections = sorted.map((statement, i) => {
    const previous = sorted[i + 1]; // one position further back = the preceding statement chronologically
    return statementSection(
      ctx,
      statement,
      sorted,
      txnsByStatement(statement.id),
      previous ? txnsByStatement(previous.id) : null,
      currency,
      sorted.length === 1,
      () => render(container, ctx),
    );
  });

  mount(container, [
    h('p', { class: 'meta' }, 'Upload a bank statement to auto-sort its spending into categories — anything it’s unsure about lands in "Needs review" for you to assign.'),
    driveLinkRow,
    sections.length ? h('div', {}, sections) : h('div', { class: 'empty-state' }, 'No statements uploaded yet.'),
    h('button', { class: 'fab', 'aria-label': 'Upload bank statement', onclick: () => openUploadStatementSheet(ctx, () => render(container, ctx)) }, '+'),
  ]);
}
