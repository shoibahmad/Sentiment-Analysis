import { API_BASE } from './api.js';
import { auth, onAuthStateChanged, signOut } from './firebaseConfig.js';

let currentUser = null;

onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        const headerName = document.getElementById("headerUserName");
        if (headerName) {
            const displayName = user.displayName || user.email.split('@')[0];
            headerName.textContent = displayName;
            headerName.previousElementSibling.textContent = displayName.charAt(0).toUpperCase();
        }

        // Fetch data only after user is authenticated
        fetchRecentAnalyses();
        fetchPersonalStats();
    } else {
        window.location.href = "auth.html";
    }
});

const logoutBtn = document.getElementById("logoutBtn");
if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
        try {
            await signOut(auth);
        } catch (error) {
            console.error("Error signing out: ", error);
        }
    });
}

// --- Tab Switching Logic ---
const tabs = document.querySelectorAll('.tab-btn');
const textPanel = document.getElementById('textModePanel');
const filePanel = document.getElementById('fileModePanel');

tabs.forEach(tab => {
    tab.addEventListener('click', () => {
        tabs.forEach(t => {
            t.classList.remove('active');
            t.classList.add('text-gray-400');
            t.classList.remove('text-white');
        });
        tab.classList.add('active');
        tab.classList.remove('text-gray-400');
        tab.classList.add('text-white');

        if (tab.dataset.mode === 'text') {
            textPanel.classList.remove('hidden');
            textPanel.classList.add('flex');
            filePanel.classList.add('hidden');
            filePanel.classList.remove('flex');
            document.getElementById('resultContent').classList.add('hidden');
            document.getElementById('bulkResultContent').classList.add('hidden');
            document.getElementById('resultPlaceholder').classList.remove('hidden');
        } else {
            filePanel.classList.remove('hidden');
            filePanel.classList.add('flex');
            textPanel.classList.add('hidden');
            textPanel.classList.remove('flex');
            document.getElementById('resultContent').classList.add('hidden');
            document.getElementById('bulkResultContent').classList.add('hidden');
            document.getElementById('resultPlaceholder').classList.remove('hidden');
        }
    });
});


// --- Text Analysis Logic (Real-time & Manual) ---
const analyzeBtn = document.getElementById("analyzeBtn");
const textInput = document.getElementById("textInput");
const errorMsg = document.getElementById("errorMsg");
const typingIndicator = document.getElementById("typingIndicator");

let typingTimer;
const doneTypingInterval = 1000; // 1 second pause triggers analysis

if (textInput) {
    textInput.addEventListener('input', () => {
        clearTimeout(typingTimer);
        document.getElementById('resultContent').classList.add('opacity-50');
        if (typingIndicator) typingIndicator.classList.remove('hidden');

        if (textInput.value.trim().length > 0) {
            typingTimer = setTimeout(triggerAnalysis, doneTypingInterval);
        } else {
            if (typingIndicator) typingIndicator.classList.add('hidden');
            document.getElementById('resultContent').classList.remove('opacity-50');
        }
    });
}

if (analyzeBtn) {
    analyzeBtn.addEventListener("click", () => {
        clearTimeout(typingTimer);
        triggerAnalysis(true);
    });
}

