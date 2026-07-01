/* Main dashboard application */

import { requireAuth, logout } from './auth.js';
import {
  favoritesStore,
  recentStore,
  progressStore,
  settingsStore,
  ACCENT_COLORS,
  appState,
} from './storage.js';
import {
  createCard,
  createCategoryTabs,
  createEmptyState,
  showToast,
  createLoadingGrid,
  createModal,
  escapeHtml,
} from './ui.js';
import { playItem } from './player.js';
import { initFocusNavigation } from './focus.js';

const SECTIONS = {
  HOME: 'home',
  LIVE: 'live',
  GUIDE: 'guide',
  MOVIES: 'movies',
  SERIES: 'series',
  FAVORITES: 'favorites',
  RECENT: 'recent',
  SETTINGS: 'settings',
};

let api = null;
let currentSection = SECTIONS.HOME;
let activeCategory = 'all';
let categoriesCache = {};
let contentCache = {};
let searchQuery = '';

export async function initApp() {
  api = requireAuth();
  if (!api) return;

  setupNavigation();
  setupSearch();
  setupLogout();
  registerServiceWorker();
  initFocusNavigation();

  await loadAccountInfo();

  currentSection = appState.getLastSection();
  activateSection(currentSection);
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker.register('./sw.js')
    .then((registration) => {
      console.log('Service worker registered:', registration.scope);
    })
    .catch((err) => {
      console.warn('Service worker registration failed:', err);
    });
}

function setupNavigation() {
  document.querySelectorAll('[data-section]').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const section = link.dataset.section;
      activateSection(section);
    });
  });
}

function setupSearch() {
  const searchInput = document.getElementById('search-input');
  if (!searchInput) return;

  let debounceTimer;
  searchInput.addEventListener('input', (e) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      searchQuery = e.target.value.trim().toLowerCase();
      renderCurrentSection();
    }, 300);
  });
}

function setupLogout() {
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', logout);
  }
}

async function loadAccountInfo() {
  try {
    const info = await api.getAccountInfo();
    const statusEl = document.getElementById('account-status');
    const expiryEl = document.getElementById('account-expiry');
    const maxConnEl = document.getElementById('account-max-connections');

    if (statusEl) statusEl.textContent = info.status || 'Active';
    if (expiryEl) expiryEl.textContent = info.exp_date
      ? new Date(info.exp_date * 1000).toLocaleDateString()
      : 'N/A';
    if (maxConnEl) maxConnEl.textContent = info.max_connections || 'Unlimited';
  } catch (err) {
    console.error('Failed to load account info:', err);
    showToast('Could not load account info', 'error');
  }
}

function activateSection(section) {
  currentSection = section;
  appState.setLastSection(section);
  activeCategory = 'all';
  searchQuery = '';

  document.querySelectorAll('[data-section]').forEach((link) => {
    link.classList.toggle('active', link.dataset.section === section);
  });

  const searchInput = document.getElementById('search-input');
  if (searchInput) searchInput.value = '';

  const searchBar = document.querySelector('.search-bar');
  if (searchBar) {
    searchBar.style.display =
      section === SECTIONS.HOME || section === SECTIONS.SETTINGS ? 'none' : '';
  }

  updatePageTitle(section);
  renderCurrentSection();
}

function updatePageTitle(section) {
  const labelEl = document.getElementById('page-label');
  const titleEl = document.getElementById('page-title');
  const descEl = document.getElementById('page-desc');
  if (!titleEl) return;

  const config = {
    [SECTIONS.HOME]: { label: 'Dashboard', title: 'Home', desc: 'Continue watching and discover what’s next.' },
    [SECTIONS.LIVE]: { label: 'Dashboard', title: 'Live TV', desc: 'Browse channels and catch the action live.' },
    [SECTIONS.GUIDE]: { label: 'Dashboard', title: 'TV Guide', desc: 'See what’s on now and what’s coming up.' },
    [SECTIONS.MOVIES]: { label: 'Dashboard', title: 'Movies', desc: 'Stream the latest films on demand.' },
    [SECTIONS.SERIES]: { label: 'Dashboard', title: 'Series', desc: 'Binge full seasons and episodes.' },
    [SECTIONS.FAVORITES]: { label: 'Dashboard', title: 'Favorites', desc: 'Your saved channels and shows.' },
    [SECTIONS.RECENT]: { label: 'Dashboard', title: 'Recently Watched', desc: 'Pick up where you left off.' },
    [SECTIONS.SETTINGS]: { label: 'Settings', title: 'Settings', desc: 'Customize the app and manage your account.' },
  };

  const c = config[section] || config[SECTIONS.HOME];
  if (labelEl) labelEl.textContent = c.label;
  titleEl.textContent = c.title;
  if (descEl) descEl.textContent = c.desc;
}

