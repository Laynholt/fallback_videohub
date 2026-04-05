(function () {
  const SETTINGS = { initial: 30, batch: 10, max: 60 };
  const DEFAULT_MESSAGES = {
    login: '⚠ Неверный логин или пароль',
    register: '⚠ Пожалуйста, заполните все поля'
  };

  const FILTERS = [
    { key: 'all', label: 'Все' },
    { key: 'ambient', label: 'Ambient' },
    { key: 'phonk', label: 'Phonk' },
    { key: 'hyperpop', label: 'Hyperpop' },
    { key: 'house', label: 'House' },
    { key: 'trap', label: 'Trap' },
    { key: 'cinematic', label: 'Cinematic' },
    { key: 'lofi', label: 'Lo-Fi' },
    { key: 'techno', label: 'Techno' },
    { key: 'synthwave', label: 'Synthwave' }
  ];

  const CATEGORY_THEMES = {
    all: { label: 'Все', colors: ['#111115', '#252532'], accent: '#ff8c42', mark: '◉' },
    ambient: { label: 'Ambient', colors: ['#0c1422', '#234d64'], accent: '#7dd3fc', mark: '☁' },
    phonk: { label: 'Phonk', colors: ['#120c12', '#6b1d1d'], accent: '#fb7185', mark: '◈' },
    hyperpop: { label: 'Hyperpop', colors: ['#1a1020', '#db2777'], accent: '#f9a8d4', mark: '✦' },
    house: { label: 'House', colors: ['#1a120d', '#ea580c'], accent: '#fdba74', mark: '▣' },
    trap: { label: 'Trap', colors: ['#111418', '#374151'], accent: '#d1d5db', mark: '▲' },
    cinematic: { label: 'Cinematic', colors: ['#120f0d', '#7c2d12'], accent: '#f59e0b', mark: '▶' },
    lofi: { label: 'Lo-Fi', colors: ['#16131c', '#475569'], accent: '#c4b5fd', mark: '◌' },
    techno: { label: 'Techno', colors: ['#07131b', '#0f766e'], accent: '#67e8f9', mark: '⌘' },
    synthwave: { label: 'Synthwave', colors: ['#170f1f', '#7e22ce'], accent: '#f472b6', mark: '◎' }
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

  function fetchCatalog({ filter = 'all', query = '', offset = 0, limit = SETTINGS.initial, seed = '' } = {}) {
    const params = new URLSearchParams({
      filter,
      q: query,
      offset: String(offset),
      limit: String(limit)
    });
    if (seed) params.set('seed', String(seed));
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
