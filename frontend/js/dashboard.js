import { auth } from './firebaseConfig.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { showToast, showConfirmModal, queueToast, checkPendingToast } from './toast.js';

const API_BASE = "/api";
let currentUser = null;
let historyLineChart = null;
let sentimentPieChart = null;

// All fetched data cached for tabs
let cachedData = null;
let historyPage = 0;
const HISTORY_PAGE_SIZE = 10;
let historyFilter = 'All';
let historySearch = '';

// ============================================================
// Auth + Init
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, async (user) => {
        if (!user) { window.location.href = 'auth.html'; return; }
        currentUser = user;
        updateProfileUI(user);
        await loadDashboardData();
        checkPendingToast();  // Show any queued toast from sign-in page
    });

    const logoutHandler = async () => {
        const confirmed = await showConfirmModal({
            title: 'Sign Out?',
            message: 'Are you sure you want to sign out of Aura? You\'ll need to log in again to access your dashboard.',
            confirmText: 'Sign Out',
            cancelText: 'Stay',
            icon: '🚪'
        });
        if (!confirmed) return;
        try {
            queueToast('Signed out successfully', 'info', 3000);
            await signOut(auth);
        } catch (e) {
            console.error(e);
            showToast('Failed to sign out', 'error');
        }
    };

    document.getElementById('logoutBtn')?.addEventListener('click', logoutHandler);
    document.getElementById('drawerLogoutBtn')?.addEventListener('click', logoutHandler);

    // History filters
    document.getElementById('historyFilter')?.addEventListener('change', (e) => {
        historyFilter = e.target.value;
        historyPage = 0;
        renderHistoryTab();
    });
    document.getElementById('historySearch')?.addEventListener('input', (e) => {
        historySearch = e.target.value.toLowerCase();
        historyPage = 0;
        renderHistoryTab();
    });
    document.getElementById('histPrevBtn')?.addEventListener('click', () => {
        if (historyPage > 0) { historyPage--; renderHistoryTab(); }
    });
    document.getElementById('histNextBtn')?.addEventListener('click', () => {
        historyPage++;
        renderHistoryTab();
    });
});

function updateProfileUI(user) {
    const name = user.displayName || 'User';
    const first = name.split(' ')[0];
    const initial = name.charAt(0).toUpperCase();
    document.getElementById('headerName').textContent = name;
    document.getElementById('welcomeName').textContent = first;
    document.getElementById('headerEmail').textContent = user.email || 'No email';
    document.getElementById('headerAvatar').textContent = initial;
    document.getElementById('welcomeSubtitle').textContent =
        `Welcome back, ${first}. Here's a summary of your sentiment journey.`;
    // Sync drawer
    const da = document.getElementById('drawerAvatar');
    const dn = document.getElementById('drawerName');
    const de = document.getElementById('drawerEmail');
    if (da) da.textContent = initial;
    if (dn) dn.textContent = name;
    if (de) de.textContent = user.email || 'No email';
}

// ============================================================
// Mobile Drawer
// ============================================================
window.toggleMobileDrawer = function () {
    // Only open on mobile/tablet (< md breakpoint = 768px)
    const overlay = document.getElementById('drawerOverlay');
    const panel = document.getElementById('drawerPanel');
    if (!overlay || !panel) return;
    const isOpen = panel.classList.contains('open');
    if (isOpen) {
        panel.classList.remove('open');
        overlay.classList.remove('open');
        document.body.style.overflow = '';
    } else {
        panel.classList.add('open');
        overlay.classList.add('open');
        document.body.style.overflow = 'hidden';
    }
};

// ============================================================
// Tab Switching
// ============================================================
function capTabName(t) {
    // 'ai' → 'AI', 'overview' → 'Overview', 'history' → 'History'
    return t === 'ai' ? 'AI' : t.charAt(0).toUpperCase() + t.slice(1);
}
window.switchDashTab = function (tab) {
    ['overview', 'history', 'ai'].forEach(t => {
        document.getElementById(`panel${capTabName(t)}`)?.classList.add('hidden');
        document.getElementById(`tab${capTabName(t)}`)?.classList.remove('active');
        // Sync drawer tabs
        document.getElementById(`drawerTab${capTabName(t)}`)?.classList.remove('active');
    });
    document.getElementById(`panel${capTabName(tab)}`)?.classList.remove('hidden');
    document.getElementById(`tab${capTabName(tab)}`)?.classList.add('active');
    document.getElementById(`drawerTab${capTabName(tab)}`)?.classList.add('active');

    if (tab === 'history' && cachedData) renderHistoryTab();
    if (tab === 'ai' && cachedData) updateAIProfileStats(cachedData);
};

