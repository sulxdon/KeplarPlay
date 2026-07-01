/* Video player logic with HLS.js support, custom controls, diagnostics, and resume progress */

import { recentStore, progressStore } from './storage.js';

let hls = null;
let currentItem = null;
let currentSection = null;
let currentUrl = '';
let debugVisible = false;
let progressInterval = null;
let hasResumed = false;
let isSeeking = false;
let controlsTimeout = null;
let wasPausedBeforeSeek = false;

const els = {};

export function initPlayer() {
  cacheElements();
  if (!els.video) return;

  bindControls();
  bindKeyboard();
  bindInactivity();

  return { video: els.video };
}

function cacheElements() {
  els.page = document.getElementById('player-page');
  els.stage = document.getElementById('player-stage');
  els.video = document.getElementById('video-player');
  els.title = document.getElementById('player-title');
  els.meta = document.getElementById('player-meta');
  els.loader = document.getElementById('player-loader');

  els.centerBtn = document.getElementById('player-center-play');
  els.iconCenterPlay = document.getElementById('icon-center-play');
  els.iconCenterPause = document.getElementById('icon-center-pause');

  els.backBtn = document.getElementById('player-back');
  els.debugToggle = document.getElementById('player-debug-toggle');
  els.debugPanel = document.getElementById('player-debug');

  els.playBtn = document.getElementById('player-play');
  els.iconPlay = document.getElementById('icon-play');
  els.iconPause = document.getElementById('icon-pause');

  els.muteBtn = document.getElementById('player-mute');
  els.iconVolume = document.getElementById('icon-volume');
  els.iconMute = document.getElementById('icon-mute');
  els.volumeSlider = document.getElementById('player-volume');

  els.fullscreenBtn = document.getElementById('player-fullscreen');

  els.progressTrack = document.getElementById('player-progress-track');
  els.progressBar = document.getElementById('player-progress-bar');
  els.progressBuffer = document.getElementById('player-progress-buffer');
  els.progressThumb = document.getElementById('player-progress-thumb');
  els.timeCurrent = document.getElementById('player-time-current');
  els.timeDuration = document.getElementById('player-time-duration');

  els.debugUrl = document.getElementById('debug-url');
  els.debugNative = document.getElementById('debug-native');
  els.debugHlsjs = document.getElementById('debug-hlsjs');
  els.debugStatus = document.getElementById('debug-status');
  els.debugError = document.getElementById('debug-error');
}

function bindControls() {
  els.backBtn?.addEventListener('click', closePlayer);
  els.debugToggle?.addEventListener('click', toggleDebug);

  els.playBtn?.addEventListener('click', togglePlay);
  els.centerBtn?.addEventListener('click', togglePlay);

  els.muteBtn?.addEventListener('click', toggleMute);
  els.volumeSlider?.addEventListener('input', (e) => {
    els.video.volume = parseFloat(e.target.value);
    els.video.muted = false;
    updateVolumeIcon();
  });

  els.fullscreenBtn?.addEventListener('click', toggleFullscreen);

  // Video click/dblclick
  els.video?.addEventListener('click', () => {
    showControls();
    togglePlay();
  });
  els.video?.addEventListener('dblclick', (e) => {
    e.preventDefault();
    toggleFullscreen();
  });

  // Progress scrubbing
  els.progressTrack?.addEventListener('mousedown', startScrub);
  els.progressTrack?.addEventListener('touchstart', startScrub, { passive: false });

  // Video events
  els.video?.addEventListener('play', updatePlayIcons);
  els.video?.addEventListener('pause', updatePlayIcons);
  els.video?.addEventListener('timeupdate', updateProgress);
  els.video?.addEventListener('progress', updateBuffer);
  els.video?.addEventListener('loadedmetadata', () => {
    updateDuration();
    attemptResume();
  });
  els.video?.addEventListener('waiting', () => {
    if (els.loader) els.loader.style.display = 'flex';
  });
  els.video?.addEventListener('playing', () => {
    if (els.loader) els.loader.style.display = 'none';
  });
  els.video?.addEventListener('volumechange', updateVolumeIcon);
}

