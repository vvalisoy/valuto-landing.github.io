/* ==========================================================================
   Valuto landing — vanilla JS
   ========================================================================== */

/* ----- Configuration -------------------------------------------------------
   Where signups go. A static page (opened by double-clicking index.html) has
   no server of its own, so it cannot silently deliver mail to an inbox. There
   are two supported paths:

   1. RECOMMENDED — set WAITLIST_ENDPOINT to a form backend and configure that
      backend to forward every submission to WAITLIST_RECIPIENT. With Formspree,
      create a form whose notification email is waitlist@getvaluto.com and paste
      its URL below. The page POSTs { email, destination } to it.
        Formspree:  'https://formspree.io/f/YOUR_FORM_ID'
        ConvertKit: 'https://app.convertkit.com/forms/YOUR_FORM_ID/subscriptions'

   2. FALLBACK (no endpoint set) — the form opens the visitor's own email app
      with a message pre-addressed to WAITLIST_RECIPIENT, so the address still
      receives the signup once they hit send. This needs no backend but relies
      on the visitor having a mail client. */
const WAITLIST_ENDPOINT = '';
const WAITLIST_RECIPIENT = 'waitlist@getvaluto.com';

/* Founding-member counter — edit freely. */
const SPOTS_REMAINING = 417;
const SPOTS_TOTAL = 1000;

/* Referral link shown in the success state. */
const REFERRAL_LINK = 'getvaluto.com/?ref=founding';

/* Anti temp-mail: reject known disposable / throwaway inbox providers so the
   waitlist collects real, reachable addresses (Gmail, iCloud, Yahoo, Mail.ru,
   Outlook, company domains, etc. all pass). Add domains here as needed. */
const DISPOSABLE_EMAIL_DOMAINS = new Set([
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.info', 'guerrillamail.biz',
  'guerrillamail.net', 'guerrillamail.org', 'grr.la', 'sharklasers.com',
  '10minutemail.com', '10minutemail.net', '20minutemail.com', 'temp-mail.org',
  'tempmail.com', 'tempmail.net', 'tempmail.plus', 'tempmailo.com', 'tmpmail.org',
  'tmpmail.net', 'tmpeml.com', 'moakt.com', 'tempr.email', 'tempmailaddress.com',
  'yopmail.com', 'yopmail.net', 'yopmail.fr', 'throwawaymail.com', 'getnada.com',
  'nada.email', 'maildrop.cc', 'dispostable.com', 'trashmail.com', 'trashmail.net',
  'trashmail.de', 'mailnesia.com', 'mytemp.email', 'fakeinbox.com', 'tempinbox.com',
  'emailondeck.com', 'mohmal.com', 'mintemail.com', 'spam4.me', 'mailcatch.com',
  'discard.email', 'discardmail.com', 'jetable.org', 'spambox.us', 'mvrht.net',
  'harakirimail.com', 'inboxbear.com', 'fakemail.net', 'burnermail.io', 'mailsac.com',
  'wegwerfmail.de', 'einrot.com', 'cuvox.de', 'dayrep.com', 'gustr.com',
  'trbvm.com', 'trbvn.com', '33mail.com', 'anonaddy.me', 'maileon.com',
  '1secmail.com', '1secmail.net', '1secmail.org', 'emltmp.com', 'linshiyouxiang.net',
]);

/* ----- Receipt comparison data ---------------------------------------------
   Illustrative mid-market rates, hardcoded on purpose (static site). */
