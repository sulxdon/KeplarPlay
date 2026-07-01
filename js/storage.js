/* Storage helpers for credentials, favorites, recently watched, progress, and settings */

const STORAGE_KEYS = {
  CREDENTIALS: 'xtream_credentials',
  FAVORITES: 'xtream_favorites',
  RECENT: 'xtream_recent',
  PROGRESS: 'xtream_progress',
  SETTINGS: 'xtream_settings',
  LAST_SECTION: 'xtream_last_section',
};

export const ACCENT_COLORS = {
  purple: '#9146ff',
  magenta: '#ff4fd8',
  cyan: '#00f0ff',
  orange: '#ff9e2c',
};

export const storage = {
  get(key, defaultValue = null) {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : defaultValue;
    } catch {
      return defaultValue;
    }
  },

  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (err) {
      console.warn('Storage set failed:', err);
    }
  },

  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch (err) {
      console.warn('Storage remove failed:', err);
    }
  },
};

export const credentialsStore = {
  get() {
    return storage.get(STORAGE_KEYS.CREDENTIALS, null);
  },

  set(creds) {
    storage.set(STORAGE_KEYS.CREDENTIALS, creds);
  },

  clear() {
    storage.remove(STORAGE_KEYS.CREDENTIALS);
  },
};

export const favoritesStore = {
  getAll() {
    return storage.get(STORAGE_KEYS.FAVORITES, {});
  },

  get(section) {
    const all = this.getAll();
    return all[section] || [];
  },

  add(section, item) {
    const all = this.getAll();
    if (!all[section]) all[section] = [];
    const enriched = { ...item, _section: section };
    if (!this.isFavorite(section, item)) {
      all[section].push(enriched);
      storage.set(STORAGE_KEYS.FAVORITES, all);
    }
  },

  remove(section, item) {
    const all = this.getAll();
    if (!all[section]) return;
    all[section] = all[section].filter((i) => !itemMatches(i, item));
    storage.set(STORAGE_KEYS.FAVORITES, all);
  },

  isFavorite(section, item) {
    return this.get(section).some((i) => itemMatches(i, item));
  },
};

export const recentStore = {
  get(section = null) {
    const all = storage.get(STORAGE_KEYS.RECENT, {});
    if (section) return all[section] || [];
    return all;
  },

  add(section, item) {
    const all = storage.get(STORAGE_KEYS.RECENT, {});
    if (!all[section]) all[section] = [];
    const enriched = { ...item, _section: section, watchedAt: Date.now() };
    all[section] = all[section].filter(
      (i) =>
        i.stream_id !== item.stream_id &&
        i.series_id !== item.series_id &&
        i.num !== item.num
    );
    all[section].unshift(enriched);
    all[section] = all[section].slice(0, 20);
    storage.set(STORAGE_KEYS.RECENT, all);
  },
};

export const progressStore = {
  getAll() {
    return storage.get(STORAGE_KEYS.PROGRESS, {});
  },

  getKey(section, item) {
    const id = item.stream_id || item.series_id || item.id || item.num || 'unknown';
    return `${section}:${id}`;
  },

  get(section, item) {
    const all = this.getAll();
    return all[this.getKey(section, item)] || null;
  },

  set(section, item, currentTime, duration) {
    const all = this.getAll();
    const key = this.getKey(section, item);
    const progress = duration > 0 ? currentTime / duration : 0;
    all[key] = {
      currentTime,
      duration,
      progress,
      updatedAt: Date.now(),
      completed: progress > 0.95,
    };
    storage.set(STORAGE_KEYS.PROGRESS, all);
  },

  clear() {
    storage.remove(STORAGE_KEYS.PROGRESS);
  },
};

export const settingsStore = {
  get() {
    return storage.get(STORAGE_KEYS.SETTINGS, {
      accent: 'purple',
    });
  },

  set(settings) {
    storage.set(STORAGE_KEYS.SETTINGS, { ...this.get(), ...settings });
    applyAccent();
  },

  applyAccent() {
    applyAccent();
  },

  clear() {
    storage.remove(STORAGE_KEYS.SETTINGS);
    applyAccent();
  },
};

export const appState = {
  getLastSection() {
    return storage.get(STORAGE_KEYS.LAST_SECTION, 'home');
  },

  setLastSection(section) {
    storage.set(STORAGE_KEYS.LAST_SECTION, section);
  },
};

function itemMatches(a, b) {
  return (
    (a.stream_id && a.stream_id === b.stream_id) ||
    (a.series_id && a.series_id === b.series_id) ||
    (a.num && a.num === b.num) ||
    (a.episode_num && a.episode_num === b.episode_num && a.series_id === b.series_id)
  );
}

function applyAccent() {
  if (typeof document === 'undefined') return;
  const settings = storage.get(STORAGE_KEYS.SETTINGS, { accent: 'purple' });
  const color = ACCENT_COLORS[settings.accent] || ACCENT_COLORS.purple;
  document.documentElement.style.setProperty('--accent-primary', color);
}

// Apply on load in browser
if (typeof document !== 'undefined') {
  applyAccent();
}
