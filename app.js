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
        history: []
    };

    // Load settings from local storage
    const savedSettings = JSON.parse(localStorage.getItem('fof_logi_settings'));
    if (savedSettings) {
        state.slName = savedSettings.slName || 'Non identifié';
        state.isShiftActive = savedSettings.shiftActive || false;
        state.startTime = savedSettings.shiftActive ? new Date(savedSettings.shiftStartTime) : null;
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
    async function init() {
        try {
            const response = await fetch(API_URL);
            const result = await response.json();

            if (result.status === 'success') {
                // Filter and map backend data to local state format
                // Assuming backend columns: id, category, name, cost, grade, deployed, crew, status, note
                state.fleet = result.data
                    .filter(v => v.id >= 8 && v.name !== "Type de véhicule")
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
                        color: getCategoryColor(v.category)
                    }));

                // Synchronize global settings from backend
                if (result.globals) {
                    state.supply = result.globals.supply;
                    state.personnel = result.globals.personnel;
                    state.medics = result.globals.medics;
                    state.slName = result.globals.slName;
                }

                render();
            } else {
                console.error("API Error:", result.message);
            }
        } catch (error) {
            console.error("Connection Error:", error);
        }

        // Start Timer
        startTimer();
    }

    function getCategoryColor(cat) {
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
    function render() {
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
                    <div class="bg-slate-800/40 rounded-xl p-4 border border-white/5 relative overflow-hidden">
                        <div class="category-accent" style="background-color: ${v.color}"></div>
                        <div class="flex justify-between items-start mb-2">
                            <div>
                                <span class="text-[8px] font-black text-slate-500 uppercase tracking-widest">${v.cat}</span>
                                <h3 class="font-bold text-sm text-white">${v.type}</h3>
                            </div>
                            <span class="mono text-lg font-black text-blue-400">x${v.count}</span>
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
                <div class="bg-slate-900 border border-white/5 rounded-xl overflow-hidden relative">
                    <div class="category-accent" style="background-color: ${v.color}"></div>
                    <div class="p-4">
                        <div class="flex justify-between items-start">
                            <div>
                                <span class="px-1.5 py-0.5 bg-slate-800 text-[8px] font-black rounded text-slate-400 uppercase mb-1 inline-block">${v.grade}</span>
                                <h3 class="font-bold text-sm leading-tight">${v.type}</h3>
                            </div>
                            <span class="mono text-xs font-bold text-slate-500">${v.cost} pts</span>
                        </div>
                        
                        <div class="mt-4 flex flex-col gap-2">
                        <div class="flex items-center justify-between">
                            <span class="text-[9px] text-slate-500 uppercase font-black tracking-widest">Total dispos</span>
                            <div class="flex items-center gap-3">
                                <button onclick="changeCount(${v.id}, -1)" class="w-7 h-7 rounded bg-slate-800 flex items-center justify-center font-bold text-slate-400">-</button>
                                <span class="mono text-sm font-bold w-4 text-center text-white">${v.count}</span>
                                <button onclick="changeCount(${v.id}, 1)" class="w-7 h-7 rounded bg-slate-800 flex items-center justify-center font-bold text-blue-500">+</button>
                            </div>
                        </div>
                        <div class="flex items-center justify-between">
                            <span class="text-[9px] text-slate-500 uppercase font-black tracking-widest">Sur le terrain</span>
                            <div class="flex items-center gap-3">
                                <button onclick="changeMissionCount(${v.id}, -1)" class="w-7 h-7 rounded bg-slate-800 flex items-center justify-center font-bold text-slate-400">-</button>
                                <span class="mono text-sm font-bold w-4 text-center ${v.inMission > 0 ? 'text-green-500' : 'text-slate-500'}">${v.inMission}</span>
                                <button onclick="changeMissionCount(${v.id}, 1)" class="w-7 h-7 rounded bg-slate-800 flex items-center justify-center font-bold text-green-500">+</button>
                            </div>
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
        const active = state.fleet.filter(v => v.count > 0);
        let html = `
            <div class="mb-6">
                <h2 class="text-xl font-black uppercase tracking-tight">Suivi Opérations</h2>
                <p class="text-[9px] text-slate-500 uppercase tracking-widest">Attribution des équipages et pertes</p>
            </div>
        `;

        if (active.length === 0) {
            html += `<div class="py-20 text-center text-slate-600 text-[10px] uppercase font-bold tracking-widest">Aucun véhicule déployé en opération</div>`;
        } else {
            html += `<div class="space-y-3">`;
            active.forEach(v => {
                html += `
                    <div class="bg-slate-800 border border-white/5 rounded-xl p-4">
                        <div class="flex justify-between items-center mb-3">
                            <h4 class="font-bold text-sm text-white">${v.type} <span class="text-blue-500 text-xs">(x${v.count})</span></h4>
                            <div class="flex gap-2 items-center bg-slate-900 border border-white/5 px-2 py-1 rounded-lg">
                            <span class="text-[8px] text-slate-500 font-black uppercase tracking-widest mr-1">Tern</span>
                            <button onclick="changeMissionCount(${v.id}, -1)" class="w-6 h-6 rounded bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-500">-</button>
                            <span class="mono text-[10px] font-bold w-4 text-center text-green-500">${v.inMission}</span>
                            <button onclick="changeMissionCount(${v.id}, 1)" class="w-6 h-6 rounded bg-slate-800 flex items-center justify-center text-xs font-bold text-green-500">+</button>
                            <span class="text-[10px] text-slate-600 font-bold ml-1">/ ${v.count}</span>
                        </div>
                        </div>
                        <div class="flex gap-1.5 mb-3">
                                <button onclick="updateStatus(${v.id}, 'Opérationnel')" 
                                        class="px-2 py-1 rounded text-[9px] font-black uppercase tracking-tighter border transition-all ${v.status === 'Opérationnel' ? 'bg-green-500/20 border-green-500 text-green-500' : 'bg-slate-900 border-white/5 text-slate-500'}">
                                    OPR
                                </button>
                                <button onclick="updateStatus(${v.id}, 'En Base')" 
                                        class="px-2 py-1 rounded text-[9px] font-black uppercase tracking-tighter border transition-all ${v.status === 'En Base' ? 'bg-blue-500/20 border-blue-500 text-blue-500' : 'bg-slate-900 border-white/5 text-slate-500'}">
                                    BASE
                                </button>
                                <button onclick="updateStatus(${v.id}, 'Détruit')" 
                                        class="px-2 py-1 rounded text-[9px] font-black uppercase tracking-tighter border transition-all ${v.status === 'Détruit' ? 'bg-red-500/20 border-red-500 text-red-500' : 'bg-slate-900 border-white/5 text-slate-500'}">
                                    OUT
                                </button>
                            </div>
                        <div class="flex items-center gap-2">
                            <div class="flex-1 bg-slate-900 rounded p-2 flex items-center gap-2">
                                <i data-lucide="user" class="w-3 h-3 text-slate-500"></i>
                                <input type="text" value="${v.crew}" placeholder="Nom du pilote..." 
                                       onblur="updateCrew(${v.id}, this.value)"
                                       class="bg-transparent text-[10px] text-white w-full outline-none">
                            </div>
                            <button onclick="reportLoss(${v.id})" class="bg-red-500/10 text-red-500 p-2 rounded">
                                <i data-lucide="skull" class="w-4 h-4"></i>
                            </button>
                        </div>
                    </div>
                `;
            });
            html += `</div>`;
        }
        container.innerHTML = html;
    }

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
    window.changeCount = (id, delta) => {
        const v = state.fleet.find(x => x.id === id);
        if (!v) return;
        if (v.count + delta < 0) return;

        v.count += delta;
        if (v.count > 0 && v.status === 'Pas déployé') v.status = 'Opérationnel';
        if (v.count === 0 && v.status === 'Opérationnel') v.status = 'Pas déployé';
        if (v) {
            v.count = Math.max(0, v.count + delta);
            // Limit inMission by new count
            if (v.inMission > v.count) v.inMission = v.count;

            updateVehicleStatusLocally(v);
            render();
            syncVehicle(v);
        }
    };

    window.changeMissionCount = (id, delta) => {
        const v = state.fleet.find(x => x.id === id);
        if (v) {
            v.inMission = Math.min(v.count, Math.max(0, v.inMission + delta));
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

    window.updateStatus = (id, status) => {
        const v = state.fleet.find(x => x.id === id);
        if (v) {
            if (status === 'Opérationnel') {
                v.inMission = v.count;
            } else if (status === 'En Base' || status === 'Pas déployé') {
                v.inMission = 0;
            } else if (status === 'Détruit') {
                state.history.push({ type: 'LOSS', vehicle: v.type, count: v.count, time: new Date() });
                v.count = 0;
                v.inMission = 0;
            }
            updateVehicleStatusLocally(v);
            render();
            syncVehicle(v);
        }
    };

    window.reportLoss = (id) => {
        if (!confirm("Confirmer la destruction d'une unité ?")) return;
        const v = state.fleet.find(x => x.id === id);
        if (v && v.count > 0) {
            state.history.push({ type: 'LOSS', vehicle: v.type, count: 1, time: new Date() });
            v.count--;
            if (v.count === 0) v.status = 'Détruit';
            render();
            syncVehicle(v);
        }
    };

    function calculateRemainingSupply() {
        let cost = 0;
        state.fleet.forEach(v => {
            // Include cost of deployed AND destroyed units? 
            // Previous logic: supplyCost += (v.deployed * v.cost) for Operational and Destroyed
            if (v.status === 'Opérationnel' || v.status === 'Détruit') {
                cost += (v.count * v.cost);
            }
        });
        // We also need to add history losses if v.count was reset
        state.history.filter(h => h.type === 'LOSS').forEach(h => {
            const vRef = state.fleet.find(f => f.type === h.vehicle);
            if (vRef) cost += (h.count * vRef.cost);
        });

        return state.supply - cost;
    }

    function updateGlobalStats() {
        const remaining = calculateRemainingSupply();
        document.getElementById('stat-supply').innerText = remaining;
        document.getElementById('stat-active').innerText = state.fleet.reduce((a, b) => a + (b.status === 'Opérationnel' ? b.count : 0), 0);
        document.getElementById('stat-lost').innerText = state.history.filter(h => h.type === 'LOSS').reduce((a, b) => a + b.count, 0);

        // New stats: Personnel and Medics
        const personnelEl = document.getElementById('stat-personnel');
        const medicsEl = document.getElementById('stat-medics');
        if (personnelEl) personnelEl.innerText = state.personnel;
        if (medicsEl) medicsEl.innerText = state.medics;

        // Header background status
        const slStatus = document.getElementById('sl-status');
        if (state.isShiftActive) {
            slStatus.innerText = `En Service (${state.slName})`;
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
        const formattedTime = `${now.toLocaleDateString('fr-FR')} ${now.toLocaleTimeString('fr-FR')}`;

        state.isShiftActive = true;
        state.startTime = now;
        syncShiftAction('shift_start', {
            pseudo: state.slName,
            startTime: formattedTime
        });

        saveAndSyncGlobals();
    };

    window.confirmStopShift = () => {
        closeModal();
        const now = new Date();
        const formattedTime = `${now.toLocaleDateString('fr-FR')} ${now.toLocaleTimeString('fr-FR')}`;
        const startTimeStr = `${state.startTime.toLocaleDateString('fr-FR')} ${state.startTime.toLocaleTimeString('fr-FR')}`;

        const totalDeployed = state.fleet.reduce((a, b) => a + b.count, 0);
        const totalDestroyed = state.history.filter(h => h.type === 'LOSS').reduce((a, b) => a + b.count, 0);

        syncShiftAction('shift_stop', {
            pseudo: state.slName,
            startTime: startTimeStr,
            endTime: formattedTime,
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
        console.log(`[SYNC] Globals: Personnel: ${state.personnel}, Medics: ${state.medics}, Supply: ${state.supply}`);
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
        console.log(`[SYNC] ${v.type} | Despl: ${v.count}, Miss: ${v.inMission}`);
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
        console.log(`[SHIFT] ${action}`, data);
        fetch(API_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({
                action: action,
                data: data
            })
        }).catch(err => console.error("Shift Sync Error", err));
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
                timerEl.innerText = `${h}:${m}:${s}`;
            } else if (timerEl) {
                timerEl.innerText = "00:00:00";
            }
        }, 1000);
    }

    // --- INIT ---
    init();
});
