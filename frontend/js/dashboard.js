import { auth } from './firebaseConfig.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const API_BASE = "http://localhost:8000/api";
let currentUser = null;

// Chart Instances
let historyLineChart = null;
let sentimentPieChart = null;

document.addEventListener('DOMContentLoaded', () => {
    // 1. Auth Gate
    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            window.location.href = 'auth.html';
        } else {
            currentUser = user;
            updateProfileUI(user);
            await loadDashboardData();
        }
    });

    // 2. Logout Handler
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            try {
                await signOut(auth);
            } catch (error) {
                console.error("Sign out error", error);
            }
        });
    }
});

function updateProfileUI(user) {
    const name = user.displayName || 'User';
    document.getElementById('headerName').textContent = name;
    document.getElementById('welcomeName').textContent = name.split(' ')[0];
    document.getElementById('headerEmail').textContent = user.email || 'No email associated';

    if (name) {
        document.getElementById('headerAvatar').textContent = name.charAt(0).toUpperCase();
    }
}

async function loadDashboardData() {
    try {
        const token = await currentUser.getIdToken();
        const res = await fetch(`${API_BASE}/user/analytics`, {
            headers: {
                "Authorization": `Bearer ${token}`
            }
        });

        if (!res.ok) {
            throw new Error(`Analytics API failing: ${res.status}`);
        }

        const data = await res.json();

        // 1. Update High-level stats
        document.getElementById('totalQueriesCounter').textContent = data.summary.total_queries;
        document.getElementById('statPos').textContent = data.summary.total_positive;
        document.getElementById('statNeg').textContent = data.summary.total_negative;
        document.getElementById('statNeu').textContent = data.summary.total_neutral;

        // 2. Render Charts
        renderPieChart(data.summary);
        renderLineChart(data.history);
        renderWordCloud(data.word_frequencies);

    } catch (error) {
        console.error("Failed to load dashboard data:", error);
    }
}

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

    if (sentimentPieChart) {
        sentimentPieChart.destroy();
    }

    sentimentPieChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Positive', 'Negative', 'Neutral'],
            datasets: [{
                data: [summary.total_positive, summary.total_negative, summary.total_neutral],
                backgroundColor: [
                    'rgba(52, 211, 153, 0.8)', // emerald-400
                    'rgba(244, 63, 94, 0.8)',  // rose-400
                    'rgba(156, 163, 175, 0.8)' // gray-400
                ],
                borderColor: '#1a1a1a',
                borderWidth: 2,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '70%',
            plugins: {
                legend: {
                    display: false // We built custom legend in HTML
                },
                tooltip: {
                    theme: 'dark',
                    backgroundColor: 'rgba(0,0,0,0.8)',
                    titleColor: '#fff',
                    bodyColor: '#e5e7eb',
                    borderColor: '#333',
                    borderWidth: 1
                }
            }
        }
    });
}

function renderLineChart(historyData) {
    const ctx = document.getElementById('userHistoryChart');
    if (!ctx) return;

    if (historyLineChart) {
        historyLineChart.destroy();
    }

    if (!historyData || historyData.length === 0) {
        return; // Chart.js handles empty gracefully, but we could add an empty state here too.
    }

    const labels = historyData.map(d => new Date(d.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' }));
    const scores = historyData.map(d => d.score); // assuming backend sends -1 to 1

    // Gradient fill
    const chartCtx = ctx.getContext('2d');
    const gradient = chartCtx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, 'rgba(52, 211, 153, 0.2)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

    historyLineChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Sentiment Polarity [-1 to 1]',
                data: scores,
                borderColor: 'rgb(52, 211, 153)',
                backgroundColor: gradient,
                borderWidth: 2,
                tension: 0.4,
                fill: true,
                pointBackgroundColor: '#0a0a0a',
                pointBorderColor: 'rgb(52, 211, 153)',
                pointBorderWidth: 2,
                pointHoverBackgroundColor: 'rgb(52, 211, 153)',
                pointHoverBorderColor: '#fff',
                pointRadius: 3,
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    min: -1,
                    max: 1,
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)',
                    },
                    ticks: {
                        color: '#9ca3af'
                    }
                },
                x: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        color: '#9ca3af',
                        maxTicksLimit: 10
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                }
            }
        }
    });
}

function renderWordCloud(wordFreq) {
    const el = document.getElementById('wordCloudCanvas');
    const emptyState = document.getElementById('cloudEmptyState');

    // Transform dict {word: count} to array [[word, count]]
    const wordsList = Object.entries(wordFreq).sort((a, b) => b[1] - a[1]);

    if (wordsList.length < 3) {
        if (emptyState) emptyState.classList.remove('hidden');
        return;
    }

    if (emptyState) emptyState.classList.add('hidden');

    // Scale weights depending on the highest counts so they look good visually
    const maxCount = wordsList[0][1];
    const weightFactor = maxCount > 10 ? 100 / maxCount : 30; // arbitrary multiplier for visual size

    const list = wordsList.map(([word, freq]) => [word, freq * weightFactor]);

    // Ensure container takes full space
    el.style.width = '100%';
    el.style.height = '100%';

    try {
        WordCloud(el, {
            list: list,
            fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
            color: 'random-light',
            backgroundColor: 'transparent',
            weightFactor: 1, // multiplier applied above manually
            shrinkToFit: true,
            drawOutOfBound: false,
            gridSize: 12,
            rotateRatio: 0.2, // mostly horizontal
            shape: 'circle'
        });
    } catch (e) {
        console.error("Wordcloud error", e);
    }
}