const DESTINATIONS = {
  vn: { name: 'Vietnam', city: 'Hanoi', rate: 25400, symbol: '₫', position: 'suffix', decimals: 0 },
  ph: { name: 'Philippines', city: 'Manila', rate: 58, symbol: '₱', position: 'prefix', decimals: 0 },
  br: { name: 'Brazil', city: 'Rio', rate: 5.4, symbol: 'R$ ', position: 'prefix', decimals: 2 },
  co: { name: 'Colombia', city: 'Bogotá', rate: 4100, symbol: 'COL$ ', position: 'prefix', decimals: 0 },
  ar: { name: 'Argentina', city: 'Buenos Aires', rate: 1350, symbol: 'AR$ ', position: 'prefix', decimals: 0 },
  pe: { name: 'Peru', city: 'Lima', rate: 3.75, symbol: 'S/ ', position: 'prefix', decimals: 2 },
};


const BANK_FX_MARKUP = 0.025; // hidden in the exchange rate
const BANK_TXN_FEE = 0.03;    // foreign transaction fee
const VALUTO_FEE = 0.02;      // shown before you confirm
const TRIP_SPEND = 1200;      // "two-week trip" framing

/* mark that JS is running — scroll-reveal styles are gated on this */
document.documentElement.classList.add('js');

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ----- Helpers ----- */

const fmtUSD = (v) => '$' + v.toFixed(2);

function fmtLocal(dest, usd) {
  const value = usd * dest.rate;
  const num = value.toLocaleString('en-US', {
    minimumFractionDigits: dest.decimals,
    maximumFractionDigits: dest.decimals,
  });
  return dest.position === 'prefix' ? dest.symbol + num : num + ' ' + dest.symbol;
}

/* Tween a $x.xx value in an element; snaps instantly under reduced motion. */
function animateUSD(el, to, prefix = '') {
  if (el._tween) cancelAnimationFrame(el._tween);
  const from = parseFloat((el.textContent || '').replace(/[^0-9.]/g, '')) || 0;
  if (prefersReducedMotion || document.hidden || Math.abs(to - from) < 0.005) {
    el.textContent = prefix + fmtUSD(to);
    return;
  }
  const start = performance.now();
  const duration = 350;
  function frame(now) {
    const t = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = prefix + fmtUSD(from + (to - from) * eased);
    el._tween = t < 1 ? requestAnimationFrame(frame) : null;
  }
  el._tween = requestAnimationFrame(frame);
}

/* ----- Receipt widget ----- */

const widget = document.querySelector('[data-widget]');

const state = { dest: 'vn', usd: 3, item: 'Coffee' };

function setAll(name, fn) {
  widget.querySelectorAll('[data-r="' + name + '"]').forEach(fn);
}

function renderReceipts(animate) {
  const dest = DESTINATIONS[state.dest];
  const usd = state.usd;

  /* round each displayed line to cents first, then derive totals from the
     rounded parts — so the receipt math always adds up for the reader */
  const toCents = (v) => Math.round(v * 100) / 100;
  const markup = toCents(usd * BANK_FX_MARKUP);
  const txnFee = toCents(usd * BANK_TXN_FEE);
  const bankTotal = usd + markup + txnFee;
  const vFee = toCents(usd * VALUTO_FEE);
  const valutoTotal = usd + vFee;
  const saved = toCents(bankTotal - valutoTotal);
  const bankPct = (BANK_FX_MARKUP + BANK_TXN_FEE) * 100;
  const tripSaved = TRIP_SPEND * (BANK_FX_MARKUP + BANK_TXN_FEE - VALUTO_FEE);

  setAll('item', (el) => { el.textContent = state.item + ' — ' + dest.city; });
  setAll('local', (el) => { el.textContent = fmtLocal(dest, usd); });

  const usdValues = [
    ['mid-bank', usd, ''], ['mid-valuto', usd, ''],
    ['markup', markup, '+'], ['txnfee', txnFee, '+'], ['vfee', vFee, '+'],
    ['bank-total', bankTotal, ''], ['valuto-total', valutoTotal, ''],
    ['saved', saved, ''],
  ];
  usdValues.forEach(([name, value, prefix]) => {
    setAll(name, (el) => {
      if (animate) animateUSD(el, value, prefix);
      else el.textContent = prefix + fmtUSD(value);
    });
  });

  setAll('bank-tag', (el) => {
    el.textContent = bankPct.toFixed(1).replace(/\.0$/, '') + '% over the real price';
  });
  setAll('trip', (el) => { el.textContent = '$' + Math.round(tripSaved); });
}

