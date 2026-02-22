import { API_BASE } from './api.js';
import { auth, onAuthStateChanged } from './firebaseConfig.js';

let currentUser = null;

onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
    } else {
        window.location.href = "auth.html";
    }
});

// --- Admin Portal Logic ---
const loginBtn = document.getElementById("loginBtn");
let adminChart = null;
let currentPage = 0;
const PAGE_SIZE = 15;

if (loginBtn) {
    loginBtn.addEventListener("click", () => {
        const user = document.getElementById("username").value;
        const pass = document.getElementById("password").value;
        const err = document.getElementById("loginError");

        if (user === "admin" && pass === "password123") {
            document.getElementById("loginOverlay").style.display = "none";

            const adminHeader = document.getElementById("adminHeader");
            const dashboard = document.getElementById("dashboard");
            const adminFooter = document.getElementById("adminFooter");

            if (adminHeader) adminHeader.classList.remove("hidden");
            if (dashboard) {
                dashboard.classList.remove("hidden");
                dashboard.classList.add("flex");
            }
            if (adminFooter) adminFooter.classList.remove("hidden");

            fetchAdminData();
            fetchAdminVisuals();

        } else {
            err.classList.remove("hidden");
        }
    });

    // Press enter to login
    const passInput = document.getElementById("password");
    if (passInput) {
        passInput.addEventListener("keypress", function (event) {
            if (event.key === "Enter") {
                event.preventDefault();
                loginBtn.click();
            }
        });
    }

    // Pagination Listeners
    document.getElementById("prevBtn").addEventListener("click", () => {
        if (currentPage > 0) {
            currentPage--;
            fetchAdminData();
        }
    });

    document.getElementById("nextBtn").addEventListener("click", () => {
        currentPage++;
        fetchAdminData();
    });

    // Filter Listener
    document.getElementById("sentimentFilter").addEventListener("change", () => {
        currentPage = 0; // reset
        fetchAdminData();
    });

    // Refresh Button Listener
    const refreshBtn = document.getElementById("refreshBtn");
    if (refreshBtn) {
        refreshBtn.addEventListener("click", () => {
            fetchAdminData();
            fetchAdminVisuals();
        });
    }

    // Download Listener
    const exportBtn = document.getElementById("exportBtn");
    if (exportBtn) {
        exportBtn.addEventListener("click", () => {
            window.location.href = `${API_BASE}/admin/export`;
        });
    }
}


async function fetchAdminData() {
    try {
        const lastUpdated = document.getElementById("lastUpdated");
        if (lastUpdated) lastUpdated.textContent = "Sync pending...";

        const filterStr = document.getElementById("sentimentFilter").value;
        const token = currentUser ? await currentUser.getIdToken() : '';
        const res = await fetch(`${API_BASE}/admin/stats?skip=${currentPage * PAGE_SIZE}&limit=${PAGE_SIZE}&sentiment=${filterStr}`, {
            headers: {
                "Authorization": `Bearer ${token}`
            }
        });
        if (!res.ok) throw new Error("Failed to fetch admin data.");

        const data = await res.json();
        const summary = data.summary;

        // Update Top Stats
        document.getElementById("statTotal").textContent = summary.total_queries;
        document.getElementById("statPositive").textContent = summary.total_positive;
        document.getElementById("statNegative").textContent = summary.total_negative;
        document.getElementById("statNeutral").textContent = summary.total_neutral;

        // Update Table
        const tbody = document.getElementById("adminTableBody");
        const emptyState = document.getElementById("tableEmptyState");

        if (!tbody || !emptyState) return;

        tbody.innerHTML = "";

        if (data.all_queries.length === 0) {
            emptyState.classList.remove("hidden");
            document.querySelector("table").classList.add("hidden");
        } else {
            emptyState.classList.add("hidden");
            document.querySelector("table").classList.remove("hidden");

            data.all_queries.forEach(q => {
                const tr = document.createElement("tr");
                tr.className = "transition-colors group hover:bg-[#1a1a1a]";

                let dotClass = "bg-gray-500 text-gray-400";
                if (q.sentiment === "Positive") dotClass = "bg-[#064e3b] text-emerald-400 border border-emerald-900";
                else if (q.sentiment === "Negative") dotClass = "bg-rose-900/30 text-rose-400 border border-rose-900/50";

                tr.innerHTML = `
                    <td class="px-6 py-4 text-gray-500 font-mono text-xs">#${String(q.id).padStart(4, '0')}</td>
                    <td class="px-6 py-4">
                        <div class="max-w-md truncate font-medium text-gray-300" title="${q.text}">${q.text}</div>
                    </td>
                    <td class="px-6 py-4">
                        <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${dotClass}">
                            ${q.sentiment}
                        </span>
                    </td>
                    <td class="px-6 py-4">
                        <div class="flex items-center gap-2 max-w-[120px]">
                            <div class="flex-1 bg-[#262626] rounded-full h-1.5 border border-[#333]">
                                <div class="h-1.5 rounded-full bg-gray-400" style="width: ${Math.round(q.confidence * 100)}%"></div>
                            </div>
                            <span class="text-xs font-semibold text-gray-400">${Math.round(q.confidence * 100)}%</span>
                        </div>
                    </td>
                    <td class="px-6 py-4 text-gray-500 text-sm">${new Date(q.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                `;
                tbody.appendChild(tr);
            });
        }

        // Update Pagination Info
        const totalMatching = data.filtered_total;
        const startIdx = totalMatching === 0 ? 0 : (currentPage * PAGE_SIZE) + 1;
        const endIdx = Math.min((currentPage + 1) * PAGE_SIZE, totalMatching);

        document.getElementById("pageInfo").textContent = `Showing ${startIdx} to ${endIdx} of ${totalMatching}`;
        document.getElementById("prevBtn").disabled = currentPage === 0;
        document.getElementById("nextBtn").disabled = endIdx >= totalMatching;

        if (lastUpdated) lastUpdated.textContent = `Synced ${new Date().toLocaleTimeString()}`;

    } catch (err) {
        console.error(err);
        const lastUpdated = document.getElementById("lastUpdated");
        if (lastUpdated) lastUpdated.textContent = "Data sync failed.";
    }
}


