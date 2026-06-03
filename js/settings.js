// Dashboard section definitions and localStorage persistence

const STORAGE_KEY = 'fintrack_dashboard_sections';

// Canonical list of all configurable sections (order = default order)
export const SECTION_DEFS = [
  { id: 'today',      label: 'Today Strip' },
  { id: 'spent',      label: 'Spent in Period' },
  { id: 'merchant',   label: 'By Merchant' },
  { id: 'budget',     label: 'Budget vs Actual' },
  { id: 'donut',      label: 'Spending Breakdown' },
  { id: 'trend',      label: 'Spending Trend' },
  { id: 'comparison', label: 'vs Previous Period' },
  { id: 'weekly',     label: 'Weekly & Day Breakdown' },
  { id: 'recurring',  label: 'Recurring Expenses' },
  { id: 'owes',       label: 'Owes You' },
  { id: 'planned',    label: 'Planned Expenses' },
];

/**
 * Load sections from localStorage.
 * Merges saved order + visibility with SECTION_DEFS so new sections
 * added in future releases appear at the end with visible: true.
 */
export function loadSections() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return SECTION_DEFS.map(s => ({ ...s, visible: true }));

    const saved = JSON.parse(raw); // [{ id, visible }]
    const savedMap = new Map(saved.map(s => [s.id, s.visible]));

    // Rebuild in saved order, keeping only known sections
    const result = saved
      .filter(s => SECTION_DEFS.some(d => d.id === s.id))
      .map(s => ({ ...SECTION_DEFS.find(d => d.id === s.id), visible: s.visible }));

    // Append any new sections not yet in saved data
    for (const def of SECTION_DEFS) {
      if (!savedMap.has(def.id)) result.push({ ...def, visible: true });
    }
    return result;
  } catch {
    return SECTION_DEFS.map(s => ({ ...s, visible: true }));
  }
}

/** Persist the current sections array to localStorage. */
export function saveSections(sections) {
  localStorage.setItem(STORAGE_KEY,
    JSON.stringify(sections.map(s => ({ id: s.id, visible: s.visible })))
  );
}
