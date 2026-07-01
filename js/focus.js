/* Arrow-pad / TV remote focus navigation */

import { closePlayer } from './player.js';

const FOCUSABLE_SELECTORS = [
  '.sidebar-link',
  '.category-tab',
  '.card',
  '.home-carousel-item',
  '.btn',
  '.player-icon-btn',
  '.player-center-btn',
  '.modal-close',
  '.favorite-btn',
  '.episode-item',
  '.accent-option',
  '.guide-channel-col',
  '.guide-program',
  'input[type="text"]',
  'input[type="password"]',
  'input[type="search"]',
  'input[type="email"]',
  'input[type="url"]',
  'textarea',
].join(', ');

const EXCLUDED_FOCUSABLE = 'input[type="range"], input[type="submit"], input[type="button"], input[type="reset"]';

let isEnabled = true;
let lastFocusedElement = null;

export function initFocusNavigation() {
  if (typeof document === 'undefined') return;

  document.addEventListener('keydown', handleKeyDown, { capture: true });
  document.addEventListener('click', (e) => {
    const target = e.target.closest(FOCUSABLE_SELECTORS);
    if (target) {
      lastFocusedElement = target;
    }
  });
}

export function setFocusNavigationEnabled(enabled) {
  isEnabled = enabled;
}

function handleKeyDown(e) {
  if (!isEnabled) return;

  const key = e.key;
  const active = document.activeElement;

  // Skip when typing in form fields
  if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) {
    return;
  }

  // Directional navigation
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key)) {
    e.preventDefault();
    moveFocus(key);
    return;
  }

  // Activate focused element
  if (key === 'Enter') {
    const focused = document.activeElement;
    if (focused && isFocusable(focused)) {
      e.preventDefault();
      focused.click();
    }
    return;
  }

  // Back button / Escape
  if (key === 'Backspace' || key === 'Escape') {
    if (handleBack()) {
      e.preventDefault();
    }
  }
}

function isFocusable(el) {
  if (!el) return false;
  return el.matches(FOCUSABLE_SELECTORS) || el.closest(FOCUSABLE_SELECTORS) != null;
}

function moveFocus(direction) {
  const focused = document.activeElement;
  const context = getFocusContext(focused);
  const candidates = getFocusCandidates(context);

  if (candidates.length === 0) return;

  // If nothing is focused or focused is not focusable, focus first candidate
  if (!focused || !isFocusable(focused)) {
    focusElement(candidates[0]);
    return;
  }

  // Sidebar: vertical list
  if (context === 'sidebar') {
    const currentIndex = candidates.indexOf(focused);
    let nextIndex = direction === 'ArrowUp' ? currentIndex - 1 : currentIndex + 1;
    if (direction === 'ArrowLeft' || direction === 'ArrowRight') {
      // Move from sidebar to content area
      focusFirstContentElement();
      return;
    }
    if (nextIndex >= 0 && nextIndex < candidates.length) {
      focusElement(candidates[nextIndex]);
    }
    return;
  }

  // Category tabs: horizontal list
  if (context === 'tabs') {
    const currentIndex = candidates.indexOf(focused);
    let nextIndex = direction === 'ArrowLeft' ? currentIndex - 1 : currentIndex + 1;
    if (direction === 'ArrowUp') {
      if (focusSearchInput()) return;
      focusSidebar();
      return;
    }
    if (direction === 'ArrowDown') {
      focusFirstContentElement();
      return;
    }
    if (nextIndex >= 0 && nextIndex < candidates.length) {
      focusElement(candidates[nextIndex]);
    }
    return;
  }

  // Player controls: horizontal/vertical
  if (context === 'player') {
    moveFocusSpatial(focused, candidates, direction);
    return;
  }

  // Cross-zone navigation for content/guide
  if (context === 'content' || context === 'guide') {
    if (direction === 'ArrowLeft') {
      focusSidebar();
      return;
    }
    if (direction === 'ArrowUp') {
      if (focusSearchInput()) return;
      const tabs = document.querySelector('.category-tabs');
      if (tabs) {
        const activeTab = tabs.querySelector('.category-tab.active') || tabs.querySelector('.category-tab');
        if (activeTab) {
          focusElement(activeTab);
          return;
        }
      }
      focusSidebar();
      return;
    }
  }

  // From search input, move down to tabs/content
  if (context === 'search' && direction === 'ArrowDown') {
    const tabs = document.querySelector('.category-tabs');
    if (tabs) {
      const activeTab = tabs.querySelector('.category-tab.active') || tabs.querySelector('.category-tab');
      if (activeTab) {
        focusElement(activeTab);
        return;
      }
    }
    focusFirstContentElement();
    return;
  }

  // Cards, guide items, episodes, settings: 2D spatial
  moveFocusSpatial(focused, candidates, direction);
}