async function renderCurrentSection() {
  const container = document.getElementById('content-area');
  if (!container) return;

  container.innerHTML = '';

  if (currentSection === SECTIONS.HOME) {
    await renderHome(container);
    return;
  }

  if (currentSection === SECTIONS.GUIDE) {
    await renderGuide(container);
    return;
  }

  if (currentSection === SECTIONS.FAVORITES) {
    renderFavorites(container);
    return;
  }

  if (currentSection === SECTIONS.RECENT) {
    renderRecent(container);
    return;
  }

  if (currentSection === SECTIONS.SETTINGS) {
    renderSettings(container);
    return;
  }

  container.appendChild(createLoadingGrid());

  try {
    const categories = await getCategories(currentSection);
    const items = await getContent(currentSection, activeCategory);
    const filtered = filterItems(items, searchQuery);

    container.innerHTML = '';
    container.appendChild(createCategoryTabs(categories, activeCategory, (id) => {
      activeCategory = id;
      renderCurrentSection();
    }));

    if (filtered.length === 0) {
      container.appendChild(createEmptyState('Nothing found', 'Try a different category or search term.'));
    } else {
      const grid = document.createElement('div');
      grid.className = 'content-grid';
      filtered.forEach((item) => {
        grid.appendChild(createItemCard(currentSection, item));
      });
      container.appendChild(grid);
    }
  } catch (err) {
    console.error('Render error:', err);
    container.innerHTML = '';
    container.appendChild(createEmptyState('Error loading content', err.message || 'Please try again.'));
  }
}

async function renderHome(container) {
  // Hero with recommendations carousel
  const hero = document.createElement('div');
  hero.className = 'home-hero';
  hero.innerHTML = `
    <div class="home-hero-content">
      <p class="section-label">Featured for you</p>
      <h2>Recommended <em>now.</em></h2>
      <p>Hand-picked movies and series to dive into.</p>
    </div>
    <div class="home-carousel" id="home-carousel">
      <div class="home-carousel-track" id="home-carousel-track">
        <div class="home-carousel-item skeleton" style="width: 180px; height: 260px;"></div>
        <div class="home-carousel-item skeleton" style="width: 180px; height: 260px;"></div>
        <div class="home-carousel-item skeleton" style="width: 180px; height: 260px;"></div>
        <div class="home-carousel-item skeleton" style="width: 180px; height: 260px;"></div>
      </div>
    </div>
  `;
  container.appendChild(hero);

  // Load recommendations asynchronously
  loadRecommendations().then((recommendations) => {
    const track = hero.querySelector('#home-carousel-track');
    if (!track) return;
    track.innerHTML = '';

    if (recommendations.length === 0) {
      hero.querySelector('#home-carousel').style.display = 'none';
      return;
    }

    recommendations.forEach(({ section, item }) => {
      track.appendChild(createCarouselItem(section, item));
    });
  });

  // Continue Watching
  const continueItems = getContinueWatchingItems();
  if (continueItems.length > 0) {
    const section = document.createElement('section');
    section.className = 'home-section';
    section.innerHTML = '<h3 class="home-section-title">Continue Watching</h3>';

    const grid = document.createElement('div');
    grid.className = 'content-grid';
    continueItems.forEach(({ section, item, progress }) => {
      grid.appendChild(createItemCard(section, item, { progress }));
    });
    section.appendChild(grid);
    container.appendChild(section);
  }

  // Recent
  const recentItems = getRecentItems(8);
  if (recentItems.length > 0) {
    const section = document.createElement('section');
    section.className = 'home-section';
    section.innerHTML = '<h3 class="home-section-title">Recently Watched</h3>';

    const grid = document.createElement('div');
    grid.className = 'content-grid';
    recentItems.forEach(({ section, item }) => {
      grid.appendChild(createItemCard(section, item));
    });
    section.appendChild(grid);
    container.appendChild(section);
  }

  // Favorites preview
  const favItems = getFavoriteItems(8);
  if (favItems.length > 0) {
    const section = document.createElement('section');
    section.className = 'home-section';
    section.innerHTML = '<h3 class="home-section-title">Your Favorites</h3>';

    const grid = document.createElement('div');
    grid.className = 'content-grid';
    favItems.forEach(({ section, item }) => {
      grid.appendChild(createItemCard(section, item));
    });
    section.appendChild(grid);
    container.appendChild(section);
  }

  if (continueItems.length === 0 && recentItems.length === 0 && favItems.length === 0) {
    container.appendChild(createEmptyState('Welcome to KeplarPlay', 'Start watching live TV, movies, or series to build your home feed.'));
  }
}

