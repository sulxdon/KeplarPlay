/* Xtream Codes API wrapper */

export class XtreamAPI {
  constructor(baseUrl, username, password) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.username = username;
    this.password = password;
  }

  get authParams() {
    return `username=${encodeURIComponent(this.username)}&password=${encodeURIComponent(this.password)}`;
  }

  async request(action, extraParams = {}) {
    let url = `${this.baseUrl}/player_api.php?${this.authParams}`;
    if (action) url += `&action=${encodeURIComponent(action)}`;
    const extra = new URLSearchParams(extraParams).toString();
    if (extra) url += `&${extra}`;

    const response = await fetch(url, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  async authenticate() {
    const data = await this.request();
    if (!data || !data.user_info) {
      throw new Error('Invalid response from server');
    }
    if (data.user_info.auth === 0 || ['Disabled', 'Invalid', 'Banned'].includes(data.user_info.status)) {
      throw new Error(`Account status: ${data.user_info.status || 'unauthorized'}`);
    }
    return data;
  }

  async getAccountInfo() {
    const data = await this.request();
    return data.user_info || {};
  }

  async getLiveCategories() {
    return this.request('get_live_categories');
  }

  async getVodCategories() {
    return this.request('get_vod_categories');
  }

  async getSeriesCategories() {
    return this.request('get_series_categories');
  }

  async getLiveStreams(categoryId = null) {
    const params = categoryId ? { category_id: categoryId } : {};
    return this.request('get_live_streams', params);
  }

  async getVodStreams(categoryId = null) {
    const params = categoryId ? { category_id: categoryId } : {};
    return this.request('get_vod_streams', params);
  }

  async getSeries(categoryId = null) {
    const params = categoryId ? { category_id: categoryId } : {};
    return this.request('get_series', params);
  }

  async getSeriesInfo(seriesId) {
    return this.request('get_series_info', { series_id: seriesId });
  }

  async getShortEpg(streamId, limit = 10) {
    return this.request('get_short_epg', { stream_id: streamId, limit });
  }

  async getFullEpg(streamId) {
    return this.request('get_simple_data_table', { stream_id: streamId });
  }

  async getEpgForChannels(channels, limit = 4) {
    const results = await Promise.allSettled(
      channels.map(async (channel) => {
        const data = await this.getShortEpg(channel.stream_id, limit);
        return {
          channel,
          epg: normalizeEpgListings(data?.epg_listings || (Array.isArray(data) ? data : [])),
        };
      })
    );

    return results
      .filter((r) => r.status === 'fulfilled')
      .map((r) => r.value);
  }

  getLiveStreamUrl(streamId, extension = 'm3u8') {
    const cleanId = String(streamId).trim();
    const cleanExt = String(extension).trim().replace(/^\./, '');
    return `${this.baseUrl}/live/${this.username}/${this.password}/${cleanId}.${cleanExt}`;
  }

  getMovieStreamUrl(streamId, containerExtension = 'mp4') {
    const cleanId = String(streamId).trim();
    const cleanExt = String(containerExtension).trim().replace(/^\./, '');
    return `${this.baseUrl}/movie/${this.username}/${this.password}/${cleanId}.${cleanExt}`;
  }

  getSeriesEpisodeUrl(filename) {
    const cleanFilename = String(filename).trim();
    return `${this.baseUrl}/series/${this.username}/${this.password}/${cleanFilename}`;
  }
}

const API_ENDPOINT_FILES = [
  '/player_api.php',
  '/get.php',
  '/panel_api.php',
  '/xmltv.php',
];

function normalizeXtreamPath(pathname) {
  const clean = pathname.replace(/\/$/, '');
  for (const file of API_ENDPOINT_FILES) {
    if (clean.endsWith(file)) {
      return clean.slice(0, -file.length);
    }
  }
  return clean;
}

/**
 * Parse a server URL entered by the user.
 * Accepts plain host URLs and full M3U/Xtream endpoint URLs.
 * Returns the panel base URL (protocol + host + optional base path).
 */
export function parseXtreamUrl(input) {
  return extractXtreamCredentials(input).baseUrl;
}

/**
 * Extract the base URL and credentials from a pasted M3U/Xtream URL.
 * Example: http://host:8080/get.php?username=u&password=p&type=m3u
 */
export function extractXtreamCredentials(input) {
  const result = { baseUrl: null, username: '', password: '' };
  let url = input.trim();
  if (!url) return result;
  if (!/^https?:\/\//i.test(url)) {
    url = `http://${url}`;
  }
  try {
    const parsed = new URL(url);
    const pathname = normalizeXtreamPath(parsed.pathname);
    result.baseUrl = `${parsed.protocol}//${parsed.host}${pathname}`;

    const username = parsed.searchParams.get('username');
    const password = parsed.searchParams.get('password');
    if (username) result.username = username;
    if (password) result.password = password;

    // Some URLs encode credentials in the userinfo portion (rare).
    if (!result.username && parsed.username) {
      result.username = decodeURIComponent(parsed.username);
    }
    if (!result.password && parsed.password) {
      result.password = decodeURIComponent(parsed.password);
    }
  } catch {
    // Invalid URL
  }
  return result;
}

function normalizeEpgListings(listings) {
  if (!Array.isArray(listings)) return [];

  return listings.map((item) => {
    const start = parseEpgTimestamp(item.start_timestamp || item.start);
    const end = parseEpgTimestamp(item.stop_timestamp || item.end || item.stop);

    return {
      id: item.id || '',
      title: decodeEpgText(item.title) || 'No title',
      description: decodeEpgText(item.description) || '',
      start,
      end,
      startText: item.start || '',
      endText: item.stop || item.end || '',
    };
  });
}

function parseEpgTimestamp(value) {
  if (!value) return null;
  if (typeof value === 'number') return value * 1000;
  const num = Number(value);
  if (!Number.isNaN(num) && String(value).length <= 12) {
    return num * 1000;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
}

function decodeEpgText(value) {
  if (value == null) return '';
  const text = String(value).trim();
  if (!text) return '';

  // Some Xtream panels return base64-encoded strings; try to decode only
  // if the value looks like base64 and decodes to readable text.
  const clean = text.replace(/\s/g, '');
  if (/^[A-Za-z0-9+/=]+$/.test(clean) && clean.length % 4 === 0 && clean.length > 8) {
    try {
      const decoded = atob(clean);
      if (
        decoded &&
        /^[\x20-\x7E\s]+$/.test(decoded) &&
        /[a-zA-Z]{2,}/.test(decoded)
      ) {
        return decoded.trim();
      }
    } catch {
      // fall through
    }
  }
  return text;
}
