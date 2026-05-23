const routes = {};
let current  = null;

const PAGE_TITLES = {
  dashboard: 'Overview',
  add:       'Add Expense',
};

export function register(name, fn) {
  routes[name] = fn;
}

export function navigate(page) {
  if (current === page) return;
  current = page;

  document.querySelectorAll('.nav-item').forEach(el =>
    el.classList.toggle('active', el.dataset.page === page)
  );

  const titleEl = document.getElementById('page-title');
  if (titleEl) titleEl.textContent = PAGE_TITLES[page] ?? page;

  const content = document.getElementById('page-content');
  const renderer = routes[page];
  if (renderer) renderer(content);
  else content.innerHTML = '<p class="error-msg" style="margin:24px">Page not found.</p>';
}

export function initRouter(defaultPage = 'dashboard') {
  document.querySelectorAll('.nav-item').forEach(btn =>
    btn.addEventListener('click', () => navigate(btn.dataset.page))
  );
  navigate(defaultPage);
}
