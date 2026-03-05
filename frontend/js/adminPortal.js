import { API_BASE } from './api.js';
import { auth, onAuthStateChanged } from './firebaseConfig.js';
import { showToast, showConfirmModal } from './toast.js';

let currentUser = null;
let adminChart = null;
let currentPage = 0;
const PAGE_SIZE = 15;
let tableSearch = '';

onAuthStateChanged(auth, (user) => {
    if (user) { currentUser = user; }
    else { window.location.href = "auth.html"; }
});

// ============================================================
// ✅ ALL GLOBAL FUNCTIONS — exposed on window so onclick attrs work
// ============================================================

window.switchAdminTab = function (tab) {
    ['stats', 'users', 'log'].forEach(t => {
        document.getElementById(`panel${cap(t)}`)?.classList.add('hidden');
        document.getElementById(`adminTab${cap(t)}`)?.classList.remove('active');
    });
    document.getElementById(`panel${cap(tab)}`)?.classList.remove('hidden');
    document.getElementById(`adminTab${cap(tab)}`)?.classList.add('active');

    if (tab === 'users') fetchUsers();
};

window.fetchAdminData = async function () {
    const lastUpdated = document.getElementById("lastUpdated");
    const syncTime = document.getElementById("syncTime");
    if (lastUpdated) lastUpdated.textContent = "Syncing...";

    try {
        const filterStr = document.getElementById("sentimentFilter")?.value || 'All';
        const token = await getToken();
        const url = `${API_BASE}/admin/stats?skip=${currentPage * PAGE_SIZE}&limit=${PAGE_SIZE}&sentiment=${filterStr}`;
        const res = await fetch(url, { headers: { "Authorization": `Bearer ${token}` } });
        if (!res.ok) throw new Error("HTTP " + res.status);

        const data = await res.json();
        updateStatCards(data.summary);
        renderAdminTable(data);

        const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        if (lastUpdated) lastUpdated.textContent = `Synced ${now}`;
        if (syncTime) syncTime.textContent = now;

    } catch (err) {
        console.error("fetchAdminData error:", err);
        if (lastUpdated) lastUpdated.textContent = "Sync failed";
    }
};

window.fetchAdminVisuals = async function () {
    try {
        const token = await getToken();
        await Promise.all([
            loadTrendChart(token),
            loadWordCloud(token)
        ]);
    } catch (err) {
        console.error("fetchAdminVisuals error:", err);
    }
};

window.downloadCSV = async function () {
    const btn = document.querySelector('[onclick="downloadCSV()"]');
    if (btn) { btn.textContent = 'Exporting...'; btn.disabled = true; }

    try {
        const token = await getToken();
        const res = await fetch(`${API_BASE}/admin/export`, {
            headers: { "Authorization": `Bearer ${token}` }
        });
        if (!res.ok) throw new Error("Export failed: " + res.status);

        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const ts = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
        a.href = url;
        a.download = `aura_export_${ts}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('CSV exported successfully!', 'success');

    } catch (err) {
        console.error("CSV export error:", err);
        showToast('Export failed. Please try again.', 'error');
    } finally {
        if (btn) {
            btn.innerHTML = `<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg> Export CSV`;
            btn.disabled = false;
        }
    }
};

window.deleteUser = async function (uid) {
    const confirmed = await showConfirmModal({
        title: 'Delete User?',
        message: 'Permanently delete this user and all their data? This action cannot be undone.',
        confirmText: 'Delete',
        cancelText: 'Cancel',
        icon: '⚠️'
    });
    if (!confirmed) return;
    try {
        const token = await getToken();
        const res = await fetch(`${API_BASE}/admin/users/${uid}`, {
            method: 'DELETE',
            headers: { "Authorization": `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Delete failed: ' + res.status);
        showToast('User deleted successfully', 'success');
        fetchUsers();
    } catch (err) {
        showToast('Failed to delete user: ' + err.message, 'error');
    }
};

// ============================================================
// Login
// ============================================================
const loginBtn = document.getElementById("loginBtn");
if (loginBtn) {
    loginBtn.addEventListener("click", doLogin);
    document.getElementById("password")?.addEventListener("keypress", (e) => {
        if (e.key === "Enter") { e.preventDefault(); doLogin(); }
    });
}

