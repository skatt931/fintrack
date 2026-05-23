import { SPREADSHEET_ID, SHEETS } from './config.js';
import { getToken, requestToken, clearToken } from './auth.js';

const BASE      = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values`;
const CACHE_KEY = 'finance_data';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function fetchRange(range, token) {
  const url  = `${BASE}/${encodeURIComponent(range)}`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (resp.status === 401) { const e = new Error('Unauthorized'); e.status = 401; throw e; }
  if (!resp.ok) throw new Error(`Sheets API error ${resp.status}`);
  const { values = [] } = await resp.json();
  if (values.length < 2) return [];
  const [headers, ...rows] = values;
  return rows
    .filter(row => row.some(cell => cell !== ''))
    .map(row => Object.fromEntries(headers.map((h, i) => [h, row[i] ?? ''])));
}

async function fetchAll(token) {
  const [transactions, budgets, salaryPeriods] = await Promise.all([
    fetchRange(SHEETS.transactions,  token),
    fetchRange(SHEETS.budgets,       token),
    fetchRange(SHEETS.salaryPeriods, token),
  ]);
  return { transactions, budgets, salaryPeriods, loadedAt: Date.now() };
}

async function ensureToken() {
  const existing = getToken();
  if (existing) return existing;
  return requestToken('select_account');
}

export async function loadData(force = false) {
  if (!force) {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Date.now() - parsed.loadedAt < CACHE_TTL) return parsed;
    }
  }

  let token = await ensureToken();

  let data;
  try {
    data = await fetchAll(token);
  } catch (e) {
    if (e.status === 401) {
      clearToken();
      token = await requestToken('select_account');
      data = await fetchAll(token);
    } else throw e;
  }

  sessionStorage.setItem(CACHE_KEY, JSON.stringify(data));
  return data;
}

export function clearCache() {
  sessionStorage.removeItem(CACHE_KEY);
}
