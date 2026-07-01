/* Authentication flow */

import { XtreamAPI, parseXtreamUrl, extractXtreamCredentials } from './api.js';
import { credentialsStore } from './storage.js';

const LOGIN_FORM_ID = 'login-form';
const ERROR_ID = 'login-error';

export function initLogin() {
  const form = document.getElementById(LOGIN_FORM_ID);
  const serverUrlInput = document.getElementById('serverUrl');
  const usernameInput = document.getElementById('username');
  const passwordInput = document.getElementById('password');

  if (!form || !serverUrlInput || !usernameInput || !passwordInput) return;

  // Auto-redirect if already logged in
  const existing = credentialsStore.get();
  if (existing) {
    window.location.href = 'app.html';
    return;
  }

  // If the user pastes an M3U/Xtream URL into the server field, auto-fill the
  // credentials so the required username/password fields stay valid.
  serverUrlInput.addEventListener('input', (e) => {
    const extracted = extractXtreamCredentials(e.target.value);
    if (extracted.username && !usernameInput.value.trim()) {
      usernameInput.value = extracted.username;
    }
    if (extracted.password && !passwordInput.value) {
      passwordInput.value = extracted.password;
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;

    const rawUrl = serverUrlInput.value;
    let username = usernameInput.value.trim();
    let password = passwordInput.value;

    // Support pasting a full M3U/Xtream URL into the server field.
    // If credentials are present in the URL, use them when the form fields are empty.
    const extracted = extractXtreamCredentials(rawUrl);
    if (!username && extracted.username) username = extracted.username;
    if (!password && extracted.password) password = extracted.password;

    let serverUrl = parseXtreamUrl(rawUrl);
    if (!serverUrl && extracted.baseUrl) serverUrl = extracted.baseUrl;

    if (!serverUrl) {
      showError('Please enter a valid server URL.');
      return;
    }

    // Browsers block plain-HTTP requests from an HTTPS page.
    if (window.location.protocol === 'https:' && serverUrl.startsWith('http:')) {
      showError('This page is served over HTTPS, so the browser will block an HTTP Xtream server (mixed content). Host the app over HTTP or use an HTTPS server.');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span>Connecting...</span>';
    hideError();

    try {
      const api = new XtreamAPI(serverUrl, username, password);
      const data = await api.authenticate();
      credentialsStore.set({ serverUrl, username, password, info: data.user_info });
      window.location.href = 'app.html';
    } catch (err) {
      console.error('Login error:', err);
      let message = err.message || 'Failed to connect. Check your credentials and server URL.';

      // Detect common failure types
      if (err.name === 'TypeError' && message.toLowerCase().includes('fetch')) {
        message = `Network error: could not reach ${serverUrl}. This is usually CORS blocked or the server is unreachable.`;
      } else if (message.includes('Failed to fetch')) {
        message = `Could not connect to ${serverUrl}/player_api.php. The server may be offline, the URL may be wrong, or CORS may be blocking the request.`;
      }

      showError(message);
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalText;
    }
  });
}

function showError(message) {
  const el = document.getElementById(ERROR_ID);
  if (el) {
    el.textContent = message;
    el.classList.add('show');
  }
}

function hideError() {
  const el = document.getElementById(ERROR_ID);
  if (el) {
    el.classList.remove('show');
  }
}

export function getAPIFromStorage() {
  const creds = credentialsStore.get();
  if (!creds) return null;
  return new XtreamAPI(creds.serverUrl, creds.username, creds.password);
}

export function logout() {
  credentialsStore.clear();
  window.location.href = 'index.html';
}

export function requireAuth() {
  const api = getAPIFromStorage();
  if (!api) {
    window.location.href = 'index.html';
    return null;
  }
  return api;
}
