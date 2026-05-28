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
    all: { label: 'Все', colors: ['#121417', '#2a2520'], accent: '#d49a63', mark: '◉' },
    ambient: { label: 'Ambient', colors: ['#0e1519', '#263844'], accent: '#9dc8d8', mark: '☁' },
    phonk: { label: 'Phonk', colors: ['#171113', '#3b2020'], accent: '#cf6f73', mark: '◈' },
    hyperpop: { label: 'Hyperpop', colors: ['#17131a', '#4b2d48'], accent: '#d697bb', mark: '✦' },
    house: { label: 'House', colors: ['#171410', '#5b3b23'], accent: '#d49a63', mark: '▣' },
    trap: { label: 'Trap', colors: ['#111417', '#2f343a'], accent: '#bfc4c7', mark: '▲' },
    cinematic: { label: 'Cinematic', colors: ['#16130f', '#4f3320'], accent: '#d6a45d', mark: '▶' },
    lofi: { label: 'Lo-Fi', colors: ['#16141a', '#38404a'], accent: '#c6b8dd', mark: '◌' },
    techno: { label: 'Techno', colors: ['#0b1418', '#214642'], accent: '#8fcfc5', mark: '⌘' },
    synthwave: { label: 'Synthwave', colors: ['#17131a', '#432f55'], accent: '#c98daf', mark: '◎' }
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
