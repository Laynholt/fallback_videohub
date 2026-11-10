;(function () {
  'use strict';
  const forms = new Map([
    ['formLogin', { event: 'login_submit', page: 'catalog' }],
    ['formRegister', { event: 'register_submit', page: 'catalog' }],
    ['playerLoginForm', { event: 'login_submit', page: 'video' }],
    ['playerRegisterForm', { event: 'register_submit', page: 'video' }]
  ]);
  let period = Date.now();
  let sent = 0;
  document.addEventListener('submit', event => {
    const form = event.target;
    if (!form || form.tagName !== 'FORM') return;
    const payload = forms.get(form.id);
    if (!payload) return;
    const now = Date.now();
    if (now - period >= 60_000) { period = now; sent = 0; }
    if (sent >= 30) return;
    sent++;
    try {
      void fetch('/api/_events', {
        method: 'POST', credentials: 'omit', referrer: '', keepalive: true,
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      }).catch(() => {});
    } catch { /* Network failure leaves the demo form working. */ }
  }, true);
})();
