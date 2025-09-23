/*
  main.enhanced.js — улучшенная и расширенная логика переключения темы для XSoft
  Особенности:
  - Поддержка режимов: light / dark / system (по умолчанию — system)
  - Хранение в localStorage с безопасной обработкой ошибок
  - Приоритет: saved > data-theme on <html> > system preference > default
  - Плавный переход (временный класс .theme--transition)
  - Доступность: aria-атрибуты, keyboard support
  - API: window.XSoftTheme (read-only helper) и кастомное событие 'xsoft:themechange'
  - Фоллбекы, логирование для отладки и graceful degradation

  Как подключать:
  <script defer src="/assets/js/main.enhanced.js"></script>

  CSS (рекомендуется):
  html[data-theme="light"] { --bg: #fff; --text: #111; }
  html[data-theme="dark"]  { --bg: #0b0b0b; --text: #eee; }
  body { background: var(--bg); color: var(--text); transition: background .18s ease, color .18s ease; }
*/

(function () {
  'use strict';

  // -------------------- Конфигурация --------------------
  var STORAGE_KEY = 'xsoft-theme';
  var ATTRIBUTE = 'data-theme'; // куда пишем значение темы — более универсально, чем class
  var TRANSITION_CLASS = 'theme--transition';
  var TRANSITION_MS = 180; // время плавного перехода
  var VALID = { LIGHT: 'light', DARK: 'dark', SYSTEM: 'system' };
  var DEFAULT = VALID.SYSTEM;

  // -------------------- Утилиты --------------------
  function safeLocalStorageGet(key) {
    try {
      return window.localStorage ? window.localStorage.getItem(key) : null;
    } catch (err) {
      // localStorage может быть недоступен (privacy mode)
      console.warn('LocalStorage get failed', err);
      return null;
    }
  }

  function safeLocalStorageSet(key, value) {
    try {
      if (window.localStorage) window.localStorage.setItem(key, value);
      return true;
    } catch (err) {
      console.warn('LocalStorage set failed', err);
      return false;
    }
  }

  function isValidTheme(v) {
    return v === VALID.LIGHT || v === VALID.DARK || v === VALID.SYSTEM;
  }

  function emitThemeChange(detail) {
    var ev;
    try {
      ev = new CustomEvent('xsoft:themechange', { detail: detail || {} });
    } catch (e) {
      // старые браузеры
      ev = document.createEvent('CustomEvent');
      ev.initCustomEvent('xsoft:themechange', false, false, detail || {});
    }
    document.dispatchEvent(ev);
  }

  // -------------------- Работа с системой (prefers-color-scheme) --------------------
  var mql = null;
  function getSystemPref() {
    try {
      if (!mql) mql = window.matchMedia('(prefers-color-scheme: dark)');
      return mql.matches ? VALID.DARK : VALID.LIGHT;
    } catch (err) {
      return VALID.LIGHT; // conservative fallback
    }
  }

  function watchSystemPreference(onChange) {
    try {
      if (!mql) mql = window.matchMedia('(prefers-color-scheme: dark)');
      if (typeof mql.addEventListener === 'function') {
        mql.addEventListener('change', onChange);
        return function () { mql.removeEventListener('change', onChange); };
      }
      // старые Safari
      if (typeof mql.addListener === 'function') {
        mql.addListener(onChange);
        return function () { mql.removeListener(onChange); };
      }
    } catch (err) {
      // nothing
    }
    return function () { /* noop */ };
  }

  // -------------------- Применение темы к DOM --------------------
  function applyThemeToDOM(theme) {
    // theme = light | dark | system
    var doc = document.documentElement;
    if (!doc) return;

    var final = theme;
    if (theme === VALID.SYSTEM) final = getSystemPref();

    // Запишем атрибут (удобно для CSS селекторов и сниппетов)
    doc.setAttribute(ATTRIBUTE, final);
    // для совместимости можно удалить старые классы
    doc.classList.remove('light');
    doc.classList.remove('dark');
    // При желании можно оставить класс, но атрибут более очевиден

    emitThemeChange({ themeRequested: theme, themeApplied: final });
  }

  function withTransition(fn) {
    var doc = document.documentElement;
    if (!doc) { fn(); return; }
    // чтобы не было лишних переходов при начальной установке
    doc.classList.add(TRANSITION_CLASS);
    window.setTimeout(function () {
      try { fn(); } catch (e) { console.error(e); }
      window.setTimeout(function () { doc.classList.remove(TRANSITION_CLASS); }, TRANSITION_MS);
    }, 0);
  }

  // -------------------- API управления темой --------------------
  function readStored() {
    var v = safeLocalStorageGet(STORAGE_KEY);
    if (!v) return null;
    return isValidTheme(v) ? v : null;
  }

  function setTheme(theme, options) {
    // theme: light|dark|system
    options = options || {};
    if (!isValidTheme(theme)) throw new Error('Invalid theme: ' + theme);

    // Сохраняем предпочтение
    var savedOK = safeLocalStorageSet(STORAGE_KEY, theme);

    // Применяем
    if (options.transition) {
      withTransition(function () { applyThemeToDOM(theme); });
    } else {
      applyThemeToDOM(theme);
    }

    if (options.noEmit !== true) {
      emitThemeChange({ themeRequested: theme, saved: !!savedOK });
    }
    return true;
  }

  function getEffectiveTheme() {
    var doc = document.documentElement;
    var attr = doc.getAttribute(ATTRIBUTE);
    if (attr === VALID.LIGHT || attr === VALID.DARK) return attr;
    // fallback
    return getSystemPref();
  }

  function toggleTheme() {
    var current = readStored() || DEFAULT;
    var target;
    // Если текущая сохранённая — system, то определяем, что сейчас реально применено
    var effective = getEffectiveTheme();
    target = (effective === VALID.DARK) ? VALID.LIGHT : VALID.DARK;
    setTheme(target, { transition: true });
  }

  // -------------------- UI: связываем кнопку и поведение --------------------
  function findToggleButton() {
    // ожидаем кнопку с id=theme-toggle, но допускаем data-attr
    return document.getElementById('theme-toggle') || document.querySelector('[data-theme-toggle]');
  }

  function makeButtonAccessible(btn) {
    if (!btn) return;
    // aria-pressed отражает состояние dark (true если dark)
    function refreshLabel() {
      var effective = getEffectiveTheme();
      var pressed = (effective === VALID.DARK);
      try { btn.setAttribute('aria-pressed', String(pressed)); } catch (e) { /* ignore */ }

      // Меняем визуальный текст/иконку
      var icon = btn.querySelector('.theme-icon');
      var label = btn.querySelector('.visually-hidden');
      if (icon) icon.textContent = pressed ? '🌙' : '☀️';
      if (label) label.textContent = pressed ? 'Включена тёмная тема' : 'Включена светлая тема';
    }

    // keyboard support
    btn.addEventListener('keydown', function (ev) {
      if (ev.key === ' ' || ev.key === 'Enter') {
        ev.preventDefault();
        btn.click();
      }
    });

    // click handler
    btn.addEventListener('click', function (ev) {
      ev && ev.preventDefault && ev.preventDefault();
      try { toggleTheme(); } catch (e) { console.error('Toggle theme failed', e); }
      // обновим лейбл чуть позже, когда изменится атрибут на html
      setTimeout(refreshLabel, TRANSITION_MS + 10);
    });

    // react to external changes
    document.addEventListener('xsoft:themechange', refreshLabel);
    // initial
    refreshLabel();
  }

  // -------------------- Инициализация на старте --------------------
  function init(options) {
    options = options || {};

    // Быстрая защита от FOUC: если в <html> уже есть ATTR — используем его без перехода
    var doc = document.documentElement;
    var initialAttr = doc.getAttribute(ATTRIBUTE);
    var stored = readStored();

    // Решаем какую тему применить при загрузке (приоритеты): stored > html attr > system > default
    var chosen = stored || (isValidTheme(initialAttr) ? initialAttr : null) || DEFAULT;

    // Применим без анимации при старте
    try { applyThemeToDOM(chosen); } catch (e) { console.error('Apply theme failed', e); }

    // Подпишемся на системные изменения, если активен system
    var unwatch = function () { /* noop */ };
    if (chosen === VALID.SYSTEM || stored === VALID.SYSTEM || initialAttr === VALID.SYSTEM) {
      unwatch = watchSystemPreference(function () {
        // Если пользователь явно не зафиксировал другую тему — обновляем
        var curStored = readStored();
        if (curStored === VALID.SYSTEM || !curStored) {
          // плавно применим новую тему
          withTransition(function () { applyThemeToDOM(VALID.SYSTEM); });
        }
      });
    }

    // Attach UI
    var btn = findToggleButton();
    if (btn) makeButtonAccessible(btn);

    // Expose public, read-only API for other scripts
    if (!window.XSoftTheme) {
      Object.defineProperty(window, 'XSoftTheme', {
        configurable: false,
        enumerable: true,
        value: {
          get current() { return getEffectiveTheme(); },
          get stored() { return readStored(); },
          set: function (v) { return setTheme(v, { transition: true }); },
          toggle: toggleTheme
        }
      });
    }

    // Возвращаем cleanup
    return function destroy() {
      try { unwatch(); } catch (e) { /* ignore */ }
    };
  }

  // -------------------- Доп. улучшение: логирование скачиваний (без утечек) --------------------
  function initDownloadLogging() {
    document.addEventListener('click', function (ev) {
      var el = ev.target;
      while (el && el !== document) {
        if (el.tagName === 'A' && el.hasAttribute('download')) {
          try {
            var href = el.getAttribute('href');
            // не логируем внутренние приватные ссылки
            console.log('[XSoft] Скачать:', href);
            // Можно тут добавить кастомную аналитику
          } catch (e) {
            // не мешаем клику
          }
          break;
        }
        el = el.parentNode;
      }
    }, { passive: true });
  }

  // -------------------- Автоинициализация (defer-friendly) --------------------
  // Если script подключен с defer или внизу — DOMContentLoaded может уже быть.
  function onReady(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      // уже готово
      setTimeout(fn, 0);
    }
  }

  onReady(function () {
    try {
      // init инициализирует тему и прикрепляет кнопку
      init();
      initDownloadLogging();
    } catch (err) {
      console.error('XSoft theme init failed', err);
    }
  });

})();