if (widget) {
  renderReceipts(false);

  widget.querySelectorAll('.chip[data-dest], .chip[data-amount]').forEach((chip) => {
    chip.addEventListener('click', () => {
      const group = chip.closest('.chip-row');
      group.querySelectorAll('.chip').forEach((c) => {
        c.classList.remove('is-selected');
        c.setAttribute('aria-pressed', 'false');
      });
      chip.classList.add('is-selected');
      chip.setAttribute('aria-pressed', 'true');

      if (chip.dataset.dest) state.dest = chip.dataset.dest;
      if (chip.dataset.amount) {
        state.usd = parseFloat(chip.dataset.amount);
        state.item = chip.dataset.item;
      }
      renderReceipts(true);
    });
  });

  /* One orchestrated moment: the receipts "print" when first seen. */
  const receipts = widget.querySelector('[data-receipts]');
  if (receipts && !prefersReducedMotion && 'IntersectionObserver' in window) {
    const printOnce = new IntersectionObserver((entries, obs) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          receipts.classList.add('is-printing');
          obs.disconnect();
        }
      });
    }, { threshold: 0.35 });
    printOnce.observe(receipts);
  }
}

/* ----- Waitlist forms ----- */

let selectedDestination = '';

/* Returns the email domain, lowercased, or '' if the address is malformed. */
function emailDomain(email) {
  const at = email.lastIndexOf('@');
  if (at < 1 || at === email.length - 1) return '';
  return email.slice(at + 1).toLowerCase();
}

/* Validate an email beyond format: reject disposable / temp-mail domains. */
function checkEmail(input) {
  const email = input.value.trim();
  if (!email || !input.checkValidity()) {
    return { ok: false, message: 'Please enter a valid email address.' };
  }
  const domain = emailDomain(email);
  if (!domain || !domain.includes('.')) {
    return { ok: false, message: 'Please enter a valid email address.' };
  }
  if (DISPOSABLE_EMAIL_DOMAINS.has(domain)) {
    return {
      ok: false,
      message: 'Please use a permanent email (Gmail, iCloud, Yahoo, Outlook…). Temporary inboxes aren’t accepted.',
    };
  }
  return { ok: true, email, domain };
}

/* Fallback delivery with no backend: open the visitor's mail app with a
   message already addressed to the waitlist inbox. */
function openMailtoFallback(email, destination) {
  const subject = encodeURIComponent('Valuto waitlist signup');
  const body = encodeURIComponent(
    'Add me to the Valuto founding waitlist.\n\n' +
    'Email: ' + email + '\n' +
    'Travelling next: ' + (destination || '(not specified)') + '\n'
  );
  window.location.href =
    'mailto:' + WAITLIST_RECIPIENT + '?subject=' + subject + '&body=' + body;
}

function showSuccess(form) {
  const success = document.createElement('div');
  success.className = 'form-success';
  success.setAttribute('role', 'status');
  success.innerHTML =
    '<span class="form-success-icon" aria-hidden="true">' +
    '<svg viewBox="0 0 20 20"><path d="M4 10.5 L8.2 14.7 L16 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
    '</span>' +
    '<strong>You’re on the list.</strong>' +
    '<p>We’ll email you before launch. Share your link and move up the list:</p>' +
    '<div class="ref-row"><code>' + REFERRAL_LINK + '</code>' +
    '<button class="btn-copy" type="button">Copy link</button></div>';

  form.replaceWith(success);

  success.querySelector('.btn-copy').addEventListener('click', function () {
    const btn = this;
    navigator.clipboard.writeText('https://' + REFERRAL_LINK).then(() => {
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = 'Copy link'; }, 2000);
    }).catch(() => {
      btn.textContent = 'Copy failed';
    });
  });
}

