// ============================================================
// 🔔 Toast Notification System + Logout Confirmation Modal
// ============================================================

// ── Toast Container (auto-injected into DOM)
function ensureToastContainer() {
    if (document.getElementById('aura-toast-container')) return;
    const container = document.createElement('div');
    container.id = 'aura-toast-container';
    container.style.cssText = 'position:fixed;top:24px;right:24px;z-index:99999;display:flex;flex-direction:column;gap:10px;pointer-events:none;';
    document.body.appendChild(container);
}

// ── Toast Styles (injected once)
function ensureToastStyles() {
    if (document.getElementById('aura-toast-styles')) return;
    const style = document.createElement('style');
    style.id = 'aura-toast-styles';
    style.textContent = `
        .aura-toast {
            pointer-events: auto;
            display: flex; align-items: center; gap: 10px;
            padding: 14px 20px; border-radius: 12px;
            font-family: 'Inter', sans-serif; font-size: 13px; font-weight: 500;
            color: #ededed; border: 1px solid #262626;
            box-shadow: 0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.03);
            backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
            transform: translateX(120%); opacity: 0;
            transition: transform 0.4s cubic-bezier(0.16,1,0.3,1), opacity 0.4s ease;
            min-width: 280px; max-width: 400px;
        }
        .aura-toast.show { transform: translateX(0); opacity: 1; }
        .aura-toast.hiding { transform: translateX(120%); opacity: 0; }
        .aura-toast .toast-icon {
            width: 32px; height: 32px; border-radius: 10px;
            display: flex; align-items: center; justify-content: center;
            font-size: 16px; flex-shrink: 0;
        }
        .aura-toast .toast-close {
            margin-left: auto; background: none; border: none;
            color: #666; cursor: pointer; font-size: 16px; padding: 0 0 0 8px;
            transition: color 0.2s;
        }
        .aura-toast .toast-close:hover { color: #fff; }
        .aura-toast .toast-progress {
            position: absolute; bottom: 0; left: 0; height: 2px;
            border-radius: 0 0 12px 12px;
            transition: width linear;
        }

        /* Types */
        .aura-toast.success { background: rgba(5,46,22,0.9); border-color: #14532d; }
        .aura-toast.success .toast-icon { background: rgba(52,211,153,0.15); color: #34d399; }
        .aura-toast.success .toast-progress { background: #34d399; }

        .aura-toast.error { background: rgba(76,5,25,0.9); border-color: #881337; }
        .aura-toast.error .toast-icon { background: rgba(251,113,133,0.15); color: #fb7185; }
        .aura-toast.error .toast-progress { background: #fb7185; }

        .aura-toast.info { background: rgba(15,10,40,0.9); border-color: #312e81; }
        .aura-toast.info .toast-icon { background: rgba(129,140,248,0.15); color: #818cf8; }
        .aura-toast.info .toast-progress { background: #818cf8; }

        .aura-toast.warning { background: rgba(60,30,0,0.9); border-color: #78350f; }
        .aura-toast.warning .toast-icon { background: rgba(251,191,36,0.15); color: #fbbf24; }
        .aura-toast.warning .toast-progress { background: #fbbf24; }

        /* Confirmation Modal */
        .aura-modal-overlay {
            position: fixed; inset: 0; z-index: 100000;
            background: rgba(0,0,0,0.7); backdrop-filter: blur(6px);
            display: flex; align-items: center; justify-content: center;
            opacity: 0; transition: opacity 0.25s ease;
        }
        .aura-modal-overlay.show { opacity: 1; }
        .aura-modal {
            background: #141414; border: 1px solid #262626; border-radius: 16px;
            padding: 32px; min-width: 360px; max-width: 440px;
            box-shadow: 0 24px 64px rgba(0,0,0,0.6);
            transform: scale(0.9) translateY(20px);
            transition: transform 0.3s cubic-bezier(0.16,1,0.3,1);
            text-align: center; font-family: 'Inter', sans-serif;
        }
        .aura-modal-overlay.show .aura-modal { transform: scale(1) translateY(0); }
        .aura-modal .modal-icon {
            width: 56px; height: 56px; border-radius: 16px;
            display: flex; align-items: center; justify-content: center;
            font-size: 24px; margin: 0 auto 16px;
            background: rgba(251,113,133,0.1); border: 1px solid rgba(251,113,133,0.2);
        }
        .aura-modal h3 { color: #fff; font-size: 18px; font-weight: 700; margin-bottom: 8px; }
        .aura-modal p { color: #9ca3af; font-size: 13px; line-height: 1.5; margin-bottom: 24px; }
        .aura-modal .modal-btns { display: flex; gap: 12px; justify-content: center; }
        .aura-modal .btn-cancel {
            flex: 1; padding: 10px 20px; border-radius: 10px;
            background: #1a1a1a; border: 1px solid #333; color: #ccc;
            font-size: 13px; font-weight: 600; cursor: pointer;
            transition: all 0.2s;
        }
        .aura-modal .btn-cancel:hover { background: #262626; color: #fff; }
        .aura-modal .btn-confirm {
            flex: 1; padding: 10px 20px; border-radius: 10px;
            background: linear-gradient(135deg, #be123c, #e11d48); border: none; color: #fff;
            font-size: 13px; font-weight: 600; cursor: pointer;
            transition: all 0.2s; box-shadow: 0 4px 16px rgba(225,29,72,0.3);
        }
        .aura-modal .btn-confirm:hover { filter: brightness(1.1); transform: translateY(-1px); }
    `;
    document.head.appendChild(style);
}

