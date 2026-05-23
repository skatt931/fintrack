export function renderAdd(el) {
  el.innerHTML = `
    <div class="add-page">
      <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" width="80" height="80">
        <circle cx="40" cy="40" r="36" stroke="#334155" stroke-width="2"/>
        <path d="M40 26v28M26 40h28" stroke="#475569" stroke-width="2.5" stroke-linecap="round"/>
      </svg>
      <h2>Add Expense</h2>
      <p>Manually log cash or untracked transactions directly into your spreadsheet.</p>
      <p class="add-soon">Coming soon</p>
    </div>
  `;
}