function doLogin() {
    const username = document.getElementById("username").value;
    const password = document.getElementById("password").value;
    const err = document.getElementById("loginError");

    if (username === "admin" && password === "password123") {
        document.getElementById("loginOverlay").style.display = "none";
        document.getElementById("adminHeader").classList.remove("hidden");
        const dashboard = document.getElementById("dashboard");
        if (dashboard) { dashboard.classList.remove("hidden"); dashboard.classList.add("flex"); }
        document.getElementById("adminFooter")?.classList.remove("hidden");

        // Wire up after-login event listeners
        document.getElementById("prevBtn")?.addEventListener("click", () => {
            if (currentPage > 0) { currentPage--; window.fetchAdminData(); }
        });
        document.getElementById("nextBtn")?.addEventListener("click", () => {
            currentPage++; window.fetchAdminData();
        });
        document.getElementById("sentimentFilter")?.addEventListener("change", () => {
            currentPage = 0; window.fetchAdminData();
        });
        document.getElementById("tableSearch")?.addEventListener("input", (e) => {
            tableSearch = e.target.value; currentPage = 0; window.fetchAdminData();
        });

        window.fetchAdminData();
        window.fetchAdminVisuals();
        showToast('Admin panel unlocked!', 'success');
    } else {
        if (err) err.classList.remove("hidden");
        showToast('Invalid credentials', 'error');
    }
}

// ============================================================
// Helpers
// ============================================================
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
async function getToken() {
    return currentUser ? await currentUser.getIdToken() : '';
}

// ============================================================
// Stats Cards
// ============================================================
function updateStatCards(s) {
    const total = s.total_queries || 0;
    document.getElementById("statTotal").textContent = total;
    document.getElementById("statPositive").textContent = s.total_positive;
    document.getElementById("statNegative").textContent = s.total_negative;
    document.getElementById("statNeutral").textContent = s.total_neutral;

    if (total > 0) {
        const posP = Math.round((s.total_positive / total) * 100);
        const negP = Math.round((s.total_negative / total) * 100);
        const neuP = Math.round((s.total_neutral / total) * 100);
        setBar("posBar", "posPercent", posP);
        setBar("negBar", "negPercent", negP);
        setBar("neuBar", "neuPercent", neuP);
    }
}

function setBar(barId, percentId, pct) {
    const bar = document.getElementById(barId);
    const lbl = document.getElementById(percentId);
    if (bar) bar.style.width = pct + '%';
    if (lbl) lbl.textContent = pct + '%';
}

