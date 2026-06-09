const routes  = {};
let current   = null;
let curParams = {};

const PAGE_TITLES = {
  dashboard:    'Overview',
  transactions: 'Records',
  add:          'Add Expense',
  breakdown:    'Spending',
  merchants:    'Merchants',
  daily:        'Daily View',
  weekly:       'Weekly View',
  settings:     'Settings',
  planned:      'Planned',
};

export function register(name, fn) {
  routes[name] = fn;
}

export function navigate(page, params = {}) {
  current   = page;
  curParams = params;

  document.querySelectorAll('.nav-item').forEach(el =>
    el.classList.toggle('active', el.dataset.page === page)
  );

  const titleEl = document.getElementById('page-title');
  if (titleEl) titleEl.textContent = PAGE_TITLES[page] ?? page;

  const content  = document.getElementById('page-content');
  const renderer = routes[page];
  if (renderer) renderer(content, params);
  else content.innerHTML = '<p class="error-msg" style="margin:24px">Page not found.</p>';

  // Always reset scroll to top when navigating to a new page so the user
  // doesn't land mid-page (the .page-content container is reused across
  // pages — without this it inherits the previous page's scroll position).
  // Use rAF so it runs after the renderer has populated the DOM.
  requestAnimationFrame(() => {
    if (content) content.scrollTop = 0;
    // Some renderers swap innerHTML asynchronously after loadData(); reset
    // again on the next frame so we still land at the top after the data
    // arrives and the real content paints.
    requestAnimationFrame(() => {
      if (content) content.scrollTop = 0;
    });
  });
}

export function getCurrentPage()   { return current; }
export function getCurrentParams() { return curParams; }

export function initRouter(defaultPage = 'dashboard') {
  document.querySelectorAll('.nav-item').forEach(btn =>
    btn.addEventListener('click', () => navigate(btn.dataset.page))
  );
  navigate(defaultPage);
}
