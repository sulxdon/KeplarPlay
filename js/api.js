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

    const response = await fetch(url);
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

export function parseXtreamUrl(input) {
  let url = input.trim();
  if (!url) return null;
  if (!/^https?:\/\//i.test(url)) {
    url = `http://${url}`;
  }
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return null;
  }
}