function bindKeyboard() {
  document.addEventListener('keydown', (e) => {
    if (!els.page?.classList.contains('show')) return;

    switch (e.key) {
      case ' ':
      case 'k':
        e.preventDefault();
        togglePlay();
        break;
      case 'ArrowLeft':
        e.preventDefault();
        seekRelative(-10);
        break;
      case 'ArrowRight':
        e.preventDefault();
        seekRelative(10);
        break;
      case 'ArrowUp':
        e.preventDefault();
        changeVolume(0.1);
        break;
      case 'ArrowDown':
        e.preventDefault();
        changeVolume(-0.1);
        break;
      case 'f':
        e.preventDefault();
        toggleFullscreen();
        break;
      case 'm':
        e.preventDefault();
        toggleMute();
        break;
      case 'Escape':
        if (document.fullscreenElement) {
          document.exitFullscreen();
        } else {
          closePlayer();
        }
        break;
    }
  });
}

function bindInactivity() {
  els.stage?.addEventListener('mousemove', showControls);
  els.stage?.addEventListener('mouseleave', startHideTimer);
  els.stage?.addEventListener('click', showControls);
  els.stage?.addEventListener('touchstart', showControls);
}

function showControls() {
  els.stage?.classList.remove('controls-hidden');
  clearTimeout(controlsTimeout);
  if (!els.video?.paused) {
    startHideTimer();
  }
}

function startHideTimer() {
  clearTimeout(controlsTimeout);
  controlsTimeout = setTimeout(() => {
    if (els.video?.paused) return;
    els.stage?.classList.add('controls-hidden');
  }, 3000);
}

export function playItem({ section, item, url, title, meta, poster }) {
  if (!els.video || !els.page) return;

  currentItem = item;
  currentSection = section;
  currentUrl = url;
  hasResumed = false;

  if (els.title) els.title.textContent = title || 'Now Playing';
  if (els.meta) els.meta.textContent = meta || '';
  if (poster) els.video.poster = poster;

  els.page.classList.add('show');
  document.body.style.overflow = 'hidden';
  els.stage?.classList.remove('controls-hidden');

  recentStore.add(section, item);

  stopCurrentStream();
  clearError();
  clearProgressInterval();
  resetProgressUI();

  if (els.loader) els.loader.style.display = 'flex';

  updateDebugPanel({ url });

  const canPlayHlsNative = Boolean(els.video.canPlayType('application/vnd.apple.mpegurl'));
  const isHls = /\.m3u8(\?|$)|\/.*\.m3u8/i.test(url);
  const hlsjsSupported = window.Hls && window.Hls.isSupported();

  updateDebugPanel({
    url,
    native: canPlayHlsNative ? 'supported' : 'not supported',
    hlsjs: hlsjsSupported ? `v${window.Hls.version}` : 'not loaded',
    status: 'starting playback',
  });

  els.video.crossOrigin = 'anonymous';

  if (isHls && hlsjsSupported) {
    loadWithHlsjs(url);
  } else if (canPlayHlsNative && isHls) {
    loadNativeHls(url);
  } else {
    loadDirect(url);
  }
}

