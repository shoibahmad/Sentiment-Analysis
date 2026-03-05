import { API_BASE } from './api.js';
import { auth, onAuthStateChanged, signOut } from './firebaseConfig.js';
import { showToast, showConfirmModal, queueToast, checkPendingToast } from './toast.js';

let currentUser = null;

onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;

        // Fetch data only after user is authenticated
        fetchRecentAnalyses();
        fetchPersonalStats();
        checkPendingToast();  // Show any queued toast from sign-in page
    } else {
        window.location.href = "auth.html";
    }
});

// Sign-out is handled by shared header.js

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
        renderDeepAnalysis(data);   // 🔬 Deep Analysis panels
        triggerAiInsights(data);    // ✨ Gemini AI insights
        fetchRecentAnalyses();
        fetchPersonalStats();
        showToast(`Analysis complete — ${data.sentiment} (${Math.round(data.confidence * 100)}%)`, 'success');

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
            showToast(`Bulk analysis complete — ${data.processed_count} texts processed`, 'success');

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


// ============================================================
// 🔬 DEEP ANALYSIS — renders Sarcasm, Toxicity, Sentences, Keywords
// ============================================================

function renderDeepAnalysis(data) {
    const section = document.getElementById('deepAnalysisSection');
    if (!section) return;
    section.classList.remove('hidden');
    section.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    renderSarcasmMeter(data.sarcasm);
    renderToxicityShield(data.toxicity);
    renderSentenceBreakdown(data.sentence_breakdown);
    renderKeywordMap(data.keyword_map);
}

// ── Sarcasm Meter
function renderSarcasmMeter(sarcasm) {
    if (!sarcasm) return;
    const pct = Math.round(sarcasm.score * 100);

    const score = document.getElementById('sarcasmScore');
    const label = document.getElementById('sarcasmLabel');
    const badge = document.getElementById('sarcasmBadge');
    const clues = document.getElementById('sarcasmClues');

    // Replace the bar HTML with a gradient track + needle indicator
    const barContainer = document.getElementById('sarcasmBar')?.parentElement;
    if (barContainer) {
        barContainer.innerHTML = `
            <div class="relative w-full h-3 rounded-full overflow-hidden bg-gradient-to-r from-emerald-500 via-amber-400 to-rose-500 border border-[#262626]">
                <div class="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_6px_rgba(255,255,255,0.9)] transition-all duration-1000"
                     id="sarcasmNeedle" style="left: ${pct}%"></div>
            </div>`;
    }

    if (score) score.textContent = pct + '%';
    if (label) label.textContent = sarcasm.label;

    if (badge) {
        badge.classList.remove('hidden');
        badge.textContent = sarcasm.label;
        badge.className = 'ml-auto px-2 py-0.5 rounded-full text-[10px] font-bold border';
        if (sarcasm.score >= 0.45) {
            badge.classList.add('bg-amber-900/30', 'text-amber-400', 'border-amber-700/40');
        } else if (sarcasm.score >= 0.25) {
            badge.classList.add('bg-yellow-900/30', 'text-yellow-400', 'border-yellow-700/40');
        } else {
            badge.classList.add('bg-emerald-900/30', 'text-emerald-400', 'border-emerald-700/40');
        }
    }

    if (clues) {
        if (sarcasm.clues && sarcasm.clues.length > 0) {
            clues.innerHTML = sarcasm.clues.map(c =>
                `<div class="flex items-start gap-2">
                    <span class="text-amber-500 mt-0.5 flex-shrink-0">⚠</span>
                    <span class="text-gray-400">${c}</span>
                </div>`
            ).join('');
        } else {
            clues.innerHTML = '<span class="text-xs text-emerald-600">— No sarcasm indicators found</span>';
        }
    }
}

