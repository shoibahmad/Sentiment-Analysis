/**
 * Shared Aura Header + Mobile Drawer
 * Import this module on any page to inject the unified header.
 * Usage: import './header.js';
 */
import { auth } from './firebaseConfig.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// ── Current page detection ──
const path = window.location.pathname;
const page = path.endsWith('/') || path.endsWith('index.html') ? 'home'
    : path.includes('app.html') ? 'analyzer'
        : path.includes('dashboard.html') ? 'dashboard'
            : path.includes('about.html') ? 'about'
                : path.includes('admin.html') ? 'admin'
                    : 'other';

const PAGE_TITLES = {
    home: 'Aura',
    analyzer: 'Analyzer Engine',
    dashboard: 'My Dashboard',
    about: 'About Project',
    admin: 'Admin Panel',
    other: 'Aura'
};

const PAGE_SUBTITLES = {
    home: 'AI Sentiment Engine',
    analyzer: 'Decode your text',
    dashboard: 'Personal analytics',
    about: 'Project documentation',
    admin: 'Command center',
    other: ''
};

// ── Inject drawer CSS ──
const drawerStyle = document.createElement('style');
drawerStyle.textContent = `
    .aura-header { width:100%; border-bottom:1px solid #1f1f1f; background:rgba(12,12,12,0.95); backdrop-filter:blur(12px); position:sticky; top:0; z-index:50; }
    .drawer-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.6); backdrop-filter:blur(4px); z-index:60; opacity:0; pointer-events:none; transition:opacity .3s ease; }
    .drawer-overlay.open { opacity:1; pointer-events:auto; }
    .drawer-panel { position:fixed; top:0; right:0; bottom:0; width:300px; max-width:85vw; background:#0c0c0c; border-left:1px solid #1f1f1f; z-index:70; transform:translateX(100%); transition:transform .3s cubic-bezier(.4,0,.2,1); display:flex; flex-direction:column; overflow-y:auto; }
    .drawer-panel.open { transform:translateX(0); }
    .drawer-nav-item { display:flex; align-items:center; gap:12px; padding:12px 16px; border-radius:10px; font-size:14px; font-weight:500; color:#a3a3a3; transition:all .2s; cursor:pointer; text-decoration:none; }
    .drawer-nav-item:hover, .drawer-nav-item.active { background:#1a1a1a; color:#fff; }
    .drawer-nav-item .nav-icon { width:32px; height:32px; border-radius:8px; display:flex; align-items:center; justify-content:center; font-size:14px; flex-shrink:0; }
    .header-link { font-size:12px; font-weight:500; color:#6b7280; transition:color .2s; text-decoration:none; padding:6px 12px; border-radius:8px; }
    .header-link:hover { color:#fff; }
    .header-link.active { color:#fff; background:#1a1a1a; }
`;
document.head.appendChild(drawerStyle);

