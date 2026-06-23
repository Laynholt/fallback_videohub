(function () {
  const {
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

  function createTextElement(tagName, className, text) {
    const element = document.createElement(tagName);
    if (className) element.className = className;
    element.textContent = text;
    return element;
  }

  function createChannelCard(card) {
    const article = document.createElement('article');
    article.className = 'video-card';
    article.addEventListener('click', () => {
      window.location.href = buildPlayerUrl(card.id);
    });

    const thumb = document.createElement('div');
    thumb.className = 'thumb-wrap';
    const image = document.createElement('img');
    image.src = card.previewStatic;
    image.alt = card.title;
    image.addEventListener('error', () => {
      if (card.previewFallbackStatic) image.src = card.previewFallbackStatic;
    });
    thumb.append(
      image,
      createTextElement('span', 'badge', card.categoryLabel),
      createTextElement('span', 'duration', card.duration)
    );

    const copy = document.createElement('div');
    copy.className = 'card-copy';
    copy.append(
      createTextElement('strong', '', card.title),
      createTextElement('span', '', `${card.views} прослушиваний · ${card.date}`)
    );

    article.append(thumb, copy);
    return article;
  }

  function renderCards(cards) {
    const root = byId('channelGrid');
    if (!cards.length) {
      root.innerHTML = '<div class="empty-state"><div><strong>Профиль не найден</strong><span>Похоже, для этого автора пока нет опубликованных релизов или ссылка была собрана некорректно.</span></div></div>';
      return;
    }

    root.replaceChildren(...cards.map((card) => createChannelCard(card)));
  }

  function renderMissingChannel(author) {
    document.title = 'Профиль не найден — REMOVI';
    byId('channelTitle').textContent = 'Профиль не найден';
    byId('channelDescription').textContent = 'Похоже, для этого автора пока нет опубликованных релизов.';
    byId('channelName').textContent = author || 'Неизвестный артист';
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

      document.title = `${payload.author} — REMOVI Artist`;
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
