import { register, initRouter } from './router.js';
import { renderDashboard }      from './pages/dashboard.js';
import { renderAdd }            from './pages/add.js';
import { getToken, requestToken, clearToken } from './auth.js';
import { clearCache }           from './api.js';

function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
}

function startApp() {
  register('dashboard', renderDashboard);
  register('add',       renderAdd);
  initRouter('dashboard');
}

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

  // Menu → sign out
  document.getElementById('menu-btn').addEventListener('click', () => {
    if (!confirm('Sign out?')) return;
    clearToken();
    clearCache();
    show('signin-screen');
  });

  // If token still valid from this session, skip sign-in screen
  if (getToken()) {
    show('main-screen');
    startApp();
  } else {
    show('signin-screen');
  }

  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

// Wait for DOM + GSI script to be ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