async function triggerAnalysis(isManual = false) {
    if (typingIndicator) typingIndicator.classList.add('hidden');

    if (!textInput.value.trim()) {
        if (isManual) {
            errorMsg.querySelector('span').textContent = "Please enter some text to analyze.";
            errorMsg.classList.remove("hidden");
        }
        return;
    }

    if (errorMsg) errorMsg.classList.add("hidden");

    if (isManual) {
        analyzeBtn.innerHTML = `
            Processing...
            <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-black"></div>
        `;
        analyzeBtn.disabled = true;
    }

    try {
        const token = currentUser ? await currentUser.getIdToken() : '';
        const res = await fetch(`${API_BASE}/analyze`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({ text: textInput.value })
        });

        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.detail || "Analysis failed.");
        }

        const data = await res.json();

        // Hide bulk UI, show single UI
        if (document.getElementById('bulkResultContent')) document.getElementById('bulkResultContent').classList.add('hidden');

        updateSingleResultUI(data);
        triggerAiInsights(data);  // ✨ Gemini AI insights
        fetchRecentAnalyses();
        fetchPersonalStats();

    } catch (err) {
        if (errorMsg) {
            errorMsg.querySelector('span').textContent = err.message;
            errorMsg.classList.remove("hidden");
        }
    } finally {
        if (isManual) {
            analyzeBtn.innerHTML = `
                Force Save & Analyze
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
            `;
            analyzeBtn.disabled = false;
        }
        if (document.getElementById('resultContent')) document.getElementById('resultContent').classList.remove('opacity-50');
    }
}


function updateSingleResultUI(data) {
    const placeholder = document.getElementById("resultPlaceholder");
    const content = document.getElementById("resultContent");

    if (placeholder) placeholder.classList.add("hidden");
    if (content) content.classList.remove("hidden");

    // Core metrics
    document.getElementById("resultEmoji").textContent = data.emoji;
    document.getElementById("resultSentiment").textContent = data.sentiment;
    document.getElementById("langBadge").textContent = data.language.toUpperCase();

    // Confidence Bar
    const percent = Math.round(data.confidence * 100);
    document.getElementById("resultConfidenceValue").textContent = `${percent}%`;
    const bar = document.getElementById("resultConfidenceBar");
    bar.style.width = '0%';
    bar.className = "h-full rounded-full transition-all duration-1000 ease-out shadow-[0_0_10px_rgba(255,255,255,0.5)]";

    if (data.sentiment === "Positive") {
        bar.classList.add("bg-emerald-400");
        bar.classList.replace("shadow-[0_0_10px_rgba(255,255,255,0.5)]", "shadow-[0_0_10px_rgba(52,211,153,0.5)]");
        document.getElementById("resultEmoji").className = "text-6xl mb-5 bg-[#064e3b] text-emerald-400 p-5 rounded-full border border-emerald-900 shadow-lg aspect-square flex items-center justify-center";
    }
    else if (data.sentiment === "Negative") {
        bar.classList.add("bg-rose-500");
        bar.classList.replace("shadow-[0_0_10px_rgba(255,255,255,0.5)]", "shadow-[0_0_10px_rgba(244,63,94,0.5)]");
        document.getElementById("resultEmoji").className = "text-6xl mb-5 bg-[#4c1d95]/20 text-rose-500 p-5 rounded-full border border-rose-900 shadow-lg aspect-square flex items-center justify-center";
    }
    else {
        bar.classList.add("bg-gray-400");
        bar.classList.replace("shadow-[0_0_10px_rgba(255,255,255,0.5)]", "shadow-[0_0_10px_rgba(156,163,175,0.5)]");
        document.getElementById("resultEmoji").className = "text-6xl mb-5 bg-[#262626] text-gray-300 p-5 rounded-full border border-[#333] shadow-lg aspect-square flex items-center justify-center";
    }

    setTimeout(() => { bar.style.width = `${percent}%`; }, 50);

    // Advanced Metrics: Emotions
    const emotionsList = document.getElementById("emotionsList");
    emotionsList.innerHTML = "";
    if (Object.keys(data.emotions).length === 0) {
        emotionsList.innerHTML = "<span class='text-xs text-gray-600 block'>No strong emotions detected.</span>";
    } else {
        for (const [emo, score] of Object.entries(data.emotions)) {
            if (score > 0) {
                emotionsList.innerHTML += `<span class="bg-[#1a1a1a] border border-[#333] px-2 py-1 rounded text-xs text-gray-300 capitalize">${emo} <span class="opacity-50 ml-1">${Math.round(score * 100)}%</span></span>`;
            }
        }
    }

    // Advanced Metrics: Entities
    const entitiesList = document.getElementById("entitiesList");
    entitiesList.innerHTML = "";
    if (data.entities.length === 0) {
        entitiesList.innerHTML = "<span class='text-xs text-gray-600 block'>No entities detected.</span>";
    } else {
        data.entities.forEach(ent => {
            let text = ent.text;
            if (text.length > 20) text = text.substring(0, 17) + '...';
            entitiesList.innerHTML += `<span class="bg-[#1a1a1a] border border-[#333] px-2 py-1 rounded text-xs text-gray-300" title="${ent.text}">
                 <span class="text-indigo-400 mr-1">${ent.label}</span>${text}
             </span>`;
        });
    }

    // Advanced Metrics: Aspects (ABSA)
    const aspectsList = document.getElementById("aspectsList");
    if (aspectsList) {
        aspectsList.innerHTML = "";
        if (!data.aspects || Object.keys(data.aspects).length === 0) {
            aspectsList.innerHTML = "<span class='text-xs text-gray-600 block'>No strong aspects identified.</span>";
        } else {
            for (const [aspect, sent] of Object.entries(data.aspects)) {
                let colorClass = "text-gray-400";
                if (sent === "Positive") colorClass = "text-emerald-400";
                else if (sent === "Negative") colorClass = "text-rose-400";

                aspectsList.innerHTML += `<span class="bg-[#1a1a1a] border border-[#333] px-2 py-1 rounded text-xs text-gray-300 capitalize">${aspect}: <span class="font-medium ${colorClass}">${sent}</span></span>`;
            }
        }
    }
}


