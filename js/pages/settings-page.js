import { navigate }                        from '../router.js';
import { loadSections, saveSections, SECTION_DEFS } from '../settings.js';

export function renderSettings(el) {
  draw(el, loadSections());
}

function draw(el, sections) {
  el.innerHTML = `
    <div class="settings-page">

      <button class="bp-back" id="settings-back">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
             stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
        Overview
      </button>

      <div class="settings-intro">
        <div class="settings-title">Dashboard Sections</div>
        <div class="settings-subtitle">
          Toggle sections on or off, and use the arrows to reorder them.
          The summary cards (Income, Expenses, Balance, Safe Limit) are always shown.
        </div>
      </div>

      <div class="settings-list">
        ${sections.map((s, i) => `
        <div class="settings-row${s.visible ? '' : ' settings-row-dim'}">
          <div class="settings-row-left">
            <label class="toggle-switch">
              <input type="checkbox" data-id="${s.id}" ${s.visible ? 'checked' : ''}>
              <span class="toggle-track"></span>
            </label>
            <span class="settings-label">${s.label}</span>
          </div>
          <div class="settings-arrows">
            <button class="arr-btn" data-dir="up"   data-id="${s.id}" ${i === 0 ? 'disabled' : ''} aria-label="Move up">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="18 15 12 9 6 15"/></svg>
            </button>
            <button class="arr-btn" data-dir="down" data-id="${s.id}" ${i === sections.length - 1 ? 'disabled' : ''} aria-label="Move down">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
          </div>
        </div>`).join('')}
      </div>

      <button class="settings-reset-btn" id="settings-reset">Reset to defaults</button>

    </div>
  `;

  // Back
  el.querySelector('#settings-back').addEventListener('click', () => navigate('dashboard'));

  // Toggle visibility
  el.querySelectorAll('.toggle-switch input').forEach(cb => {
    cb.addEventListener('change', () => {
      const idx = sections.findIndex(s => s.id === cb.dataset.id);
      if (idx >= 0) sections[idx].visible = cb.checked;
      saveSections(sections);
      draw(el, sections);
    });
  });

  // Move up / down
  el.querySelectorAll('.arr-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = sections.findIndex(s => s.id === btn.dataset.id);
      if (btn.dataset.dir === 'up' && idx > 0) {
        [sections[idx - 1], sections[idx]] = [sections[idx], sections[idx - 1]];
      } else if (btn.dataset.dir === 'down' && idx < sections.length - 1) {
        [sections[idx], sections[idx + 1]] = [sections[idx + 1], sections[idx]];
      }
      saveSections(sections);
      draw(el, sections);
    });
  });

  // Reset
  el.querySelector('#settings-reset').addEventListener('click', () => {
    const fresh = SECTION_DEFS.map(s => ({ ...s, visible: true }));
    saveSections(fresh);
    draw(el, fresh);
  });
}