function getFocusContext(focused) {
  if (!focused) return 'content';

  if (focused.closest('.modal') || focused.classList.contains('modal-close')) return 'modal';
  if (focused.closest('#player-page')) return 'player';
  if (focused.closest('.sidebar')) return 'sidebar';
  if (focused.id === 'search-input' || focused.closest('.search-bar')) return 'search';
  if (focused.closest('.category-tabs')) return 'tabs';
  if (focused.closest('.guide-grid')) return 'guide';

  return 'content';
}

function getFocusCandidates(context) {
  let candidates = [];

  const modal = document.querySelector('.modal-overlay.show .modal');
  if (modal) {
    candidates = Array.from(modal.querySelectorAll(FOCUSABLE_SELECTORS));
  } else {
    const playerPage = document.getElementById('player-page');
    if (playerPage?.classList.contains('show')) {
      candidates = Array.from(playerPage.querySelectorAll(FOCUSABLE_SELECTORS));
    } else if (context === 'sidebar') {
      candidates = Array.from(document.querySelectorAll('.sidebar-link'));
    } else if (context === 'tabs') {
      candidates = Array.from(document.querySelectorAll('.category-tab'));
    } else {
      // Content area: cards, guide items, episodes, settings buttons
      const contentArea = document.getElementById('content-area');
      if (contentArea) {
        candidates = Array.from(contentArea.querySelectorAll(FOCUSABLE_SELECTORS));
      }
    }
  }

  return candidates.filter((el) => !el.matches(EXCLUDED_FOCUSABLE));
}

function moveFocusSpatial(current, candidates, direction) {
  const currentRect = current.getBoundingClientRect();
  const currentCenter = {
    x: currentRect.left + currentRect.width / 2,
    y: currentRect.top + currentRect.height / 2,
  };

  const dirVectors = {
    ArrowUp: { x: 0, y: -1 },
    ArrowDown: { x: 0, y: 1 },
    ArrowLeft: { x: -1, y: 0 },
    ArrowRight: { x: 1, y: 0 },
  };
  const dir = dirVectors[direction];

  let best = null;
  let bestScore = Infinity;

  candidates.forEach((candidate) => {
    if (candidate === current) return;

    const rect = candidate.getBoundingClientRect();
    const center = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };

    const dx = center.x - currentCenter.x;
    const dy = center.y - currentCenter.y;
    const distance = Math.hypot(dx, dy);

    if (distance < 1) return;

    // Dot product to check direction alignment
    const alignment = (dx * dir.x + dy * dir.y) / distance;
    if (alignment <= 0.1) return; // Not in the requested direction

    // Penalize distance, reward alignment
    const score = distance * (2 - alignment);

    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  });

  if (best) {
    focusElement(best);
  }
}

function focusElement(el) {
  if (!el) return;

  // Remove focus class from previously focused element
  document.querySelectorAll('.is-focused').forEach((item) => item.classList.remove('is-focused'));

  el.focus({ preventScroll: true });
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  el.classList.add('is-focused');
  lastFocusedElement = el;
}

// Clean up focus class on blur
document.addEventListener('focusout', (e) => {
  const target = e.target;
  if (target && target.classList.contains('is-focused')) {
    target.classList.remove('is-focused');
  }
});

function focusSidebar() {
  const active = document.querySelector('.sidebar-link.active') || document.querySelector('.sidebar-link');
  if (active) focusElement(active);
}

function focusSearchInput() {
  const searchInput = document.getElementById('search-input');
  if (searchInput && searchInput.offsetParent !== null) {
    focusElement(searchInput);
    return true;
  }
  return false;
}

function focusFirstContentElement() {
  const contentArea = document.getElementById('content-area');
  if (!contentArea) return;
  const first = contentArea.querySelector(FOCUSABLE_SELECTORS);
  if (first) focusElement(first);
}

function handleBack() {
  const modal = document.querySelector('.modal-overlay.show');
  if (modal) {
    const closeBtn = modal.querySelector('.modal-close');
    if (closeBtn) closeBtn.click();
    return true;
  }

  const playerPage = document.getElementById('player-page');
  if (playerPage?.classList.contains('show')) {
    closePlayer();
    return true;
  }

  return false;
}

// Public helper to restore focus after content changes
export function restoreFocus() {
  if (lastFocusedElement && document.contains(lastFocusedElement)) {
    focusElement(lastFocusedElement);
  } else {
    focusFirstContentElement();
  }
}