function showError(form, message) {
  let error = form.querySelector('.form-error');
  if (!error) {
    error = document.createElement('p');
    error.className = 'form-error';
    error.setAttribute('role', 'alert');
    form.append(error);
  }
  error.textContent = message;
}

document.querySelectorAll('form[data-waitlist]').forEach((form) => {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const emailInput = form.querySelector('input[type="email"]');
    const result = checkEmail(emailInput);
    if (!result.ok) {
      showError(form, result.message);
      emailInput.focus();
      return;
    }
    const { email } = result;

    const select = form.querySelector('[data-dest-select]');
    const destination = (select && select.value) || selectedDestination || '';

    /* No backend configured: hand off to the visitor's mail app, count the
       spot, and show success. */
    if (!WAITLIST_ENDPOINT) {
      openMailtoFallback(email, destination);
      claimSpot();
      showSuccess(form);
      return;
    }

    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const body = new FormData();
      body.append('email', email);
      body.append('destination', destination);
      body.append('_recipient', WAITLIST_RECIPIENT); // hint for backends that support it
      const response = await fetch(WAITLIST_ENDPOINT, {
        method: 'POST',
        body,
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) throw new Error('Request failed: ' + response.status);
      claimSpot();
      showSuccess(form);
    } catch (err) {
      console.error('[Valuto] Waitlist signup failed:', err);
      button.disabled = false;
      showError(form, 'Something went wrong — please try again.');
    }
  });
});

/* ----- "Where are you travelling next?" voter ----- */

const voteBox = document.querySelector('[data-vote]');
if (voteBox) {
  const confirmLine = document.querySelector('[data-vote-confirm]');
  voteBox.querySelectorAll('.chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      voteBox.querySelectorAll('.chip').forEach((c) => {
        c.classList.remove('is-selected');
        c.setAttribute('aria-pressed', 'false');
      });
      chip.classList.add('is-selected');
      chip.setAttribute('aria-pressed', 'true');
      selectedDestination = chip.dataset.country;

      /* mirror the choice into the signup form's select */
      const select = document.querySelector('[data-dest-select]');
      if (select) {
        const match = Array.from(select.options).find((o) => o.text === selectedDestination);
        if (match) select.value = match.value || match.text;
      }
      if (confirmLine) {
        confirmLine.hidden = false;
        confirmLine.textContent =
          selectedDestination === 'Somewhere else'
            ? 'Noted — tell us where when you sign up below.'
            : selectedDestination + ' — noted. Join below and your vote counts.';
      }
    });
  });
}

/* ----- Founding spots counter -----
   The remaining count is stored so a refresh doesn't reset it, and each
   browser can only claim once (claiming again just re-shows success). */

const SPOTS_STORE_KEY = 'valuto.spotsRemaining';
const SPOTS_CLAIMED_KEY = 'valuto.claimed';

const spotsCount = document.querySelector('[data-spots-count]');
const spotsFill = document.querySelector('[data-spots-fill]');

function safeStore(action, key, value) {
  try {
    if (action === 'get') return localStorage.getItem(key);
    if (action === 'set') localStorage.setItem(key, value);
  } catch (err) {
    /* storage blocked (private mode, file:// restrictions) — fall back to memory */
  }
  return null;
}

function getRemaining() {
  const stored = parseInt(safeStore('get', SPOTS_STORE_KEY), 10);
  if (Number.isFinite(stored) && stored >= 0 && stored <= SPOTS_TOTAL) return stored;
  return SPOTS_REMAINING;
}

function renderSpots(remaining, animateBar) {
  if (spotsCount) spotsCount.textContent = remaining.toLocaleString('en-US');
  if (spotsFill) {
    const claimedPct = ((SPOTS_TOTAL - remaining) / SPOTS_TOTAL) * 100;
    spotsFill.style.width = claimedPct + '%';
    if (!animateBar) return;
  }
}

