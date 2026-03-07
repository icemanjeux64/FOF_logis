// app.js - FOF Logistics Mobile Command Logic

document.addEventListener('DOMContentLoaded', () => {

    const API_URL = 'https://script.google.com/macros/s/AKfycbxEwlrKIZNgIb-4WEBPeaz35ekVvRuL8HRAplehgssnKKg6XG0-t9zze62TOgBZK2Q/exec';

    // --- STATE MANAGEMENT ---
    let state = {
        currentTab: 'dashboard',
        supply: 12000,
        isShiftActive: false,
        startTime: null,
        slName: 'Non identifié',
        personnel: 0,
        medics: 0,
        fleet: [], // Loaded from API
        history: [],
        movements: {}, // Temporary data for Crew Management: { unitKey: { indicatif, mission, status, condition } }
        expandedCategory: null, // Selected Category to show Vehicles
        expandedVehicleId: null, // Selected vehicle type to show grid
        editingUnitKey: null, // Selected unit to show modal
        isSyncing: false,
        lastSync: null
    };

    // Load settings from local storage
    const savedSettings = JSON.parse(localStorage.getItem('fof_logi_settings'));
    if (savedSettings) {
        state.slName = savedSettings.slName || 'Non identifié';
        state.personnel = savedSettings.personnel || 0;
        state.medics = savedSettings.medics || 0;
    }

    // --- NAVIGATION ---
    window.switchTab = (tabId) => {
        state.currentTab = tabId;

        // Update UI Nav
        document.querySelectorAll('nav button').forEach(btn => {
            btn.classList.remove('tab-active');
            const span = btn.querySelector('span');
            const icon = btn.querySelector('i, svg');
            if (span) span.classList.remove('text-blue-400');
            if (icon) icon.classList.remove('text-blue-400');
        });

        const activeBtn = document.getElementById(`nav-${tabId}`);
        if (activeBtn) {
            activeBtn.classList.add('tab-active');
            const span = activeBtn.querySelector('span');
            const icon = activeBtn.querySelector('i, svg');
            if (span) span.classList.add('text-blue-400');
            if (icon) icon.classList.add('text-blue-400');
        }

        render();
    };

    // --- DATA FETCHING ---
    window.init = (isSilent = false) => {
        if (!isSilent) state.isSyncing = true;
        const syncBtn = document.getElementById('sync-btn');
        if (syncBtn) syncBtn.classList.add('spin');

        fetch(`${API_URL}?action=get_data`)
            .then(res => res.json())
            .then(response => {
                state.isSyncing = false;
                if (syncBtn) syncBtn.classList.remove('spin');

                if (response.status === 'success') {
                    // Update last sync time
                    const now = new Date();
                    state.lastSync = now;
                    const syncEl = document.getElementById('last-sync');
                    if (syncEl) syncEl.innerText = `Sinc: ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

                    // Filter and map backend data to local state format
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
                            destroyed: parseInt(v.destroyed) || 0, // Ensure destroyed is synced
                            color: getCategoryColor(v.category)
                        }));

                    // Synchronize global settings from backend
                    if (response.globals) {
                        state.supply = response.globals.supply;
                        state.personnel = response.globals.personnel;
                        state.medics = response.globals.medics;
                        state.slName = response.globals.slName || 'Non identifié';

                        // Global Shift Sync
                        const isOnline = state.slName !== 'Non identifié' && state.slName !== '' && !response.globals.shiftEndTime;
                        state.isShiftActive = isOnline;

                        // Robust Date Parsing
                        if (isOnline && response.globals.shiftStartTime) {
                            const parsedDate = new Date(response.globals.shiftStartTime);
                            state.startTime = isNaN(parsedDate.getTime()) ? null : parsedDate;
                        } else {
                            state.startTime = null;
                        }
                    }

                    // Smart Merge of movements
                    if (response.movements) {
                        Object.keys(response.movements).forEach(indicatif => {
                            const m = response.movements[indicatif];
                            const v = state.fleet.find(f => f.type === m.vehicleType);
                            if (v) {
                                for (let i = 0; i < v.inMission; i++) {
                                    const key = `${v.id}_${i}`;
                                    // Protect local changes: only overwrite if local state is empty or already logged
                                    if (!state.movements[key] || state.movements[key].isLogged) {
                                        state.movements[key] = { ...m, isLogged: true };
                                    }
                                }
                            }
                        });
                    }

                    render();
                } else {
                    console.error("API Error:", response.message);
                }
            })
            .catch(err => {
                state.isSyncing = false;
                if (syncBtn) syncBtn.classList.remove('spin');
                console.error("Initialization Error", err);
            });

        // Start Timer only once
        if (!window.timerStarted) {
            startTimer();
            startBackgroundSync();
            window.timerStarted = true;
        }
    };

    window.manualRefresh = () => {
        if (state.isSyncing) return;
        init(false);
    };

    function startBackgroundSync() {
        // Poll every 30 seconds
        setInterval(() => {
            if (!state.isSyncing) {
                init(true);
            }
        }, 30000);
    }

    function getCategoryColor(cat) {
        if (!cat) return '#a855f7';
        const c = cat.toUpperCase();
        if (c.includes('TRANSPORT')) return '#facc15';
        if (c.includes('MAINTENANCE')) return '#ef4444';
        if (c.includes('RAVITAILLEMENT')) return '#ec4899';
        if (c.includes('BLINDÉ')) return '#fb923c';
        if (c.includes('COMBAT')) return '#ea580c';
        if (c.includes('AÉRIEN')) return '#2563eb';
        return '#a855f7';
    }

    // --- RENDERERS ---
    window.render = () => {
        const container = document.getElementById('main-content');
        if (!container) return;

        container.innerHTML = '';

        if (state.currentTab === 'dashboard') renderDashboard(container);
        else if (state.currentTab === 'fleet') renderFleet(container);
        else if (state.currentTab === 'ops') renderOps(container);
        else if (state.currentTab === 'admin') renderAdmin(container);

        updateGlobalStats();
        lucide.createIcons();
    }

    function renderDashboard(container) {
        const deployed = state.fleet.filter(v => v.count > 0);

        let html = `
            <div class="mb-6 flex justify-between items-center">
                <h2 class="text-xl font-black uppercase tracking-tight">Tableau de Bord</h2>
                <span class="text-[10px] bg-blue-500/20 text-blue-400 px-2 py-1 rounded font-bold">${deployed.length} TYPES ACTIFS</span>
            </div>
        `;

        if (deployed.length === 0) {
            html += `
                <div class="flex flex-col items-center justify-center py-20 text-slate-600 opacity-50">
                    <i data-lucide="package-open" class="w-12 h-12 mb-4"></i>
                    <p class="text-xs font-bold uppercase tracking-widest">Aucune unité sur le terrain</p>
                    <button onclick="switchTab('fleet')" class="mt-4 text-blue-500 text-[10px] font-black underline uppercase">Aller à la Flotte</button>
                </div>
            `;
        } else {
            html += `<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">`;
            deployed.forEach(v => {
                const statusColor = v.status === 'Détruit' ? 'text-red-500' : 'text-green-500';
                html += `
                    <div onclick="jumpToOpsCategory('${v.cat}')" class="bg-slate-800/40 rounded-xl p-4 border border-white/5 relative overflow-hidden cursor-pointer active:scale-95 transition-all group hover:bg-slate-800/60">
                        <div class="category-accent" style="background-color: ${v.color}"></div>
                        <div class="flex justify-between items-start mb-2">
                            <div>
                                <span class="text-[8px] font-black text-slate-500 uppercase tracking-widest">${v.cat}</span>
                                <h3 class="font-bold text-sm text-white group-hover:text-blue-400 transition-colors">${v.type}</h3>
                            </div>
                            <div class="flex flex-col items-end">
                                <span class="mono text-lg font-black text-blue-400">x${v.count}</span>
                                <span class="text-[7px] text-slate-600 uppercase font-black">Déployés</span>
                            </div>
                        </div>
                        <div class="flex items-center gap-2 mt-3">
                            <span class="status-pill bg-opacity-20 ${v.status === 'Détruit' ? 'bg-red-500 text-red-500' : 'bg-green-500 text-green-500'} text-[8px]">${v.status}</span>
                            <span class="text-[9px] text-slate-500 mono italic">${v.crew || 'Sans pilote attitré'}</span>
                        </div>
                    </div>
                `;
            });
            html += `</div>`;
        }
        container.innerHTML = html;
    }

    window.jumpToOpsCategory = (cat) => {
        state.currentTab = 'ops';
        state.expandedCategory = cat;
        switchTab('ops');
    };

    function renderFleet(container) {
        let html = `
            <div class="mb-6">
                <h2 class="text-xl font-black uppercase tracking-tight">Catalogue Flotte</h2>
                <p class="text-[9px] text-slate-500 uppercase tracking-widest">Déployez et gérez les unités disponibles</p>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        `;

        state.fleet.forEach(v => {
            html += `
                <div onclick="deployVehicle(${v.id})" class="bg-slate-900 border border-white/5 rounded-xl overflow-hidden relative cursor-pointer active:scale-95 transition-all group hover:border-blue-500/30">
                    <div class="category-accent" style="background-color: ${v.color}"></div>
                    <div class="p-4">
                        <div class="flex justify-between items-start">
                            <div>
                                <span class="px-1.5 py-0.5 bg-slate-800 text-[8px] font-black rounded text-slate-400 uppercase mb-1 inline-block">${v.grade}</span>
                                <h3 class="font-bold text-sm leading-tight group-hover:text-blue-400 transition-colors">${v.type}</h3>
                            </div>
                            <span class="mono text-xs font-bold text-slate-500">${v.cost} pts</span>
                        </div>
                        
                        <div class="mt-6 flex items-center justify-between">
                            <span class="text-[7px] text-slate-600 uppercase font-black tracking-[0.2em]">Cliquer pour ajouter</span>
                            <div class="w-6 h-6 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-500 border border-blue-500/20 group-hover:bg-blue-500 group-hover:text-white transition-all">
                                <i data-lucide="plus" class="w-3 h-3"></i>
                            </div>
                        </div>
                    </div>
                </div>
        `;
        });

        html += `</div>`;
        container.innerHTML = html;
    }

    function renderOps(container) {
        const deployedUnits = state.fleet.filter(v => v.count > 0);
        const categories = [...new Set(deployedUnits.map(v => v.cat))];

        let html = `
            <div class="mb-6">
                <h2 class="text-xl font-black uppercase tracking-tight">Opérations Tactiques</h2>
                <p class="text-[9px] text-slate-500 uppercase tracking-widest italic">${deployedUnits.length} Modèles déployés</p>
            </div>
        `;

        if (categories.length === 0) {
            html += `<div class="py-20 text-center text-slate-600 text-[10px] uppercase font-bold tracking-widest italic tracking-tighter">AUCUN VÉHICULE EN MISSION</div>`;
        } else {
            html += `<div class="space-y-3">`;
            categories.forEach(cat => {
                const isCatExpanded = state.expandedCategory === cat;
                const catVehicles = deployedUnits.filter(v => v.cat === cat);
                const totalDeployed = catVehicles.reduce((a, b) => a + b.count, 0);
                const totalInMission = catVehicles.reduce((a, b) => a + b.inMission, 0);
                const totalDestroyed = catVehicles.reduce((a, b) => a + (b.destroyed || 0), 0);

                html += `
                    <!-- Level 1: Category -->
                    <div class="bg-slate-900/60 border border-white/5 rounded-2xl overflow-hidden shadow-lg transition-all">
                        <div onclick="toggleCategoryExpand('${cat}')" class="p-4 flex justify-between items-center cursor-pointer active:bg-slate-800 transition-colors">
                            <div class="flex items-center gap-3">
                                <div class="w-8 h-8 rounded-xl flex items-center justify-center border border-white/10" style="background-color: ${getCategoryColor(cat)}20">
                                    <i data-lucide="layers" class="w-4 h-4" style="color: ${getCategoryColor(cat)}"></i>
                                </div>
                                <div>
                                    <h4 class="font-black text-xs text-white uppercase tracking-tighter">${cat}</h4>
                                    <p class="text-[8px] text-slate-500 font-bold uppercase tracking-widest">
                                        <span class="text-blue-400">${totalDeployed}</span> DÉPLOYÉ(S) | 
                                        <span class="text-green-400">${totalInMission}</span> MISSION | 
                                        <span class="text-red-500">${totalDestroyed}</span> PERTE(S)
                                    </p>
                                </div>
                            </div>
                            <i data-lucide="${isCatExpanded ? 'chevron-up' : 'chevron-down'}" class="w-4 h-4 text-slate-600"></i>
                        </div>

                        ${isCatExpanded ? `
                        <div class="px-3 pb-3 space-y-2 animate-slide-up">
                            ${catVehicles.map(v => {
                    const isVehExpanded = state.expandedVehicleId === v.id;
                    return `
                                <!-- Level 2: Vehicle Type -->
                                <div class="bg-slate-800/80 border border-white/5 rounded-xl overflow-hidden shadow-md">
                                    <div onclick="toggleVehicleExpand(${v.id})" class="p-3 flex justify-between items-center cursor-pointer active:bg-slate-700/50">
                                        <div class="flex items-center gap-2">
                                            <div class="w-1 h-1 rounded-full animate-pulse" style="background-color: ${v.color}"></div>
                                            <h5 class="font-black text-[10px] text-slate-300 uppercase tracking-tight">
                                                ${v.type} 
                                                <span class="text-blue-500 ml-1">x${v.count}</span>
                                                ${v.inMission > 0 ? `<span class="text-green-500 ml-1">(${v.inMission} en mission)</span>` : ''}
                                            </h5>
                                        </div>
                                        <i data-lucide="${isVehExpanded ? 'chevron-up' : 'chevron-down'}" class="w-3.5 h-3.5 text-slate-500"></i>
                                    </div>

                                    ${isVehExpanded ? `
                                    <!-- Level 3: Unit Grid -->
                                    <div class="p-3 bg-slate-900/40 border-t border-white/5">
                                        <div class="grid grid-cols-4 sm:grid-cols-5 gap-2">
                                             ${Array.from({ length: v.count }).map((_, i) => {
                        const unitKey = `${v.id}_${i}`;
                        const m = state.movements[unitKey];
                        // Bleu si en base (pas de mission), Vert si en mission active
                        const hasActiveMission = m && m.mission && m.status === 'En cours';
                        const statusColor = hasActiveMission ? 'bg-green-500' : 'bg-blue-500';

                        return `
                                                    <button onclick="openUnitModal('${unitKey}')" 
                                                            class="aspect-square bg-slate-800 rounded-lg border border-white/5 flex flex-col items-center justify-center relative active:scale-90 transition-all shadow-inner">
                                                        <span class="text-[9px] font-black text-white/50 uppercase italic">V.${i + 1}</span>
                                                        <div class="w-1.5 h-1.5 rounded-full ${statusColor} mt-1 shadow-lg"></div>
                                                    </button>
                                                `;
                    }).join('')}
                                        </div>
                                    </div>
                                    ` : ''}
                                </div>
                                `;
                }).join('')}
                        </div>
                        ` : ''}
                    </div>
                `;
            });
            html += `</div>`;
        }
        container.innerHTML = html;

        if (state.editingUnitKey) renderUnitModal(container);
    }


    window.toggleCategoryExpand = (cat) => {
        state.expandedCategory = state.expandedCategory === cat ? null : cat;
        render();
    };

    window.toggleVehicleExpand = (id) => {
        state.expandedVehicleId = state.expandedVehicleId === id ? null : id;
        render();
    };

    window.openUnitModal = (unitKey) => {
        state.editingUnitKey = unitKey;
        render();
    };

    window.closeUnitModal = () => {
        state.editingUnitKey = null;
        render();
    };

    function renderAdmin(container) {
        container.innerHTML = `
            <div class="mb-6">
                <h2 class="text-xl font-black uppercase tracking-tight">Administration</h2>
            </div>

            <div class="space-y-4">
                <!-- PERSONNEL & MEDICS -->
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div class="bg-slate-900 border border-white/5 rounded-xl p-5 relative overflow-hidden">
                        <div class="category-accent bg-orange-500"></div>
                        <label class="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-4">Effectifs Logistiques</label>
                        <div class="flex items-center justify-between">
                            <div class="flex items-center gap-4">
                                <i data-lucide="users" class="w-6 h-6 text-orange-500"></i>
                                <span class="mono text-2xl font-bold text-white">${state.personnel}</span>
                            </div>
                            <div class="flex gap-2">
                                <button onclick="adjustPersonnel(-1)" class="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center font-bold text-slate-400">-</button>
                                <button onclick="adjustPersonnel(1)" class="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center font-bold text-orange-500">+</button>
                            </div>
                        </div>
                    </div>

                    <div class="bg-slate-900 border border-white/5 rounded-xl p-5 relative overflow-hidden">
                        <div class="category-accent bg-pink-500"></div>
                        <label class="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-4">Unités EVASAN / V2</label>
                        <div class="flex items-center justify-between">
                            <div class="flex items-center gap-4">
                                <i data-lucide="heart-pulse" class="w-6 h-6 text-pink-500"></i>
                                <span class="mono text-2xl font-bold text-white">${state.medics}</span>
                            </div>
                            <div class="flex gap-2">
                                <button onclick="adjustMedics(-1)" class="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center font-bold text-slate-400">-</button>
                                <button onclick="adjustMedics(1)" class="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center font-bold text-pink-500">+</button>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="bg-slate-900 border border-white/5 rounded-xl p-5">
                    <label class="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-4">Gestion Supply de Base</label>
                    <div class="flex items-center gap-4">
                        <span id="admin-supply-display" class="mono text-2xl font-bold text-blue-400">${calculateRemainingSupply()}</span>
                        <div class="flex gap-2">
                            <button onclick="adjustSupplyLimit(500)" class="bg-slate-800 px-3 py-1 rounded text-[10px] font-bold text-white">+500 Base</button>
                            <button onclick="adjustSupplyLimit(-500)" class="bg-slate-800 px-3 py-1 rounded text-[10px] font-bold text-red-400">-500 Base</button>
                        </div>
                    </div>
                    <small class="text-[9px] text-slate-600 mt-2 block">Supply Initial: ${state.supply}</small>
                </div>

                <div class="bg-slate-900 border border-white/5 rounded-xl p-5">
                    <label class="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-4">Service SL Logistique</label>
                    <input type="text" id="sl-name-input" value="${state.slName}" placeholder="Votre nom..."
                        class="w-full bg-slate-800 text-white rounded p-3 mb-4 text-xs font-bold outline-none border border-white/5">
                        <button onclick="toggleShift()"
                            class="w-full py-4 rounded-xl font-black uppercase tracking-tighter transition-all ${state.isShiftActive ? 'bg-red-600 shadow-lg shadow-red-900/20' : 'bg-green-600 shadow-lg shadow-green-900/20'}">
                            ${state.isShiftActive ? 'Finir le service' : 'Prendre le service'}
                        </button>
                </div>

                <div class="bg-red-900/10 border border-red-900/20 rounded-xl p-5">
                    <button onclick="resetAll()" class="w-full text-red-500 font-bold text-xs uppercase tracking-widest">Réinitialiser Localement</button>
                </div>
            </div>
        `;
    }

    // --- CORE ACTIONS ---
    window.deployVehicle = (id) => {
        const v = state.fleet.find(x => x.id === id);
        if (v) {
            v.count++;
            state.supply -= v.cost; // Déduction directe du supply
            updateVehicleStatusLocally(v);
            render();
            syncVehicle(v);
            saveAndSyncGlobals(); // Sync le nouveau supply au backend

            // Notification visuelle discrète
            const statsContainer = document.querySelector('#stat-active')?.parentElement;
            if (statsContainer) {
                statsContainer.classList.add('scale-110', 'brightness-125');
                setTimeout(() => statsContainer.classList.remove('scale-110', 'brightness-125'), 300);
            }
        }
    };

    window.changeCount = (id, delta) => {
        const v = state.fleet.find(x => x.id === id);
        if (v) {
            v.count = Math.max(0, v.count + delta);
            // Limit inMission by new count
            if (v.inMission > v.count) v.inMission = v.count;

            updateVehicleStatusLocally(v);
            render();
            syncVehicle(v);
        }
    };

    function updateVehicleStatusLocally(v) {
        if (v.count === 0) {
            v.status = 'Pas déployé';
        } else if (v.inMission > 0) {
            v.status = 'Opérationnel';
        } else {
            v.status = 'En Base';
        }
    }

    window.updateCrew = (id, name) => {
        const v = state.fleet.find(x => x.id === id);
        if (v) {
            v.crew = name;
            syncVehicle(v);
        }
    };

    window.updateMovementField = (id, field, value) => {
        if (!state.movements[id]) {
            state.movements[id] = { indicatif: '', mission: '', status: 'En cours', condition: '100%' };
        }
        state.movements[id][field] = value;
        // Pas de render() ici par défaut pour éviter de couper la saisie des inputs, 
        // les boutons eux appellent render() explicitement.
    };

    window.syncMovement = (unitKey) => {
        const vid = parseInt(unitKey.split('_')[0]);
        const v = state.fleet.find(x => x.id === vid);
        const m = state.movements[unitKey];
        if (!v || !m) return;

        if (!m.indicatif) {
            alert("Veuillez saisir un Indicatif avant le départ.");
            return;
        }

        const isFinished = m.status === 'Terminé' || m.status === 'Échec';
        const isNewMission = !m.isLogged;
        const isHS = m.condition === 'HS';

        // Si c'est une validation de mission déjà en cours (sans changement de statut final et pas HS),
        // on évite de renvoyer un log dans le Sheet pour éviter les doublons.
        if (!isNewMission && !isFinished && !isHS) {
            console.log("[SYNC] Mission Validation - Local only");
            render();
            return;
        }

        // Logique Mission
        if (isNewMission && !isFinished && !isHS) {
            // Départ mission
            v.inMission = Math.min(v.count, (v.inMission || 0) + 1);
        } else if ((isFinished || isHS) && m.isLogged) {
            // Fin de mission (ou destruction en mission)
            v.inMission = Math.max(0, (v.inMission || 0) - 1);
        }

        // Logique Destruction (HS)
        if (isHS) {
            v.destroyed = (v.destroyed || 0) + 1;
            v.count = Math.max(0, v.count - 1);
            delete state.movements[unitKey];
            // Nettoyage de l'ID si c'était le dernier du type
            if (v.count === 0) {
                state.movements = Object.fromEntries(
                    Object.entries(state.movements).filter(([key]) => !key.startsWith(`${vid}_`))
                );
            }
        }

        // Marquer comme loggué
        m.isLogged = true;

        // Mise à jour Statut Auto
        if (v.count === 0) v.status = "Pas déployé";
        else if (v.inMission > 0) v.status = "Opérationnel";
        else v.status = "En Base";

        // Sync vers GSheet (Véhicule)
        syncVehicle(v);

        // Sync vers GSheet (Log périodique / Équipage)
        fetch(API_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({
                action: 'log_equipage',
                data: {
                    vehicleType: v.type,
                    idIndicatif: m.indicatif,
                    crew: m.crew || v.crew || "Personnel",
                    mission: m.mission,
                    status: isHS ? "VÉHICULE DÉTRUIT" : m.status,
                    condition: "'" + m.condition, // Force format texte Google Sheets
                    remark: m.remark || ""
                }
            })
        }).then(() => {
            if (isHS) showSuccessModal(v.type, m.indicatif, true);
            else if (isFinished) {
                delete state.movements[unitKey];
                showSuccessModal(v.type, m.indicatif, true);
            } else {
                showSuccessModal(v.type, m.indicatif, false);
            }
            render();
        }).catch(err => console.error("Sync Error", err));
    }

    window.updateStatus = (id, status) => {
        const v = state.fleet.find(x => x.id === id);
        if (v) {
            if (status === 'Opérationnel') {
                // Déjà géré par le bouton ? Si on force le statut global
                v.inMission = v.count;
            } else if (status === 'En Base' || status === 'Pas déployé') {
                v.inMission = 0;
            } else if (status === 'Détruit') {
                v.destroyed = (v.destroyed || 0) + v.count;
                v.count = 0;
                v.inMission = 0;
            }
            updateVehicleStatusLocally(v);
            render();
            syncVehicle(v);
        }
    };

    window.reportLoss = (id) => {
        if (!confirm("Confirmer la perte (destruction) d'une unité ?")) return;
        const v = state.fleet.find(x => x.id === id);
        if (v && v.count > 0) {
            v.destroyed = (v.destroyed || 0) + 1;
            v.count--;
            // On ne rend pas les points de supply car le véhicule est détruit
            updateVehicleStatusLocally(v);
            render();
            syncVehicle(v);
        }
    };

    window.cancelDeployment = (id) => {
        if (!confirm("Annuler le déploiement ? Le supply sera remboursé.")) return;
        const v = state.fleet.find(x => x.id === id);
        if (v && v.count > 0) {
            v.count--;
            state.supply += v.cost; // Remboursement du supply
            updateVehicleStatusLocally(v);
            render();
            syncVehicle(v);
            saveAndSyncGlobals();
            closeUnitModal();
        }
    };

    function calculateRemainingSupply() {
        return state.supply; // Le supply est maintenant géré comme un inventaire direct
    }

    function updateGlobalStats() {
        const remaining = calculateRemainingSupply();
        document.getElementById('stat-supply').innerText = remaining;
        document.getElementById('stat-active').innerText = state.fleet.reduce((a, b) => a + (b.count || 0), 0);
        document.getElementById('stat-lost').innerText = state.fleet.reduce((a, b) => a + (b.destroyed || 0), 0);

        // New stats: Personnel and Medics
        const personnelEl = document.getElementById('stat-personnel');
        const medicsEl = document.getElementById('stat-medics');
        if (personnelEl) personnelEl.innerText = state.personnel;
        if (medicsEl) medicsEl.innerText = state.medics;

        // Header background status
        const slStatus = document.getElementById('sl-status');
        if (state.isShiftActive) {
            slStatus.innerText = `En Service(${state.slName})`;
            slStatus.classList.remove('text-slate-500');
            slStatus.classList.add('text-green-500');
        } else {
            slStatus.innerText = "OFFLINE";
            slStatus.classList.add('text-slate-500');
            slStatus.classList.remove('text-green-500');
        }
    }

    window.toggleShift = () => {
        const nameInput = document.getElementById('sl-name-input');
        if (nameInput) state.slName = nameInput.value || 'Non identifié';

        if (!state.isShiftActive) {
            showStartShiftModal();
        } else {
            showStopShiftModal();
        }
    };

    function showModal(contentHtml) {
        const overlay = document.getElementById('modal-overlay');
        const content = document.getElementById('modal-content');
        content.innerHTML = contentHtml;
        overlay.classList.remove('hidden');
        overlay.classList.add('flex');
    }

    window.closeModal = () => {
        const overlay = document.getElementById('modal-overlay');
        overlay.classList.add('hidden');
        overlay.classList.remove('flex');
    };

    window.showSuccessModal = (vehicleType, indicatif, isFinished) => {
        const overlay = document.getElementById('modal-overlay');
        const unitKey = state.editingUnitKey;
        const m = unitKey ? state.movements[unitKey] : null;
        const isHS = m && m.condition === 'HS';

        const title = isHS ? "VÉHICULE DÉTRUIT" : (isFinished ? "MISSION TERMINÉE" : "MISSION ENREGISTRÉE");
        const subtitle = isHS ? "L'UNITÉ A ÉTÉ RETIRÉE DU SERVICE" : (isFinished ? "L'UNITÉ EST DE RETOUR À LA BASE" : "LES DONNÉES SONT SYNCHRONISÉES");
        const icon = isHS ? 'skull' : (isFinished ? 'home' : 'check-circle');
        const color = isHS ? 'text-red-500' : (isFinished ? 'text-blue-500' : 'text-green-500');

        showModal(`
            <div class="p-8 text-center">
                <div class="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center ${color} mx-auto mb-6 border border-white/5 shadow-xl">
                    <i data-lucide="${icon}" class="w-10 h-10"></i>
                </div>
                <h3 class="text-xl font-black text-white uppercase tracking-tighter mb-2">${title}</h3>
                <p class="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-8 italic">${subtitle}</p>
                
                <div class="bg-slate-900/50 rounded-2xl p-4 border border-white/5 mb-8 space-y-3 text-left">
                    <div>
                        <span class="text-[8px] text-slate-500 uppercase font-black block tracking-widest">Unité Tactique</span>
                        <span class="text-sm font-bold text-white">${indicatif}</span>
                    </div>
                    <div>
                        <span class="text-[8px] text-slate-500 uppercase font-black block tracking-widest">Modèle de Véhicule</span>
                        <span class="text-sm font-bold text-indigo-400">${vehicleType}</span>
                    </div>
                </div>

                <button onclick="closeModal()" class="w-full py-4 bg-indigo-600 text-white font-black uppercase tracking-widest rounded-xl shadow-lg shadow-indigo-900/40 hover:bg-indigo-500 transition-all active:scale-95">
                    Terminer
                </button>
            </div>
        `);
        lucide.createIcons();
    }

    function showStartShiftModal() {
        showModal(`
            <div class="p-6">
                <div class="flex items-center gap-3 mb-4">
                    <div class="w-10 h-10 bg-green-500/20 rounded-full flex items-center justify-center text-green-500">
                        <i data-lucide="check-square" class="w-6 h-6"></i>
                    </div>
                    <h3 class="font-black uppercase tracking-tight text-white italic">Début de Service</h3>
                </div>
                <div class="space-y-4 text-slate-300 text-sm leading-relaxed mb-6">
                    <p class="text-xs text-slate-500 uppercase font-black tracking-widest">Instructions Tactiques</p>
                    <p>Bonjour <span class="text-white font-bold">${state.slName}</span>,</p>
                    <ul class="space-y-2 text-xs">
                        <li class="flex gap-2 items-start"><span class="text-green-500">■</span> Faire l'inventaire de toute la flotte</li>
                        <li class="flex gap-2 items-start"><span class="text-green-500">■</span> Vérifier l'état de chaque véhicule</li>
                        <li class="flex gap-2 items-start"><span class="text-green-500">■</span> Vérifier le supply disponible en base</li>
                        <li class="flex gap-2 items-start"><span class="text-green-500">■</span> Mettre à jour l'application régulièrement</li>
                    </ul>
                </div>
                <button onclick="confirmStartShift()" class="w-full py-4 bg-green-600 text-white font-black uppercase tracking-tighter rounded-xl shadow-lg shadow-green-900/40 hover:bg-green-500 transition-all active:scale-95">
                    Démarrer le service
                </button>
            </div>
            `);
        lucide.createIcons();
    }

    function showStopShiftModal() {
        showModal(`
            <div class="p-6 text-center">
                <div class="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center text-red-500 mx-auto mb-4">
                    <i data-lucide="alert-octagon" class="w-8 h-8"></i>
                </div>
                <h3 class="font-black uppercase tracking-tight text-white text-lg mb-2">Fin de Service</h3>
                <p class="text-slate-400 text-sm mb-8">Avez-vous mis à jour l'application, la flotte et le supply pour le prochain SL ?</p>
                
                <div class="grid grid-cols-2 gap-3">
                    <button onclick="closeModal()" class="py-4 bg-slate-800 text-slate-400 font-black uppercase tracking-tighter rounded-xl hover:bg-slate-700 hover:text-white transition-all">
                        Non
                    </button>
                    <button onclick="confirmStopShift()" class="py-4 bg-red-600 text-white font-black uppercase tracking-tighter rounded-xl shadow-lg shadow-red-900/40 hover:bg-red-500 transition-all active:scale-95">
                        Oui
                    </button>
                </div>
            </div>
            `);
        lucide.createIcons();
    }

    window.confirmStartShift = () => {
        closeModal();
        const now = new Date();
        const formattedDate = now.toLocaleDateString('fr-FR');
        const formattedTime = now.toLocaleTimeString('fr-FR');
        const sheetDateTime = `${formattedDate} ${formattedTime}`;

        state.isShiftActive = true;
        state.startTime = now;
        syncShiftAction('shift_start', {
            pseudo: state.slName,
            startTime: sheetDateTime
        });

        saveAndSyncGlobals();
    };

    window.confirmStopShift = () => {
        closeModal();
        const now = new Date();
        const formattedDate = now.toLocaleDateString('fr-FR');
        const formattedTime = now.toLocaleTimeString('fr-FR');
        const sheetDateTime = `${formattedDate} ${formattedTime}`;

        // Safety check for startTime
        let startTimeStr = 'INCONNU';
        if (state.startTime instanceof Date && !isNaN(state.startTime)) {
            startTimeStr = `${state.startTime.toLocaleDateString('fr-FR')} ${state.startTime.toLocaleTimeString('fr-FR')}`;
        }

        const totalDeployed = state.fleet.reduce((a, b) => a + (b.count || 0), 0);
        const totalDestroyed = state.fleet.reduce((a, b) => a + (b.destroyed || 0), 0);

        syncShiftAction('shift_stop', {
            pseudo: state.slName,
            startTime: startTimeStr, // Already FR formatted
            endTime: sheetDateTime,
            totalDeployed: totalDeployed,
            totalDestroyed: totalDestroyed,
            personnel: state.personnel
        });

        state.isShiftActive = false;
        state.startTime = null;

        saveAndSyncGlobals();
    };

    window.adjustPersonnel = (delta) => {
        state.personnel = Math.max(0, state.personnel + delta);
        saveAndSyncGlobals();
    };

    window.adjustMedics = (delta) => {
        state.medics = Math.max(0, state.medics + delta);
        saveAndSyncGlobals();
    };

    function saveAndSyncGlobals() {
        localStorage.setItem('fof_logi_settings', JSON.stringify({
            slName: state.slName,
            shiftActive: state.isShiftActive,
            shiftStartTime: state.startTime ? state.startTime.toISOString() : null,
            initialSupply: state.supply,
            personnel: state.personnel,
            medics: state.medics
        }));
        render();
        syncGlobalSettings();
    }

    window.openQuickEdit = (type) => {
        let label = '';
        let value = 0;
        let colorClass = '';

        if (type === 'supply') {
            label = 'Supply Initial Base';
            value = state.supply;
            colorClass = 'text-blue-400';
        } else if (type === 'personnel') {
            label = 'Effectifs Logistique';
            value = state.personnel;
            colorClass = 'text-orange-500';
        } else if (type === 'medics') {
            label = 'Unités V2 / EVASAN';
            value = state.medics;
            colorClass = 'text-pink-500';
        }

        showModal(`
            <div class="p-6">
                <div class="flex items-center gap-3 mb-6">
                    <div class="w-10 h-10 bg-slate-800 rounded-xl flex items-center justify-center border border-white/5">
                        <i data-lucide="edit-3" class="w-5 h-5 ${colorClass}"></i>
                    </div>
                    <div>
                        <h3 class="font-black uppercase tracking-tight text-white italic">Mise à jour Rapide</h3>
                        <p class="text-[8px] text-slate-500 font-bold uppercase tracking-widest">${label}</p>
                    </div>
                </div>

                <div class="bg-slate-900/50 rounded-2xl p-4 border border-white/5 mb-6">
                    <input type="number" id="quick-edit-input" value="${value}" 
                           class="bg-transparent text-2xl font-black text-center w-full outline-none ${colorClass} [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none">
                </div>

                <div class="grid grid-cols-2 gap-3">
                    <button onclick="closeModal()" class="py-4 bg-slate-800 text-slate-400 font-black uppercase tracking-tighter rounded-xl hover:bg-slate-700 hover:text-white transition-all">
                        Annuler
                    </button>
                    <button onclick="confirmQuickEdit('${type}')" class="py-4 bg-indigo-600 text-white font-black uppercase tracking-tighter rounded-xl shadow-lg shadow-indigo-900/40 hover:bg-indigo-500 transition-all active:scale-95">
                        Valider
                    </button>
                </div>
            </div>
        `);
        lucide.createIcons();
        setTimeout(() => document.getElementById('quick-edit-input').select(), 100);
    };

    window.confirmQuickEdit = (type) => {
        const input = document.getElementById('quick-edit-input');
        const newValue = parseInt(input.value);
        if (isNaN(newValue)) return;

        if (type === 'supply') state.supply = newValue;
        else if (type === 'personnel') state.personnel = newValue;
        else if (type === 'medics') state.medics = newValue;

        closeModal();
        saveAndSyncGlobals();
    };

    window.adjustSupplyLimit = (val) => {
        state.supply += val;
        saveAndSyncGlobals();
    };

    window.resetAll = () => {
        if (!confirm("Effacer les données locales et recharger ?")) return;
        localStorage.removeItem('fof_logi_settings');
        location.reload();
    };

    // --- SYNC ENGINE ---
    function syncGlobalSettings() {
        console.log(`[SYNC] Globals: Personnel: ${state.personnel}, Medics: ${state.medics}, Supply: ${state.supply} `);
        fetch(API_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({
                action: 'sync_globals',
                data: {
                    supply: state.supply,
                    personnel: state.personnel,
                    medics: state.medics
                }
            })
        }).catch(err => console.error("Global Sync Error", err));
    }
    function syncVehicle(v) {
        console.log(`[SYNC] ${v.type} | Depl: ${v.count}, Miss: ${v.inMission} `);
        fetch(API_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({
                action: 'update',
                vehicle: {
                    id: v.id,
                    status: v.status,
                    deployed: v.count,
                    inMission: v.inMission,
                    crew: v.crew
                }
            })
        }).catch(err => console.error("Sync Error", err));
    }

    function syncShiftAction(action, data) {
        console.log(`[SHIFT] ${action} `, data);
        state.isSyncing = true;
        const syncBtn = document.getElementById('sync-btn');
        if (syncBtn) syncBtn.classList.add('spin');

        fetch(API_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({
                action: action,
                data: data
            })
        })
            .then(() => {
                state.isSyncing = false;
                if (syncBtn) syncBtn.classList.remove('spin');
                // Force a refresh to see the new state globally
                setTimeout(() => init(true), 1000);
            })
            .catch(err => {
                state.isSyncing = false;
                if (syncBtn) syncBtn.classList.remove('spin');
                console.error("Shift Sync Error", err);
            });
    }

    // --- TIMER ---
    function startTimer() {
        setInterval(() => {
            const timerEl = document.getElementById('shift-timer');
            if (state.isShiftActive && state.startTime && timerEl) {
                const diff = new Date() - state.startTime;
                const h = Math.floor(diff / 3600000).toString().padStart(2, '0');
                const m = Math.floor((diff % 3600000) / 60000).toString().padStart(2, '0');
                const s = Math.floor((diff % 60000) / 1000).toString().padStart(2, '0');
                timerEl.innerText = `${h}:${m}:${s} `;
            } else if (timerEl) {
                timerEl.innerText = "00:00:00";
            }
        }, 1000);
    }

    function renderUnitModal(container) {
        const unitKey = state.editingUnitKey;
        if (!unitKey) return;

        const vid = parseInt(unitKey.split('_')[0]);
        const index = parseInt(unitKey.split('_')[1]);
        const v = state.fleet.find(x => x.id === vid);
        if (!v) return;

        if (!state.movements[unitKey]) {
            state.movements[unitKey] = {
                indicatif: `${v.type.split(' ')[0]}-${index + 1}`,
                crew: v.crew || '', // Par défaut l'équipage du véhicule
                mission: '',
                status: 'En cours',
                condition: 'Opérationnel',
                remark: ''
            };
        }
        const m = state.movements[unitKey];

        const modalHtml = `
            <div class="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
                <div class="absolute inset-0 bg-slate-950/90 backdrop-blur-sm" onclick="closeUnitModal()"></div>
                
                <div class="relative w-full max-w-lg bg-slate-900 border-t sm:border border-white/10 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden animate-slide-up">
                    <div class="h-1.5 w-12 bg-white/10 rounded-full mx-auto mt-3 mb-1 sm:hidden"></div>
                    
                    <div class="p-6">
                        <div class="flex justify-between items-start mb-6">
                            <div>
                                <h3 class="text-xl font-black text-white uppercase tracking-tighter">${v.type}</h3>
                                <span class="text-[9px] bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded-full font-black uppercase tracking-widest border border-indigo-500/20">UNITÉ V.${index + 1}</span>
                            </div>
                            <button onclick="closeUnitModal()" class="bg-slate-800 p-2 rounded-xl text-slate-500">
                                <i data-lucide="x" class="w-5 h-5"></i>
                            </button>
                        </div>

                        <div class="space-y-4">
                            <div class="grid grid-cols-2 gap-3">
                                <div class="bg-slate-800/50 rounded-2xl p-3 border border-white/5">
                                    <label class="text-[8px] text-slate-500 uppercase font-black block mb-1 tracking-widest">Indicatif</label>
                                    <input type="text" value="${m.indicatif}" 
                                           oninput="updateMovementField('${unitKey}', 'indicatif', this.value)"
                                           class="bg-transparent text-sm text-white w-full outline-none font-bold">
                                </div>
                                <div class="bg-slate-800/50 rounded-2xl p-3 border border-white/5">
                                    <label class="text-[8px] text-slate-500 uppercase font-black block mb-1 tracking-widest">Équipier</label>
                                    <input type="text" value="${m.crew || ''}" 
                                           oninput="updateMovementField('${unitKey}', 'crew', this.value)"
                                           class="bg-transparent text-sm text-blue-400 w-full outline-none font-bold">
                                </div>
                            </div>

                            <div class="bg-slate-800/50 rounded-2xl p-3 border border-white/5">
                                <label class="text-[8px] text-slate-500 uppercase font-black block mb-1 tracking-widest">Mission / Secteur</label>
                                <input type="text" value="${m.mission}" placeholder="Décrivez la mission..."
                                       oninput="updateMovementField('${unitKey}', 'mission', this.value)"
                                       class="bg-transparent text-sm text-white w-full outline-none font-bold">
                            </div>

                            <div>
                                <label class="text-[8px] text-slate-500 uppercase font-black block mb-2 tracking-widest">État du Matériel</label>
                                <div class="grid grid-cols-3 gap-2">
                                    ${['Opérationnel', 'En Réparation', 'HS'].map(c => `
                                        <button onclick="updateMovementField('${unitKey}', 'condition', '${c}'); render();" 
                                                class="py-3 rounded-xl text-[9px] font-black uppercase border transition-all ${m.condition === c ? (c === 'HS' ? 'bg-red-600 border-red-400 text-white' : 'bg-indigo-600 border-indigo-400 text-white shadow-lg shadow-indigo-900/40') : 'bg-slate-800 border-white/5 text-slate-500'}">
                                            ${c === 'Opérationnel' ? 'OPR' : c === 'En Réparation' ? 'RÉPA' : 'HS'}
                                        </button>
                                    `).join('')}
                                </div>
                            </div>

                            <div class="bg-slate-800/50 rounded-2xl p-3 border border-white/5">
                                <label class="text-[8px] text-slate-500 uppercase font-black block mb-1 tracking-widest">Observations / Remarques</label>
                                <textarea oninput="updateMovementField('${unitKey}', 'remark', this.value)"
                                          placeholder="Précisez l'état ou les détails de la mission..."
                                          class="bg-transparent text-sm text-white w-full outline-none font-bold min-h-[60px] resize-none">${m.remark || ''}</textarea>
                            </div>

                            <div>
                                <label class="text-[8px] text-slate-500 uppercase font-black block mb-2 tracking-widest">Statut Mission</label>
                                <div class="grid grid-cols-3 gap-2">
                                    ${['En cours', 'Terminé', 'Échec'].map(s => `
                                        <button onclick="updateMovementField('${unitKey}', 'status', '${s}'); render();" 
                                                class="py-3 rounded-xl text-[9px] font-black uppercase border transition-all ${m.status === s ? 'bg-blue-600 border-blue-400 text-white shadow-lg shadow-blue-900/40' : 'bg-slate-800 border-white/5 text-slate-500'}">
                                            ${s}
                                        </button>
                                    `).join('')}
                                </div>
                            </div>

                            <div class="pt-4 flex gap-3">
                                <button onclick="syncMovement('${unitKey}'); closeUnitModal();"
                                        class="flex-1 py-4 bg-indigo-600 text-white text-[11px] font-black uppercase tracking-widest rounded-2xl shadow-xl shadow-indigo-900/40 active:scale-95 transition-all">
                                    ${m.mission ? 'VALIDATION' : 'DÉPART MISSION'}
                                </button>
                                <button onclick="reportLoss(${v.id}); closeUnitModal();" 
                                        title="Détruire le véhicule (HS)"
                                        class="px-5 py-4 bg-red-600/10 text-red-500 rounded-2xl border border-red-500/10 active:scale-95 transition-all">
                                    <i data-lucide="skull" class="w-5 h-5"></i>
                                </button>
                                <button onclick="cancelDeployment(${v.id});" 
                                        title="Annuler le déploiement (Rembourser Supply)"
                                        class="px-5 py-4 bg-slate-800 text-slate-400 rounded-2xl border border-white/5 active:scale-95 transition-all hover:bg-slate-700 hover:text-white">
                                    <i data-lucide="trash-2" class="w-5 h-5"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const modalDiv = document.createElement('div');
        modalDiv.id = 'unit-modal-layer';
        modalDiv.innerHTML = modalHtml;
        container.appendChild(modalDiv);
        lucide.createIcons();
    }

    // --- INIT ---
    init();
});