function loadWithHlsjs(url) {
  updateDebugPanel({ status: 'loading via HLS.js' });

  hls = new window.Hls({
    enableWorker: true,
    lowLatencyMode: false,
    backBufferLength: 90,
    maxBufferLength: 30,
    maxMaxBufferLength: 60,
    xhrSetup: (xhr) => {
      xhr.addEventListener('load', () => {
        if (xhr.status >= 400) {
          updateDebugPanel({ error: `segment HTTP ${xhr.status}` });
        }
      });
      xhr.addEventListener('error', () => {
        updateDebugPanel({ error: 'segment network/CORS error' });
      });
    },
  });

  hls.loadSource(url);
  hls.attachMedia(els.video);

  hls.on(window.Hls.Events.MANIFEST_PARSED, (_event, data) => {
    updateDebugPanel({ status: `manifest parsed (${data.levels?.length || 0} levels)` });
    if (els.loader) els.loader.style.display = 'none';
    els.video.play().catch((err) => {
      updateDebugPanel({ error: `play() blocked: ${err.name}` });
    });
  });

  hls.on(window.Hls.Events.LEVEL_LOADED, (_event, data) => {
    const duration = data?.details?.totalduration;
    if (duration && isFinite(duration)) {
      updateDuration();
    }
  });

  hls.on(window.Hls.Events.ERROR, (_event, data) => {
    const errorType = data.type;
    const errorDetails = data.details;
    const fatal = data.fatal;

    let message = `${errorType}: ${errorDetails}`;
    if (errorDetails && errorDetails.toLowerCase().includes('cors')) {
      message = 'CORS blocked — the stream server must allow cross-origin requests';
    } else if (errorType === 'networkError') {
      message = 'Network error — stream unreachable or blocked';
    } else if (errorType === 'mediaError') {
      message = 'Media decode error — unsupported stream format';
    }

    updateDebugPanel({ error: `${message}${fatal ? ' (fatal)' : ''}` });

    if (fatal) {
      showPlayerError(message);
      console.error('HLS fatal error:', data);

      switch (errorType) {
        case 'networkError':
          hls.startLoad();
          break;
        case 'mediaError':
          hls.recoverMediaError();
          break;
        default:
          hls.destroy();
          hls = null;
          break;
      }
    }
  });
}

function loadNativeHls(url) {
  updateDebugPanel({ status: 'loading via native HLS' });
  els.video.src = url;

  const onLoaded = () => {
    if (els.loader) els.loader.style.display = 'none';
    updateDuration();
    attemptResume();
    els.video.play().catch((err) => {
      updateDebugPanel({ error: `play() blocked: ${err.name}` });
    });
  };

  const onError = () => {
    const err = els.video.error;
    const message = err ? `Native error ${err.code}: ${err.message}` : 'Native playback failed';
    updateDebugPanel({ error: message });

    if (window.Hls && window.Hls.isSupported()) {
      updateDebugPanel({ status: 'native failed, trying HLS.js' });
      els.video.removeEventListener('loadedmetadata', onLoaded);
      els.video.removeEventListener('error', onError);
      els.video.src = '';
      loadWithHlsjs(url);
    } else {
      showPlayerError(message);
    }
  };

  els.video.addEventListener('loadedmetadata', onLoaded, { once: true });
  els.video.addEventListener('error', onError, { once: true });
}

function loadDirect(url) {
  updateDebugPanel({ status: 'loading direct video' });
  els.video.src = url;

  const onLoaded = () => {
    if (els.loader) els.loader.style.display = 'none';
    updateDuration();
    attemptResume();
    els.video.play().catch((err) => {
      updateDebugPanel({ error: `play() blocked: ${err.name}` });
    });
  };

  const onError = () => {
    const err = els.video.error;
    const message = err ? `Video error ${err.code}: ${err.message}` : 'Direct playback failed';
    updateDebugPanel({ error: message });
    showPlayerError(message);
  };

  els.video.addEventListener('loadedmetadata', onLoaded, { once: true });
  els.video.addEventListener('error', onError, { once: true });
}

function togglePlay() {
  if (!els.video) return;
  if (els.video.paused || els.video.ended) {
    els.video.play().catch(() => {});
  } else {
    els.video.pause();
  }
  showControls();
}

