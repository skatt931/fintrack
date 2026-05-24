import { SPREADSHEET_ID, SHEETS } from './config.js';
import { getToken, requestToken, clearToken } from './auth.js';

const BASE      = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}`;
const CACHE_KEY = 'finance_data';
const CACHE_TTL = 5 * 60 * 1000;

// ── Fetch helpers ─────────────────────────────────────────────────────────────

async function fetchRange(range, token) {
  const url  = `${BASE}/values/${encodeURIComponent(range)}`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (resp.status === 401) { const e = new Error('Unauthorized'); e.status = 401; throw e; }
  if (!resp.ok) throw new Error(`Sheets API error ${resp.status}`);
  const { values = [] } = await resp.json();
  if (values.length < 2) return { headers: [], rows: [] };
  const [headers, ...rawRows] = values;
  const rows = rawRows
    .filter(row => row.some(cell => cell !== ''))
    .map((row, i) => ({
      ...Object.fromEntries(headers.map((h, j) => [h, row[j] ?? ''])),
      _row: i + 2,   // sheet row number (1 = header, 2 = first data row)
    }));
  return { headers, rows };
}

async function ensureToken() {
  const existing = getToken();
  if (existing) return existing;
  return requestToken('select_account');
}

async function withAuth(fn) {
  let token = await ensureToken();
  try {
    return await fn(token);
  } catch (e) {
    if (e.status === 401) {
      clearToken();
      token = await requestToken('select_account');
      return fn(token);
    }
    throw e;
  }
}

// ── Read ──────────────────────────────────────────────────────────────────────

export async function loadData(force = false) {
  if (!force) {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Date.now() - parsed.loadedAt < CACHE_TTL) return parsed;
    }
  }

  const data = await withAuth(async token => {
    const [txResult, budgetsResult, spResult] = await Promise.all([
      fetchRange(SHEETS.transactions,  token),
      fetchRange(SHEETS.budgets,       token),
      fetchRange(SHEETS.salaryPeriods, token),
    ]);
    return {
      transactions:  txResult.rows,
      txHeaders:     txResult.headers,   // column order, needed for writes
      budgets:       budgetsResult.rows,
      salaryPeriods: spResult.rows,
      loadedAt:      Date.now(),
    };
  });

  sessionStorage.setItem(CACHE_KEY, JSON.stringify(data));
  return data;
}

export function clearCache() {
  sessionStorage.removeItem(CACHE_KEY);
}

// ── Write helpers ─────────────────────────────────────────────────────────────

function colLetter(index) {
  // 0 → A, 25 → Z, 26 → AA …
  let s = '';
  let n = index;
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

// Update individual cells in a transaction row
// fields: { category: 'Food', needs_review: 'FALSE', ... }
export async function updateTransactionCells(row, txHeaders, fields) {
  const data = Object.entries(fields)
    .map(([field, value]) => {
      const idx = txHeaders.indexOf(field);
      if (idx === -1) return null;
      return {
        range:  `${SHEETS.transactions}!${colLetter(idx)}${row}`,
        values: [[value]],
      };
    })
    .filter(Boolean);

  if (!data.length) return;

  await withAuth(async token => {
    const url  = `${BASE}/values:batchUpdate`;
    const resp = await fetch(url, {
      method:  'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ valueInputOption: 'USER_ENTERED', data }),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error?.message || `Update failed: ${resp.status}`);
    }
  });

  clearCache();
}

// Append a new transaction row
// fields: { date, bank, direction, amount, currency, category, month, billing_period, needs_review, report_amount, ... }
export async function appendTransaction(txHeaders, fields) {
  const rowValues = txHeaders.map(h => fields[h] ?? '');

  await withAuth(async token => {
    const url  = `${BASE}/values/${encodeURIComponent(SHEETS.transactions)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
    const resp = await fetch(url, {
      method:  'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ values: [rowValues] }),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error?.message || `Append failed: ${resp.status}`);
    }
  });

  clearCache();
}
