import { SPREADSHEET_ID, SHEETS } from './config.js';
import { getToken, requestToken, clearToken } from './auth.js';

const BASE      = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}`;
const CACHE_KEY = 'finance_data_v4'; // bumped — busts caches after the fx_rate schema change
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
    const [txResult, budgetsResult, spResult, plannedResult] = await Promise.all([
      fetchRange(SHEETS.transactions,  token),
      fetchRange(SHEETS.budgets,       token),
      fetchRange(SHEETS.salaryPeriods, token),
      fetchRange(SHEETS.planned,       token),
    ]);
    return {
      transactions:   txResult.rows,
      txHeaders:      txResult.headers,   // column order, needed for writes
      budgets:        budgetsResult.rows,
      budgetHeaders:  budgetsResult.headers,
      salaryPeriods:  spResult.rows,
      planned:        plannedResult.rows,
      plannedHeaders: plannedResult.headers,
      loadedAt:       Date.now(),
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
// fields: { date, bank, direction, amount, currency, fx_rate, category, month, billing_period, needs_review, report_amount, ... }
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

// Update the Monthly Budget cell (col B) for an existing budget row.
// amount: number or '' (empty string clears / removes the budget).
// Col B is hardcoded per SHEETS_SCHEMA.md — Budgets sheet is always Category(A) | Monthly Budget(B) | all_categories(C).
export async function updateBudgetAmount(row, amount) {
  await withAuth(async token => {
    const url  = `${BASE}/values:batchUpdate`;
    const resp = await fetch(url, {
      method:  'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        valueInputOption: 'USER_ENTERED',
        data: [{ range: `${SHEETS.budgets}!B${row}`, values: [[amount]] }],
      }),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error?.message || `Update failed: ${resp.status}`);
    }
  });

  clearCache();
}

// Append a new Category + Monthly Budget row to the Budgets sheet.
// Only writes cols A and B — col C (all_categories) is managed by the sheet itself.
export async function appendBudgetRow(category, amount) {
  await withAuth(async token => {
    const url  = `${BASE}/values/${encodeURIComponent(SHEETS.budgets)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
    const resp = await fetch(url, {
      method:  'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: [[category, amount]] }),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error?.message || `Append failed: ${resp.status}`);
    }
  });

  clearCache();
}

// Normalise a header / field name for case-insensitive, whitespace-tolerant matching.
// "Due Date" / "due_date" / " DueDate " all collapse to "duedate".
function normKey(s) {
  return String(s ?? '').toLowerCase().replace(/[\s_-]/g, '');
}

// Update specific fields of a planned expense row.
// Matches header names case-insensitively (handles "Name" vs "name", "Due Date" vs "due_date").
export async function updatePlannedExpense(row, plannedHeaders, fields) {
  const headerIndexByNorm = new Map(plannedHeaders.map((h, i) => [normKey(h), i]));

  const data = Object.entries(fields)
    .map(([field, value]) => {
      const idx = headerIndexByNorm.get(normKey(field));
      if (idx === undefined) return null;
      return {
        range:  `${SHEETS.planned}!${colLetter(idx)}${row}`,
        values: [[value]],
      };
    })
    .filter(Boolean);

  if (!data.length) {
    console.warn('[updatePlannedExpense] No header matches for fields:', Object.keys(fields), 'against headers:', plannedHeaders);
    return;
  }

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

// Append a new row to the Planned Expenses sheet.
// Matches header names case-insensitively so the sheet's headers can be e.g.
// "Name" / "name" / "Due Date" / "due_date" without breaking the save.
export async function appendPlannedExpense(plannedHeaders, fields) {
  if (!plannedHeaders.length) throw new Error('Planned Expenses sheet has no header row. Please add the column headers to the sheet first.');

  const fieldsByNorm = {};
  for (const [k, v] of Object.entries(fields)) fieldsByNorm[normKey(k)] = v;

  const rowValues = plannedHeaders.map(h => fieldsByNorm[normKey(h)] ?? '');

  // Defensive: if every cell would be empty, the headers don't match our field names — bail
  const allEmpty = rowValues.every(v => v === '' || v == null);
  if (allEmpty) {
    console.error('[appendPlannedExpense] Headers did not match any fields.', { plannedHeaders, fields });
    throw new Error(
      `Sheet headers do not match expected names.\n` +
      `Expected (any of): name, amount, category, due_date, recurring, recurring_period, status, last_paid_date, notes.\n` +
      `Found in sheet: ${plannedHeaders.join(', ')}`
    );
  }

  await withAuth(async token => {
    const url  = `${BASE}/values/${encodeURIComponent(SHEETS.planned)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
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
