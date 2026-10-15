/**
 * Mzimba Luwerezi Constituency — Internationalization (i18n) Engine
 * Manages runtime language switching between English & Chichewa with state persistence.
 */

import en from '../locales/en.js';
import ch from '../locales/ch.js';

const STORAGE_KEY = 'luwerezi_constituency_lang';
const DEFAULT_LANG = 'en';

const dictionaries = {
  en,
  ch
};

/**
 * Retrieves the currently selected language from local storage or returns the default.
 * @returns {'en' | 'ch'}
 */
export function getLanguage() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'ch' || saved === 'en') {
      return saved;
    }
  } catch (err) {
    console.warn('[i18n] LocalStorage unavailable, using default language:', err);
  }
  return DEFAULT_LANG;
}

/**
 * Translates a given key based on current or specified language with fallback.
 * @param {string} key 
 * @param {string} [fallback] 
 * @param {'en' | 'ch'} [lang]
 * @returns {string}
 */
export function t(key, fallback = '', lang = getLanguage()) {
  const currentDict = dictionaries[lang] || dictionaries[DEFAULT_LANG];
  if (currentDict && typeof currentDict[key] !== 'undefined') {
    return currentDict[key];
  }
  // Fallback to English if translation key is missing in Chichewa
  if (dictionaries[DEFAULT_LANG] && typeof dictionaries[DEFAULT_LANG][key] !== 'undefined') {
    return dictionaries[DEFAULT_LANG][key];
  }
  return fallback || key;
}

/**
 * Scans the DOM and applies translations to all elements declaring data-i18n attributes.
 * Also handles input placeholders and titles where specified.
 */
export function applyTranslations() {
  const currentLang = getLanguage();
  document.documentElement.lang = currentLang;

  // Text content translation
  const elements = document.querySelectorAll('[data-i18n]');
  elements.forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (!key) return;
    const translation = t(key, el.textContent?.trim(), currentLang);
    if (translation) {
      el.textContent = translation;
    }
  });

  // Placeholder translation
  const placeholderElements = document.querySelectorAll('[data-i18n-placeholder]');
  placeholderElements.forEach((el) => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (!key) return;
    const translation = t(key, el.getAttribute('placeholder') || '', currentLang);
    if (translation) {
      el.setAttribute('placeholder', translation);
    }
  });

  // Title translation
  const titleElements = document.querySelectorAll('[data-i18n-title]');
  titleElements.forEach((el) => {
    const key = el.getAttribute('data-i18n-title');
    if (!key) return;
    const translation = t(key, el.getAttribute('title') || '', currentLang);
    if (translation) {
      el.setAttribute('title', translation);
    }
  });

  // Update header language button indicator
  updateLanguageButtonLabel(currentLang);
}

/**
 * Updates the text label inside the language button.
 * Indicates the alternate language to switch to.
 * @param {'en' | 'ch'} currentLang 
 */
function updateLanguageButtonLabel(currentLang) {
  const labelEl = document.getElementById('currentLangLabel');
  if (!labelEl) return;
  // If current is English, button invites switching to Chichewa; if Chichewa, invites English
  labelEl.textContent = currentLang === 'en' ? 'Chichewa' : 'English';
}

/**
 * Switches the active language, stores preference, and updates the entire document.
 * @param {'en' | 'ch'} newLang 
 */
export function setLanguage(newLang) {
  if (newLang !== 'en' && newLang !== 'ch') return;
  try {
    localStorage.setItem(STORAGE_KEY, newLang);
  } catch (err) {
    console.warn('[i18n] Failed to persist language to localStorage:', err);
  }
  applyTranslations();
  window.dispatchEvent(new CustomEvent('languagechange', { detail: { language: newLang } }));
}

/**
 * Toggles language between English and Chichewa.
 */
export function toggleLanguage() {
  const current = getLanguage();
  const target = current === 'en' ? 'ch' : 'en';
  setLanguage(target);
}

/**
 * Initializes language engine on page load.
 */
export function initI18n() {
  applyTranslations();

  const toggleBtn = document.getElementById('languageToggleBtn');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', (e) => {
      e.preventDefault();
      toggleLanguage();
    });
  }
}