// ── Build header HTML ──
function buildHeader() {
    const headerEl = document.createElement('header');
    headerEl.className = 'aura-header';
    headerEl.id = 'auraHeader';

    const navLinks = [
        { href: '/', label: 'Home', key: 'home', icon: '🏠' },
        { href: '/app.html', label: 'Analyzer', key: 'analyzer', icon: '🔮' },
        { href: '/dashboard.html', label: 'Dashboard', key: 'dashboard', icon: '📊' },
        { href: '/about.html', label: 'About', key: 'about', icon: 'ℹ️' },
    ];

    const desktopNav = navLinks.map(l =>
        `<a href="${l.href}" class="header-link ${page === l.key ? 'active' : ''}">${l.label}</a>`
    ).join('');

    headerEl.innerHTML = `
        <div class="max-w-7xl mx-auto px-6 py-3.5 flex justify-between items-center">
            <div class="flex items-center gap-3">
                <a href="/" class="flex items-center justify-center w-8 h-8 rounded-lg bg-white text-black font-bold text-base shadow-[0_0_15px_rgba(255,255,255,0.15)] hover:bg-gray-200 transition-colors">A</a>
                <div>
                    <h1 class="text-base font-bold text-white leading-none">${PAGE_TITLES[page]}</h1>
                    <p class="text-xs text-gray-600 leading-none mt-0.5">${PAGE_SUBTITLES[page]}</p>
                </div>
            </div>

            <nav class="hidden md:flex items-center gap-1 bg-[#141414] border border-[#262626] rounded-xl p-1">
                ${desktopNav}
            </nav>

            <div class="flex items-center gap-3">
                <!-- Auth area: shown when logged in -->
                <div id="sharedAuthArea" class="flex items-center gap-2.5 border-l border-[#262626] pl-3" style="display:none;">
                    <button id="sharedAvatar" onclick="window.__toggleAuraDrawer()"
                        class="w-8 h-8 rounded-full bg-gradient-to-tr from-emerald-600 to-emerald-400 flex items-center justify-center text-black font-bold text-sm shadow-[0_0_10px_rgba(16,185,129,0.3)] cursor-pointer">?</button>
                    <div class="hidden sm:block">
                        <p id="sharedHeaderName" class="text-sm font-semibold text-white leading-none">Loading...</p>
                        <p id="sharedHeaderEmail" class="text-xs text-gray-500 leading-none mt-0.5">Authenticating...</p>
                    </div>
                </div>
                <button id="sharedLogoutBtn" class="p-1.5 text-gray-600 hover:text-rose-400 transition-colors hidden" title="Sign Out">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>
                </button>
                <!-- Guest area: shown when NOT logged in -->
                <div id="sharedGuestArea" class="flex items-center gap-3">
                    <a href="/auth.html" class="text-sm font-medium text-gray-400 hover:text-white transition-colors">Sign In</a>
                    <a href="/auth.html" class="px-4 py-2 bg-white text-black text-sm font-semibold rounded-lg hover:bg-gray-200 transition-colors shadow-[0_0_12px_rgba(255,255,255,0.1)]">Get Started</a>
                </div>
            </div>
        </div>
    `;

    return headerEl;
}

// ── Build drawer HTML ──
function buildDrawer() {
    const navLinks = [
        { href: '/', label: 'Home', key: 'home', icon: '🏠', bg: 'bg-[#1a1a1a] border border-[#262626]' },
        { href: '/app.html', label: 'Analyzer Engine', key: 'analyzer', icon: '🔮', bg: 'bg-violet-900/30 border border-violet-800/20' },
        { href: '/dashboard.html', label: 'Dashboard', key: 'dashboard', icon: '📊', bg: 'bg-emerald-900/30 border border-emerald-800/20' },
        { href: '/about.html', label: 'About Project', key: 'about', icon: 'ℹ️', bg: 'bg-[#1a1a1a] border border-[#262626]' },
        { href: '/admin.html', label: 'Admin Panel', key: 'admin', icon: '🛡️', bg: 'bg-[#1a1a1a] border border-[#262626]' },
    ];

    const overlayEl = document.createElement('div');
    overlayEl.id = 'sharedDrawerOverlay';
    overlayEl.className = 'drawer-overlay';
    overlayEl.onclick = () => window.__toggleAuraDrawer();

    const panelEl = document.createElement('div');
    panelEl.id = 'sharedDrawerPanel';
    panelEl.className = 'drawer-panel';
    panelEl.innerHTML = `
        <div class="p-5 border-b border-[#1f1f1f] flex items-center justify-between">
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-full bg-gradient-to-tr from-emerald-600 to-emerald-400 flex items-center justify-center text-black font-bold text-base shadow-[0_0_10px_rgba(16,185,129,0.3)]" id="sharedDrawerAvatar">?</div>
                <div>
                    <p id="sharedDrawerName" class="text-sm font-semibold text-white leading-none">User</p>
                    <p id="sharedDrawerEmail" class="text-xs text-gray-500 leading-none mt-1">Loading...</p>
                </div>
            </div>
            <button onclick="window.__toggleAuraDrawer()" class="p-2 text-gray-500 hover:text-white transition-colors rounded-lg hover:bg-[#1a1a1a]">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
        </div>
        <div class="p-4">
            <p class="text-[10px] text-gray-600 uppercase tracking-widest font-semibold mb-3 px-2">Navigation</p>
            <div class="flex flex-col gap-1">
                ${navLinks.map(l => `
                    <a href="${l.href}" class="drawer-nav-item ${page === l.key ? 'active' : ''}">
                        <div class="nav-icon ${l.bg}">${l.icon}</div>
                        ${l.label}
                    </a>
                `).join('')}
            </div>
        </div>
        <div class="mt-auto p-4 border-t border-[#1a1a1a]">
            <button id="sharedDrawerLogout"
                class="w-full flex items-center justify-center gap-2 px-4 py-3 bg-rose-950/40 border border-rose-900/30 text-rose-400 rounded-xl text-sm font-medium hover:bg-rose-950/60 transition-colors">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>
                Sign Out
            </button>
        </div>
    `;

    return { overlayEl, panelEl };
}

