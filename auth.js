// ---------- Sign-in ----------
// All data goes through /api/* on the same Vercel site. The API only answers when the browser
// has a valid session cookie (HttpOnly — page scripts can't read it). On a 401 we show the
// sign-in screen; after signing in the page reloads and stays on the same section.

const appSession = { authed: false, drive: false, checked: false };

// Drive keys used to live in this browser; they're on the server now, so remove them.
try { localStorage.removeItem('scanDriveUrl'); localStorage.removeItem('scanDriveKey'); } catch { }

async function apiFetch(url, options = {}) {
    const res = await fetch(url, { credentials: 'same-origin', ...options });
    if (res.status === 401) { showSignIn(); throw new Error('unauthorized'); }
    return res;
}

function showSignIn(message) {
    let el = document.getElementById('signInScreen');
    if (!el) {
        el = document.createElement('div');
        el.id = 'signInScreen';
        el.className = 'fixed inset-0 z-[100] bg-gray-950/95 backdrop-blur flex items-center justify-center p-4';
        document.body.appendChild(el);
    }
    el.innerHTML = `
      <form id="signInForm" class="w-full max-w-sm rounded-2xl border border-white/10 bg-gradient-to-b from-gray-800/90 to-gray-900/95 shadow-2xl shadow-black/40 overflow-hidden">
        <div class="h-1.5 bg-gradient-to-r from-logoClr via-logoClrBlue to-logoClr"></div>
        <div class="p-6 flex flex-col gap-4">
          <div class="flex items-center gap-3">
            <img src="./imgs/spare-parts.png" alt="" class="w-10">
            <div>
              <h2 class="text-txtWht text-lg font-semibold tracking-tight">${t('auth_title')}</h2>
              <p class="text-gray-400 text-xs">${t('auth_subtitle')}</p>
            </div>
          </div>
          <label class="text-gray-400 text-[11px] font-semibold uppercase tracking-wide" for="signInPassword">${t('auth_password')}</label>
          <input id="signInPassword" type="password" autocomplete="current-password" required
            class="w-full rounded-lg border border-white/10 bg-gray-950/50 text-txtWht px-3 py-2.5 focus:outline-none focus:border-logoClr/60 focus:ring-2 focus:ring-logoClr/20">
          <p id="signInMsg" class="text-red-300 text-sm ${message ? '' : 'hidden'}">${message ? escapeHtmlAuth(message) : ''}</p>
          <button type="submit" class="bg-logoClr text-gray-900 font-semibold rounded-xl p-2.5 hover:brightness-110 disabled:opacity-60">${t('auth_submit')}</button>
        </div>
      </form>`;
    document.documentElement.style.overflow = 'hidden';
    const input = document.getElementById('signInPassword');
    setTimeout(() => input.focus(), 50);
    document.getElementById('signInForm').addEventListener('submit', async e => {
        e.preventDefault();
        const btn = e.target.querySelector('button');
        const msg = document.getElementById('signInMsg');
        btn.disabled = true; btn.textContent = t('auth_checking');
        try {
            const res = await fetch('/api/login', {
                method: 'POST', credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: input.value })
            });
            if (res.ok) { location.reload(); return; }
            msg.textContent = res.status === 401 ? t('auth_wrong') : t('auth_error');
        } catch {
            msg.textContent = t('auth_error');
        }
        msg.classList.remove('hidden');
        btn.disabled = false; btn.textContent = t('auth_submit');
        input.select();
    });
}

function escapeHtmlAuth(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function signOut() {
    try { await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' }); } catch { }
    location.reload();
}

// Ask the server once on load whether we're signed in (and whether Drive uploads are set up).
const sessionReady = fetch('/api/session', { credentials: 'same-origin', cache: 'no-store' })
    .then(r => r.json())
    .then(s => {
        Object.assign(appSession, { authed: !!s.authed, drive: !!s.drive, checked: true });
        if (!appSession.authed) showSignIn();
        if (typeof renderScans === 'function' && document.getElementById('scans')?.style.display === 'block') renderScans();
    })
    .catch(() => { appSession.checked = true; });

document.addEventListener('click', e => { if (e.target.closest('#signOutBtn')) signOut(); });
