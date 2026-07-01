/* UI rendering helpers */

export function createCard({
  title,
  meta,
  badge,
  image,
  progress = null,
  onClick,
  onFavorite,
  isFavorite,
}) {
  const card = document.createElement('div');
  card.className = 'card';
  if (onClick) card.addEventListener('click', onClick);

  const imgSrc = image || '';
  const hasImage = Boolean(imgSrc);
  const badgeHtml = badge ? `<span class="card-badge">${escapeHtml(badge)}</span>` : '';
  const favoriteHtml = onFavorite
    ? `<button class="favorite-btn ${isFavorite ? 'active' : ''}" title="Toggle favorite" aria-label="Toggle favorite">
        <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
      </button>`
    : '';
  const progressHtml = (progress !== null && progress > 0 && progress < 0.95)
    ? `<div class="card-progress"><div class="card-progress-bar" style="width: ${Math.round(progress * 100)}%;"></div></div>`
    : '';
  const placeholderHtml = `
    <div class="image-placeholder">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
        <circle cx="8.5" cy="8.5" r="1.5"></circle>
        <polyline points="21 15 16 10 5 21"></polyline>
      </svg>
    </div>
  `;

  card.innerHTML = `
    <div class="card-image">
      ${badgeHtml}
      ${favoriteHtml}
      ${placeholderHtml}
      ${hasImage ? `<img src="${imgSrc}" alt="" loading="lazy">` : ''}
      ${progressHtml}
    </div>
    <div class="card-body">
      <h4 class="card-title">${escapeHtml(title)}</h4>
      ${meta ? `<p class="card-meta">${escapeHtml(meta)}</p>` : ''}
    </div>
  `;

  if (hasImage) {
    const img = card.querySelector('img');

    const showImage = () => img.classList.remove('hidden');
    const hideImage = () => img.classList.add('hidden');

    img.addEventListener('load', showImage);
    img.addEventListener('error', hideImage);
    img.classList.add('hidden');

    // Cached images may already be complete before the listener is attached
    if (img.complete) {
      if (img.naturalWidth > 0) {
        showImage();
      } else {
        hideImage();
      }
    }
  }

  if (onFavorite) {
    const favBtn = card.querySelector('.favorite-btn');
    favBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      onFavorite(favBtn);
    });
  }

  return card;
}

export function createCategoryTabs(categories, activeId, onSelect) {
  const container = document.createElement('div');
  container.className = 'category-tabs';

  const allTab = document.createElement('button');
  allTab.className = `category-tab ${activeId === 'all' ? 'active' : ''}`;
  allTab.textContent = 'All';
  allTab.addEventListener('click', () => onSelect('all'));
  container.appendChild(allTab);

  categories.forEach((cat) => {
    const tab = document.createElement('button');
    tab.className = `category-tab ${activeId === cat.category_id ? 'active' : ''}`;
    tab.textContent = cat.category_name;
    tab.addEventListener('click', () => onSelect(cat.category_id));
    container.appendChild(tab);
  });

  return container;
}

export function createEmptyState(title, message) {
  const el = document.createElement('div');
  el.className = 'empty-state';
  el.innerHTML = `
    <h3>${escapeHtml(title)}</h3>
    <p>${escapeHtml(message)}</p>
  `;
  return el;
}

export function showToast(message, type = 'info') {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.className = `toast ${type} show`;
  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

export function escapeHtml(text) {
  if (text == null) return '';
  const div = document.createElement('div');
  div.textContent = String(text);
  return div.innerHTML;
}

export function formatTimestamp(ts) {
  if (!ts) return '';
  const date = new Date(ts * 1000);
  return date.toLocaleString();
}

export function createLoadingGrid(count = 8) {
  const grid = document.createElement('div');
  grid.className = 'content-grid';
  for (let i = 0; i < count; i++) {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="card-image skeleton" style="height: 0; padding-bottom: 56.25%;"></div>
      <div class="card-body">
        <div class="skeleton" style="height: 1rem; width: 80%; margin-bottom: 0.5rem;"></div>
        <div class="skeleton" style="height: 0.75rem; width: 50%;"></div>
      </div>
    `;
    grid.appendChild(card);
  }
  return grid;
}

export function createModal({ title, content, onClose }) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h3>${escapeHtml(title)}</h3>
        <button class="btn btn-ghost modal-close" aria-label="Close">✕</button>
      </div>
      <div class="modal-body"></div>
    </div>
  `;

  const body = overlay.querySelector('.modal-body');
  if (typeof content === 'string') {
    body.innerHTML = content;
  } else if (content instanceof HTMLElement) {
    body.appendChild(content);
  }

  const closeBtn = overlay.querySelector('.modal-close');
  const close = () => {
    overlay.classList.remove('show');
    setTimeout(() => overlay.remove(), 300);
    if (onClose) onClose();
  };

  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  document.body.appendChild(overlay);
  // Trigger reflow for transition
  overlay.offsetHeight;
  overlay.classList.add('show');

  return { overlay, close };
}
