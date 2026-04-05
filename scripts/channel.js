(function () {
  const {
    escapeHtml,
    buildPlayerUrl,
    fetchChannel
  } = window.REMOVI_CLIENT;

  function byId(id) {
    return document.getElementById(id);
  }

  function getAuthorFromLocation() {
    const match = window.location.pathname.match(/^\/channel\/([^/]+)$/);
    if (match) return decodeURIComponent(match[1]);
    const params = new URLSearchParams(window.location.search);
    return params.get('author') || '';
  }

  function attachPreviewFallbacks(cards) {
    document.querySelectorAll('#channelGrid img[data-card-index]').forEach((image) => {
      const index = Number(image.dataset.cardIndex);
      const card = cards[index];
      if (!card) return;
      image.addEventListener('error', () => {
        if (card.previewFallbackStatic) image.src = card.previewFallbackStatic;
      });
    });
  }

  function renderCards(cards) {
    const root = byId('channelGrid');
    if (!cards.length) {
      root.innerHTML = '<div class="empty-state"><div><strong>Канал не найден</strong><span>Похоже, для этого автора пока нет опубликованных видео или ссылка была собрана некорректно.</span></div></div>';
      return;
    }

    root.innerHTML = cards.map((card, index) => `
      <article class="video-card" onclick="window.location.href='${buildPlayerUrl(card.id)}'">
        <div class="thumb-wrap">
          <img src="${card.previewStatic}" alt="${escapeHtml(card.title)}" data-card-index="${index}">
          <span class="badge">${escapeHtml(card.categoryLabel)}</span>
          <span class="duration">${escapeHtml(card.duration)}</span>
        </div>
        <div class="card-copy">
          <strong>${escapeHtml(card.title)}</strong>
          <span>${escapeHtml(card.views)} просмотров · ${escapeHtml(card.date)}</span>
        </div>
      </article>
    `).join('');

    attachPreviewFallbacks(cards);
  }

  function renderMissingChannel(author) {
    document.title = 'Канал не найден — REMOVI';
    byId('channelTitle').textContent = 'Канал не найден';
    byId('channelDescription').textContent = 'Похоже, для этого автора пока нет опубликованных видео.';
    byId('channelName').textContent = author || 'Неизвестный автор';
    byId('channelAvatar').textContent = 'R';
    byId('videoCount').textContent = '0';
    byId('viewCount').textContent = '0';
    byId('categoryCount').textContent = '0';
    byId('latestVideoDate').textContent = '—';
    renderCards([]);
  }

  async function initChannel() {
    const author = getAuthorFromLocation();
    if (!author) {
      renderMissingChannel('');
      return;
    }

    try {
      const payload = await fetchChannel(author);
      if (!payload || payload.found === false) {
        renderMissingChannel(author);
        return;
      }

      document.title = `${payload.author} — REMOVI Channel`;
      byId('channelTitle').textContent = payload.author;
      byId('channelDescription').textContent = payload.description;
      byId('channelName').textContent = payload.author;
      byId('channelAvatar').textContent = payload.stats.avatar;
      byId('videoCount').textContent = payload.stats.videoCount;
      byId('viewCount').textContent = payload.stats.viewCount;
      byId('categoryCount').textContent = payload.stats.categoryCount;
      byId('latestVideoDate').textContent = payload.stats.latestVideoDate;
      renderCards(Array.isArray(payload.videos) ? payload.videos : []);
    } catch (error) {
      renderMissingChannel(author);
    }
  }

  void initChannel();
})();
