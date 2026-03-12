// app_v2.js - FOF HUD
document.addEventListener('DOMContentLoaded', () => {

    const API_URL = 'https://script.google.com/macros/s/AKfycbxEwlrKIZNgIb-4WEBPeaz35ekVvRuL8HRAplehgssnKKg6XG0-t9zze62TOgBZK2Q/exec';

    // --- STATE MANAGEMENT ---
    let state = {
        currentView: 'dashboard',
        supply: 12000,
        maxSupply: 20000, // Updated per user request
        isShiftActive: false,
        startTime: null,
        slName: 'Non identifié',
        personnel: 0,
        medics: 0,
        fleet: [],
        movements: {}, // { unitKey: { ...props } }
        isSyncing: false,
        lastSync: null
    };

    // Load local settings
    const saved = JSON.parse(localStorage.getItem('fof_logi_settings'));
    if (saved) {
        state.slName = saved.slName || 'Non identifié';
        state.personnel = saved.personnel || 0;
        state.medics = saved.medics || 0;
    }

    // --- NAVIGATION ---
    window.changeView = (viewId) => {
        state.currentView = viewId;

        // Update Nav Menu styling
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.classList.remove('text-cyan-400', 'border-b-2', 'border-cyan-400');
            btn.classList.add('text-slate-500');
        });

        // Map viewId to button indices or IDs
        const viewMap = { 'dashboard': 0, 'operations': 1, 'fleet': 2, 'service': 3 };
        const buttons = document.querySelectorAll('.nav-btn');
        if (buttons[viewMap[viewId]]) {
            buttons[viewMap[viewId]].classList.add('text-cyan-400', 'border-b-2', 'border-cyan-400');
            buttons[viewMap[viewId]].classList.remove('text-slate-500');
        }

        render();
    };

    // --- DATA FETCHING ---
    window.init = (isSilent = false) => {
        if (!isSilent) state.isSyncing = true;
        const syncBtn = document.getElementById('sync-btn');
        if (syncBtn) syncBtn.classList.add('animate-spin');

        fetch(`${API_URL}?action=get_data`)
            .then(res => res.json())
            .then(response => {
                state.isSyncing = false;
                if (syncBtn) syncBtn.classList.remove('animate-spin');

                if (response.status === 'success') {
                    state.lastSync = new Date();

                    // Fleet logic
                    state.fleet = response.data
                        .filter(v => v.id >= 9 && v.name !== "Type de véhicule")
                        .map(v => ({
                            id: v.id,
                            grade: v.grade || '2CL',
                            cat: v.category,
                            type: v.name,
                            cost: parseInt(v.cost) || 0,
                            count: parseInt(v.deployed) || 0,
                            inMission: parseInt(v.inMission) || 0,
                            status: v.status || 'En Base',
                            crew: v.crew || v.note || '',
                            destroyed: parseInt(v.destroyed) || 0,
                            color: getCategoryColor(v.category)
                        }));

                    // Globals logic
                    if (response.globals) {
                        state.supply = response.globals.supply;
                        state.personnel = response.globals.personnel;
                        state.medics = response.globals.medics;
                        state.slName = response.globals.slName || 'Non identifié';

                        const slUpper = state.slName.toUpperCase();
                        const isOnline = state.slName !== 'Non identifié' &&
                            state.slName !== '' &&
                            slUpper !== 'OFF' &&
                            slUpper !== 'OFFLINE' &&
                            !response.globals.shiftEndTime;
                        state.isShiftActive = isOnline;

                        if (isOnline && response.globals.shiftStartTime) {
                            // Ensure we have a valid ISO string or parseable format
                            const startTime = new Date(response.globals.shiftStartTime);
                            if (!isNaN(startTime.getTime())) {
                                state.startTime = startTime;
                            } else {
                                state.startTime = null;
                            }
                        } else {
                            state.startTime = null;
                        }
                    }

                    // Movements logic
                    if (response.movements) {
                        state.movements = {}; // Reset local movements for fresh sync
                        Object.keys(response.movements).forEach(indicatif => {
                            const m = response.movements[indicatif];
                            // Version robuste du mapping (insensible à la casse et aux espaces)
                            const v = state.fleet.find(f => 
                                f.type.trim().toUpperCase() === m.vehicleType.trim().toUpperCase()
                            );
                            if (v) {
                                // Extract index from indicatif (e.g., "AMB-1" -> index 0)
                                const match = m.indicatif.match(/-(\d+)$/);
                                const unitIndex = match ? parseInt(match[1]) - 1 : 0;
                                const key = `${v.id}_${unitIndex}`;
                                state.movements[key] = { ...m, isLogged: true };
                            }
                        });
                    }

                    render();
                }
            })
            .catch(err => {
                console.error("Tactical HUD Sync Error", err);
                state.isSyncing = false;
                if (syncBtn) syncBtn.classList.remove('animate-spin');
            });

        if (!window.timerStarted) {
            startClock();
            startSessionTimer();
            window.timerStarted = true;
        }
    };

    function getCategoryColor(cat) {
        if (!cat) return '#00f2ff';
        const c = cat.toUpperCase();
        if (c.includes('TRANSPORT')) return '#facc15'; // Jaune
        if (c.includes('MAINTENANCE')) return '#ef4444'; // Rouge
        if (c.includes('AÉRIEN')) return '#2563eb'; // Bleu
        return '#00f2ff'; // Cyan par défaut
    }

    // --- RENDERERS ---
    window.render = () => {
        const container = document.getElementById('main-content');
        if (!container) return;

        updateHeaderStats();

        if (state.currentView === 'dashboard') renderDashboard();
        else if (state.currentView === 'operations') renderOperationsView();
        else if (state.currentView === 'fleet') renderFleetCatalogue();
        else if (state.currentView === 'service') renderServiceControl();

        lucide.createIcons();
    };

    function updateHeaderStats() {
        // Real-time Clock
        const clock = document.getElementById('real-time-clock');
        if (clock) {
            const now = new Date();
            clock.innerText = now.toLocaleTimeString('fr-FR');
        }

        // Shift Duration Timer
        const durationContainer = document.getElementById('shift-duration-container');
        const durationTimer = document.getElementById('shift-duration-timer');

        if (state.isShiftActive && state.startTime && durationContainer && durationTimer) {
            durationContainer.classList.remove('hidden');
            // Logic moved to startClock for second-by-second precision
        } else if (durationContainer) {
            durationContainer.classList.add('hidden');
        }

        function updateStatusBadge() {
            const badge = document.getElementById('sl-status-badge');
            const text = document.getElementById('sl-status-text');
            if (!badge || !text) return;

            if (state.isShiftActive) {
                badge.className = "px-1.5 py-0.5 lg:px-2 lg:py-1 rounded border border-cyan-500/40 bg-cyan-500/10 text-[7px] lg:text-[10px] font-black uppercase tracking-widest flex items-center gap-1 opacity-100";
                badge.innerHTML = `<div class="w-1 h-1 lg:w-1.5 lg:h-1.5 rounded-full bg-cyan-400 animate-pulse"></div><span id="sl-status-text">EN SERVICE : ${state.slName}</span>`;
            } else {
                badge.className = "px-1.5 py-0.5 lg:px-2 lg:py-1 rounded border border-red-500/40 bg-red-500/10 text-[7px] lg:text-[10px] font-black uppercase tracking-widest flex items-center gap-1 opacity-100 text-red-500";
                badge.innerHTML = `<div class="w-1 h-1 lg:w-1.5 lg:h-1.5 rounded-full bg-red-500"></div><span id="sl-status-text">OFFLINE</span>`;
            }
        }
        updateStatusBadge();
        // Sync Info (Hidden on mobile footer, just in state now)
        const syncEl = document.getElementById('last-sync');
        if (syncEl && state.lastSync) {
            syncEl.innerText = `MAJ: ${state.lastSync.toLocaleTimeString('fr-FR')}`;
        }
    }

    function renderDashboard() {
        const content = document.getElementById('main-content');
        content.innerHTML = `
            <div id="dashboard-view" class="h-full flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div class="grid grid-cols-1 lg:grid-cols-3 gap-2 xl:gap-4 h-full min-h-0 flex-1">
                    <!-- PANEL 1: ENLARGED STATS -->
                    <section class="hud-panel p-2 xl:p-4 border border-cyan-500/40 rounded bg-black/60 flex flex-col h-full overflow-hidden">
                        <div class="flex flex-col gap-2 xl:gap-3 justify-around h-full">
                            <!-- CIRCULAR SUPPLY GAUGE -->
                            <div onclick="updateBaseStat('supply', ${state.supply})" class="bg-slate-900/40 border border-blue-500/30 p-2 xl:p-4 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:bg-blue-500/10 active:scale-95 transition-all flex-1 min-h-0 relative">
                                <span class="text-[8px] xl:text-[10px] text-blue-300 font-black uppercase tracking-widest leading-none mb-1">Réserve Supply</span>
                                <div class="flex-1 flex items-center justify-center min-h-0 w-full mb-4">
                                    <div class="circle-gauge scale-[0.65] lg:scale-90 xl:scale-110 transition-transform">
                                        <svg viewBox="0 0 100 100">
                                            <circle class="bg" cx="50" cy="50" r="42"></circle>
                                            <circle class="progress" cx="50" cy="50" r="42" 
                                                style="stroke-dasharray: 264; stroke-dashoffset: ${264 - (264 * Math.min(1, state.supply / state.maxSupply))}">
                                            </circle>
                                        </svg>
                                        <div class="gauge-value-container">
                                            <span class="text-sm xl:text-lg font-black font-orbitron text-blue-400 leading-none">
                                                ${Math.round((state.supply / state.maxSupply) * 100)}<span class="text-[0.7em] ml-0.5">%</span>
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <div class="absolute bottom-2 left-0 right-0 flex justify-center">
                                    <span class="text-[10px] xl:text-lg font-black font-orbitron text-white leading-none whitespace-nowrap">${state.supply} / 20k</span>
                                </div>
                            </div>

                            <!-- SECONDARY STATS (Side-by-side on mobile) -->
                            <div class="grid grid-cols-3 lg:flex lg:flex-col gap-2 flex-none">
                                <div onclick="updateBaseStat('personnel', ${state.personnel})" class="stat-card-adaptive bg-slate-900/40 border border-green-500/30 p-2 xl:p-4 rounded-lg flex flex-col lg:flex-row items-center lg:justify-between cursor-pointer hover:bg-green-500/10 active:scale-95 transition-all text-center lg:text-left min-h-0">
                                    <div class="flex flex-col">
                                        <span class="text-[6px] xl:text-[10px] text-green-300 font-black uppercase tracking-widest leading-none mb-1">Effectifs</span>
                                        <span class="text-sm xl:text-2xl font-black font-orbitron text-green-400 leading-none">${state.personnel}</span>
                                    </div>
                                    <i data-lucide="users" class="hidden lg:block w-4 h-4 xl:w-8 xl:h-8 text-green-500 opacity-40"></i>
                                </div>

                                <div onclick="updateBaseStat('medics', ${state.medics})" class="stat-card-adaptive bg-slate-900/40 border border-pink-500/30 p-2 xl:p-4 rounded-lg flex flex-col lg:flex-row items-center lg:justify-between cursor-pointer hover:bg-pink-500/10 active:scale-95 transition-all text-center lg:text-left min-h-0">
                                    <div class="flex flex-col">
                                        <span class="text-[6px] xl:text-[10px] text-pink-300 font-black uppercase tracking-widest leading-none mb-1">V2 / EVS</span>
                                        <span class="text-sm xl:text-2xl font-black font-orbitron text-pink-500 leading-none">${state.medics}</span>
                                    </div>
                                    <i data-lucide="cross" class="hidden lg:block w-4 h-4 xl:w-8 xl:h-8 text-pink-500 opacity-40"></i>
                                </div>

                                <div class="stat-card-adaptive bg-slate-900/40 border border-cyan-500/40 p-2 xl:p-4 rounded-lg flex flex-col lg:flex-row items-center lg:justify-between flex-none text-center lg:text-left min-h-0">
                                    <div class="flex flex-col">
                                        <span class="text-[6px] xl:text-[10px] text-cyan-300 font-black uppercase tracking-widest leading-none mb-1">Missions</span>
                                        <span class="text-sm xl:text-2xl font-black font-orbitron text-cyan-400 leading-none">${Object.values(state.movements).filter(m => m.status === 'En cours').length}</span>
                                    </div>
                                    <i data-lucide="radio" class="hidden lg:block w-4 h-4 xl:w-8 xl:h-8 text-cyan-500 opacity-40 animate-pulse"></i>
                                </div>
                            </div>
                        </div>
                    </section>

                    <!-- PANEL 2: SUIVI DES MISSIONS ACTIVES -->
                    <section class="hud-panel h-full p-4 xl:p-5 border border-cyan-500/40 rounded bg-black/40 overflow-hidden flex flex-col h-full">
                        <h2 class="text-[10px] xl:text-xs font-black uppercase tracking-widest mb-4 flex items-center gap-2 text-white border-b border-cyan-500/20 pb-2">
                            <i data-lucide="shield" class="w-4 h-4 text-amber-500"></i>
                            Suivi des Missions
                        </h2>
                        <div id="active-missions-list" class="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar min-h-0">
                           <div class="flex flex-col items-center justify-center h-full opacity-20 italic text-[10px] uppercase font-black tracking-[0.2em]">Initialisation des flux...</div>
                        </div>
                    </section>
                    
                    <!-- PANEL 3: DEPLOYED UNITS (HIDDEN ON MOBILE DASHBOARD, VISIBLE ON LARGE) -->
                    <section class="hidden lg:flex hud-panel h-full p-4 xl:p-5 border border-cyan-500/40 rounded bg-black/40 overflow-hidden flex-col h-full">
                        <h2 class="text-[10px] xl:text-xs font-black uppercase tracking-widest mb-4 flex items-center gap-2 text-white border-b border-cyan-500/20 pb-2">
                            <i data-lucide="truck" class="w-4 h-4 text-cyan-500"></i>
                            Unités Déployées
                        </h2>
                        <div id="fleet-grid-dash" class="flex-1 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-2 xl:gap-3 pr-2 custom-scrollbar min-h-0">
                           <!-- Deployed units here -->
                        </div>
                    </section>
                </div>
            </div>
        `;
        renderMissionsList();
        renderFleetGrid('fleet-grid-dash');
        updateQuickStats();
    }

    function renderOperationsView() {
        const content = document.getElementById('main-content');
        content.innerHTML = `
            <div id="operations-view" class="h-full flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <!-- FLEET MONITORING GRID -->
                <div class="flex-1 border border-cyan-500/40 rounded bg-black/40 p-5 overflow-hidden flex flex-col relative">
                    <h2 class="text-xs font-black uppercase tracking-widest mb-4 flex items-center justify-between text-white">
                        <div class="flex items-center gap-2">
                            <i data-lucide="truck" class="w-4 h-4"></i>
                            Unités Déployées & Surveillance
                        </div>
                        <div class="flex gap-4">
                            <div class="flex items-center gap-2 text-[9px] uppercase font-bold text-slate-500">
                                <span class="w-2 h-2 rounded-full bg-green-500"></span> Opérationnel
                            </div>
                           <div class="flex items-center gap-2 text-[9px] uppercase font-bold text-slate-500">
                                <span class="w-2 h-2 rounded-full bg-blue-500"></span> En Base
                            </div>
                        </div>
                    </h2>
                    <div id="fleet-grid" class="flex-1 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3 pr-2 custom-scrollbar">
                        <!-- Fleet categories/units injected here -->
                    </div>
                </div>
            </div>
        `;
        renderFleetGrid();
    }

    function updateQuickStats() {
        if (document.getElementById('dash-stat-supply')) {
            document.getElementById('dash-stat-supply').innerText = state.supply;
            document.getElementById('dash-stat-active').innerText = state.fleet.reduce((a, b) => a + (b.count || 0), 0);
            document.getElementById('dash-stat-personnel').innerText = state.personnel;
            document.getElementById('dash-stat-lost').innerText = state.fleet.reduce((a, b) => a + (b.destroyed || 0), 0);
            document.getElementById('dash-stat-medics').innerText = state.medics;
            document.getElementById('dash-stat-missions').innerText = Object.values(state.movements).filter(m => m.status === 'En cours').length;
        }
    }

    function renderMissionsList() {
        const listContainer = document.getElementById('active-missions-list');
        if (!listContainer) return;

        const activeMissions = Object.entries(state.movements).filter(([key, m]) => m.status === 'En cours');

        if (activeMissions.length === 0) {
            listContainer.innerHTML = `<div class="flex flex-col items-center justify-center h-full opacity-20 italic text-[10px] uppercase font-black tracking-[0.2em]">Aucun mouvement en cours</div>`;
            return;
        }

        listContainer.innerHTML = activeMissions.map(([unitKey, m]) => `
            <div onclick="openUnitModal('${unitKey}')" class="mission-alert-card p-3 border border-amber-500/10 rounded relative group cursor-pointer hover:border-cyan-500/30 transition-all">
                <div class="flex justify-between items-start mb-1">
                    <span class="text-[9px] font-black text-amber-500 uppercase tracking-widest">${m.indicatif}</span>
                    <span class="text-[8px] text-slate-500 font-bold uppercase">${m.vehicleType}</span>
                </div>
                <div class="text-[10px] font-bold text-white uppercase mb-1 line-clamp-1">${m.mission || 'PATROUILLE GÉNÉRALE'}</div>
                <div class="flex justify-between items-center text-[8px] text-slate-400">
                    <span>PILOTE: ${m.crew || 'N/A'}</span>
                    <div class="flex items-center gap-1 text-cyan-400">
                        <i data-lucide="target" class="w-2.5 h-2.5"></i>
                        ${m.condition || '100%'}
                    </div>
                </div>
            </div>
        `).join('');
        lucide.createIcons();
    }

    function renderFleetGrid(targetId = 'fleet-grid') {
        const container = document.getElementById(targetId);
        if (!container) return;

        const deployed = state.fleet.filter(v => v.count > 0);
        if (deployed.length === 0) {
            container.innerHTML = `<div class="col-span-full py-10 text-center opacity-20 uppercase font-black tracking-widest text-xs">Aucune unité sur le terrain</div>`;
            return;
        }

        container.innerHTML = deployed.map(v => {
            const inBase = v.count - v.inMission;
            const statusColor = v.inMission > 0 ? 'bg-green-500' : 'bg-blue-500';
            return `
                <div class="vehicle-card p-3 border border-cyan-500/20 rounded-xl flex flex-col gap-1 relative cursor-pointer active:scale-95 min-h-[70px] !overflow-visible" 
                     onclick="openUnitControl('${v.type}')">
                    <div class="flex justify-between items-center mb-1">
                        <span class="text-[8px] font-black text-slate-500 uppercase truncate max-w-[40%]">${v.type}</span>
                        <span class="text-[7px] font-bold uppercase text-cyan-400/40 tracking-tighter">M: ${v.inMission} / B: ${inBase}</span>
                        <div class="w-1.5 h-1.5 rounded-full ${statusColor} shadow-[0_0_6px_currentColor]"></div>
                    </div>
                    
                    <div class="flex-1 flex items-center justify-end">
                         <span class="font-orbitron text-lg font-black text-white opacity-90">x${v.count}</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    window.openUnitControl = (type) => {
        const v = state.fleet.find(x => x.type === type);
        if (!v) return;

        const movementKeys = Object.keys(state.movements).filter(k => k.startsWith(v.id + "_"));
        const indicesSet = new Set(movementKeys.map(k => parseInt(k.split("_")[1])));
        for (let i = 0; indicesSet.size < v.count; i++) {
            indicesSet.add(i);
        }
        const sortedIndices = Array.from(indicesSet).sort((a, b) => a - b);

        let activeLogCount = sortedIndices.filter(idx => {
            const mk = v.id + "_" + idx;
            return state.movements[mk] && state.movements[mk].isLogged;
        }).length;

        let missingMissions = Math.max(0, v.inMission - activeLogCount);

        if (missingMissions > 0) {
            sortedIndices.forEach(idx => {
                const mk = v.id + "_" + idx;
                if (missingMissions > 0 && !(state.movements[mk] && state.movements[mk].isLogged)) {
                    if (!state.movements[mk]) {
                        state.movements[mk] = {
                            indicatif: v.type.split(" ")[0] + "-" + (idx + 1),
                            crew: v.crew || "",
                            mission: "MOUVEMENT DETECTE (RECONCILIATION)",
                            status: "En cours",
                            condition: "Operationnel",
                            remark: ""
                        };
                    }
                    state.movements[mk].isLogged = true;
                    state.movements[mk].status = "En cours";
                    missingMissions--;
                }
            });
        }

        if (sortedIndices.length === 1) {
            openUnitModal(v.id + "_" + sortedIndices[0]);
        } else {
            const overlay = document.getElementById("modal-overlay");
            const content = document.getElementById("modal-content");

            let buttonsHtml = sortedIndices.map((idx) => {
                const unitKey = v.id + "_" + idx;
                const m = state.movements[unitKey];
                const isMission = (m && m.status === "En cours");
                const indicatif = (m && m.indicatif) || (v.type.split(" ")[0] + "-" + (idx + 1));
                const mission = (m && m.mission) || "RAS";
                const statusText = isMission ? "EN MISSION" : "EN BASE";
                const statusClass = isMission ? "text-green-500" : "text-blue-500";
                
                return `
                    <button onclick="openUnitModal('${unitKey}')" title="Gerer l'unite ${idx + 1}"
                            class="p-4 bg-black/40 border border-cyan-500/10 rounded-lg flex justify-between items-center hover:border-cyan-500/40 hover:bg-cyan-500/5 transition-all group">
                        <div class="flex flex-col items-start">
                            <span class="text-[10px] font-black text-white uppercase group-hover:text-cyan-400">UNITE ${idx + 1}</span>
                            <span class="text-[8px] text-slate-500 uppercase font-bold">${indicatif}</span>
                        </div>
                        <div class="flex items-center gap-3">
                            <div class="flex flex-col items-end">
                                <span class="text-[8px] font-black ${statusClass} uppercase">${statusText}</span>
                                <span class="text-[7px] text-slate-600 font-bold">${mission}</span>
                            </div>
                            <i data-lucide="chevron-right" class="w-4 h-4 text-slate-700 group-hover:text-cyan-400"></i>
                        </div>
                    </button>
                `;
            }).join("");

            content.innerHTML = `
                <div class="p-6">
                    <div class="flex justify-between items-start mb-6">
                        <div>
                            <div class="text-[9px] text-cyan-500 font-black uppercase tracking-[0.2em] mb-1">Selection d'Unite</div>
                            <h3 class="text-xl font-black text-white uppercase font-orbitron">${v.type} <span class="text-cyan-400 opacity-50 text-sm">x${v.count}</span></h3>
                        </div>
                        <button onclick="closeModal()" title="Fermer" class="text-slate-500 hover:text-white transition-all">
                            <i data-lucide="x" class="w-5 h-5"></i>
                        </button>
                    </div>
                    <div class="grid grid-cols-1 gap-2 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                        ${buttonsHtml}
                    </div>
                </div>
            `;

            overlay.classList.remove("hidden");
            overlay.classList.add("flex");
            lucide.createIcons();
        }
    };

    function renderFleetCatalogue() {
        const container = document.getElementById('main-content');
        container.innerHTML = `
            <div class="h-full flex flex-col animate-in fade-in zoom-in duration-300">
                <div class="mb-3 flex justify-between items-center border-b border-cyan-500/10 pb-2">
                    <h2 class="text-[10px] lg:text-sm font-black uppercase tracking-widest text-cyan-400">Catalogue de Déploiement</h2>
                    <span class="text-[8px] lg:text-[10px] text-slate-500 uppercase">${state.fleet.length} MODÈLES</span>
                </div>
                <div class="flex-1 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 lg:gap-4 p-1 custom-scrollbar">
                    ${state.fleet.map(v => `
                        <div onclick="deployVehicle(${v.id})" class="hud-panel p-3 lg:p-4 border border-cyan-500/20 rounded-xl cursor-pointer group hover:border-cyan-400 transition-all flex flex-col gap-2 min-h-[90px] lg:min-h-[100px] !overflow-visible shadow-lg">
                            <div class="flex justify-between items-start">
                                <div class="flex flex-col gap-0.5 lg:gap-1">
                                    <span class="text-[8px] lg:text-[9px] px-1.5 py-0.5 border border-cyan-500/30 text-cyan-500 rounded uppercase font-black bg-black/40 w-fit">${v.grade}</span>
                                    <span class="text-[6px] lg:text-[7px] font-black text-slate-500 uppercase opacity-60 tracking-wider">${v.cat}</span>
                                </div>
                                <div class="flex flex-col items-end gap-1">
                                    <span class="text-[8px] lg:text-[10px] font-black font-orbitron text-cyan-400 shadow-[0_0_10px_rgba(0,242,255,0.2)] whitespace-nowrap">${v.cost} <span class="text-[0.8em]">PTS</span></span>
                                    <span class="text-[7px] lg:text-[8px] font-black text-white/40">${v.count > 0 ? `ACTIF: x${v.count}` : ''}</span>
                                </div>
                            </div>
                            
                            <div class="flex-1 flex items-center justify-center text-center">
                                <h3 class="font-black text-[10px] lg:text-sm text-white uppercase leading-tight group-hover:text-cyan-400 tracking-tight break-words w-full font-orbitron">${v.type}</h3>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    function renderServiceControl() {
        const content = document.getElementById('main-content');
        content.innerHTML = `
            <div id="service-view" class="h-full animate-in fade-in slide-in-from-bottom-4 duration-500 flex flex-col items-center justify-center p-4">
                <div class="w-full max-w-xl">
                    <section class="hud-panel p-8 border border-cyan-500/40 rounded-xl bg-black/60 flex flex-col items-center justify-center text-center space-y-6 shadow-[0_0_50px_rgba(0,242,255,0.05)]">
                        <div class="w-20 h-20 rounded-full border-2 border-cyan-500/30 flex items-center justify-center bg-cyan-500/5 shadow-[0_0_20px_rgba(0,242,255,0.1)]">
                            <i data-lucide="shield-check" class="w-10 h-10 text-cyan-400 ${state.isShiftActive ? 'status-blink' : ''}"></i>
                        </div>
                        
                        <div class="space-y-2">
                            <h2 class="text-xl font-black uppercase tracking-[0.2em] text-white">Opérateur en Service</h2>
                            <p class="text-[10px] text-slate-500 uppercase font-black tracking-widest">Contrôle Tactique de la Base FOF</p>
                        </div>

                        <div class="w-full max-w-xs space-y-4">
                            <div class="space-y-1 text-left">
                                <label class="text-[9px] uppercase font-black text-cyan-400/70 tracking-tighter">Identifiant Opérateur</label>
                                <input type="text" id="sl-name-input" value="${state.slName === 'Non identifié' ? '' : state.slName}" 
                                    class="w-full bg-slate-900/60 border border-cyan-500/30 rounded p-3 text-white font-orbitron text-sm focus:border-cyan-400 focus:outline-none transition-all uppercase"
                                    ${state.isShiftActive ? 'disabled' : ''}
                                    placeholder="ENTREZ VOTRE NOM">
                            </div>
                            
                            <button id="shift-toggle-btn" 
                                onclick="toggleShift()" 
                                class="w-full ${state.isShiftActive ? 'bg-red-500/20 border-red-500/50 hover:bg-red-500/30 text-red-400' : 'bg-cyan-500/20 border-cyan-500/50 hover:bg-cyan-500/30 text-cyan-400'} border p-4 rounded uppercase font-black tracking-widest text-xs transition-all flex items-center justify-center gap-3">
                                <i data-lucide="${state.isShiftActive ? 'power-off' : 'power'}" class="w-4 h-4"></i>
                                ${state.isShiftActive ? 'Déconnexion Système' : 'Initialiser Connexion'}
                            </button>
                        </div>
                        
                        ${state.isShiftActive ? `
                            <div class="pt-4 border-t border-cyan-500/20 w-full">
                                <span class="text-[9px] text-slate-500 uppercase font-bold mb-2 block">Durée de la session</span>
                                <div id="shift-timer" class="text-2xl font-black font-orbitron text-cyan-400">00:00:00</div>
                            </div>
                        ` : ''}
                    </section>
                </div>
            </div>
        `;
        lucide.createIcons();
    }

    // --- UTILITIES ---
    window.toggleMobileMenu = () => {
        const menu = document.getElementById('mobile-menu-overlay');
        if (!menu) return;

        if (menu.classList.contains('menu-closed')) {
            menu.classList.remove('menu-closed');
            menu.classList.add('menu-open');
        } else {
            menu.classList.add('menu-closed');
            menu.classList.remove('menu-open');
        }
    };

    function startClock() {
        setInterval(() => {
            const now = new Date();

            // Real-time Clock
            const clock = document.getElementById('real-time-clock');
            if (clock) {
                clock.innerText = now.toLocaleTimeString('fr-FR');
            }

            // Header Shift Duration
            const durationTimer = document.getElementById('shift-duration-timer');
            if (state.isShiftActive && state.startTime && durationTimer) {
                const diff = Math.max(0, now - state.startTime);
                const h = Math.floor(diff / 3600000).toString().padStart(2, '0');
                const m = Math.floor((diff % 3600000) / 60000).toString().padStart(2, '0');
                const s = Math.floor((diff % 60000) / 1000).toString().padStart(2, '0');
                durationTimer.innerText = `${h}:${m}:${s}`;
            }
        }, 1000);
    }

    function startSessionTimer() {
        setInterval(() => {
            const timerEl = document.getElementById('shift-timer');
            if (state.isShiftActive && state.startTime && timerEl) {
                const diff = Math.max(0, new Date() - state.startTime);
                const h = Math.floor(diff / 3600000).toString().padStart(2, '0');
                const m = Math.floor((diff % 3600000) / 60000).toString().padStart(2, '0');
                const s = Math.floor((diff % 60000) / 1000).toString().padStart(2, '0');
                timerEl.innerText = `SESSION: ${h}:${m}:${s}`;
            } else if (timerEl) {
                timerEl.innerText = "SESSION: 00:00:00";
            }
        }, 1000);
    }

    // Reuse the existing CORE ACTIONS (deployVehicle, syncMovement, etc.)
    // I will port them exactly as they are but with UI updates

    window.openUnitModal = (unitKey) => {
        const vid = parseInt(unitKey.split('_')[0]);
        const index = parseInt(unitKey.split('_')[1]);
        const v = state.fleet.find(x => x.id === vid);
        if (!v) return;

        if (!state.movements[unitKey]) {
            state.movements[unitKey] = {
                indicatif: `${v.type.split(' ')[0]}-${index + 1}`,
                crew: v.crew || '',
                mission: '',
                status: 'En cours',
                condition: 'Opérationnel',
                remark: ''
            };
        }
        const m = state.movements[unitKey];

        const overlay = document.getElementById('modal-overlay');
        const content = document.getElementById('modal-content');

        content.innerHTML = `
            <div class="p-6 relative">
                <div class="absolute top-0 right-0 p-4">
                    <button onclick="closeModal()" title="Fermer" class="text-slate-500 hover:text-white transition-all">
                        <i data-lucide="x" class="w-5 h-5"></i>
                    </button>
                </div>

                <div class="mb-6">
                    <div class="text-[9px] text-cyan-500 font-black uppercase tracking-[0.2em] mb-1">Unité Tactique</div>
                    <h3 class="text-2xl font-black text-white uppercase font-orbitron">${v.type} <span class="text-cyan-400 opacity-50 text-sm">V.${index + 1}</span></h3>
                </div>

                <div class="grid grid-cols-2 gap-4 mb-4">
                    <div class="bg-black/40 border border-cyan-500/20 p-3 rounded">
                        <label class="text-[8px] text-slate-500 font-black uppercase block mb-1">Identifiant Radio</label>
                        <input type="text" value="${m.indicatif}" oninput="updateMovementField('${unitKey}', 'indicatif', this.value)"
                               class="bg-transparent text-white font-bold w-full outline-none border-b border-transparent focus:border-cyan-500 transition-all text-sm uppercase">
                    </div>
                    <div class="bg-black/40 border border-cyan-500/20 p-3 rounded">
                        <label class="text-[8px] text-slate-500 font-black uppercase block mb-1">Équipage Assigné</label>
                        <input type="text" value="${m.crew || ''}" oninput="updateMovementField('${unitKey}', 'crew', this.value)"
                               class="bg-transparent text-cyan-400 font-bold w-full outline-none border-b border-transparent focus:border-cyan-500 transition-all text-sm uppercase">
                    </div>
                </div>

                <div class="bg-black/40 border border-cyan-500/20 p-3 rounded mb-4">
                    <label class="text-[8px] text-slate-500 font-black uppercase block mb-1">Mission / Secteur d'Opérations</label>
                    <input type="text" value="${m.mission}" placeholder="Entrez les ordres de mission..."
                           oninput="updateMovementField('${unitKey}', 'mission', this.value)"
                           class="bg-transparent text-white font-bold w-full outline-none border-b border-transparent focus:border-cyan-500 transition-all text-sm uppercase">
                </div>

                <div class="mb-4">
                    <label class="text-[8px] text-slate-500 font-black uppercase block mb-2">État du Matériel</label>
                    <div class="grid grid-cols-3 gap-2">
                        ${['Opérationnel', 'En Réparation', 'HS'].map(c => `
                            <button onclick="updateMovementField('${unitKey}', 'condition', '${c}'); openUnitModal('${unitKey}')" 
                                    class="py-2.5 rounded border text-[9px] font-black uppercase transition-all ${m.condition === c ? (c === 'HS' ? 'bg-red-600 border-red-400 text-white shadow-[0_0_15px_rgba(239,68,68,0.3)]' : 'bg-cyan-600 border-cyan-400 text-white shadow-[0_0_15px_rgba(0,242,255,0.3)]') : 'bg-black/40 border-cyan-500/10 text-slate-500 hover:border-cyan-500/30'}">
                                ${c === 'Opérationnel' ? 'OPR' : c === 'En Réparation' ? 'RÉPA' : 'HS'}
                            </button>
                        `).join('')}
                    </div>
                </div>

                <div class="bg-black/40 border border-cyan-500/20 p-3 rounded mb-6">
                    <label class="text-[8px] text-slate-500 font-black uppercase block mb-1">Notes de Commandement</label>
                    <textarea oninput="updateMovementField('${unitKey}', 'remark', this.value)"
                              placeholder="Notes additionnelles..."
                              class="bg-transparent text-white font-bold w-full outline-none text-[10px] min-h-[50px] resize-none uppercase">${m.remark || ''}</textarea>
                </div>

                <div class="flex flex-col gap-3">
                    <button onclick="syncMovement('${unitKey}')" title="Transmettre les ordres au serveur"
                            class="w-full py-4 bg-cyan-600 border border-cyan-400 text-white font-black uppercase tracking-widest text-[10px] rounded hover:bg-cyan-500 transition-all shadow-[0_0_20px_rgba(0,242,255,0.1)] active:scale-95">
                        Transmettre les Ordres
                    </button>
                    
                    <div class="flex gap-3">
                        ${m.isLogged ? `
                            <button onclick="finishMission('${unitKey}')" title="Clôturer la mission"
                                    class="flex-1 py-3 bg-red-600/20 border border-red-500/40 text-red-500 font-black uppercase tracking-widest text-[10px] rounded hover:bg-red-600 hover:text-white transition-all active:scale-95">
                                Finir la Mission
                            </button>
                        ` : ''}
                        <button onclick="undeployVehicle(${v.id}, '${unitKey}')" title="Ranger le véhicule au garage"
                                class="flex-1 py-3 bg-slate-800 border border-slate-700 text-slate-400 font-black uppercase tracking-widest text-[10px] rounded hover:bg-slate-700 hover:text-white transition-all active:scale-95">
                            Ranger au Garage
                        </button>
                    </div>
                </div>
            </div>
        `;

        overlay.classList.remove('hidden');
        overlay.classList.add('flex');
        lucide.createIcons();
    };

    window.closeModal = () => {
        document.getElementById('modal-overlay').classList.add('hidden');
        document.getElementById('modal-overlay').classList.remove('flex');
    };

    window.showTacticalConfirm = (title, message, onConfirm) => {
        const overlay = document.getElementById('modal-overlay');
        const content = document.getElementById('modal-content');

        content.innerHTML = `
            <div class="p-6 relative text-center">
                <div class="mb-6">
                    <div class="text-[9px] text-cyan-500 font-black uppercase tracking-[0.2em] mb-1">Confirmation Tactique</div>
                    <h3 class="text-xl font-black text-white uppercase font-orbitron">${title}</h3>
                </div>
                
                <p class="text-slate-400 font-bold text-sm mb-8 uppercase">${message}</p>
                
                <div class="flex gap-4">
                    <button id="modal-confirm-btn" class="flex-1 py-4 bg-cyan-600 border border-cyan-400 text-white font-black uppercase tracking-widest text-[10px] rounded hover:bg-cyan-500 transition-all shadow-[0_0_20px_rgba(0,242,255,0.1)] active:scale-95">
                        Confirmer
                    </button>
                    <button onclick="closeModal()" class="flex-1 py-4 bg-slate-800 border border-slate-700 text-slate-400 font-black uppercase tracking-widest text-[10px] rounded hover:bg-slate-700 hover:text-white transition-all active:scale-95">
                        Annuler
                    </button>
                </div>
            </div>
        `;

        document.getElementById('modal-confirm-btn').onclick = () => {
            onConfirm();
            closeModal();
        };

        overlay.classList.remove('hidden');
        overlay.classList.add('flex');
        lucide.createIcons();
    };

    window.showTacticalPrompt = (title, message, defaultValue, onConfirm) => {
        const overlay = document.getElementById('modal-overlay');
        const content = document.getElementById('modal-content');

        content.innerHTML = `
            <div class="p-6 relative text-center">
                <div class="mb-6">
                    <div class="text-[9px] text-cyan-500 font-black uppercase tracking-[0.2em] mb-1">Ajustement Système</div>
                    <h3 class="text-xl font-black text-white uppercase font-orbitron">${title}</h3>
                </div>
                
                <p class="text-slate-400 font-bold text-[9px] mb-4 uppercase">${message}</p>
                
                <div class="bg-black/40 border-2 border-cyan-500/20 p-4 rounded-xl mb-8">
                    <input type="text" id="modal-prompt-input" value="${defaultValue}" 
                           class="bg-transparent text-white font-black font-orbitron text-2xl w-full text-center outline-none border-b-2 border-transparent focus:border-cyan-500 transition-all uppercase">
                </div>
                
                <div class="flex gap-4">
                    <button id="modal-confirm-btn" class="flex-1 py-4 bg-cyan-600 border border-cyan-400 text-white font-black uppercase tracking-widest text-[10px] rounded hover:bg-cyan-500 transition-all shadow-[0_0_20px_rgba(0,242,255,0.1)] active:scale-95">
                        Valider
                    </button>
                    <button onclick="closeModal()" class="flex-1 py-4 bg-slate-800 border border-slate-700 text-slate-400 font-black uppercase tracking-widest text-[10px] rounded hover:bg-slate-700 hover:text-white transition-all active:scale-95">
                        Annuler
                    </button>
                </div>
            </div>
        `;

        const input = document.getElementById('modal-prompt-input');
        input.focus();
        input.select();

        document.getElementById('modal-confirm-btn').onclick = () => {
            onConfirm(input.value);
            closeModal();
        };

        overlay.classList.remove('hidden');
        overlay.classList.add('flex');
        lucide.createIcons();
    };

    window.updateMovementField = (id, field, value) => {
        if (state.movements[id]) {
            state.movements[id][field] = value;
        }
    };

    window.syncMovement = (unitKey) => {
        const vid = parseInt(unitKey.split('_')[0]);
        const v = state.fleet.find(x => x.id === vid);
        const m = state.movements[unitKey];
        if (!v || !m) return;

        // Visual feedback
        const btn = event.currentTarget;
        if (btn && btn.innerText) {
            btn.innerText = "TRANSMISSION...";
            btn.disabled = true;
        }

        const isNewMission = !m.isLogged;

        fetch(API_URL, {
            method: 'POST',
            mode: 'no-cors',
            body: JSON.stringify({
                action: 'log_equipage',
                data: {
                    vehicleType: v.type,
                    idIndicatif: m.indicatif,
                    crew: m.crew || v.crew || "Personnel",
                    mission: m.mission,
                    status: m.status,
                    condition: "'" + m.condition,
                    remark: m.remark || ""
                }
            })
        }).then(() => {
            m.isLogged = (m.status === 'En cours');
            
            // Sync mission count to the spreadsheet grid
            if (isNewMission && m.status === 'En cours') {
                v.inMission++;
            } else if (m.status === 'Terminé' || m.status.includes('Garage')) {
                v.inMission = Math.max(0, v.inMission - 1);
            }

            return fetch(API_URL, {
                method: 'POST',
                mode: 'no-cors',
                body: JSON.stringify({
                    action: 'update',
                    vehicle: {
                        id: v.id,
                        deployed: v.count,
                        inMission: v.inMission
                    }
                })
            });
        }).then(() => {
            closeModal();
            setTimeout(() => init(true), 1000);
        });
    };

    window.finishMission = (unitKey) => {
        if (!state.movements[unitKey]) return;

        showTacticalConfirm(
            "Fin de Mission",
            `Souhaitez-vous clôturer la mission pour ${state.movements[unitKey].indicatif} ?`,
            () => {
                state.movements[unitKey].status = 'Terminé';
                syncMovement(unitKey);
            }
        );
    };

    window.deployVehicle = (id) => {
        const v = state.fleet.find(x => x.id === id);
        if (!v) return;

        if (state.supply < v.cost) {
            showTacticalConfirm("Ressources Insuffisantes", `Il vous faut ${v.cost} points de supply pour déployer ce ${v.type}.`, () => { });
            return;
        }

        showTacticalConfirm(
            "Confirmation de Déploiement",
            `Voulez-vous déployer un ${v.type} pour ${v.cost} supply ?`,
            () => {
                // Mise à jour optimiste
                v.count++;
                state.supply -= v.cost;
                render();

                // Sync avec le serveur
                fetch(API_URL, {
                    method: 'POST',
                    mode: 'no-cors',
                    body: JSON.stringify({
                        action: 'update',
                        vehicle: {
                            id: v.id,
                            deployed: v.count,
                            inMission: v.inMission
                        }
                    })
                }).then(() => {
                    // Sync supply
                    return fetch(API_URL, {
                        method: 'POST',
                        mode: 'no-cors',
                        body: JSON.stringify({
                            action: 'sync_globals',
                            data: { supply: state.supply }
                        })
                    });
                }).then(() => {
                    setTimeout(() => init(true), 1000);
                });
            }
        );
    };

    window.undeployVehicle = (id, unitKey) => {
        const v = state.fleet.find(x => x.id === id);
        if (!v) return;

        if (v.count <= 0) return;

        showTacticalConfirm(
            "Ranger au Garage",
            `Souhaitez-vous ranger ce ${v.type} au garage ?<br><span class="text-cyan-400">+${v.cost} points de supply seront récupérés.</span>`,
            () => {
                // Mise à jour optimiste
                v.count--;
                state.supply += v.cost;
                
                // Si l'unité avait une mission active, on la clôture proprement sur le serveur
                const m = state.movements[unitKey];
                let syncPromise = Promise.resolve();
                
                if (m && m.isLogged) {
                    m.status = 'Rentrée Garage';
                    syncPromise = fetch(API_URL, {
                        method: 'POST',
                        mode: 'no-cors',
                        body: JSON.stringify({
                            action: 'log_equipage',
                            data: {
                                vehicleType: v.type,
                                idIndicatif: m.indicatif,
                                crew: m.crew || "N/A",
                                mission: m.mission,
                                status: 'Terminé (Retour Garage)',
                                condition: m.condition,
                                remark: "Véhicule rangé au garage."
                            }
                        })
                    });
                }

                // Nettoyage local
                if (state.movements[unitKey]) {
                    delete state.movements[unitKey];
                }
                
                render();

                // Sync avec le serveur
                syncPromise.then(() => {
                    return fetch(API_URL, {
                        method: 'POST',
                        mode: 'no-cors',
                        body: JSON.stringify({
                            action: 'update',
                            vehicle: {
                                id: v.id,
                                deployed: v.count,
                                inMission: v.inMission
                            }
                        })
                    });
                }).then(() => {
                    // Sync supply
                    return fetch(API_URL, {
                        method: 'POST',
                        mode: 'no-cors',
                        body: JSON.stringify({
                            action: 'sync_globals',
                            data: { supply: state.supply }
                        })
                    });
                }).then(() => {
                    setTimeout(() => init(true), 1000);
                });
            }
        );
    };

    window.updateBaseStat = (key, currentVal) => {
        const labels = { 'supply': 'Gestion des Réserves (Supply)', 'personnel': 'Effectifs (Personnel)', 'medics': 'V2 / EVS' };

        if (key === 'supply') {
            const overlay = document.getElementById('modal-overlay');
            const content = document.getElementById('modal-content');

            content.innerHTML = `
                <div class="p-6 relative text-center">
                    <div class="mb-6">
                        <div class="text-[9px] text-cyan-500 font-black uppercase tracking-[0.2em] mb-1">Configuration Logistique</div>
                        <h3 class="text-xl font-black text-white uppercase font-orbitron">${labels[key]}</h3>
                    </div>
                    
                    <div class="grid grid-cols-2 gap-4 mb-8">
                        <div class="bg-black/40 border-2 border-cyan-500/20 p-4 rounded-xl text-left">
                            <label class="text-[8px] text-slate-500 font-black uppercase mb-2 block">Valeur Actuelle</label>
                            <input type="number" id="modal-supply-current" value="${state.supply}" 
                                   class="bg-transparent text-white font-black font-orbitron text-xl w-full outline-none border-b border-transparent focus:border-cyan-500 transition-all">
                        </div>
                        <div class="bg-black/40 border-2 border-slate-500/10 p-4 rounded-xl text-left">
                            <label class="text-[8px] text-slate-500 font-black uppercase mb-2 block">Capacité Max</label>
                            <input type="number" id="modal-supply-max" value="${state.maxSupply}" 
                                   class="bg-transparent text-white/50 font-black font-orbitron text-xl w-full outline-none border-b border-transparent focus:border-cyan-500 transition-all">
                        </div>
                    </div>
                    
                    <div class="flex gap-4">
                        <button id="modal-save-supply" class="flex-1 py-4 bg-cyan-600 border border-cyan-400 text-white font-black uppercase tracking-widest text-[10px] rounded hover:bg-cyan-500 transition-all active:scale-95">
                            Mettre à Jour le Stock
                        </button>
                        <button onclick="closeModal()" class="flex-1 py-4 bg-slate-800 border border-slate-700 text-slate-400 font-black uppercase tracking-widest text-[10px] rounded hover:bg-slate-700 hover:text-white transition-all active:scale-95">
                            Annuler
                        </button>
                    </div>
                </div>
            `;

            document.getElementById('modal-save-supply').onclick = () => {
                const newCurrent = parseInt(document.getElementById('modal-supply-current').value);
                const newMax = parseInt(document.getElementById('modal-supply-max').value);

                if (!isNaN(newCurrent) && !isNaN(newMax)) {
                    state.supply = newCurrent;
                    state.maxSupply = newMax;
                    render();

                    fetch(API_URL, {
                        method: 'POST',
                        mode: 'no-cors',
                        body: JSON.stringify({
                            action: 'sync_globals',
                            data: { supply: state.supply, maxSupply: state.maxSupply }
                        })
                    }).then(() => {
                        setTimeout(() => init(true), 1000);
                    });
                }
                closeModal();
            };

            overlay.classList.remove('hidden');
            overlay.classList.add('flex');
            return;
        }

        showTacticalPrompt(
            labels[key],
            `Ajuster la valeur actuelle de ${currentVal}`,
            currentVal,
            (newVal) => {
                if (newVal === null || newVal === "" || isNaN(newVal)) return;

                state[key] = parseInt(newVal);
                render(); // Optimistic update

                fetch(API_URL, {
                    method: 'POST',
                    mode: 'no-cors',
                    body: JSON.stringify({
                        action: 'sync_globals',
                        data: { [key]: state[key] }
                    })
                }).then(() => {
                    console.log(`[SYNC] ${key} updated successfully.`);
                    setTimeout(() => init(true), 1000); // Re-sync to be sure
                });
            }
        );
    };

    window.toggleShift = () => {
        const nameInput = document.getElementById('sl-name-input');
        const name = nameInput ? nameInput.value.trim() : state.slName;

        if (!name && !state.isShiftActive) {
            showTacticalConfirm("Erreur", "Veuillez entrer un nom d'opérateur avant de commencer le service.", () => { });
            return;
        }

        const action = state.isShiftActive ? 'shift_stop' : 'shift_start';
        const msg = state.isShiftActive ? "Voulez-vous clore votre session de service ?" : `Prendre le service en tant que ${name} ?`;

        showTacticalConfirm(
            state.isShiftActive ? "Fin de Service" : "Prise de Service",
            msg,
            () => {
                const btn = document.getElementById('shift-toggle-btn');
                if (btn) btn.innerText = "SYNCHRONISATION...";

                fetch(API_URL, {
                    method: 'POST',
                    mode: 'no-cors',
                    body: JSON.stringify({
                        action: action,
                        data: {
                            slName: name,
                            pseudo: name // For backward compatibility with Code.gs
                        }
                    })
                }).then(() => {
                    state.slName = name;
                    state.isShiftActive = !state.isShiftActive;
                    if (state.isShiftActive) state.startTime = new Date();
                    localStorage.setItem('fof_logi_settings', JSON.stringify({
                        slName: state.slName,
                        personnel: state.personnel,
                        medics: state.medics
                    }));
                    render();
                    init(true);
                });
            }
        );
    };
    localStorage.setItem('fof_logi_settings', JSON.stringify({
        slName: state.slName,
        personnel: state.personnel,
        medics: state.medics
    }));

    render();

    // Auto-synchronisation toutes les 10 secondes
    setInterval(() => init(true), 10000);
});
