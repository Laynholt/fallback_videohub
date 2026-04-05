(function () {
  const {
    DEFAULT_MESSAGES,
    FILTERS,
    SETTINGS,
    buildChannelUrl,
    buildPlayerUrl,
    escapeHtml,
    fetchCatalog
  } = window.REMOVI_CLIENT;

  let shownCount = 0;
  let totalAvailable = null;
  let isLoading = false;
  let maxReached = false;
  let currentFilter = 'all';
  let currentQuery = '';
  let feedObserver = null;
  let modalCloseTimer = 0;
  let catalogRequestToken = 0;
  let searchTimer = 0;
  const currentFeedSeed = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const welcomeStorageKey = 'removi-ai-intro-seen';

  function byId(id) {
    return document.getElementById(id);
  }

  function syncBodyScrollLock() {
    const overlay = byId('modalOverlay');
    const welcomeOverlay = byId('welcomeOverlay');
    const drawerOpen = byId('sidebar').classList.contains('drawer-open');
    const modalVisible = overlay.classList.contains('show') || overlay.classList.contains('closing');
    const welcomeVisible = welcomeOverlay && welcomeOverlay.classList.contains('show');
    document.body.style.overflow = drawerOpen || modalVisible || welcomeVisible ? 'hidden' : '';
  }

  function renderFilterChips() {
    const bar = byId('filterBar');
    const chips = FILTERS.map((filter) => `<button class="chip${filter.key === currentFilter ? ' active' : ''}" type="button" data-category="${filter.key}" onclick="chipClick(this)">${filter.label}</button>`);
    if (currentQuery) {
      chips.push(`<button class="chip searching" type="button" onclick="clearSearch()">Поиск: ${escapeHtml(currentQuery)} ×</button>`);
    }
    bar.innerHTML = chips.join('');
  }

  function syncSidebarFilterState() {
    document.querySelectorAll('.nav-item[data-category]').forEach((item) => {
      item.classList.toggle('active', item.dataset.category === currentFilter);
    });
  }

  function handlePreviewFailure(image, fallbackSrc) {
    if (!fallbackSrc || image.dataset.failed === 'true') return;
    image.dataset.failed = 'true';
    image.src = fallbackSrc;
    image.classList.add('is-fallback');
  }

  function createPreviewImage(className, src, alt, fallbackSrc) {
    const image = document.createElement('img');
    image.className = className;
    image.src = src;
    image.alt = alt;
    image.loading = 'lazy';
    image.addEventListener('error', () => handlePreviewFailure(image, fallbackSrc));
    return image;
  }

  function renderCard(card, delay) {
    const cardNode = document.createElement('article');
    cardNode.className = 'video-card';
    cardNode.dataset.category = card.category;
    cardNode.style.animationDelay = `${delay}ms`;
    cardNode.addEventListener('click', () => {
      window.location.href = buildPlayerUrl(card.id);
    });

    const thumb = document.createElement('div');
    thumb.className = 'thumb-wrap';
    thumb.appendChild(createPreviewImage('thumb-static', card.previewStatic, card.title, card.previewFallbackStatic));
    thumb.insertAdjacentHTML('beforeend', `
      <span class="category-badge">${escapeHtml(card.categoryLabel)}</span>
      <span class="duration-badge">${escapeHtml(card.duration)}</span>
      ${card.quality ? `<span class="quality-badge">${escapeHtml(card.quality)}</span>` : ''}
    `);

    cardNode.innerHTML = `
      <div class="card-info">
        <div class="avatar">${escapeHtml(card.avatar)}</div>
        <div class="card-text">
          <div class="card-title">${escapeHtml(card.title)}</div>
          <div class="card-meta"><a class="author-link" href="${buildChannelUrl(card.author)}" onclick="openChannel(event, decodeURIComponent('${encodeURIComponent(card.author)}'))">${escapeHtml(card.author)}</a><br>${escapeHtml(card.views)} прослушиваний · ${escapeHtml(card.date)}</div>
        </div>
      </div>
    `;
    cardNode.prepend(thumb);
    return cardNode;
  }

  function renderMessageState(title, description) {
    byId('cardsGrid').innerHTML = `<div class="empty-state"><div><strong>${escapeHtml(title)}</strong><span>${escapeHtml(description)}</span></div></div>`;
  }

  function renderEmptyState() {
    const queryText = currentQuery ? `по запросу «${currentQuery}»` : 'в этой подборке';
    renderMessageState('Ничего не найдено', `Сейчас нет релизов ${queryText}. Попробуйте сменить жанр или формулировку поиска.`);
  }

  function renderLoadError() {
    renderMessageState('Каталог недоступен', 'Сейчас не удалось загрузить релизы с сервера. Проверьте, что локальный API запущен, и обновите страницу.');
  }

  function canLoadMore() {
    if (totalAvailable === null) return true;
    return shownCount < Math.min(totalAvailable, SETTINGS.max);
  }

  function syncFeedState() {
    const sentinel = byId('sentinel');
    const gate = byId('authGate');
    const showSpinner = isLoading || (!maxReached && canLoadMore());
    sentinel.innerHTML = showSpinner ? '<div class="spinner"></div>' : '';
    gate.classList.toggle('show', Number(totalAvailable) > 0);
  }

  async function loadBatch(size, requestToken) {
    if (isLoading || maxReached) return;
    const remaining = SETTINGS.max - shownCount;
    if (remaining <= 0) {
      maxReached = true;
      syncFeedState();
      return;
    }

    isLoading = true;
    syncFeedState();

    try {
      const payload = await fetchCatalog({
        filter: currentFilter,
        query: currentQuery,
        offset: shownCount,
        limit: Math.min(size, remaining),
        seed: currentFeedSeed
      });

      if (requestToken !== catalogRequestToken) return;

      const items = Array.isArray(payload.items) ? payload.items : [];
      const grid = byId('cardsGrid');
      totalAvailable = Number(payload.total) || 0;

      if (!items.length && shownCount === 0 && totalAvailable === 0) {
        renderEmptyState();
      } else {
        items.forEach((card, index) => {
          grid.appendChild(renderCard(card, index * 32));
        });
      }

      shownCount += items.length;
      maxReached = shownCount >= Math.min(totalAvailable, SETTINGS.max) || items.length === 0 || payload.hasMore === false;
      syncFeedState();
    } catch (error) {
      if (requestToken !== catalogRequestToken) return;
      totalAvailable = 0;
      maxReached = true;
      if (shownCount === 0) {
        renderLoadError();
      }
      syncFeedState();
    } finally {
      if (requestToken === catalogRequestToken) {
        isLoading = false;
        syncFeedState();
      }
    }
  }

  function setupObserver() {
    const sentinel = byId('sentinel');
    if (feedObserver) feedObserver.disconnect();
    feedObserver = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !maxReached && !isLoading) {
        const token = catalogRequestToken;
        setTimeout(() => {
          void loadBatch(SETTINGS.batch, token);
        }, 220);
      }
    }, { rootMargin: '220px' });
    feedObserver.observe(sentinel);
  }

  async function applyCatalogView(options) {
    const nextState = options || {};
    if (typeof nextState.filter === 'string') currentFilter = nextState.filter;
    if (typeof nextState.query === 'string') currentQuery = nextState.query.trim();

    catalogRequestToken += 1;
    shownCount = 0;
    totalAvailable = null;
    isLoading = false;
    maxReached = false;
    byId('cardsGrid').innerHTML = '';
    byId('authGate').classList.remove('show');
    renderFilterChips();
    syncSidebarFilterState();
    syncSearchInputs(currentQuery);
    syncFeedState();
    await loadBatch(SETTINGS.initial, catalogRequestToken);
  }

  function syncSearchInputs(value) {
    const topInput = byId('searchInput');
    const mobileInput = byId('mobileSearchInput');
    if (topInput && topInput.value !== value) topInput.value = value;
    if (mobileInput && mobileInput.value !== value) mobileInput.value = value;
  }

  function applySearchFrom(input, immediate) {
    const runSearch = () => {
      void applyCatalogView({ query: input.value });
    };
    clearTimeout(searchTimer);
    if (immediate) {
      runSearch();
      return;
    }
    searchTimer = setTimeout(runSearch, 180);
  }

  function openChannel(event, author) {
    if (event) event.stopPropagation();
    window.location.href = buildChannelUrl(author);
  }

  function bindSearchInputs() {
    const topInput = byId('searchInput');
    const mobileInput = byId('mobileSearchInput');
    const searchButton = byId('searchButton');

    [topInput, mobileInput].forEach((input) => {
      input.addEventListener('input', () => applySearchFrom(input, false));
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          applySearchFrom(input, true);
        }
      });
    });

    searchButton.addEventListener('click', () => {
      if (topInput.value.trim()) {
        applySearchFrom(topInput, true);
      } else {
        topInput.focus();
      }
    });
  }

  function resetAuthFeedback() {
    byId('loginError').textContent = DEFAULT_MESSAGES.login;
    byId('regError').textContent = DEFAULT_MESSAGES.register;
    ['loginError', 'regError', 'regSuccess'].forEach((id) => byId(id).classList.remove('show'));
    document.querySelectorAll('.form-input.invalid').forEach((input) => input.classList.remove('invalid'));
    byId('regSubmitBtn').style.display = '';
  }

  function stopModalPropagation(event) {
    event.stopPropagation();
  }

  function finishCloseModal() {
    const overlay = byId('modalOverlay');
    overlay.classList.remove('show', 'closing');
    overlay.setAttribute('aria-hidden', 'true');
    syncBodyScrollLock();
  }

  function openModal(tab) {
    const overlay = byId('modalOverlay');
    clearTimeout(modalCloseTimer);
    overlay.classList.remove('closing');
    overlay.classList.add('show');
    overlay.setAttribute('aria-hidden', 'false');
    switchTab(tab || 'login');
    resetAuthFeedback();
    syncBodyScrollLock();
  }

  function rememberWelcomeOverlay() {
    try {
      window.localStorage.setItem(welcomeStorageKey, '1');
    } catch (error) {
      // Ignore storage failures and continue.
    }
  }

  function hasSeenWelcomeOverlay() {
    try {
      return window.localStorage.getItem(welcomeStorageKey) === '1';
    } catch (error) {
      return false;
    }
  }

  function showWelcomeOverlay() {
    const overlay = byId('welcomeOverlay');
    if (!overlay || hasSeenWelcomeOverlay()) return;
    overlay.classList.add('show');
    overlay.setAttribute('aria-hidden', 'false');
    syncBodyScrollLock();
  }

  function dismissWelcomeOverlay() {
    const overlay = byId('welcomeOverlay');
    if (!overlay) return;
    overlay.classList.remove('show');
    overlay.setAttribute('aria-hidden', 'true');
    rememberWelcomeOverlay();
    syncBodyScrollLock();
  }

  function openWelcomeAuth(tab) {
    dismissWelcomeOverlay();
    openModal(tab || 'login');
  }

  function closeModal(immediate) {
    const overlay = byId('modalOverlay');
    clearTimeout(modalCloseTimer);
    if (immediate) {
      finishCloseModal();
      return;
    }
    overlay.classList.remove('show');
    overlay.classList.add('closing');
    modalCloseTimer = setTimeout(finishCloseModal, 220);
  }

  function overlayClose(event) {
    if (event.target === byId('modalOverlay')) closeModal();
  }

  function switchTab(tab) {
    const isLogin = tab === 'login';
    byId('tabLogin').classList.toggle('active', isLogin);
    byId('tabRegister').classList.toggle('active', !isLogin);
    byId('formLogin').hidden = !isLogin;
    byId('formRegister').hidden = isLogin;
  }

  function requireAuth() {
    openModal('login');
  }

  function maybeOpenAuthFromLocation() {
    if (window.location.hash === '#login') {
      const welcomeOverlay = byId('welcomeOverlay');
      if (welcomeOverlay) {
        welcomeOverlay.classList.remove('show');
        welcomeOverlay.setAttribute('aria-hidden', 'true');
      }
      rememberWelcomeOverlay();
      openModal('login');
    }
  }

  function reloadPage() {
    window.location.reload();
  }

  function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
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

  function bindRegisterInputs() {
    const phone = byId('regPhone');
    const email = byId('regEmail');
    if (phone.dataset.bound === 'true') return;
    phone.dataset.bound = 'true';

    phone.addEventListener('focus', () => {
      if (!phone.value.trim()) phone.value = '+7';
    });
    phone.addEventListener('input', () => {
      phone.value = formatPhone(phone.value);
      requestAnimationFrame(() => {
        if (document.activeElement === phone) phone.setSelectionRange(phone.value.length, phone.value.length);
      });
      markField(phone, !phone.value.trim() || validatePhone(phone.value));
    });
    phone.addEventListener('blur', () => {
      if (phone.value.trim() === '+7') phone.value = '';
      markField(phone, !phone.value.trim() || validatePhone(phone.value));
    });
    email.addEventListener('input', () => {
      markField(email, !email.value.trim() || validateEmail(email.value.trim()));
    });
  }

  function doLogin() {
    const loginInput = byId('loginEmail');
    const passwordInput = byId('loginPassword');
    const error = byId('loginError');
    const login = loginInput.value.trim();
    const password = passwordInput.value.trim();

    markField(loginInput, true);
    markField(passwordInput, true);
    error.classList.remove('show');

    if (!login || !password) {
      error.textContent = '⚠ Заполните логин и пароль';
      error.classList.add('show');
      markField(loginInput, Boolean(login));
      markField(passwordInput, Boolean(password));
      return;
    }
    if (login.includes('@') && !validateEmail(login)) {
      error.textContent = '⚠ Проверьте формат email';
      error.classList.add('show');
      markField(loginInput, false);
      return;
    }
    error.textContent = DEFAULT_MESSAGES.login;
    error.classList.add('show');
  }

  function doRegister() {
    const phoneInput = byId('regPhone');
    const emailInput = byId('regEmail');
    const loginInput = byId('regLogin');
    const passwordInput = byId('regPassword');
    const error = byId('regError');
    const success = byId('regSuccess');
    const phone = formatPhone(phoneInput.value.trim());
    const email = emailInput.value.trim();
    const login = loginInput.value.trim();
    const password = passwordInput.value.trim();

    phoneInput.value = phone === '+7' ? '+7' : phone;
    [phoneInput, emailInput, loginInput, passwordInput].forEach((input) => markField(input, true));
    error.classList.remove('show');
    success.classList.remove('show');

    if (!phone || phone === '+7' || !email || !login || !password) {
      error.textContent = DEFAULT_MESSAGES.register;
      error.classList.add('show');
      [phoneInput, emailInput, loginInput, passwordInput].forEach((input) => markField(input, Boolean(input.value.trim())));
      return;
    }
    if (!validatePhone(phone)) {
      error.textContent = '⚠ Телефон должен начинаться с +7 и содержать 10 цифр после кода';
      error.classList.add('show');
      markField(phoneInput, false);
      return;
    }
    if (!validateEmail(email)) {
      error.textContent = '⚠ Введите корректный email';
      error.classList.add('show');
      markField(emailInput, false);
      return;
    }
    if (login.length < 3) {
      error.textContent = '⚠ Логин должен быть не короче 3 символов';
      error.classList.add('show');
      markField(loginInput, false);
      return;
    }
    if (password.length < 8) {
      error.textContent = '⚠ Пароль должен содержать минимум 8 символов';
      error.classList.add('show');
      markField(passwordInput, false);
      return;
    }
    byId('regEmailConfirm').textContent = email;
    success.classList.add('show');
    byId('regSubmitBtn').style.display = 'none';
  }

  function navClick(el) {
    const categoryKey = el.dataset.category;
    if (categoryKey) {
      void applyCatalogView({ filter: categoryKey });
      closeDrawer();
      scrollToTop();
      return;
    }
    if (el.querySelector('.nav-icon').textContent.includes('⌂')) {
      document.querySelectorAll('.nav-item').forEach((item) => item.classList.remove('active'));
      el.classList.add('active');
      closeDrawer();
      scrollToTop();
      return;
    }
    requireAuth();
  }

  function chipClick(el) {
    const categoryKey = el.dataset.category;
    if (!categoryKey || categoryKey === currentFilter) return;
    void applyCatalogView({ filter: categoryKey });
    scrollToTop();
  }

  function clearSearch() {
    void applyCatalogView({ query: '' });
  }

  function toggleDrawer() {
    const sidebar = byId('sidebar');
    const overlay = byId('drawerOverlay');
    const open = sidebar.classList.toggle('drawer-open');
    overlay.classList.toggle('show', open);
    syncBodyScrollLock();
  }

  function closeDrawer() {
    byId('sidebar').classList.remove('drawer-open');
    byId('drawerOverlay').classList.remove('show');
    syncBodyScrollLock();
  }

  function toggleMobileSearch() {
    const bar = byId('mobileSearchBar');
    const open = bar.classList.toggle('open');
    if (open) byId('mobileSearchInput').focus();
  }

  function bnavClick(el, type) {
    document.querySelectorAll('.bnav-item').forEach((button) => button.classList.remove('active'));
    el.classList.add('active');
    if (type === 'home') {
      scrollToTop();
      return;
    }
    if (type === 'menu') {
      toggleDrawer();
      el.classList.remove('active');
      return;
    }
    requireAuth();
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeModal();
      closeDrawer();
    }
  });

  bindRegisterInputs();
  bindSearchInputs();
  renderFilterChips();
  setupObserver();
  void applyCatalogView({ filter: 'all', query: '' });
  showWelcomeOverlay();
  maybeOpenAuthFromLocation();

  window.bnavClick = bnavClick;
  window.chipClick = chipClick;
  window.clearSearch = clearSearch;
  window.closeDrawer = closeDrawer;
  window.closeModal = closeModal;
  window.dismissWelcomeOverlay = dismissWelcomeOverlay;
  window.doLogin = doLogin;
  window.doRegister = doRegister;
  window.navClick = navClick;
  window.openChannel = openChannel;
  window.openModal = openModal;
  window.openWelcomeAuth = openWelcomeAuth;
  window.overlayClose = overlayClose;
  window.reloadPage = reloadPage;
  window.requireAuth = requireAuth;
  window.stopModalPropagation = stopModalPropagation;
  window.switchTab = switchTab;
  window.toggleDrawer = toggleDrawer;
  window.toggleMobileSearch = toggleMobileSearch;
})();