/* Drop "founding spots left" by one on a successful signup (once per browser). */
function claimSpot() {
  if (safeStore('get', SPOTS_CLAIMED_KEY) === '1') return;
  const remaining = Math.max(0, getRemaining() - 1);
  safeStore('set', SPOTS_STORE_KEY, String(remaining));
  safeStore('set', SPOTS_CLAIMED_KEY, '1');
  renderSpots(remaining, true);
}

if (spotsCount || spotsFill) {
  const remaining = getRemaining();
  if (spotsCount) spotsCount.textContent = remaining.toLocaleString('en-US');
  if (spotsFill) {
    const claimedPct = ((SPOTS_TOTAL - remaining) / SPOTS_TOTAL) * 100;
    const setWidth = () => { spotsFill.style.width = claimedPct + '%'; };
    if (prefersReducedMotion || !('IntersectionObserver' in window)) {
      setWidth();
    } else {
      const barObserver = new IntersectionObserver((entries, obs) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) { setWidth(); obs.disconnect(); }
        });
      }, { threshold: 0.5 });
      barObserver.observe(spotsFill.parentElement);
    }
  }
}

/* ----- Mobile nav ----- */

const navToggle = document.querySelector('[data-nav-toggle]');
const mobileNav = document.getElementById('mobile-nav');
if (navToggle && mobileNav) {
  navToggle.addEventListener('click', () => {
    const open = navToggle.getAttribute('aria-expanded') === 'true';
    navToggle.setAttribute('aria-expanded', String(!open));
    mobileNav.hidden = open;
  });
  mobileNav.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      navToggle.setAttribute('aria-expanded', 'false');
      mobileNav.hidden = true;
    });
  });
}

/* ----- Header shadow on scroll ----- */

const header = document.querySelector('[data-header]');
if (header) {
  const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 8);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
}

/* ----- Narrative scenes (scroll-scrubbed, Wahda-style pinning) -----
   Each [data-scene] is (--scenes × 100vh) tall with a sticky full-screen
   child. Progress 0→1 across the track toggles .is-on on every [data-at]
   child whose threshold has been passed — scrubbing back reverses it.
   Skipped entirely under reduced motion (CSS shows everything statically). */

const sceneEls = document.querySelectorAll('[data-scene]');
if (sceneEls.length && !prefersReducedMotion) {
  const sceneItems = Array.from(sceneEls, (scene) => ({
    scene,
    targets: Array.from(scene.querySelectorAll('[data-at]'), (el) => ({
      el,
      at: parseFloat(el.dataset.at) || 0,
    })),
  }));

  let sceneTickQueued = false;
  function updateScenes() {
    sceneTickQueued = false;
    const vh = window.innerHeight;
    sceneItems.forEach(({ scene, targets }) => {
      const rect = scene.getBoundingClientRect();
      if (rect.bottom < -200 || rect.top > vh + 200) return;
      const track = rect.height - vh;
      const progress = track > 0 ? Math.min(1, Math.max(0, -rect.top / track)) : 1;
      targets.forEach(({ el, at }) => el.classList.toggle('is-on', progress >= at));
    });
  }
  function queueSceneTick() {
    if (!sceneTickQueued) {
      sceneTickQueued = true;
      requestAnimationFrame(updateScenes);
    }
  }
  window.addEventListener('scroll', queueSceneTick, { passive: true });
  window.addEventListener('resize', queueSceneTick);
  updateScenes();
}

/* ----- Scroll reveals ----- */

const revealTargets = document.querySelectorAll('.reveal');
if (prefersReducedMotion || !('IntersectionObserver' in window)) {
  revealTargets.forEach((el) => el.classList.add('is-visible'));
} else {
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
  revealTargets.forEach((el) => revealObserver.observe(el));
}