async function renderGuide(container) {
  const wrapper = document.createElement('div');
  wrapper.className = 'guide-wrapper';

  // Header with category tabs and jump-to-now button
  const header = document.createElement('div');
  header.className = 'guide-header';
  wrapper.appendChild(header);

  const content = document.createElement('div');
  content.className = 'guide-content';
  const loadingGrid = createLoadingGrid();
  loadingGrid.className = `${loadingGrid.className} guide-loading`;
  content.appendChild(loadingGrid);
  wrapper.appendChild(content);

  container.appendChild(wrapper);

  try {
    const categories = await getCategories(SECTIONS.LIVE);
    const channels = await getContent(SECTIONS.LIVE, activeCategory === 'all' ? null : activeCategory);
    const filteredChannels = filterItems(channels, searchQuery).slice(0, 60);

    header.innerHTML = '';
    header.appendChild(createCategoryTabs(categories, activeCategory, (id) => {
      activeCategory = id;
      renderCurrentSection();
    }));

    const nowBtn = document.createElement('button');
    nowBtn.className = 'btn btn-secondary guide-now-btn';
    nowBtn.innerHTML = '<span>Jump to Now</span>';
    nowBtn.addEventListener('click', () => scrollGuideToNow(content));
    header.appendChild(nowBtn);

    content.innerHTML = '';

    if (filteredChannels.length === 0) {
      content.appendChild(createEmptyState('No channels', 'Try a different category or search term.'));
      return;
    }

    const epgData = await api.getEpgForChannels(filteredChannels, 4);
    renderGuideGrid(content, epgData);
    requestAnimationFrame(() => scrollGuideToNow(content));
  } catch (err) {
    console.error('Guide render error:', err);
    content.innerHTML = '';
    content.appendChild(createEmptyState('Error loading guide', err.message || 'Please try again.'));
  }
}

