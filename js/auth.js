/* Authentication flow */

import { XtreamAPI, parseXtreamUrl } from './api.js';
import { credentialsStore } from './storage.js';

const LOGIN_FORM_ID = 'login-form';
const ERROR_ID = 'login-error';

export function initLogin() {
  const form = document.getElementById(LOGIN_FORM_ID);
  if (!form) return;

  // Auto-redirect if already logged in
  const existing = credentialsStore.get();
  if (existing) {
    window.location.href = 'app.html';
    return;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;

    const rawUrl = form.serverUrl.value;
    const username = form.username.value.trim();
    const password = form.password.value;

    const serverUrl = parseXtreamUrl(rawUrl);
    if (!serverUrl) {
      showError('Please enter a valid server URL.');
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
      showError(err.message || 'Failed to connect. Check your credentials and server URL.');
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
