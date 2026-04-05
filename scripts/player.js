(function () {
  const {
    buildChannelUrl,
    buildPlayerUrl,
    escapeHtml,
    fetchVideo
  } = window.REMOVI_CLIENT;

  function byId(id) {
    return document.getElementById(id);
  }

  function getRequestedId() {
    const params = new URLSearchParams(window.location.search);
    return params.get('id');
  }

  function renderRelated(relatedCards) {
    const relatedRoot = byId('relatedVideos');
    if (!relatedCards.length) {
      relatedRoot.innerHTML = '<div class="related-empty">Похожие видео появятся после следующей публикации.</div>';
      return;
    }

    relatedRoot.innerHTML = relatedCards.map((card) => `
      <article class="related-item">
        <a href="${buildPlayerUrl(card.id)}"><img class="related-thumb" src="${card.previewStatic}" alt="${escapeHtml(card.title)}"></a>
        <div class="related-copy">
          <a href="${buildPlayerUrl(card.id)}"><strong>${escapeHtml(card.title)}</strong></a>
          <a class="related-author" href="${buildChannelUrl(card.author)}">${escapeHtml(card.author)}</a>
          <span>${escapeHtml(card.views)} просмотров · ${escapeHtml(card.date)}</span>
        </div>
      </article>
    `).join('');

    relatedRoot.querySelectorAll('.related-thumb').forEach((image, index) => {
      const card = relatedCards[index];
      image.addEventListener('error', () => {
        if (card.previewFallbackStatic) image.src = card.previewFallbackStatic;
      });
    });
  }

  function renderMissingState() {
    document.title = 'Видео не найдено — REMOVI';
    byId('playerTitle').textContent = 'Видео не найдено';
    byId('playerMeta').textContent = 'Похоже, ссылка устарела или ролик был скрыт.';
    byId('playerAuthor').textContent = 'REMOVI';
    byId('playerAuthorLink').removeAttribute('href');
    byId('playerAvatar').textContent = 'R';
    byId('playerDescription').textContent = 'Попробуйте вернуться в каталог и открыть другой ролик.';
    renderRelated([]);
  }

  function validateEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(value);
  }

  function sanitizePhoneDigits(value) {
    const digits = value.replace(/\D/g, '');
    if (!digits) return '';
    if (digits.startsWith('8') || digits.startsWith('7')) return digits.slice(1, 11);
    return digits.slice(0, 10);
  }

  function formatPhone(value) {
    const digits = sanitizePhoneDigits(value);
    const prefix = '+7';
    if (!digits.length) return prefix;
    if (digits.length <= 3) return `${prefix} (${digits}`;
    if (digits.length <= 6) return `${prefix} (${digits.slice(0, 3)}) ${digits.slice(3)}`;
    if (digits.length <= 8) return `${prefix} (${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    return `${prefix} (${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 8)}-${digits.slice(8, 10)}`;
  }

  function validatePhone(value) {
    const digits = value.replace(/\D/g, '');
    return digits.length === 11 && digits.startsWith('7');
  }

  function markField(input, isValid) {
    input.classList.toggle('invalid', isValid === false);
  }

  function switchAuthTab(tab) {
    const login = tab === 'login';
    byId('playerTabLogin').classList.toggle('active', login);
    byId('playerTabRegister').classList.toggle('active', !login);
    byId('playerLoginForm').hidden = !login;
    byId('playerRegisterForm').hidden = login;
  }

  function resetAuthFeedback() {
    ['playerLoginError', 'playerRegisterError', 'playerRegisterSuccess'].forEach((id) => {
      byId(id).classList.remove('show');
      byId(id).style.color = '';
    });
    document.querySelectorAll('.auth-input.invalid').forEach((input) => input.classList.remove('invalid'));
  }

  function openAuthModal(tab) {
    const modal = byId('playerAuthModal');
    resetAuthFeedback();
    switchAuthTab(tab || 'login');
    modal.classList.add('show');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closeAuthModal() {
    const modal = byId('playerAuthModal');
    modal.classList.remove('show');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  function bindAuthModal() {
    const modal = byId('playerAuthModal');
    const phoneInput = byId('playerRegisterPhone');

    byId('playerAuthClose').addEventListener('click', closeAuthModal);
    modal.addEventListener('click', (event) => {
      if (event.target === modal) closeAuthModal();
    });
    byId('playerTabLogin').addEventListener('click', () => switchAuthTab('login'));
    byId('playerTabRegister').addEventListener('click', () => switchAuthTab('register'));

    phoneInput.addEventListener('focus', () => {
      if (!phoneInput.value.trim()) phoneInput.value = '+7';
    });
    phoneInput.addEventListener('input', () => {
      phoneInput.value = formatPhone(phoneInput.value);
      markField(phoneInput, !phoneInput.value.trim() || validatePhone(phoneInput.value));
    });
    phoneInput.addEventListener('blur', () => {
      if (phoneInput.value.trim() === '+7') phoneInput.value = '';
      markField(phoneInput, !phoneInput.value.trim() || validatePhone(phoneInput.value));
    });

    byId('playerLoginForm').addEventListener('submit', (event) => {
      event.preventDefault();
      const email = byId('playerLoginEmail');
      const password = byId('playerLoginPassword');
      const error = byId('playerLoginError');
      const loginValue = email.value.trim();
      const passwordValue = password.value.trim();
      resetAuthFeedback();

      if (!loginValue || !passwordValue) {
        error.textContent = '⚠ Заполните логин и пароль';
        error.classList.add('show');
        markField(email, Boolean(loginValue));
        markField(password, Boolean(passwordValue));
        return;
      }
      if (loginValue.includes('@') && !validateEmail(loginValue)) {
        error.textContent = '⚠ Проверьте формат email';
        error.classList.add('show');
        markField(email, false);
        return;
      }
      error.textContent = '✓ Демо-вход принят. Полная авторизация будет подключена к бэкенду позже.';
      error.classList.add('show');
      error.style.color = '#62f5a6';
    });

    byId('playerRegisterForm').addEventListener('submit', (event) => {
      event.preventDefault();
      const phone = byId('playerRegisterPhone');
      const email = byId('playerRegisterEmail');
      const login = byId('playerRegisterLogin');
      const password = byId('playerRegisterPassword');
      const error = byId('playerRegisterError');
      const success = byId('playerRegisterSuccess');
      const phoneValue = formatPhone(phone.value.trim());
      phone.value = phoneValue === '+7' ? '+7' : phoneValue;
      resetAuthFeedback();

      if (!phoneValue || phoneValue === '+7' || !email.value.trim() || !login.value.trim() || !password.value.trim()) {
        error.textContent = '⚠ Заполните все поля';
        error.classList.add('show');
        [phone, email, login, password].forEach((input) => markField(input, Boolean(input.value.trim())));
        return;
      }
      if (!validatePhone(phoneValue)) {
        error.textContent = '⚠ Телефон должен начинаться с +7 и содержать 10 цифр после кода';
        error.classList.add('show');
        markField(phone, false);
        return;
      }
      if (!validateEmail(email.value.trim())) {
        error.textContent = '⚠ Введите корректный email';
        error.classList.add('show');
        markField(email, false);
        return;
      }
      if (password.value.trim().length < 8) {
        error.textContent = '⚠ Пароль должен содержать минимум 8 символов';
        error.classList.add('show');
        markField(password, false);
        return;
      }
      success.classList.add('show');
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeAuthModal();
    });
  }

  async function initPlayer() {
    const requestedId = getRequestedId();
    if (!requestedId) {
      renderMissingState();
      return;
    }

    try {
      const payload = await fetchVideo(requestedId);
      const card = payload && payload.video;
      if (!card) {
        renderMissingState();
        return;
      }

      document.title = `${card.title} — REMOVI Video`;
      byId('playerPoster').src = card.previewStatic;
      byId('playerPoster').alt = card.title;
      byId('playerPoster').addEventListener('error', () => {
        if (card.previewFallbackStatic) byId('playerPoster').src = card.previewFallbackStatic;
      });
      byId('playerTitle').textContent = card.title;
      byId('playerMeta').textContent = `${card.author} · ${card.views} просмотров · ${card.date} · ${card.categoryLabel}`;
      byId('playerAvatar').textContent = card.avatar;
      byId('playerAuthor').textContent = card.author;
      byId('playerAuthorLink').href = buildChannelUrl(card.author);
      byId('playerDescription').textContent = card.playerExcerpt;

      const openAuth = () => openAuthModal('login');
      byId('playerAuthBtn').addEventListener('click', openAuth);
      byId('playerGateBtn').addEventListener('click', openAuth);
      byId('topAuthLink').addEventListener('click', (event) => {
        event.preventDefault();
        openAuth();
      });

      renderRelated(Array.isArray(payload.related) ? payload.related : []);
    } catch (error) {
      renderMissingState();
    }
  }

  bindAuthModal();
  void initPlayer();
})();