async function fetchAdminVisuals() {
    try {
        // --- 1. Fetch Trend Data for Chart.js ---
        const token = currentUser ? await currentUser.getIdToken() : '';
        const trendRes = await fetch(`${API_BASE}/admin/trends`, {
            headers: {
                "Authorization": `Bearer ${token}`
            }
        });
        if (trendRes.ok) {
            const trendData = await trendRes.json();

            const labels = Object.keys(trendData);
            const posData = labels.map(date => trendData[date].Positive || 0);
            const negData = labels.map(date => trendData[date].Negative || 0);

            const ctx = document.getElementById('trendChart');
            if (ctx) {
                if (adminChart) adminChart.destroy();

                // Set Chart.js Defaults for Dark Mode
                Chart.defaults.color = '#a3a3a3';
                Chart.defaults.borderColor = '#262626';

                adminChart = new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: labels.length > 0 ? labels : ['No Data'],
                        datasets: [
                            {
                                label: 'Positive',
                                data: posData.length > 0 ? posData : [0],
                                borderColor: '#34d399', // emerald-400
                                backgroundColor: 'rgba(52, 211, 153, 0.1)',
                                tension: 0.4,
                                fill: true
                            },
                            {
                                label: 'Negative',
                                data: negData.length > 0 ? negData : [0],
                                borderColor: '#fb7185', // rose-400
                                backgroundColor: 'rgba(251, 113, 133, 0.1)',
                                tension: 0.4,
                                fill: true
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        interaction: {
                            mode: 'index',
                            intersect: false,
                        },
                        scales: {
                            y: { min: 0 }
                        },
                        plugins: {
                            legend: {
                                position: 'top',
                            }
                        }
                    }
                });
            }
        }

        // --- 2. Fetch Word Frequencies for WordCloud ---
        const wordRes = await fetch(`${API_BASE}/admin/word-frequencies`, {
            headers: {
                "Authorization": `Bearer ${token}` // token is already defined in this scope
            }
        });
        if (wordRes.ok) {
            const wordFreqs = await wordRes.json();
            const canvas = document.getElementById('wordCloudCanvas');
            const emptyText = document.getElementById('cloudEmpty');

            if (canvas) {
                if (wordFreqs.length === 0) {
                    emptyText.classList.remove('hidden');
                } else {
                    emptyText.classList.add('hidden');
                    // Format for WordCloud: [word, weight, sentiment]
                    const list = wordFreqs.map(w => [w.text, w.weight * 15, w.sentiment]); // multiplier for visual sizing

                    WordCloud(canvas, {
                        list: list,
                        gridSize: 8,
                        weightFactor: 1,
                        fontFamily: 'Inter, sans-serif',
                        color: function (word, weight, fontSize, distance, theta) {
                            // Find sentiment to assign color in callback (inefficient but works for small lists)
                            const item = wordFreqs.find(i => i.text === word);
                            if (item && item.sentiment === "Positive") return '#4ade80'; // emerald-400 ish
                            if (item && item.sentiment === "Negative") return '#fb7185'; // rose-400 ish
                            return '#a3a3a3';
                        },
                        backgroundColor: '#0c0c0c',
                        shrinkToFit: true,
                        drawOutOfBound: false
                    });
                }
            }
        }

    } catch (err) {
        console.error("Failed to load visuals", err);
    }
}