function updatePlayIcons() {
  const paused = els.video.paused || els.video.ended;
  if (els.iconPlay) els.iconPlay.style.display = paused ? 'block' : 'none';
  if (els.iconPause) els.iconPause.style.display = paused ? 'none' : 'block';
  if (els.iconCenterPlay) els.iconCenterPlay.style.display = paused ? 'block' : 'none';
  if (els.iconCenterPause) els.iconCenterPause.style.display = paused ? 'none' : 'block';

  if (paused) {
    els.centerBtn?.classList.add('visible');
    showControls();
  } else {
    els.centerBtn?.classList.remove('visible');
    startHideTimer();
  }
}

function toggleMute() {
  if (!els.video) return;
  els.video.muted = !els.video.muted;
  updateVolumeIcon();
}

function updateVolumeIcon() {
  if (!els.video || !els.volumeSlider) return;
  els.volumeSlider.value = els.video.muted ? 0 : els.video.volume;
  const muted = els.video.muted || els.video.volume === 0;
  if (els.iconVolume) els.iconVolume.style.display = muted ? 'none' : 'block';
  if (els.iconMute) els.iconMute.style.display = muted ? 'block' : 'none';
}

function changeVolume(delta) {
  if (!els.video) return;
  const next = Math.min(1, Math.max(0, els.video.volume + delta));
  els.video.volume = next;
  els.video.muted = false;
  updateVolumeIcon();
}

function toggleFullscreen() {
  if (!els.stage) return;
  if (document.fullscreenElement) {
    document.exitFullscreen();
  } else {
    els.stage.requestFullscreen?.().catch(() => {});
  }
}

function updateProgress() {
  if (!els.video || isSeeking) return;
  const current = els.video.currentTime || 0;
  const duration = els.video.duration || 0;
  const pct = duration > 0 ? (current / duration) * 100 : 0;

  if (els.progressBar) els.progressBar.style.width = `${pct}%`;
  if (els.progressThumb) els.progressThumb.style.left = `${pct}%`;
  if (els.timeCurrent) els.timeCurrent.textContent = formatDuration(current);
}

function updateBuffer() {
  if (!els.video || !els.progressBuffer) return;
  const buffered = els.video.buffered;
  const duration = els.video.duration || 0;
  if (!duration || !buffered.length) return;

  const end = buffered.end(buffered.length - 1);
  const pct = (end / duration) * 100;
  els.progressBuffer.style.width = `${pct}%`;
}

function updateDuration() {
  if (!els.video) return;
  const duration = els.video.duration || 0;
  if (els.timeDuration) els.timeDuration.textContent = formatDuration(duration);
}

function resetProgressUI() {
  if (els.progressBar) els.progressBar.style.width = '0%';
  if (els.progressBuffer) els.progressBuffer.style.width = '0%';
  if (els.progressThumb) els.progressThumb.style.left = '0%';
  if (els.timeCurrent) els.timeCurrent.textContent = '0:00';
  if (els.timeDuration) els.timeDuration.textContent = '0:00';
}

function startScrub(e) {
  if (!els.video) return;
  e.preventDefault();
  isSeeking = true;
  wasPausedBeforeSeek = els.video.paused;
  els.video.pause();
  scrub(e);

  document.addEventListener('mousemove', scrub);
  document.addEventListener('mouseup', endScrub);
  document.addEventListener('touchmove', scrub, { passive: false });
  document.addEventListener('touchend', endScrub);
}

function scrub(e) {
  if (!els.video || !els.progressTrack) return;
  const rect = els.progressTrack.getBoundingClientRect();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const pct = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  const duration = els.video.duration || 0;

  if (els.progressBar) els.progressBar.style.width = `${pct * 100}%`;
  if (els.progressThumb) els.progressThumb.style.left = `${pct * 100}%`;
  if (els.timeCurrent) els.timeCurrent.textContent = formatDuration(duration * pct);
}

function endScrub(e) {
  if (!els.video || !els.progressTrack) return;
  const rect = els.progressTrack.getBoundingClientRect();
  const clientX = e.changedTouches ? e.changedTouches[0].clientX : e.clientX;
  const pct = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  const duration = els.video.duration || 0;

  els.video.currentTime = duration * pct;
  isSeeking = false;

  document.removeEventListener('mousemove', scrub);
  document.removeEventListener('mouseup', endScrub);
  document.removeEventListener('touchmove', scrub);
  document.removeEventListener('touchend', endScrub);

  if (!wasPausedBeforeSeek) {
    els.video.play().catch(() => {});
  }
}

