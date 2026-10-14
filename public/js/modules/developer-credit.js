/**
 * Mzimba South Luwerezi Constituency — Compact Developer Profile Module
 * Controls the subtle floating bottom-left badge and accessible contact card for Abraham Msofi.
 */

export function initDeveloperBadge() {
  const triggerBtn = document.getElementById('devBadgeBtn');
  const card = document.getElementById('devBadgeCard');
  const closeBtn = document.getElementById('devCardCloseBtn');

  if (!triggerBtn || !card) return;

  /**
   * Opens the developer card with accessible focus.
   */
  function openCard() {
    card.removeAttribute('hidden');
    triggerBtn.setAttribute('aria-expanded', 'true');
    if (closeBtn) closeBtn.focus();
  }

  /**
   * Closes the developer card and returns focus to trigger.
   */
  function closeCard() {
    card.setAttribute('hidden', '');
    triggerBtn.setAttribute('aria-expanded', 'false');
    triggerBtn.focus();
  }

  // Toggle card visibility on button click
  triggerBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isExpanded = triggerBtn.getAttribute('aria-expanded') === 'true';
    if (isExpanded) {
      closeCard();
    } else {
      openCard();
    }
  });

  // Close on explicit close button click
  if (closeBtn) {
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeCard();
    });
  }

  // Close when clicking outside of the badge container
  document.addEventListener('click', (e) => {
    const container = document.getElementById('developerBadgeContainer');
    if (container && !container.contains(e.target)) {
      if (triggerBtn.getAttribute('aria-expanded') === 'true') {
        card.setAttribute('hidden', '');
        triggerBtn.setAttribute('aria-expanded', 'false');
      }
    }
  });

  // Close on Escape key press
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && triggerBtn.getAttribute('aria-expanded') === 'true') {
      closeCard();
    }
  });
}