// ── Icons map
const TOAST_ICONS = {
    success: '✓',
    error: '✕',
    info: '💡',
    warning: '⚠'
};

/**
 * Show a toast notification.
 * @param {string} message - The message to display
 * @param {'success'|'error'|'info'|'warning'} type - Toast type
 * @param {number} duration - Auto-dismiss in ms (default 4000)
 */
export function showToast(message, type = 'info', duration = 4000) {
    ensureToastContainer();
    ensureToastStyles();

    const container = document.getElementById('aura-toast-container');

    const toast = document.createElement('div');
    toast.className = `aura-toast ${type}`;
    toast.style.position = 'relative';
    toast.innerHTML = `
        <div class="toast-icon">${TOAST_ICONS[type] || '💡'}</div>
        <span style="flex:1;line-height:1.4">${message}</span>
        <button class="toast-close" onclick="this.parentElement.classList.add('hiding'); setTimeout(() => this.parentElement.remove(), 400)">✕</button>
        <div class="toast-progress" style="width:100%"></div>
    `;

    container.appendChild(toast);

    // Animate in
    requestAnimationFrame(() => {
        toast.classList.add('show');
        // Start progress bar
        const bar = toast.querySelector('.toast-progress');
        if (bar) {
            bar.style.transitionDuration = duration + 'ms';
            requestAnimationFrame(() => { bar.style.width = '0%'; });
        }
    });

    // Auto-dismiss
    const timer = setTimeout(() => {
        toast.classList.remove('show');
        toast.classList.add('hiding');
        setTimeout(() => toast.remove(), 400);
    }, duration);

    // Pause on hover
    toast.addEventListener('mouseenter', () => {
        clearTimeout(timer);
        const bar = toast.querySelector('.toast-progress');
        if (bar) { bar.style.transitionDuration = '0ms'; bar.style.width = bar.offsetWidth / bar.parentElement.offsetWidth * 100 + '%'; }
    });
}

/**
 * Queue a toast to show on the NEXT page load (survives redirects).
 * Uses sessionStorage so it only fires once.
 */
export function queueToast(message, type = 'info', duration = 4000) {
    sessionStorage.setItem('aura_pending_toast', JSON.stringify({ message, type, duration }));
}

/**
 * Check for and show any queued toast from a previous page.
 * Call this on DOMContentLoaded in every page's JS.
 */
export function checkPendingToast() {
    const raw = sessionStorage.getItem('aura_pending_toast');
    if (raw) {
        sessionStorage.removeItem('aura_pending_toast');
        try {
            const { message, type, duration } = JSON.parse(raw);
            // Small delay so the page has rendered
            setTimeout(() => showToast(message, type, duration), 300);
        } catch (e) { /* ignore parse errors */ }
    }
}

/**
 * Show a centered confirmation modal.
 * @param {Object} options
 * @param {string} options.title - Modal title
 * @param {string} options.message - Modal body text
 * @param {string} options.confirmText - Confirm button text (default "Sign Out")
 * @param {string} options.cancelText - Cancel button text (default "Cancel")
 * @param {string} options.icon - Emoji for icon (default "🚪")
 * @returns {Promise<boolean>} - Resolves true if confirmed, false if cancelled
 */
export function showConfirmModal({
    title = 'Sign Out?',
    message = 'Are you sure you want to sign out of Aura?',
    confirmText = 'Sign Out',
    cancelText = 'Cancel',
    icon = '🚪'
} = {}) {
    ensureToastStyles();

    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'aura-modal-overlay';
        overlay.innerHTML = `
            <div class="aura-modal">
                <div class="modal-icon">${icon}</div>
                <h3>${title}</h3>
                <p>${message}</p>
                <div class="modal-btns">
                    <button class="btn-cancel" id="auraModalCancel">${cancelText}</button>
                    <button class="btn-confirm" id="auraModalConfirm">${confirmText}</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);
        requestAnimationFrame(() => overlay.classList.add('show'));

        function cleanup(result) {
            overlay.classList.remove('show');
            setTimeout(() => overlay.remove(), 300);
            resolve(result);
        }

        overlay.querySelector('#auraModalCancel').addEventListener('click', () => cleanup(false));
        overlay.querySelector('#auraModalConfirm').addEventListener('click', () => cleanup(true));
        overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup(false); });

        // ESC key
        function onKey(e) { if (e.key === 'Escape') { cleanup(false); document.removeEventListener('keydown', onKey); } }
        document.addEventListener('keydown', onKey);
    });
}