function renderGuideGrid(container, epgData) {
  const windowHours = 6;
  const pxPerHour = 120;
  const totalWidth = windowHours * pxPerHour;
  const now = Date.now();
  const windowStart = now - 60 * 60 * 1000; // 1 hour ago
  const windowEnd = windowStart + windowHours * 60 * 60 * 1000;

  const grid = document.createElement('div');
  grid.className = 'guide-grid';
  grid.style.setProperty('--guide-timeline-width', `${totalWidth}px`);

  // Timeline header
  const headerRow = document.createElement('div');
  headerRow.className = 'guide-row guide-row-header';
  headerRow.innerHTML = `
    <div class="guide-channel-col">
      <span class="text-mono">Channel</span>
    </div>
    <div class="guide-timeline">
      ${renderTimeMarkers(windowStart, windowEnd, totalWidth)}
    </div>
  `;
  grid.appendChild(headerRow);

  // Current time indicator line (absolute across all rows)
  const nowPct = ((now - windowStart) / (windowEnd - windowStart)) * 100;
  const nowLine = document.createElement('div');
  nowLine.className = 'guide-now-line';
  nowLine.style.left = `${nowPct}%`;
  grid.appendChild(nowLine);

  // Channel rows
  epgData.forEach(({ channel, epg }) => {
    const row = document.createElement('div');
    row.className = 'guide-row';

    const logo = sanitizeImageUrl(channel.stream_icon || '');
    const channelCol = document.createElement('div');
    channelCol.className = 'guide-channel-col';
    channelCol.setAttribute('tabindex', '0');
    channelCol.setAttribute('role', 'button');
    channelCol.innerHTML = `
      ${logo ? `<img src="${logo}" alt="" loading="lazy">` : '<div class="guide-channel-placeholder"></div>'}
      <span class="guide-channel-name">${escapeHtml(channel.name || 'Untitled')}</span>
    `;
    channelCol.addEventListener('click', () => handleItemClick(SECTIONS.LIVE, channel));
    channelCol.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleItemClick(SECTIONS.LIVE, channel);
      }
    });

    const timeline = document.createElement('div');
    timeline.className = 'guide-timeline';

    epg.forEach((program) => {
      const block = createProgramBlock(program, windowStart, windowEnd, totalWidth, channel);
      if (block) timeline.appendChild(block);
    });

    row.appendChild(channelCol);
    row.appendChild(timeline);
    grid.appendChild(row);
  });

  container.appendChild(grid);
}

function renderTimeMarkers(windowStart, windowEnd, totalWidth) {
  const duration = windowEnd - windowStart;
  let html = '';
  for (let ms = windowStart; ms <= windowEnd; ms += 30 * 60 * 1000) {
    const pct = ((ms - windowStart) / duration) * 100;
    const date = new Date(ms);
    const isHour = date.getMinutes() === 0;
    const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    html += `<div class="guide-time-marker ${isHour ? 'guide-time-marker-hour' : ''}" style="left: ${pct}%;"><span>${time}</span></div>`;
  }
  return html;
}

function createProgramBlock(program, windowStart, windowEnd, totalWidth, channel) {
  const start = program.start || windowStart;
  const end = program.end || (start + 30 * 60 * 1000);

  if (end <= windowStart || start >= windowEnd) return null;

  const clippedStart = Math.max(start, windowStart);
  const clippedEnd = Math.min(end, windowEnd);
  const duration = windowEnd - windowStart;
  const left = ((clippedStart - windowStart) / duration) * 100;
  const width = ((clippedEnd - clippedStart) / duration) * 100;
  const isNow = Date.now() >= start && Date.now() < end;

  const block = document.createElement('div');
  block.className = `guide-program ${isNow ? 'guide-program-now' : ''}`;
  block.setAttribute('tabindex', '0');
  block.setAttribute('role', 'button');
  block.style.left = `${left}%`;
  block.style.width = `${width}%`;
  block.innerHTML = `
    <div class="guide-program-title">${escapeHtml(program.title)}</div>
    <div class="guide-program-time">${formatEpgTime(start)} — ${formatEpgTime(end)}</div>
  `;
  block.title = `${program.title}\n${program.description || ''}`;

  block.addEventListener('click', () => handleItemClick(SECTIONS.LIVE, channel));
  block.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleItemClick(SECTIONS.LIVE, channel);
    }
  });
  return block;
}