// ============================================================
// Data Loading
// ============================================================
async function loadDashboardData() {
    try {
        const token = await currentUser.getIdToken();
        const res = await fetch(`${API_BASE}/user/analytics`, {
            headers: { "Authorization": `Bearer ${token}` }
        });
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        const data = await res.json();
        cachedData = data;

        updateKPIs(data.summary, data.history);
        renderPieChart(data.summary);
        renderLineChart(data.history);
        renderWordCloud(data.word_frequencies);
        renderMiniHistory(data);
        updateMoodRing(data);
        updateAIProfileStats(data);

    } catch (err) {
        console.error("Failed to load dashboard:", err);
    }
}

// ============================================================
// KPIs + Overview Stats
// ============================================================
function updateKPIs(summary, history) {
    const { total_queries: total, total_positive: pos, total_negative: neg, total_neutral: neu } = summary;

    document.getElementById('totalQueriesCounter').textContent = total;
    document.getElementById('statPos').textContent = pos;
    document.getElementById('statNeg').textContent = neg;
    document.getElementById('statNeu').textContent = neu;
    document.getElementById('pieStatPos').textContent = pos;
    document.getElementById('pieStatNeg').textContent = neg;
    document.getElementById('pieStatNeu').textContent = neu;

    const posRate = total > 0 ? Math.round((pos / total) * 100) : 0;
    document.getElementById('positivityRateDisplay').textContent = `${posRate}%`;

    // Percentage badges on KPI cards
    if (total > 0) {
        const el = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v + '%'; };
        el('posPct', Math.round((pos / total) * 100));
        el('negPct', Math.round((neg / total) * 100));
        el('neuPct', Math.round((neu / total) * 100));
    }

    // Mood Score: net positivity -100 to +100
    const moodScore = total > 0 ? Math.round(((pos - neg) / total) * 100) : 0;
    document.getElementById('moodScore').textContent = (moodScore >= 0 ? '+' : '') + moodScore;

    let moodLabel = 'Balanced';
    if (moodScore > 40) moodLabel = 'Very Positive 🌟';
    else if (moodScore > 10) moodLabel = 'Positive 😄';
    else if (moodScore < -40) moodLabel = 'Very Negative 😰';
    else if (moodScore < -10) moodLabel = 'Negative 😔';
    document.getElementById('moodLabel').textContent = moodLabel;

    // Highlights strip — computed from history
    if (history && history.length > 0) {
        // 1. Best positive streak
        let maxStreak = 0, streak = 0;
        for (const item of history) {
            if (item.score > 0.1) { streak++; maxStreak = Math.max(maxStreak, streak); }
            else streak = 0;
        }
        const streakEl = document.getElementById('streakCount');
        if (streakEl) streakEl.textContent = maxStreak || '0';

        // 2. First analysis date
        const sortedByTime = [...history].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        const firstEl = document.getElementById('firstAnalysisDate');
        if (firstEl && sortedByTime[0]) {
            firstEl.textContent = new Date(sortedByTime[0].timestamp).toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' });
        }

        // 3. Most active day of week
        const dayCounts = {};
        for (const item of history) {
            const day = new Date(item.timestamp).toLocaleDateString([], { weekday: 'long' });
            dayCounts[day] = (dayCounts[day] || 0) + 1;
        }
        const sortedDays = Object.entries(dayCounts).sort((a, b) => b[1] - a[1]);
        const mostActiveDayEl = document.getElementById('mostActiveDay');
        if (mostActiveDayEl && sortedDays[0]) {
            mostActiveDayEl.textContent = `${sortedDays[0][0]} (${sortedDays[0][1]} analyses)`;
        }
    }
}

