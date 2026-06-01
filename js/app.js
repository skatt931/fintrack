import { register, initRouter, navigate }  from './router.js';
import { renderDashboard }                  from './pages/dashboard.js';
import { renderTransactions }               from './pages/transactions.js';
import { renderAdd }                        from './pages/add.js';
import { renderBreakdown }                  from './pages/breakdown.js';
import { renderMerchants }                  from './pages/merchants.js';
import { renderDaily }                      from './pages/daily.js';
import { renderSettings }                   from './pages/settings-page.js';
import { getToken, requestToken, clearToken } from './auth.js';
import { clearCache }                       from './api.js';

function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
}

function startApp() {
  register('dashboard',    renderDashboard);
  register('transactions', renderTransactions);
  register('add',          renderAdd);
  register('breakdown',    renderBreakdown);
  register('merchants',    renderMerchants);
  register('daily',        renderDaily);
  register('settings',     renderSettings);
  initRouter('dashboard');
}

// ── Menu action sheet ────────────────────────────────────────────────────────

function openMenuSheet() {
  const sheet = document.createElement('div');
  sheet.className = 'sheet-overlay';
  sheet.innerHTML = `
    <div class="sheet-backdrop"></div>
    <div class="sheet-panel" id="menu-sheet-panel">
      <div class="sheet-handle"></div>
      <button class="menu-action" id="menu-settings">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
        </svg>
        Dashboard Settings
      </button>
      <button class="menu-action" id="menu-refresh">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <polyline points="23 4 23 10 17 10"/>
          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
        </svg>
        Refresh Data
      </button>
      <button class="menu-action menu-action-danger" id="menu-signout">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
          <polyline points="16 17 21 12 16 7"/>
          <line x1="21" y1="12" x2="9" y2="12"/>
        </svg>
        Sign Out
      </button>
    </div>
  `;
  document.body.appendChild(sheet);

  const panel = sheet.querySelector('#menu-sheet-panel');
  requestAnimationFrame(() => panel.classList.add('open'));

  const close = () => {
    panel.classList.remove('open');
    setTimeout(() => sheet.remove(), 280);
  };

  sheet.querySelector('.sheet-backdrop').addEventListener('click', close);

  sheet.querySelector('#menu-settings').addEventListener('click', () => {
    close();
    setTimeout(() => navigate('settings'), 300);
  });

  sheet.querySelector('#menu-refresh').addEventListener('click', () => {
    close();
    setTimeout(() => {
      clearCache();
      navigate('dashboard');
    }, 300);
  });

  sheet.querySelector('#menu-signout').addEventListener('click', () => {
    close();
    setTimeout(() => {
      if (!confirm('Sign out?')) return;
      clearToken();
      clearCache();
      show('signin-screen');
    }, 300);
  });
}

// ── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  // Sign-in button
  document.getElementById('signin-btn').addEventListener('click', async () => {
    try {
      await requestToken('select_account');
      show('main-screen');
      startApp();
    } catch (err) {
      alert(`Sign-in failed: ${err.message}`);
    }
  });

  // Menu button → action sheet
  document.getElementById('menu-btn').addEventListener('click', openMenuSheet);

  // If token still valid from this session, skip sign-in screen
  if (getToken()) {
    show('main-screen');
    startApp();
  } else {
    show('signin-screen');
  }

  // Register service worker + auto-reload when a new version activates
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then(reg => {
      reg.addEventListener('updatefound', () => {
        const newSW = reg.installing;
        newSW.addEventListener('statechange', () => {
          if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
            newSW.postMessage({ type: 'SKIP_WAITING' });
          }
        });
      });
    }).catch(() => {});

    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    });
  }
}

// Wait for DOM + GSI script to be ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