// --- File Upload Logic ---
const fileInput = document.getElementById('fileInput');
if (fileInput) {
    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        document.getElementById('selectedFileName').textContent = file.name;
        document.getElementById('selectedFileName').classList.remove('hidden');

        // Trigger bulk upload
        const overlay = document.getElementById('bulkLoadingOverlay');
        overlay.classList.remove('hidden');
        overlay.classList.add('flex');

        const placeholder = document.getElementById("resultPlaceholder");
        const singleContent = document.getElementById("resultContent");
        const bulkContent = document.getElementById("bulkResultContent");

        if (placeholder) placeholder.classList.add("hidden");
        if (singleContent) singleContent.classList.add("hidden");

        const formData = new FormData();
        formData.append("file", file);

        try {
            const token = currentUser ? await currentUser.getIdToken() : '';
            const res = await fetch(`${API_BASE}/analyze/bulk`, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${token}`
                },
                body: formData
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.detail || "Bulk analysis failed.");
            }

            const data = await res.json();

            // Show bulk summary
            bulkContent.classList.remove('hidden');
            document.getElementById('bulkTotal').textContent = data.processed_count;
            document.getElementById('bulkPos').textContent = data.summary.Positive;
            document.getElementById('bulkNeg').textContent = data.summary.Negative;
            document.getElementById('bulkNeu').textContent = data.summary.Neutral;

            fetchRecentAnalyses();
            fetchPersonalStats();

        } catch (err) {
            alert(err.message);
            document.getElementById("resultPlaceholder").classList.remove("hidden");
        } finally {
            overlay.classList.add('hidden');
            overlay.classList.remove('flex');
            fileInput.value = ""; // reset
        }
    });
}


// --- Recent Activity Feed ---
async function fetchRecentAnalyses() {
    const recentList = document.getElementById("recentList");
    if (!recentList) return;

    try {
        const token = currentUser ? await currentUser.getIdToken() : '';
        const res = await fetch(`${API_BASE}/recent`, {
            headers: {
                "Authorization": `Bearer ${token}`
            }
        });
        if (!res.ok) return;
        const data = await res.json();

        if (data.length === 0) {
            recentList.innerHTML = `<div class="h-full flex items-center justify-center text-gray-500"><p class="text-sm">No recent network activity.</p></div>`;
            return;
        }

        recentList.innerHTML = "";
        data.forEach(item => {
            const div = document.createElement("div");
            div.className = "bg-[#141414] p-4 rounded-xl border border-[#262626] shadow-sm flex flex-col gap-3 hover:border-[#444] transition-colors anim-fade-in";

            let badgeClass = "bg-[#262626] text-gray-300 border border-[#333]";
            if (item.sentiment === "Positive") badgeClass = "bg-emerald-900/30 text-emerald-400 border border-emerald-900/50";
            else if (item.sentiment === "Negative") badgeClass = "bg-rose-900/30 text-rose-400 border border-rose-900/50";

            // Entity snippet
            let entHtml = '';
            if (item.entities && item.entities.length > 0) {
                entHtml = `<div class="flex flex-wrap gap-1 mt-1">`;
                item.entities.slice(0, 2).forEach(e => {
                    entHtml += `<span class="text-[10px] bg-indigo-900/30 text-indigo-300 px-1.5 py-0.5 rounded border border-indigo-900/50" title="${e.label}">${e.text}</span>`;
                });
                if (item.entities.length > 2) entHtml += `<span class="text-[10px] text-gray-500">+${item.entities.length - 2}</span>`;
                entHtml += `</div>`;
            }

            div.innerHTML = `
                <div class="flex justify-between items-start">
                    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${badgeClass}">
                        ${item.emoji} ${item.sentiment}
                    </span>
                    <span class="text-xs text-gray-500 font-medium">${new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                </div>
                <div>
                   <p class="text-sm text-gray-300 leading-relaxed font-medium line-clamp-2" title="${item.text}">"${item.text}"</p>
                   ${entHtml}
                </div>
                <div class="flex items-center gap-2 mt-auto pt-2 border-t border-[#262626]">
                     <span class="text-[10px] text-gray-500 uppercase tracking-wider">Confidence:</span>
                     <div class="flex-1 bg-[#262626] rounded-full h-1 border border-[#333]">
                         <div class="h-full rounded-full bg-gray-500" style="width: ${Math.round(item.confidence * 100)}%"></div>
                     </div>
                     <span class="text-[10px] font-semibold text-gray-400">${Math.round(item.confidence * 100)}%</span>
                     <span class="text-[10px] text-gray-600 uppercase ml-2 border-l border-[#333] pl-2">${item.language}</span>
                </div>
            `;
            recentList.appendChild(div);
        });
    } catch (err) {
        console.error("Failed to load recent analyses.", err);
    }
}

let personalTrendChartInstance = null;
async function fetchPersonalStats() {
    const ctx = document.getElementById('personalTrendChart');
    if (!ctx) return;

    try {
        const token = currentUser ? await currentUser.getIdToken() : '';
        const res = await fetch(`${API_BASE}/user/stats`, {
            headers: {
                "Authorization": `Bearer ${token}`
            }
        });
        if (!res.ok) return;
        const data = await res.json();
        const trendData = data.trend;

        if (trendData.length === 0) {
            // Placeholder empty state
            if (personalTrendChartInstance) personalTrendChartInstance.destroy();
            return;
        }

        const labels = trendData.map(d => new Date(d.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' }));
        const scores = trendData.map(d => d.score * 100);

        // Chart color based on average trend
        const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
        const lineColor = avgScore >= 0 ? 'rgb(52, 211, 153)' : 'rgb(244, 63, 94)'; // emerald or rose
        const bgColor = avgScore >= 0 ? 'rgba(52, 211, 153, 0.1)' : 'rgba(244, 63, 94, 0.1)';

        if (personalTrendChartInstance) {
            personalTrendChartInstance.destroy();
        }

        personalTrendChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Sentiment Score',
                    data: scores,
                    borderColor: lineColor,
                    backgroundColor: bgColor,
                    borderWidth: 2,
                    tension: 0.4,
                    fill: 'start',
                    pointRadius: 0,
                    pointHoverRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        backgroundColor: '#1a1a1a',
                        titleColor: '#fff',
                        bodyColor: '#aaa',
                        borderColor: '#333',
                        borderWidth: 1
                    }
                },
                scales: {
                    x: {
                        display: false
                    },
                    y: {
                        display: true,
                        min: -100,
                        max: 100,
                        grid: {
                            color: '#262626',
                            drawBorder: false
                        },
                        ticks: {
                            color: '#666',
                            stepSize: 50
                        }
                    }
                },
                interaction: {
                    mode: 'nearest',
                    axis: 'x',
                    intersect: false
                }
            }
        });

    } catch (err) {
        console.error("Failed to load personal stats.", err);
    }
}

// Removed global init because it fires before auth is ready.


// ============================================================
// ✨  GEMINI AI INSIGHT PANEL
// ============================================================

let currentAnalysisData = null; // stores latest analysis for AI calls
let rewritesLoaded = false;     // prevent duplicate rewrite API calls

/**
 * Called after every successful single-text analysis.
 * Shows the AI panel and auto-fetches the Gemini explanation.
 */
async function triggerAiInsights(data) {
    currentAnalysisData = data;
    rewritesLoaded = false;

    // Reset rewrite UI
    const rewriteContent = document.getElementById('aiRewriteContent');
    const rewriteHint = document.getElementById('aiRewriteHint');
    const rewriteLoading = document.getElementById('aiRewriteLoading');
    if (rewriteContent) rewriteContent.classList.add('hidden');
    if (rewriteHint) rewriteHint.classList.remove('hidden');
    if (rewriteLoading) rewriteLoading.classList.add('hidden');

    // Reset explain UI to loading state
    const explainLoading = document.getElementById('aiExplainLoading');
    const explainContent = document.getElementById('aiExplainContent');
    if (explainLoading) explainLoading.classList.remove('hidden');
    if (explainContent) explainContent.classList.add('hidden');

    // Switch to Explanation tab
    switchAiTab('explain');

    // Show the panel
    const panel = document.getElementById('aiInsightSection');
    if (panel) {
        panel.classList.remove('hidden');
        panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    // Fetch explanation from Gemini
    try {
        const token = currentUser ? await currentUser.getIdToken() : '';
        const res = await fetch(`${API_BASE}/ai/explain`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                text: data.text,
                sentiment: data.sentiment,
                confidence: data.confidence,
                language: data.language || 'unknown',
                emotions: data.emotions || {},
                entities: data.entities || [],
                aspects: data.aspects || {}
            })
        });

        if (!res.ok) throw new Error('AI explain failed');
        const result = await res.json();

        // Render (supports simple markdown: **bold**, bullet lines)
        if (explainLoading) explainLoading.classList.add('hidden');
        if (explainContent) {
            explainContent.classList.remove('hidden');
            const textEl = document.getElementById('aiExplainText');
            if (textEl) textEl.innerHTML = renderSimpleMarkdown(result.explanation);
        }
    } catch (err) {
        console.error('Gemini explain error:', err);
        if (explainLoading) explainLoading.classList.add('hidden');
        if (explainContent) {
            explainContent.classList.remove('hidden');
            const textEl = document.getElementById('aiExplainText');
            if (textEl) textEl.textContent = 'AI explanation could not be loaded. Please try again.';
        }
    }
}

/**
 * Renders minimal markdown (bold, bullet points) to HTML.
 */
function renderSimpleMarkdown(text) {
    if (!text) return '';
    return text
        .split('\n')
        .map(line => {
            line = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
            if (/^[-*]\s/.test(line)) {
                return `<div class="flex gap-2 items-start"><span class="text-violet-400 mt-0.5">•</span><span>${line.replace(/^[-*]\s/, '')}</span></div>`;
            }
            if (/^#{1,3}\s/.test(line)) {
                return `<p class="font-semibold text-white mt-3">${line.replace(/^#{1,3}\s/, '')}</p>`;
            }
            return line ? `<p>${line}</p>` : '<br>';
        })
        .join('');
}

/**
 * Load tone rewrites on demand (button click).
 */
async function loadToneRewrites() {
    if (rewritesLoaded || !currentAnalysisData) return;

    const loadingEl = document.getElementById('aiRewriteLoading');
    const contentEl = document.getElementById('aiRewriteContent');
    const hintEl = document.getElementById('aiRewriteHint');
    const btn = document.getElementById('loadRewritesBtn');

    if (loadingEl) { loadingEl.classList.remove('hidden'); loadingEl.classList.add('flex'); }
    if (hintEl) hintEl.classList.add('hidden');
    if (btn) { btn.disabled = true; btn.textContent = 'Generating...'; }

    try {
        const token = currentUser ? await currentUser.getIdToken() : '';
        const res = await fetch(`${API_BASE}/ai/rewrite`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ text: currentAnalysisData.text })
        });

        if (!res.ok) throw new Error('AI rewrite failed');
        const result = await res.json();
        const rewrites = result.rewrites;

        document.getElementById('rewritePositive').textContent = rewrites.positive || '';
        document.getElementById('rewriteNeutral').textContent = rewrites.neutral || '';
        document.getElementById('rewriteFormal').textContent = rewrites.formal || '';

        if (contentEl) contentEl.classList.remove('hidden');
        rewritesLoaded = true;

    } catch (err) {
        console.error('Gemini rewrite error:', err);
        if (hintEl) {
            hintEl.textContent = 'Could not generate rewrites. Please try again.';
            hintEl.classList.remove('hidden');
        }
    } finally {
        if (loadingEl) { loadingEl.classList.add('hidden'); loadingEl.classList.remove('flex'); }
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg> Generate Tone Rewrites`;
        }
    }
}

/**
 * Switch between AI tabs (explain / rewrite).
 */
function switchAiTab(tab) {
    const explainPanel = document.getElementById('aiExplainPanel');
    const rewritePanel = document.getElementById('aiRewritePanel');
    const tabExplain = document.getElementById('tabExplain');
    const tabRewrite = document.getElementById('tabRewrite');

    if (tab === 'explain') {
        if (explainPanel) explainPanel.classList.remove('hidden');
        if (rewritePanel) rewritePanel.classList.add('hidden');
        if (tabExplain) {
            tabExplain.classList.add('text-violet-400', 'border-violet-500');
            tabExplain.classList.remove('text-gray-500', 'border-transparent');
        }
        if (tabRewrite) {
            tabRewrite.classList.remove('text-violet-400', 'border-violet-500');
            tabRewrite.classList.add('text-gray-500', 'border-transparent');
        }
    } else {
        if (rewritePanel) rewritePanel.classList.remove('hidden');
        if (explainPanel) explainPanel.classList.add('hidden');
        if (tabRewrite) {
            tabRewrite.classList.add('text-violet-400', 'border-violet-500');
            tabRewrite.classList.remove('text-gray-500', 'border-transparent');
        }
        if (tabExplain) {
            tabExplain.classList.remove('text-violet-400', 'border-violet-500');
            tabExplain.classList.add('text-gray-500', 'border-transparent');
        }
    }
}

/**
 * Copy a rewrite to clipboard.
 */
function copyRewrite(tone) {
    const el = document.getElementById(`rewrite${tone.charAt(0).toUpperCase() + tone.slice(1)}`);
    if (!el) return;
    navigator.clipboard.writeText(el.textContent).then(() => {
        const allBtns = document.querySelectorAll('[onclick^="copyRewrite"]');
        allBtns.forEach(b => { if (b.getAttribute('onclick').includes(tone)) { b.textContent = '✓ Copied!'; setTimeout(() => b.textContent = 'Copy', 2000); } });
    });
}

// Expose functions to global scope for inline onclick handlers in HTML
window.switchAiTab = switchAiTab;
window.loadToneRewrites = loadToneRewrites;
window.copyRewrite = copyRewrite;