function updateMoodRing(data) {
    const summary = data.summary;
    const total = summary.total_queries;
    const pos = summary.total_positive;
    const neg = summary.total_negative;

    if (total === 0) return;

    const moodScore = (pos - neg) / total; // -1 to +1
    const pct = (moodScore + 1) / 2; // 0 to 1
    const circumference = 2 * Math.PI * 26;
    const offset = circumference - (pct * circumference);

    const circle = document.getElementById('moodRingCircle');
    if (circle) {
        circle.style.strokeDashoffset = offset;
        if (moodScore > 0.1) { circle.style.stroke = '#34d399'; }
        else if (moodScore < -0.1) { circle.style.stroke = '#fb7185'; }
        else { circle.style.stroke = '#9ca3af'; }
    }

    const emoji = document.getElementById('moodEmoji');
    const recentScores = (data.history || []).slice(-10).map(d => d.score);
    const recentAvg = recentScores.length > 0 ? recentScores.reduce((a, b) => a + b, 0) / recentScores.length : 0;

    let moodTrendLabel = 'Balanced';
    let moodEmoji = '😐';
    if (recentAvg > 0.3) { moodTrendLabel = 'Feeling Positive'; moodEmoji = '😊'; }
    else if (recentAvg > 0.1) { moodTrendLabel = 'Slightly Positive'; moodEmoji = '🙂'; }
    else if (recentAvg < -0.3) { moodTrendLabel = 'Feeling Negative'; moodEmoji = '😔'; }
    else if (recentAvg < -0.1) { moodTrendLabel = 'Slightly Negative'; moodEmoji = '😕'; }

    if (emoji) emoji.textContent = moodEmoji;

    // Avg confidence
    const avgConf = recentScores.length > 0 ? Math.round(Math.abs(recentAvg) * 100) : 0;
    document.getElementById('avgConfDisplay').textContent = avgConf + '%';

    document.getElementById('moodTrendLabel').textContent = moodTrendLabel;
    document.getElementById('moodTrendSub').textContent = `Based on last ${recentScores.length} analyses`;
}

// ============================================================
// Sentiment Pie Chart
// ============================================================
function renderPieChart(summary) {
    const ctx = document.getElementById('sentimentPieChart');
    const emptyState = document.getElementById('pieEmptyState');
    if (!ctx) return;

    if (summary.total_queries === 0) {
        ctx.style.display = 'none';
        if (emptyState) emptyState.classList.remove('hidden');
        return;
    }
    if (emptyState) emptyState.classList.add('hidden');
    ctx.style.display = 'block';
    if (sentimentPieChart) sentimentPieChart.destroy();

    sentimentPieChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Positive', 'Negative', 'Neutral'],
            datasets: [{
                data: [summary.total_positive, summary.total_negative, summary.total_neutral],
                backgroundColor: ['rgba(52,211,153,0.85)', 'rgba(251,113,133,0.85)', 'rgba(156,163,175,0.6)'],
                borderColor: '#0a0a0a',
                borderWidth: 3,
                hoverOffset: 8
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false, cutout: '72%',
            plugins: {
                legend: { display: false },
                tooltip: { backgroundColor: 'rgba(0,0,0,0.9)', titleColor: '#fff', bodyColor: '#d1d5db', borderColor: '#333', borderWidth: 1 }
            }
        }
    });
}

// ============================================================
// Polarity Timeline
// ============================================================
function renderLineChart(historyData) {
    const ctx = document.getElementById('userHistoryChart');
    if (!ctx) return;
    if (historyLineChart) historyLineChart.destroy();
    if (!historyData || historyData.length === 0) return;

    const labels = historyData.map(d => new Date(d.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' }));
    const scores = historyData.map(d => d.score);
    const chartCtx = ctx.getContext('2d');
    const gradient = chartCtx.createLinearGradient(0, 0, 0, 300);
    gradient.addColorStop(0, 'rgba(52,211,153,0.25)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');

    historyLineChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Sentiment',
                data: scores,
                borderColor: '#34d399',
                backgroundColor: gradient,
                borderWidth: 2, tension: 0.4, fill: true,
                pointBackgroundColor: '#0a0a0a', pointBorderColor: '#34d399',
                pointBorderWidth: 2, pointRadius: 3, pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: {
                y: { min: -1, max: 1, grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#6b7280' } },
                x: { grid: { display: false }, ticks: { color: '#6b7280', maxTicksLimit: 8 } }
            },
            plugins: { legend: { display: false }, tooltip: { backgroundColor: 'rgba(0,0,0,0.9)', titleColor: '#fff', bodyColor: '#d1d5db', borderColor: '#333', borderWidth: 1 } }
        }
    });
}