// ============================================================
// Admin Table
// ============================================================
function renderAdminTable(data) {
    const tbody = document.getElementById("adminTableBody");
    const emptyEl = document.getElementById("tableEmptyState");
    const table = tbody?.closest('table');
    if (!tbody) return;

    tbody.innerHTML = "";

    let queries = data.all_queries || [];
    if (tableSearch.trim()) {
        queries = queries.filter(q => (q.text || '').toLowerCase().includes(tableSearch.toLowerCase()));
    }

    if (queries.length === 0) {
        emptyEl?.classList.remove("hidden");
        table?.classList.add("hidden");
    } else {
        emptyEl?.classList.add("hidden");
        table?.classList.remove("hidden");

        queries.forEach((q, idx) => {
            const tr = document.createElement("tr");
            tr.className = "transition-colors hover:bg-[#141414]";

            const confPct = Math.round((q.confidence || 0) * 100);
            const barColor = q.sentiment === 'Positive' ? '#34d399'
                : q.sentiment === 'Negative' ? '#fb7185' : '#9ca3af';

            let badgeCls = "bg-[#1f1f1f] text-gray-400 border border-[#262626]";
            if (q.sentiment === "Positive") badgeCls = "bg-emerald-900/20 text-emerald-400 border border-emerald-900/40";
            if (q.sentiment === "Negative") badgeCls = "bg-rose-900/20 text-rose-400 border border-rose-900/40";

            const date = q.timestamp
                ? new Date(q.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                : '—';
            const lang = (q.language || 'en').toUpperCase();

            tr.innerHTML = `
                <td class="px-5 py-3.5 text-gray-600 font-mono text-xs">${currentPage * PAGE_SIZE + idx + 1}</td>
                <td class="px-5 py-3.5 max-w-xs">
                    <div class="truncate text-gray-300 text-xs" title="${q.text}">${q.text || '—'}</div>
                </td>
                <td class="px-5 py-3.5">
                    <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${badgeCls}">${q.sentiment}</span>
                </td>
                <td class="px-5 py-3.5">
                    <div class="flex items-center gap-2 w-24">
                        <div class="flex-1 bg-[#1a1a1a] rounded-full h-1 border border-[#262626]">
                            <div class="h-1 rounded-full" style="width:${confPct}%;background:${barColor}"></div>
                        </div>
                        <span class="text-xs text-gray-500 flex-shrink-0 w-7 text-right">${confPct}%</span>
                    </div>
                </td>
                <td class="px-5 py-3.5">
                    <span class="text-xs bg-[#1a1a1a] border border-[#262626] text-gray-500 px-1.5 py-0.5 rounded font-mono">${lang}</span>
                </td>
                <td class="px-5 py-3.5 text-gray-500 text-xs whitespace-nowrap">${date}</td>
            `;
            tbody.appendChild(tr);
        });
    }

    // Pagination info
    const total = data.filtered_total || 0;
    const startIdx = total === 0 ? 0 : currentPage * PAGE_SIZE + 1;
    const endIdx = Math.min((currentPage + 1) * PAGE_SIZE, total);
    const prevBtn = document.getElementById("prevBtn");
    const nextBtn = document.getElementById("nextBtn");
    const pageInfo = document.getElementById("pageInfo");
    if (pageInfo) pageInfo.textContent = `Showing ${startIdx}–${endIdx} of ${total}`;
    if (prevBtn) prevBtn.disabled = currentPage === 0;
    if (nextBtn) nextBtn.disabled = endIdx >= total;
}

// ============================================================
// Users Tab
// ============================================================
async function fetchUsers() {
    const el = document.getElementById('usersList');
    const badge = document.getElementById('userCountBadge');
    if (!el) return;

    el.innerHTML = '<div class="p-8 text-center text-gray-600 text-sm">Loading users...</div>';

    try {
        const token = await getToken();
        const res = await fetch(`${API_BASE}/admin/users`, {
            headers: { "Authorization": `Bearer ${token}` }
        });
        if (!res.ok) throw new Error("HTTP " + res.status);
        const users = await res.json();

        if (badge) badge.textContent = `${users.length} account${users.length !== 1 ? 's' : ''}`;

        if (users.length === 0) {
            el.innerHTML = '<div class="p-8 text-center text-gray-600 text-sm">No registered users found.</div>';
            return;
        }

        el.innerHTML = users.map(u => {
            const name = u.name || u.email?.split('@')[0] || 'Unknown User';
            const email = u.email || '—';
            const initial = name.charAt(0).toUpperCase();
            const queries = u.query_count || 0;
            const created = u.created_at
                ? new Date(u.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: '2-digit' })
                : '—';

            // Color initial avatar based on query volume
            const colors = ['from-indigo-600 to-purple-500', 'from-emerald-600 to-teal-500', 'from-rose-600 to-pink-500', 'from-amber-600 to-orange-500', 'from-blue-600 to-cyan-500'];
            const colorClass = colors[name.charCodeAt(0) % colors.length];

            return `<div class="user-row">
                <div class="w-9 h-9 rounded-full bg-gradient-to-tr ${colorClass} flex items-center justify-center text-white font-bold text-sm flex-shrink-0">${initial}</div>
                <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium text-white truncate">${name}</p>
                    <p class="text-xs text-gray-500 truncate">${email}</p>
                </div>
                <div class="hidden sm:flex items-center gap-5 text-xs text-gray-600 flex-shrink-0">
                    <div class="text-center">
                        <p class="text-sm font-bold ${queries > 0 ? 'text-emerald-400' : 'text-gray-500'}">${queries}</p>
                        <p class="text-[9px] uppercase tracking-wider">queries</p>
                    </div>
                    <div class="text-center">
                        <p class="text-xs text-gray-400">${created}</p>
                        <p class="text-[9px] uppercase tracking-wider">joined</p>
                    </div>
                </div>
                <button onclick="deleteUser('${u.uid}')" class="delete-btn ml-2 px-2.5 py-1.5 bg-rose-900/20 border border-rose-900/40 text-rose-400 hover:bg-rose-900/40 rounded-lg text-xs transition-all flex-shrink-0 flex items-center gap-1">
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    Delete
                </button>
            </div>`;
        }).join('');

    } catch (err) {
        console.error("fetchUsers error:", err);
        el.innerHTML = '<div class="p-8 text-center text-gray-600 text-sm">Failed to load users. Check console.</div>';
    }
}