// ── Drawer toggle ──
window.__toggleAuraDrawer = function () {
    const overlay = document.getElementById('sharedDrawerOverlay');
    const panel = document.getElementById('sharedDrawerPanel');
    if (!overlay || !panel) return;
    const isOpen = panel.classList.contains('open');
    panel.classList.toggle('open', !isOpen);
    overlay.classList.toggle('open', !isOpen);
    document.body.style.overflow = isOpen ? '' : 'hidden';
};

// ── Sign out handler ──
async function handleSignOut() {
    try {
        await signOut(auth);
        window.location.href = '/auth.html';
    } catch (e) {
        console.error('Sign out failed:', e);
    }
}

// ── Init ──
function initSharedHeader() {
    // Skip on pages that have their own header (auth, dashboard)
    if (path.includes('auth.html')) return;
    if (page === 'dashboard') return; // dashboard has its own header + drawer

    // Remove any existing <header> in the body
    const existingHeader = document.querySelector('body > header');
    if (existingHeader) existingHeader.remove();

    // Insert shared header at top of body
    const headerEl = buildHeader();
    document.body.prepend(headerEl);

    // Insert drawer
    const { overlayEl, panelEl } = buildDrawer();
    headerEl.after(overlayEl, panelEl);

    // Wire logout buttons
    document.getElementById('sharedLogoutBtn')?.addEventListener('click', handleSignOut);
    document.getElementById('sharedDrawerLogout')?.addEventListener('click', handleSignOut);

    // Auth state
    onAuthStateChanged(auth, (user) => {
        const authArea = document.getElementById('sharedAuthArea');
        const guestArea = document.getElementById('sharedGuestArea');
        const logoutBtn = document.getElementById('sharedLogoutBtn');

        if (user) {
            const name = user.displayName || 'User';
            const initial = name.charAt(0).toUpperCase();
            if (authArea) authArea.style.display = 'flex';
            if (guestArea) guestArea.style.display = 'none';
            if (logoutBtn) logoutBtn.classList.remove('hidden');

            const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
            set('sharedAvatar', initial);
            set('sharedHeaderName', name);
            set('sharedHeaderEmail', user.email || 'No email');
            set('sharedDrawerAvatar', initial);
            set('sharedDrawerName', name);
            set('sharedDrawerEmail', user.email || 'No email');
        } else {
            if (authArea) authArea.style.display = 'none';
            if (guestArea) guestArea.style.display = 'flex';
            if (logoutBtn) logoutBtn.classList.add('hidden');
        }
    });
}

// Run when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSharedHeader);
} else {
    initSharedHeader();
}

export { initSharedHeader };