// ============================================================
// Word Cloud
// ============================================================
function renderWordCloud(wordFreq) {
    const el = document.getElementById('wordCloudCanvas');
    const emptyState = document.getElementById('cloudEmptyState');
    const wordsList = Object.entries(wordFreq).sort((a, b) => b[1] - a[1]);
    if (wordsList.length < 3) {
        if (emptyState) emptyState.classList.remove('hidden');
        return;
    }
    if (emptyState) emptyState.classList.add('hidden');
    const maxCount = wordsList[0][1];
    const weightFactor = maxCount > 10 ? 100 / maxCount : 30;
    const list = wordsList.slice(0, 60).map(([w, f]) => [w, f * weightFactor]);
    el.style.width = '100%'; el.style.height = '280px';

    try {
        WordCloud(el, {
            list, fontFamily: 'Inter, ui-sans-serif, sans-serif',
            color: 'random-light', backgroundColor: 'transparent',
            weightFactor: 1, shrinkToFit: true, drawOutOfBound: false,
            gridSize: 10, rotateRatio: 0.15, shape: 'circle'
        });
    } catch (e) { console.error('WordCloud error', e); }
}

// ============================================================
// Mini Recent List (Overview tab)
// ============================================================
function renderMiniHistory(data) {
    const el = document.getElementById('recentMiniList');
    if (!el || !data.history) return;

    const recent = (data.history || []).slice(-5).reverse();
    if (recent.length === 0) {
        el.innerHTML = '<p class="text-xs text-gray-600 py-4 text-center">No recent activity</p>';
        return;
    }

    el.innerHTML = recent.map(item => {
        const s = item.score;
        const sentLabel = s > 0.1 ? 'Positive' : s < -0.1 ? 'Negative' : 'Neutral';
        const badgeClass = s > 0.1 ? 'badge-pos' : s < -0.1 ? 'badge-neg' : 'badge-neu';
        const date = new Date(item.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' });
        return `<div class="history-row">
            <span class="badge ${badgeClass} flex-shrink-0">${sentLabel}</span>
            <span class="text-xs text-gray-500 flex-shrink-0">${date}</span>
            <span class="text-xs text-gray-600 ml-auto font-mono">${Math.round(Math.abs(s) * 100)}%</span>
        </div>`;
    }).join('');
}

// ============================================================
// History Tab (full query log)
// ============================================================
function renderHistoryTab() {
    const el = document.getElementById('historyList');
    if (!el || !cachedData) return;

    let items = (cachedData.history || []).slice().reverse();

    // Filter by sentiment
    if (historyFilter !== 'All') {
        items = items.filter(item => {
            const s = item.score;
            const sent = s > 0.1 ? 'Positive' : s < -0.1 ? 'Negative' : 'Neutral';
            return sent === historyFilter;
        });
    }

    // Search filter
    if (historySearch) {
        items = items.filter(item =>
            (item.text || '').toLowerCase().includes(historySearch)
        );
    }

    const total = items.length;
    const paged = items.slice(historyPage * HISTORY_PAGE_SIZE, (historyPage + 1) * HISTORY_PAGE_SIZE);

    document.getElementById('historyPageInfo').textContent =
        `Showing ${Math.min(historyPage * HISTORY_PAGE_SIZE + 1, total)}–${Math.min((historyPage + 1) * HISTORY_PAGE_SIZE, total)} of ${total}`;
    document.getElementById('histPrevBtn').disabled = historyPage === 0;
    document.getElementById('histNextBtn').disabled = (historyPage + 1) * HISTORY_PAGE_SIZE >= total;

    if (paged.length === 0) {
        el.innerHTML = '<div class="p-12 text-center text-gray-600 text-sm">No analyses found for this filter.</div>';
        return;
    }

    el.innerHTML = paged.map((item, i) => {
        const s = item.score;
        const sent = s > 0.1 ? 'Positive' : s < -0.1 ? 'Negative' : 'Neutral';
        const badgeClass = s > 0.1 ? 'badge-pos' : s < -0.1 ? 'badge-neg' : 'badge-neu';
        const date = new Date(item.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        const confPct = Math.round(Math.abs(s) * 100);
        const barColor = s > 0.1 ? '#34d399' : s < -0.1 ? '#fb7185' : '#9ca3af';

        return `<div class="flex items-center gap-4 px-5 py-3 hover:bg-[#141414] transition-colors border-b border-[#1a1a1a] last:border-0">
            <span class="text-xs font-mono text-gray-600 w-6 text-right flex-shrink-0">${historyPage * HISTORY_PAGE_SIZE + i + 1}</span>
            <span class="badge ${badgeClass} flex-shrink-0">${sent}</span>
            <span class="text-xs text-gray-400 flex-1 truncate" title="${item.text || ''}">${item.text || '—'}</span>
            <div class="flex items-center gap-2 flex-shrink-0">
                <div class="w-16 bg-[#1a1a1a] rounded-full h-1 border border-[#262626]">
                    <div class="h-1 rounded-full transition-all" style="width:${confPct}%;background:${barColor}"></div>
                </div>
                <span class="text-[10px] text-gray-500 w-8">${confPct}%</span>
            </div>
            <span class="text-xs text-gray-600 flex-shrink-0 hidden sm:block">${date}</span>
        </div>`;
    }).join('');
}

// ============================================================
// AI Profile — Stats & Communication Style Cards
// ============================================================
function updateAIProfileStats(data) {
    if (!data || !data.summary) return;
    const { total_queries: total, total_positive: pos, total_negative: neg, total_neutral: neu } = data.summary;

    // Stat cards
    const posRate = total > 0 ? Math.round((pos / total) * 100) : 0;
    const negRate = total > 0 ? Math.round((neg / total) * 100) : 0;
    const neuRate = total > 0 ? Math.round((neu / total) * 100) : 0;

    document.getElementById('aiStatTotal').textContent = total;
    document.getElementById('aiStatPosRate').textContent = posRate + '%';
    document.getElementById('aiStatNegRate').textContent = negRate + '%';

    // Dominant mood
    const moodEl = document.getElementById('aiStatMood');
    const moodSubEl = document.getElementById('aiStatMoodSub');
    if (total === 0) {
        moodEl.textContent = '—';
        moodSubEl.textContent = 'no data yet';
    } else if (pos >= neg && pos >= neu) {
        moodEl.textContent = '😊';
        moodSubEl.textContent = 'Optimistic';
    } else if (neg >= pos && neg >= neu) {
        moodEl.textContent = '😔';
        moodSubEl.textContent = 'Critical';
    } else {
        moodEl.textContent = '😐';
        moodSubEl.textContent = 'Balanced';
    }

    // ── Personality Archetype (always show if total > 0) ──
    const archetypeContainer = document.getElementById('aiPersonalityArchetype');
    if (archetypeContainer && total > 0) {
        let archetype = { emoji: '🔍', title: 'The Observer', desc: '' };
        if (posRate >= 70) archetype = { emoji: '☀️', title: 'The Optimist', desc: 'Your writing radiates positivity. You naturally gravitate toward uplifting, encouraging, and hopeful expressions. You see the bright side in most situations and your words reflect an inherently optimistic worldview.' };
        else if (posRate >= 50 && negRate < 25) archetype = { emoji: '🌱', title: 'The Encourager', desc: 'Your tone is warm and supportive, with a tendency toward constructive, growth-oriented language. You balance positivity with genuine observations, making your communication feel authentic and grounded.' };
        else if (negRate >= 60) archetype = { emoji: '⚡', title: 'The Challenger', desc: 'You express yourself with conviction and emotional intensity. Your writing doesn\'t shy away from criticism or strong opinions. This directness signals high engagement and a desire for honest discourse.' };
        else if (negRate >= 40) archetype = { emoji: '🔥', title: 'The Passionate Critic', desc: 'Your writing carries significant emotional weight, often channeling frustration or dissatisfaction into articulate critique. You care deeply about the subjects you analyze and it shows.' };
        else if (neuRate >= 50) archetype = { emoji: '⚖️', title: 'The Analyst', desc: 'You favor measured, objective language. Your writing is fact-driven and emotionally restrained, suggesting a systematic and logical approach to communication. You process information before passing judgment.' };
        else archetype = { emoji: '🎭', title: 'The Versatile Communicator', desc: 'You express a healthy mix of positive, negative, and neutral sentiments, demonstrating emotional versatility. Your writing adapts to context, showing range and nuance in how you process information.' };

        archetypeContainer.innerHTML = `
            <div class="flex items-center gap-4 mb-4">
                <div class="w-14 h-14 rounded-2xl bg-violet-900/30 border border-violet-800/30 flex items-center justify-center text-2xl flex-shrink-0 shadow-[0_0_20px_rgba(139,92,246,0.15)]">${archetype.emoji}</div>
                <div>
                    <p class="text-[10px] text-gray-500 uppercase tracking-wider">Your Personality Archetype</p>
                    <p class="text-xl font-bold text-white">${archetype.title}</p>
                </div>
            </div>
            <p class="text-sm text-gray-400 leading-relaxed">${archetype.desc}</p>
        `;
    }

    // ── Sentiment Distribution Bar (always show if total > 0) ──
    const distBar = document.getElementById('aiSentimentDistBar');
    if (distBar && total > 0) {
        distBar.innerHTML = `
            <p class="text-[10px] text-gray-500 uppercase tracking-wider mb-3 font-semibold">Sentiment Distribution</p>
            <div class="flex w-full h-3 rounded-full overflow-hidden mb-3 bg-[#1a1a1a]">
                <div style="width:${posRate}%;background:#34d399;" class="transition-all duration-700"></div>
                <div style="width:${neuRate}%;background:#6b7280;" class="transition-all duration-700"></div>
                <div style="width:${negRate}%;background:#fb7185;" class="transition-all duration-700"></div>
            </div>
            <div class="flex justify-between text-xs">
                <span class="flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-emerald-400 inline-block"></span> <span class="text-gray-400">Positive ${posRate}%</span></span>
                <span class="flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-gray-500 inline-block"></span> <span class="text-gray-400">Neutral ${neuRate}%</span></span>
                <span class="flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-rose-400 inline-block"></span> <span class="text-gray-400">Negative ${negRate}%</span></span>
            </div>
        `;
    }

    // ── Writing Insights (always show if total > 0) ──
    const insightsEl = document.getElementById('aiWritingInsights');
    if (insightsEl && total > 0) {
        const insights = [];
        // Volume insight
        if (total >= 20) insights.push({ icon: '🏆', text: `Power User — You've analyzed <strong class="text-white">${total} texts</strong>, putting you in the heavy-usage tier. Your data gives highly reliable personality insights.` });
        else if (total >= 10) insights.push({ icon: '📈', text: `Active Explorer — With <strong class="text-white">${total} analyses</strong>, you're building a solid sentiment profile. Keep going for even deeper insights.` });
        else if (total >= 3) insights.push({ icon: '🌱', text: `Getting Started — You've run <strong class="text-white">${total} analyses</strong> so far. More analyses will unlock richer personality insights and more accurate profiling.` });
        else insights.push({ icon: '👋', text: `Welcome — You've analyzed <strong class="text-white">${total} text${total > 1 ? 's' : ''}</strong>. Run a few more to unlock your full personality profile!` });

        // Sentiment tendency insight
        if (pos > neg && pos > neu) insights.push({ icon: '😊', text: `Your dominant sentiment is <strong class="text-emerald-400">Positive</strong> at ${posRate}%. You tend to analyze texts that reflect or generate optimistic outcomes.` });
        else if (neg > pos && neg > neu) insights.push({ icon: '🔴', text: `Your dominant sentiment is <strong class="text-rose-400">Negative</strong> at ${negRate}%. You may be analyzing critical content or your text subjects carry heavier emotional weight.` });
        else if (neu > pos && neu > neg) insights.push({ icon: '⚖️', text: `Your dominant sentiment is <strong class="text-gray-300">Neutral</strong> at ${neuRate}%. Your analyzed content tends toward factual, objective, or balanced language.` });
        else insights.push({ icon: '🎭', text: `Your sentiments are <strong class="text-violet-400">evenly distributed</strong> across positive, negative, and neutral — reflecting a well-rounded analytical approach.` });

        // Ratio insight
        if (pos > 0 && neg > 0) {
            const ratio = (pos / neg).toFixed(1);
            insights.push({ icon: '📊', text: `Your positive-to-negative ratio is <strong class="text-white">${ratio}:1</strong>. ${ratio >= 3 ? 'This is an exceptionally positive ratio.' : ratio >= 2 ? 'This reflects a healthy positivity bias.' : ratio >= 1 ? 'Your writing is fairly balanced between positive and negative.' : 'Your texts lean toward critical or negative analysis.'}` });
        }

        // Vocabulary insight
        const wordFreq = data.word_frequencies || {};
        const totalWords = Object.values(wordFreq).reduce((a, b) => a + b, 0);
        const uniqueWords = Object.keys(wordFreq).length;
        if (uniqueWords > 0) {
            const topWords = Object.entries(wordFreq).sort((a, b) => b[1] - a[1]).slice(0, 5);
            insights.push({ icon: '📝', text: `Your vocabulary spans <strong class="text-white">${uniqueWords} unique words</strong> across ${totalWords} total words. Your most frequent terms are: ${topWords.map(([w]) => `<span class="text-violet-400">${w}</span>`).join(', ')}.` });
        }

        insightsEl.innerHTML = insights.map(i =>
            `<div class="flex items-start gap-3 py-3 border-b border-[#1a1a1a] last:border-0">
                <div class="w-8 h-8 rounded-lg bg-[#141414] border border-[#262626] flex items-center justify-center text-sm flex-shrink-0 mt-0.5">${i.icon}</div>
                <p class="text-sm text-gray-400 leading-relaxed">${i.text}</p>
            </div>`
        ).join('');
    }

    // Communication style cards
    if (total >= 1) {
        const exprEl = document.getElementById('aiExpressionStyle');
        if (exprEl) {
            if (total < 3) exprEl.textContent = `Early data: ${pos} positive, ${neg} negative, ${neu} neutral out of ${total} total. Analyze more texts to discover your full expression style.`;
            else if (posRate > 60) exprEl.textContent = 'You tend to express yourself with an upbeat, positive tone. Your writing leans toward encouragement and optimism, often highlighting the best in what you analyze.';
            else if (negRate > 40) exprEl.textContent = 'Your writing carries strong emotional weight, often expressing concern, criticism, or frustration with clarity. You don\'t sugarcoat your observations.';
            else exprEl.textContent = 'You communicate in a balanced way, blending positive and critical perspectives. Your tone is measured and thoughtful, showing nuanced emotional intelligence.';
        }

        const rangeEl = document.getElementById('aiEmotionalRange');
        if (rangeEl) {
            const spread = Math.abs(posRate - negRate);
            if (total < 3) rangeEl.textContent = `Current spread: ${spread}%. More analyses will provide a more accurate picture of your emotional range.`;
            else if (spread > 50) rangeEl.textContent = `Wide range (${spread}% spread) — your texts span from strongly positive to very negative, showing rich emotional diversity in what you write and analyze.`;
            else if (spread > 20) rangeEl.textContent = `Moderate range (${spread}% spread) — you express a variety of sentiments, showing healthy emotional versatility across your analyzed texts.`;
            else rangeEl.textContent = `Narrow range (${spread}% spread) — your sentiment stays consistent, indicating a stable and even-tempered communication style across analyses.`;
        }

        const balEl = document.getElementById('aiSentimentBalance');
        if (balEl) {
            const ratio = pos > 0 && neg > 0 ? (pos / neg).toFixed(1) : pos > 0 ? '∞' : neg > 0 ? '0' : '—';
            balEl.textContent = `Positive-to-negative ratio: ${ratio}. You've written ${pos} positive, ${neg} negative, and ${neu} neutral analyses out of ${total} total queries.`;
        }
    }
}

// ============================================================
// AI Profile — Generate via Gemini
// ============================================================
window.generateAIProfile = async function () {
    if (!cachedData || !currentUser) return;
    const summary = cachedData.summary;
    if (summary.total_queries < 3) {
        alert('You need at least 3 analyses to generate an AI profile.');
        return;
    }

    document.getElementById('aiProfileEmpty').classList.add('hidden');
    document.getElementById('aiProfileContent').classList.add('hidden');
    document.getElementById('aiProfileLoading').classList.remove('hidden');
    document.getElementById('generateProfileBtn').disabled = true;

    try {
        const token = await currentUser.getIdToken();

        // Build a summary to send to Gemini explain endpoint
        const profilePayload = {
            text: `User has analyzed ${summary.total_queries} texts. ${summary.total_positive} positive, ${summary.total_negative} negative, ${summary.total_neutral} neutral. Top words from their history reflect their common topics.`,
            sentiment: summary.total_positive > summary.total_negative ? 'Positive' : (summary.total_negative > summary.total_positive ? 'Negative' : 'Neutral'),
            confidence: Math.abs((summary.total_positive - summary.total_negative) / Math.max(summary.total_queries, 1)),
            language: 'en',
            emotions: {},
            entities: [],
            aspects: {}
        };

        const res = await fetch(`${API_BASE}/ai/explain`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(profilePayload)
        });

        if (!res.ok) throw new Error('AI profile generation failed');
        const data = await res.json();

        // Render explanation
        document.getElementById('aiProfileLoading').classList.add('hidden');
        document.getElementById('aiProfileContent').classList.remove('hidden');
        document.getElementById('aiProfileText').innerHTML = renderSimpleMarkdown(data.explanation);

        // Render tone tags based on stats
        const posRate = Math.round((summary.total_positive / Math.max(summary.total_queries, 1)) * 100);
        const tags = [];
        if (posRate > 60) tags.push({ label: 'Optimistic', color: '#34d399', bg: 'rgba(5,150,105,0.1)' });
        if (summary.total_negative > summary.total_neutral) tags.push({ label: 'Emotionally Expressive', color: '#fb7185', bg: 'rgba(190,18,60,0.1)' });
        if (summary.total_neutral > summary.total_positive) tags.push({ label: 'Analytical', color: '#818cf8', bg: 'rgba(99,102,241,0.1)' });
        tags.push({ label: 'Active Writer', color: '#a3a3a3', bg: 'rgba(82,82,82,0.2)' });
        if (summary.total_queries > 20) tags.push({ label: 'Power User', color: '#fbbf24', bg: 'rgba(217,119,6,0.1)' });

        document.getElementById('aiToneTags').innerHTML = tags.map(t =>
            `<span style="background:${t.bg};color:${t.color};border:1px solid ${t.color}30;padding:4px 10px;border-radius:999px;font-size:11px;font-weight:600;">${t.label}</span>`
        ).join('');

        // Render emotion bars
        const emotions = [
            { label: 'Positivity', value: posRate },
            { label: 'Negativity', value: Math.round((summary.total_negative / Math.max(summary.total_queries, 1)) * 100) },
            { label: 'Neutrality', value: Math.round((summary.total_neutral / Math.max(summary.total_queries, 1)) * 100) },
        ];
        document.getElementById('aiEmotionBars').innerHTML = emotions.map(e => {
            const color = e.label === 'Positivity' ? '#34d399' : e.label === 'Negativity' ? '#fb7185' : '#9ca3af';
            return `<div>
                <div class="flex justify-between mb-1"><span class="text-xs text-gray-400">${e.label}</span><span class="text-xs text-gray-500">${e.value}%</span></div>
                <div class="w-full bg-[#1a1a1a] rounded-full h-1.5"><div class="h-1.5 rounded-full transition-all duration-700" style="width:${e.value}%;background:${color}"></div></div>
            </div>`;
        }).join('');

    } catch (err) {
        console.error('AI profile error:', err);
        document.getElementById('aiProfileLoading').classList.add('hidden');
        document.getElementById('aiProfileEmpty').classList.remove('hidden');
    } finally {
        document.getElementById('generateProfileBtn').disabled = false;
    }
};

function renderSimpleMarkdown(text) {
    if (!text) return '';
    return text.split('\n').map(line => {
        line = line.replace(/\*\*(.+?)\*\*/g, '<strong class="text-white">$1</strong>');
        if (/^[-*]\s/.test(line)) return `<div class="flex gap-2"><span class="text-emerald-400">•</span><span>${line.replace(/^[-*]\s/, '')}</span></div>`;
        if (/^#{1,3}\s/.test(line)) return `<p class="font-semibold text-white mt-3">${line.replace(/^#{1,3}\s/, '')}</p>`;
        return line ? `<p class="text-gray-400">${line}</p>` : '<br>';
    }).join('');
}