function formatEpgTime(timestamp) {
  if (!timestamp) return '';
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function scrollGuideToNow(container) {
  const grid = container.querySelector('.guide-grid');
  if (!grid) return;
  const timeline = grid.querySelector('.guide-timeline');
  if (!timeline) return;
  const nowLine = grid.querySelector('.guide-now-line');
  if (!nowLine) return;

  const timelineRect = timeline.getBoundingClientRect();
  const lineLeft = parseFloat(nowLine.style.left) / 100 * timelineRect.width;
  const scrollTarget = lineLeft - timelineRect.width * 0.25;

  grid.scrollTo({
    left: Math.max(0, scrollTarget),
    behavior: 'smooth',
  });
}

async function loadRecommendations() {
  const recommendations = [];
  try {
    const movies = await getContent(SECTIONS.MOVIES, 'all');
    const series = await getContent(SECTIONS.SERIES, 'all');

    movies.slice(0, 6).forEach((item) => {
      recommendations.push({ section: SECTIONS.MOVIES, item });
    });
    series.slice(0, 6).forEach((item) => {
      recommendations.push({ section: SECTIONS.SERIES, item });
    });
  } catch (err) {
    console.error('Failed to load recommendations:', err);
  }

  // Shuffle
  return recommendations.sort(() => Math.random() - 0.5);
}

function createCarouselItem(section, item) {
  const title = item.name || item.title || 'Untitled';
  const image = sanitizeImageUrl(section === SECTIONS.MOVIES ? item.stream_icon : item.cover || item.backdrop_path || '');
  const type = section === SECTIONS.MOVIES ? 'Movie' : 'Series';

  const el = document.createElement('div');
  el.className = 'home-carousel-item';
  el.setAttribute('tabindex', '0');
  el.setAttribute('role', 'button');
  el.innerHTML = `
    <div class="home-carousel-image">
      ${image ? `<img src="${image}" alt="" loading="lazy">` : ''}
      <div class="home-carousel-gradient"></div>
      <span class="home-carousel-badge">${type}</span>
    </div>
    <div class="home-carousel-title">${escapeHtml(title)}</div>
  `;

  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleItemClick(section, item);
    }
  });

  if (image) {
    const img = el.querySelector('img');
    img.addEventListener('load', () => img.classList.add('loaded'));
    img.addEventListener('error', () => img.classList.add('error'));
    if (img.complete) {
      img.classList.add(img.naturalWidth > 0 ? 'loaded' : 'error');
    }
  }

  el.addEventListener('click', () => handleItemClick(section, item));
  return el;
}

function getContinueWatchingItems() {
  const allProgress = progressStore.getAll();
  const items = [];

  Object.entries(allProgress).forEach(([key, data]) => {
    if (data.completed) return;

    const [section, id] = key.split(':');
    if (!section || !id) return;

    // Try to find the matching item in recent/favorites for metadata
    let item = null;
    const recent = recentStore.get(section);
    item = recent.find((i) => String(i.stream_id || i.series_id || i.id || i.num) === id);

    if (!item) {
      const favs = favoritesStore.get(section);
      item = favs.find((i) => String(i.stream_id || i.series_id || i.id || i.num) === id);
    }

    if (item) {
      items.push({ section, item, progress: data.progress });
    }
  });

  return items.sort((a, b) => (b.item.watchedAt || 0) - (a.item.watchedAt || 0)).slice(0, 12);
}

function getRecentItems(limit = 8) {
  const recent = recentStore.get();
  const allItems = [
    ...(recent[SECTIONS.LIVE] || []),
    ...(recent[SECTIONS.MOVIES] || []),
    ...(recent[SECTIONS.SERIES] || []),
  ].sort((a, b) => (b.watchedAt || 0) - (a.watchedAt || 0));

  return allItems.slice(0, limit).map((item) => ({ section: getItemSection(item), item }));
}

function getFavoriteItems(limit = 8) {
  const favs = favoritesStore.getAll();
  const allItems = [
    ...(favs[SECTIONS.LIVE] || []),
    ...(favs[SECTIONS.MOVIES] || []),
    ...(favs[SECTIONS.SERIES] || []),
  ];

  return allItems.slice(0, limit).map((item) => ({ section: getItemSection(item), item }));
}