// ── Toxicity Shield
function renderToxicityShield(toxicity) {
    if (!toxicity) return;
    const pct = Math.round(toxicity.score * 100);

    const badge = document.getElementById('toxicityBadge');
    const icon = document.getElementById('toxicityIcon');
    const score = document.getElementById('toxicityScore');
    const bar = document.getElementById('toxicityBar');
    const words = document.getElementById('toxicityWords');

    const configs = {
        Safe: { icon: '✅', emoji: '🛡️', badgeCls: 'bg-emerald-900/30 text-emerald-400 border-emerald-700/40', barColor: '#34d399', iconBg: 'bg-emerald-900/30 border-emerald-800/40' },
        Offensive: { icon: '⚠️', emoji: '⚠️', badgeCls: 'bg-amber-900/30  text-amber-400  border-amber-700/40', barColor: '#fbbf24', iconBg: 'bg-amber-900/30  border-amber-800/40' },
        Toxic: { icon: '☠️', emoji: '☠️', badgeCls: 'bg-rose-900/30   text-rose-400   border-rose-700/40', barColor: '#fb7185', iconBg: 'bg-rose-900/30   border-rose-800/40' },
    };
    const cfg = configs[toxicity.label] || configs.Safe;

    if (badge) { badge.textContent = toxicity.label; badge.className = `ml-auto px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${cfg.badgeCls}`; }
    if (icon) { icon.textContent = cfg.emoji; icon.className = `w-14 h-14 rounded-2xl flex items-center justify-center text-2xl border flex-shrink-0 ${cfg.iconBg}`; }
    if (score) score.textContent = pct + '%';
    if (bar) { bar.style.backgroundColor = cfg.barColor; bar.style.width = '0%'; setTimeout(() => bar.style.width = pct + '%', 50); }

    if (words) {
        if (toxicity.matched_words && toxicity.matched_words.length > 0) {
            words.innerHTML = toxicity.matched_words.map(w =>
                `<span class="bg-rose-900/20 border border-rose-900/40 text-rose-400 px-2 py-0.5 rounded text-xs font-mono">"${w}"</span>`
            ).join('');
        } else {
            words.innerHTML = '<span class="text-xs text-emerald-600">✓ No flagged terms detected</span>';
        }
    }
}

// ── Sentence Breakdown
function renderSentenceBreakdown(sentences) {
    const list = document.getElementById('sentenceList');
    const count = document.getElementById('sentenceCount');
    if (!list) return;

    if (!sentences || sentences.length === 0) {
        list.innerHTML = '<span class="text-xs text-gray-700 italic">Text may be too short to split into sentences.</span>';
        if (count) count.textContent = '0 sentences';
        return;
    }

    if (count) count.textContent = `${sentences.length} sentence${sentences.length !== 1 ? 's' : ''}`;

    list.innerHTML = sentences.map((s, i) => {
        let colorCls, dotColor, badgeText;
        if (s.sentiment === 'Positive') { colorCls = 'border-l-emerald-500 bg-emerald-900/10'; dotColor = 'bg-emerald-400'; badgeText = '+ ' + Math.round(s.score * 100) + '%'; }
        else if (s.sentiment === 'Negative') { colorCls = 'border-l-rose-500 bg-rose-900/10'; dotColor = 'bg-rose-400'; badgeText = '- ' + Math.round(Math.abs(s.score) * 100) + '%'; }
        else { colorCls = 'border-l-gray-600 bg-[#1a1a1a]'; dotColor = 'bg-gray-500'; badgeText = '~ 0%'; }

        return `<div class="flex items-start gap-2.5 border-l-2 pl-3 py-1 ${colorCls} rounded-r-lg">
            <span class="text-[10px] font-mono text-gray-600 mt-0.5 flex-shrink-0 w-4">${i + 1}</span>
            <p class="text-xs text-gray-300 leading-relaxed flex-1">${s.text}</p>
            <span class="flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded bg-black/30 ${s.sentiment === 'Positive' ? 'text-emerald-400' : s.sentiment === 'Negative' ? 'text-rose-400' : 'text-gray-500'}">${badgeText}</span>
        </div>`;
    }).join('');
}

// ── Keyword Sentiment Map
function renderKeywordMap(keywords) {
    const container = document.getElementById('keywordMap');
    if (!container) return;

    if (!keywords || keywords.length === 0) {
        container.innerHTML = '<span class="text-xs text-gray-700 italic">No sentiment-bearing keywords found.</span>';
        return;
    }

    const maxAbs = Math.max(...keywords.map(k => Math.abs(k.score)), 0.01);

    container.innerHTML = keywords.map(k => {
        const isPos = k.color === 'positive';
        const isNeg = k.color === 'negative';
        const sign = isPos ? '+' : (isNeg ? '−' : '~');

        let bgClass, dotColor;
        if (isPos) {
            bgClass = 'bg-emerald-900/20 border-emerald-700/40 text-emerald-300';
            dotColor = '#34d399';
        } else if (isNeg) {
            bgClass = 'bg-rose-900/20 border-rose-700/40 text-rose-300';
            dotColor = '#fb7185';
        } else {
            bgClass = 'bg-[#1f1f1f] border-[#333] text-gray-400';
            dotColor = '#6b7280';
        }

        const scorePct = Math.round(Math.abs(k.score) * 100);

        return `<div class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium cursor-default ${bgClass} transition-all hover:scale-105">
            <span class="w-2 h-2 rounded-full flex-shrink-0" style="background:${dotColor};box-shadow:0 0 5px ${dotColor}70"></span>
            ${k.word}
            ${scorePct > 0 ? `<span class="text-[9px] opacity-50">${sign}${scorePct}%</span>` : ''}
        </div>`;
    }).join('');
}
