import { auth } from './firebaseConfig.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const API_BASE = "http://localhost:8000/api";
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
    });

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) logoutBtn.addEventListener('click', async () => {
        try { await signOut(auth); } catch (e) { console.error(e); }
    });

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
    document.getElementById('headerName').textContent = name;
    document.getElementById('welcomeName').textContent = first;
    document.getElementById('headerEmail').textContent = user.email || 'No email';
    document.getElementById('headerAvatar').textContent = name.charAt(0).toUpperCase();
    document.getElementById('welcomeSubtitle').textContent =
        `Welcome back, ${first}. Here's a summary of your sentiment journey.`;
}

// ============================================================
// Tab Switching
// ============================================================
window.switchDashTab = function (tab) {
    ['overview', 'history', 'ai'].forEach(t => {
        document.getElementById(`panel${t.charAt(0).toUpperCase() + t.slice(1)}`)?.classList.add('hidden');
        document.getElementById(`tab${t.charAt(0).toUpperCase() + t.slice(1)}`)?.classList.remove('active');
    });
    document.getElementById(`panel${tab.charAt(0).toUpperCase() + tab.slice(1)}`)?.classList.remove('hidden');
    document.getElementById(`tab${tab.charAt(0).toUpperCase() + tab.slice(1)}`)?.classList.add('active');

    if (tab === 'history' && cachedData) renderHistoryTab();
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
// AI Profile Tab
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