function renderSettings(container) {
  const settings = settingsStore.get();
  const creds = JSON.parse(localStorage.getItem('xtream_credentials') || 'null');

  const wrapper = document.createElement('div');
  wrapper.className = 'settings-grid';

  // Appearance
  wrapper.innerHTML += `
    <div class="settings-card">
      <h3>Appearance</h3>
      <p class="section-desc" style="margin-bottom: var(--space-lg);">Choose your accent color.</p>
      <div class="accent-options" id="accent-options">
        ${Object.entries(ACCENT_COLORS).map(([name, color]) => `
          <button
            class="accent-option ${settings.accent === name ? 'active' : ''}"
            data-accent="${name}"
            style="background: ${color};"
            aria-label="Accent ${name}"
            title="${name}"
          ></button>
        `).join('')}
      </div>
    </div>
  `;

  // Account
  wrapper.innerHTML += `
    <div class="settings-card">
      <h3>Account</h3>
      <form id="settings-account-form" autocomplete="off">
        <div class="form-group">
          <label class="form-label" for="settings-server">Server URL</label>
          <input class="form-input" type="text" id="settings-server" name="serverUrl" value="${creds ? escapeHtml(creds.serverUrl) : ''}" required>
        </div>
        <div class="form-group">
          <label class="form-label" for="settings-username">Username</label>
          <input class="form-input" type="text" id="settings-username" name="username" value="${creds ? escapeHtml(creds.username) : ''}" required>
        </div>
        <div class="form-group">
          <label class="form-label" for="settings-password">Password</label>
          <input class="form-input" type="password" id="settings-password" name="password" value="${creds ? escapeHtml(creds.password) : ''}" required>
        </div>
        <button type="submit" class="btn btn-primary"><span>Reconnect Account</span></button>
      </form>
    </div>
  `;

  // Data management
  wrapper.innerHTML += `
    <div class="settings-card">
      <h3>Data</h3>
      <div class="danger-zone">
        <h4>Clear local data</h4>
        <p>This will remove favorites, watch history, progress, and settings from this browser.</p>
        <button id="clear-data-btn" class="btn btn-secondary" style="border-color: var(--accent-hot); color: var(--accent-hot);">Clear All Data</button>
      </div>
    </div>
  `;

  container.appendChild(wrapper);

  // Bind accent options
  wrapper.querySelectorAll('.accent-option').forEach((btn) => {
    btn.addEventListener('click', () => {
      const accent = btn.dataset.accent;
      settingsStore.set({ accent });
      wrapper.querySelectorAll('.accent-option').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      showToast('Accent color updated', 'success');
    });
  });

  // Bind account form
  const accountForm = wrapper.querySelector('#settings-account-form');
  accountForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = accountForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span>Connecting...</span>';

    const { parseXtreamUrl } = await import('./api.js');
    const serverUrl = parseXtreamUrl(document.getElementById('settings-server').value);
    const username = document.getElementById('settings-username').value.trim();
    const password = document.getElementById('settings-password').value;

    if (!serverUrl) {
      showToast('Invalid server URL', 'error');
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<span>Reconnect Account</span>';
      return;
    }

    try {
      const { XtreamAPI } = await import('./api.js');
      const testApi = new XtreamAPI(serverUrl, username, password);
      const data = await testApi.authenticate();
      localStorage.setItem('xtream_credentials', JSON.stringify({ serverUrl, username, password, info: data.user_info }));
      showToast('Account updated — reconnecting...', 'success');
      window.location.reload();
    } catch (err) {
      showToast(err.message || 'Failed to connect', 'error');
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<span>Reconnect Account</span>';
    }
  });

  // Bind clear data
  wrapper.querySelector('#clear-data-btn').addEventListener('click', () => {
    if (confirm('Are you sure? This will clear all favorites, history, progress, and settings.')) {
      localStorage.clear();
      window.location.href = 'index.html';
    }
  });
}

async function getCategories(section) {
  if (categoriesCache[section]) return categoriesCache[section];

  let categories = [];
  try {
    if (section === SECTIONS.LIVE) categories = await api.getLiveCategories();
    if (section === SECTIONS.MOVIES) categories = await api.getVodCategories();
    if (section === SECTIONS.SERIES) categories = await api.getSeriesCategories();
  } catch (err) {
    console.error('Failed to load categories:', err);
  }

  categoriesCache[section] = Array.isArray(categories) ? categories : [];
  return categoriesCache[section];
}

