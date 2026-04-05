(function () {
  const SETTINGS = { initial: 30, batch: 10, max: 60 };
  const DEFAULT_MESSAGES = {
    login: '⚠ Неверный логин или пароль',
    register: '⚠ Пожалуйста, заполните все поля'
  };

  const FILTERS = [
    { key: 'all', label: 'Все' },
    { key: 'travel', label: 'Путешествия' },
    { key: 'tech', label: 'Технологии' },
    { key: 'music', label: 'Музыка' },
    { key: 'art', label: 'Арт' },
    { key: 'science', label: 'Наука' },
    { key: 'cinema', label: 'Кино' },
    { key: 'sport', label: 'Спорт' },
    { key: 'food', label: 'Еда' },
    { key: 'lifestyle', label: 'Истории' }
  ];

  const CATEGORY_THEMES = {
    all: { label: 'Все', colors: ['#111115', '#252532'], accent: '#ff8c42', mark: '◉' },
    travel: { label: 'Путешествия', colors: ['#08111f', '#0e5a6f'], accent: '#5eead4', mark: '↗' },
    tech: { label: 'Технологии', colors: ['#0b1120', '#312e81'], accent: '#93c5fd', mark: '⌘' },
    music: { label: 'Музыка', colors: ['#140c1c', '#6b21a8'], accent: '#f9a8d4', mark: '♫' },
    art: { label: 'Арт', colors: ['#1a1020', '#9a3412'], accent: '#fbbf24', mark: '✦' },
    science: { label: 'Наука', colors: ['#07131b', '#0f766e'], accent: '#67e8f9', mark: '∆' },
    cinema: { label: 'Кино', colors: ['#17120d', '#7c2d12'], accent: '#fdba74', mark: '▶' },
    sport: { label: 'Спорт', colors: ['#0d1410', '#166534'], accent: '#86efac', mark: '▲' },
    food: { label: 'Еда', colors: ['#1a120d', '#92400e'], accent: '#fcd34d', mark: '◌' },
    lifestyle: { label: 'Истории', colors: ['#16131c', '#334155'], accent: '#c4b5fd', mark: '◎' }
  };

  function normalizeText(value) {
    return String(value || '').toLowerCase().replace(/ё/g, 'е');
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function buildPlayerUrl(cardId) {
    return `/video/${encodeURIComponent(cardId)}`;
  }

  function buildChannelUrl(author) {
    return `/channel/${encodeURIComponent(author)}`;
  }

  async function fetchJson(url) {
    const response = await fetch(url, { credentials: 'same-origin' });
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status}`);
    }
    return response.json();
  }

  function fetchCatalog({ filter = 'all', query = '', offset = 0, limit = SETTINGS.initial } = {}) {
    const params = new URLSearchParams({
      filter,
      q: query,
      offset: String(offset),
      limit: String(limit)
    });
    return fetchJson(`/api/catalog?${params.toString()}`);
  }

  function fetchVideo(id) {
    return fetchJson(`/api/video?id=${encodeURIComponent(id)}`);
  }

  function fetchChannel(author) {
    return fetchJson(`/api/channel?author=${encodeURIComponent(author)}`);
  }

  window.REMOVI_CLIENT = {
    CATEGORY_THEMES,
    DEFAULT_MESSAGES,
    FILTERS,
    SETTINGS,
    buildChannelUrl,
    buildPlayerUrl,
    escapeHtml,
    fetchCatalog,
    fetchChannel,
    fetchVideo,
    normalizeText
  };
})();
