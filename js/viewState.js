// ── Shared view state ────────────────────────────────────────────────────────
// In-memory state shared across pages so the user's last-selected
// period mode + period travels from Overview → Records → Spending → Merchants
// (and back) within a single session.
//
// Each page that has a period/mode toggle pushes its current state here
// (`setView`) and reads from here (`getView`) when it's navigated to via the
// bottom tab bar with no drill-down params. Drill-down params still take
// precedence — they represent an explicit user action that should override
// the shared state.

let _mode   = 'billing'; // 'billing' | 'calendar'
let _period = null;      // e.g. '2026-06'

/** Push the current period view. Pass partial — both keys optional. */
export function setView({ mode, period } = {}) {
  if (mode)   _mode   = mode;
  if (period) _period = period;
}

/** Snapshot of the current shared view. */
export function getView() {
  return { mode: _mode, period: _period };
}