function seekRelative(seconds) {
  if (!els.video) return;
  els.video.currentTime = Math.min(
    els.video.duration || 0,
    Math.max(0, els.video.currentTime + seconds)
  );
  showControls();
}

function attemptResume() {
  if (!currentItem || !currentSection || hasResumed) return;

  const duration = els.video.duration;
  if (!duration || !isFinite(duration) || duration <= 0) return;

  const saved = progressStore.get(currentSection, currentItem);
  if (!saved || saved.completed) return;

  const resumeTime = saved.currentTime;
  if (resumeTime > 5 && resumeTime < duration * 0.95) {
    els.video.currentTime = resumeTime;
    updateDebugPanel({ status: `resumed at ${formatDuration(resumeTime)}` });
    if (els.meta) els.meta.textContent = `Resumed at ${formatDuration(resumeTime)}`;
  }

  hasResumed = true;
  startProgressTracking();
}

function startProgressTracking() {
  clearProgressInterval();
  progressInterval = setInterval(() => {
    if (!currentItem || !currentSection) return;
    const duration = els.video.duration;
    if (!duration || !isFinite(duration) || duration <= 0) return;
    progressStore.set(currentSection, currentItem, els.video.currentTime, duration);
  }, 5000);
}

function clearProgressInterval() {
  if (progressInterval) {
    clearInterval(progressInterval);
    progressInterval = null;
  }
}

export function closePlayer() {
  if (els.video && currentItem && currentSection) {
    const duration = els.video.duration;
    if (duration && isFinite(duration) && duration > 0) {
      progressStore.set(currentSection, currentItem, els.video.currentTime, duration);
    }
  }

  if (document.fullscreenElement) {
    document.exitFullscreen();
  }

  if (els.page) els.page.classList.remove('show');
  document.body.style.overflow = '';
  els.stage?.classList.remove('controls-hidden');

  stopCurrentStream();
  clearProgressInterval();
  clearTimeout(controlsTimeout);

  if (els.video) {
    els.video.pause();
    els.video.removeAttribute('src');
    els.video.load();
    els.video.poster = '';
  }
}

function stopCurrentStream() {
  if (hls) {
    hls.destroy();
    hls = null;
  }
  if (els.video) {
    els.video.pause();
    els.video.removeAttribute('src');
    els.video.load();
  }
}

function toggleDebug() {
  if (!els.debugPanel) return;
  debugVisible = !debugVisible;
  els.debugPanel.style.display = debugVisible ? 'block' : 'none';
}

function updateDebugPanel(values) {
  if (values.url !== undefined && els.debugUrl) els.debugUrl.textContent = values.url;
  if (values.native !== undefined && els.debugNative) els.debugNative.textContent = values.native;
  if (values.hlsjs !== undefined && els.debugHlsjs) els.debugHlsjs.textContent = values.hlsjs;
  if (values.status !== undefined && els.debugStatus) els.debugStatus.textContent = values.status;
  if (values.error !== undefined && els.debugError) els.debugError.textContent = values.error;
}

function setMetaText(text) {
  if (els.meta) {
    els.meta.textContent = text;
    els.meta.style.color = '';
  }
}

function showPlayerError(message) {
  if (els.meta) {
    els.meta.textContent = message;
    els.meta.style.color = 'var(--accent-hot)';
  }
  if (els.loader) els.loader.style.display = 'none';
}

function clearError() {
  if (els.meta) {
    els.meta.style.color = '';
  }
}

function formatDuration(seconds) {
  if (!seconds || !isFinite(seconds)) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function getCurrentItem() {
  return currentItem;
}

export function getCurrentSection() {
  return currentSection;
}