async function getContent(section, categoryId) {
  const cacheKey = `${section}-${categoryId}`;
  if (contentCache[cacheKey]) return contentCache[cacheKey];

  let items = [];
  try {
    if (section === SECTIONS.LIVE) items = await api.getLiveStreams(categoryId === 'all' ? null : categoryId);
    if (section === SECTIONS.MOVIES) items = await api.getVodStreams(categoryId === 'all' ? null : categoryId);
    if (section === SECTIONS.SERIES) items = await api.getSeries(categoryId === 'all' ? null : categoryId);
  } catch (err) {
    console.error('Failed to load content:', err);
    throw err;
  }

  contentCache[cacheKey] = Array.isArray(items) ? items : [];
  return contentCache[cacheKey];
}

function filterItems(items, query) {
  if (!query) return items;
  return items.filter((item) =>
    (item.name || item.title || '').toLowerCase().includes(query)
  );
}

function createItemCard(section, item, options = {}) {
  const title = item.name || item.title || 'Untitled';
  const isFav = favoritesStore.isFavorite(section, item);
  const progress = options.progress ?? getItemProgress(section, item);

  let image = '';
  let meta = '';
  let badge = '';

  if (section === SECTIONS.LIVE) {
    image = item.stream_icon || '';
    meta = item.stream_type || 'Live';
    badge = 'LIVE';
  } else if (section === SECTIONS.MOVIES) {
    image = item.stream_icon || '';
    meta = item.year ? `${item.year}` : 'Movie';
    if (item.rating) meta += item.year ? ` • ${item.rating}` : item.rating;
  } else if (section === SECTIONS.SERIES) {
    image = item.cover || item.backdrop_path || '';
    meta = item.last_modified ? `${item.last_modified}` : 'Series';
  }

  image = sanitizeImageUrl(image);

  return createCard({
    title,
    meta,
    badge,
    image,
    progress,
    onClick: () => handleItemClick(section, item),
    onFavorite: (btn) => {
      if (favoritesStore.isFavorite(section, item)) {
        favoritesStore.remove(section, item);
        btn.classList.remove('active');
        showToast('Removed from favorites');
      } else {
        favoritesStore.add(section, item);
        btn.classList.add('active');
        showToast('Added to favorites', 'success');
      }
      if (currentSection === SECTIONS.FAVORITES || currentSection === SECTIONS.HOME) {
        renderCurrentSection();
      }
    },
    isFavorite: isFav,
  });
}

function getItemProgress(section, item) {
  const saved = progressStore.get(section, item);
  return saved ? saved.progress : null;
}

function sanitizeImageUrl(url) {
  if (!url || url === 'None' || url === 'null' || url === 'undefined') return '';
  const trimmed = String(url).trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith('/')) return trimmed;
  return '';
}

async function handleItemClick(section, item) {
  if (section === SECTIONS.LIVE) {
    const url = api.getLiveStreamUrl(item.stream_id);
    playItem({
      section,
      item,
      url,
      title: item.name,
      meta: item.epg_channel_id || '',
      poster: sanitizeImageUrl(item.stream_icon) || '',
    });
  } else if (section === SECTIONS.MOVIES) {
    const url = api.getMovieStreamUrl(item.stream_id, item.container_extension || 'mp4');
    playItem({
      section,
      item,
      url,
      title: item.name,
      meta: item.plot || '',
      poster: sanitizeImageUrl(item.stream_icon) || '',
    });
  } else if (section === SECTIONS.SERIES) {
    await openSeriesModal(item);
  }
}