// ============================================================
// Trend Chart
// ============================================================
async function loadTrendChart(token) {
    const res = await fetch(`${API_BASE}/admin/trends`, {
        headers: { "Authorization": `Bearer ${token}` }
    });
    if (!res.ok) return;

    const trendData = await res.json();
    const labels = Object.keys(trendData).sort();
    const posData = labels.map(d => trendData[d]?.Positive || 0);
    const negData = labels.map(d => trendData[d]?.Negative || 0);
    const neuData = labels.map(d => trendData[d]?.Neutral || 0);
    const ctx = document.getElementById('trendChart');
    if (!ctx) return;

    if (adminChart) adminChart.destroy();
    Chart.defaults.color = '#6b7280';
    Chart.defaults.borderColor = '#1f1f1f';

    adminChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels.length > 0 ? labels : ['No Data'],
            datasets: [
                {
                    label: 'Positive', data: posData.length > 0 ? posData : [0],
                    borderColor: '#34d399', backgroundColor: 'rgba(52,211,153,0.08)',
                    tension: 0.4, fill: true, borderWidth: 2,
                    pointRadius: 3, pointHoverRadius: 6,
                    pointBackgroundColor: '#0a0a0a', pointBorderColor: '#34d399'
                },
                {
                    label: 'Negative', data: negData.length > 0 ? negData : [0],
                    borderColor: '#fb7185', backgroundColor: 'rgba(251,113,133,0.08)',
                    tension: 0.4, fill: true, borderWidth: 2,
                    pointRadius: 3, pointHoverRadius: 6,
                    pointBackgroundColor: '#0a0a0a', pointBorderColor: '#fb7185'
                },
                {
                    label: 'Neutral', data: neuData.length > 0 ? neuData : [0],
                    borderColor: '#6b7280', backgroundColor: 'rgba(107,114,128,0.05)',
                    tension: 0.4, fill: false, borderWidth: 1.5, borderDash: [4, 4],
                    pointRadius: 2, pointHoverRadius: 4,
                    pointBackgroundColor: '#0a0a0a', pointBorderColor: '#6b7280'
                }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            scales: {
                y: {
                    min: 0,
                    grid: { color: 'rgba(255,255,255,0.03)' },
                    ticks: { color: '#6b7280', precision: 0 }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: '#6b7280', maxTicksLimit: 8 }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(0,0,0,0.9)',
                    titleColor: '#fff', bodyColor: '#d1d5db',
                    borderColor: '#333', borderWidth: 1
                }
            }
        }
    });
}

// ============================================================
// Word Cloud
// ============================================================
async function loadWordCloud(token) {
    const res = await fetch(`${API_BASE}/admin/word-frequencies`, {
        headers: { "Authorization": `Bearer ${token}` }
    });
    if (!res.ok) return;

    const wordFreqs = await res.json();
    const canvas = document.getElementById('wordCloudCanvas');
    const emptyText = document.getElementById('cloudEmpty');
    if (!canvas) return;

    if (!wordFreqs || wordFreqs.length === 0) {
        emptyText?.classList.remove('hidden');
        return;
    }
    emptyText?.classList.add('hidden');

    const list = wordFreqs.map(w => [w.text, w.weight * 15]);
    WordCloud(canvas, {
        list, gridSize: 8, weightFactor: 1,
        fontFamily: 'Inter, sans-serif',
        color: (word) => {
            const item = wordFreqs.find(i => i.text === word);
            if (item?.sentiment === "Positive") return '#4ade80';
            if (item?.sentiment === "Negative") return '#fb7185';
            return '#6b7280';
        },
        backgroundColor: '#0c0c0c',
        shrinkToFit: true, drawOutOfBound: false
    });
}