async function openSeriesModal(series) {
  const modalContent = document.createElement('div');
  modalContent.innerHTML = `<div class="skeleton" style="height: 120px; margin-bottom: 1rem;"></div>`;

  const modal = createModal({
    title: series.name || 'Series',
    content: modalContent,
  });

  try {
    const info = await api.getSeriesInfo(series.series_id);
    const seasons = info.episodes || {};

    modalContent.innerHTML = `
      ${series.plot ? `<p style="color: var(--text-secondary); margin-bottom: 1.5rem; line-height: 1.7;">${escapeHtml(series.plot)}</p>` : ''}
      <div class="episode-list"></div>
    `;

    const list = modalContent.querySelector('.episode-list');
    Object.entries(seasons).forEach(([seasonNum, episodes]) => {
      episodes.forEach((ep) => {
        const epItem = document.createElement('div');
        epItem.className = 'episode-item';
        epItem.setAttribute('tabindex', '0');
        epItem.setAttribute('role', 'button');
        epItem.innerHTML = `
          <span class="episode-number">${ep.episode_num}</span>
          <div>
            <div style="font-weight: 700; color: var(--text-primary);">${escapeHtml(ep.title || `Episode ${ep.episode_num}`)}</div>
            <div style="font-size: 0.8125rem; color: var(--text-secondary);">Season ${seasonNum}</div>
          </div>
        `;
        epItem.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            modal.close();
            const filename = ep.container_extension && !String(ep.id).endsWith(ep.container_extension)
              ? `${ep.id}.${ep.container_extension}`
              : ep.id;
            playItem({
              section: SECTIONS.SERIES,
              item: { ...ep, series_id: series.series_id },
              url: api.getSeriesEpisodeUrl(filename),
              title: `${series.name} — S${seasonNum}E${ep.episode_num}`,
              meta: ep.info?.plot || '',
              poster: sanitizeImageUrl(series.cover) || '',
            });
          }
        });
        epItem.addEventListener('click', () => {
          modal.close();
          const filename = ep.container_extension && !String(ep.id).endsWith(ep.container_extension)
            ? `${ep.id}.${ep.container_extension}`
            : ep.id;
          playItem({
            section: SECTIONS.SERIES,
            item: { ...ep, series_id: series.series_id },
            url: api.getSeriesEpisodeUrl(filename),
            title: `${series.name} — S${seasonNum}E${ep.episode_num}`,
            meta: ep.info?.plot || '',
            poster: sanitizeImageUrl(series.cover) || '',
          });
        });
        list.appendChild(epItem);
      });
    });

    if (!list.children.length) {
      list.innerHTML = '<p style="color: var(--text-secondary);">No episodes available.</p>';
    }
  } catch (err) {
    modalContent.innerHTML = `<p style="color: var(--accent-hot);">Failed to load series info.</p>`;
  }
}

function renderFavorites(container) {
  const favs = favoritesStore.getAll();
  const allItems = [
    ...(favs[SECTIONS.LIVE] || []),
    ...(favs[SECTIONS.MOVIES] || []),
    ...(favs[SECTIONS.SERIES] || []),
  ];

  const filtered = filterItems(allItems, searchQuery);

  if (filtered.length === 0) {
    container.appendChild(createEmptyState('No favorites yet', 'Save channels, movies, or series to find them here.'));
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'content-grid';
  filtered.forEach((item) => {
    const section = getItemSection(item);
    grid.appendChild(createItemCard(section, item));
  });
  container.appendChild(grid);
}

function renderRecent(container) {
  const recent = recentStore.get();
  const allItems = [
    ...(recent[SECTIONS.LIVE] || []),
    ...(recent[SECTIONS.MOVIES] || []),
    ...(recent[SECTIONS.SERIES] || []),
  ].sort((a, b) => (b.watchedAt || 0) - (a.watchedAt || 0));

  const filtered = filterItems(allItems, searchQuery);

  if (filtered.length === 0) {
    container.appendChild(createEmptyState('No recent activity', 'Start watching to build your history.'));
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'content-grid';
  filtered.forEach((item) => {
    const section = getItemSection(item);
    grid.appendChild(createItemCard(section, item));
  });
  container.appendChild(grid);
}

function getItemSection(item) {
  if (item._section) return item._section;
  if (item.stream_id && item.stream_type === 'movie') return SECTIONS.MOVIES;
  if (item.stream_id) return SECTIONS.LIVE;
  if (item.series_id) return SECTIONS.SERIES;
  return SECTIONS.LIVE;
}

export default initApp;
