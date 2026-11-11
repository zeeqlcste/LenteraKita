const firebaseConfig = {
    databaseURL: "https://lenterakita-default-rtdb.asia-southeast1.firebasedatabase.app/"
};

let db = null;
let eventsRef = null;
let currentManagingEventId = null;
let lastSelectedEventId = null;
let lastSelectedBaseUrl = '';

try {
    firebase.initializeApp(firebaseConfig);
    db = firebase.database();
    eventsRef = db.ref('events');
} catch (e) {
    console.warn("Firebase warning.", e);
}

document.addEventListener('DOMContentLoaded', () => {
    initAdminSecurityAndDashboard();
});

function initAdminSecurityAndDashboard() {
    const isLogged = sessionStorage.getItem('lenterakita_admin_logged');
    if (isLogged === 'true') {
        showAdminDashboard();
    } else {
        const loginScreen = document.getElementById('adminLoginScreen');
        const dashboardContent = document.getElementById('adminDashboardContent');
        if (loginScreen) loginScreen.classList.remove('hidden');
        if (dashboardContent) dashboardContent.classList.add('hidden');
    }
}

function handleAdminLogin(e) {
    e.preventDefault();
    const passInput = document.getElementById('loginPassword');
    if (!passInput) return;

    if (passInput.value === 'haziqkacak123') {
        sessionStorage.setItem('lenterakita_admin_logged', 'true');
        showAdminDashboard();
    } else {
        alert("Wrong password! Sila semak semula kata laluan anda.");
        passInput.value = '';
    }
}

function showAdminDashboard() {
    const loginScreen = document.getElementById('adminLoginScreen');
    const dashboardContent = document.getElementById('adminDashboardContent');
    if (loginScreen) loginScreen.classList.add('hidden');
    if (dashboardContent) dashboardContent.classList.remove('hidden');
    loadAdminEventList();
}

function logoutAdmin() {
    sessionStorage.removeItem('lenterakita_admin_logged');
    window.location.reload();
}

function handleCreateEvent(e) {
    e.preventDefault();
    if (!eventsRef) return;

    const eventIdInput = document.getElementById('eventId');
    if (!eventIdInput) return;

    const eventId = eventIdInput.value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const audioFile = document.getElementById('audioFilePicker').files[0];
    const bgFile = document.getElementById('bgFilePicker').files[0];

    const readFileAsDataURL = (file) => {
        return new Promise((resolve) => {
            if (!file) return resolve(null);
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.readAsDataURL(file);
        });
    };

    Promise.all([
        readFileAsDataURL(audioFile),
        readFileAsDataURL(bgFile)
    ]).then(([audioBase64, bgBase64]) => {
        
        const eventData = {
            config: {
                eventId: eventId,
                eventType: document.getElementById('eventType').value,
                title: "LenteraKita",
                eventTitle: document.getElementById('eventTitle').value,
                date: document.getElementById('eventDate').value,
                venue: document.getElementById('eventVenue').value,
                welcomeMsg: document.getElementById('eventWelcome').value,
                themeBg: document.getElementById('themeBg').value,
                themeAccent: document.getElementById('themeAccent').value,
                audioUrl: audioBase64 || "",
                customBg: bgBase64 || "",
                createdAt: Date.now()
            }
        };

        eventsRef.child(eventId).update(eventData).then(() => {
            alert(`Event '${eventId}' berjaya didaftarkan!`);
            const form = document.getElementById('createEventForm');
            if (form) form.reset();
        });
    });
}

function loadAdminEventList() {
    if (!eventsRef) return;
    eventsRef.on('value', (snapshot) => {
        const allEvents = snapshot.val();
        const container = document.getElementById('eventListGrid');
        const badge = document.getElementById('eventCountBadge');
        if (!container) return;

        if (!allEvents) {
            container.innerHTML = `<p class="text-xs text-slate-500 col-span-2">No events registered yet.</p>`;
            if (badge) badge.innerText = `0 Events`;
            return;
        }

        const eventKeys = Object.keys(allEvents);
        if (badge) badge.innerText = `${eventKeys.length} Events`;

        container.innerHTML = eventKeys.map(key => {
            const ev = allEvents[key].config || {};
            const guestUrl = `${window.location.origin}${window.location.pathname.replace(/admin\.html.*$/i, '')}index.html?event=${key}`;
            return `
                <div class="bg-slate-950 border border-slate-800 p-4 rounded-xl space-y-3">
                    <div>
                        <span class="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">${ev.eventType || 'Event'}</span>
                        <h3 class="font-bold text-sm text-slate-100 mt-1">${escapeHtml(ev.eventTitle || key)}</h3>
                        <p class="text-[11px] text-slate-400">${escapeHtml(ev.date || '')} ${ev.venue ? '• ' + escapeHtml(ev.venue) : ''}</p>
                    </div>
                    <div class="grid grid-cols-3 gap-1.5 pt-1">
                        <button onclick="showQrCode('${guestUrl}', '${escapeHtml(ev.eventTitle || key)}', '${key}')" class="py-1.5 bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/30 rounded-lg text-xs font-medium">
                            <i class="fa-solid fa-qrcode"></i> QR
                        </button>
                        <button onclick="openManageModal('${key}')" class="py-1.5 bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30 border border-cyan-500/30 rounded-lg text-xs font-medium">
                            <i class="fa-solid fa-pen-to-square"></i> Edit
                        </button>
                        <button onclick="showEventStats('${key}')" class="py-1.5 bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 border border-purple-500/30 rounded-lg text-xs font-medium">
                            <i class="fa-solid fa-chart-bar"></i> Stats
                        </button>
                    </div>
                    <div class="flex space-x-2 pt-1">
                        <a href="${guestUrl}" target="_blank" class="flex-1 py-1.5 text-center bg-slate-800 text-slate-200 hover:bg-slate-700 rounded-lg text-xs font-medium">Preview Guest View</a>
                        <button onclick="deleteEvent('${key}')" class="px-3 py-1.5 bg-red-900/40 text-red-400 border border-red-500/20 hover:bg-red-900/60 rounded-lg text-xs" title="Padam Acara"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </div>
            `;
        }).join('');
    });
}

function openManageModal(eventId) {
    currentManagingEventId = eventId;
    lastSelectedEventId = eventId;
    const modal = document.getElementById('adminManageModal');
    if (!modal) return;

    eventsRef.child(eventId).once('value', snapshot => {
        const data = snapshot.val();
        if (!data || !data.config) return;

        const cfg = data.config;
        document.getElementById('manageModalTitle').innerText = `Manage: ${cfg.eventTitle || eventId}`;
        document.getElementById('editEventId').value = eventId;
        document.getElementById('editEventTitle').value = cfg.eventTitle || '';
        document.getElementById('editEventDate').value = cfg.date || '';
        document.getElementById('editEventVenue').value = cfg.venue || '';
        document.getElementById('editEventWelcome').value = cfg.welcomeMsg || '';

        modal.classList.remove('hidden');
        switchAdminTab('details');
        loadAdminMemories(eventId, data.memories);
    });
}

function closeManageModal() {
    const modal = document.getElementById('adminManageModal');
    if (modal) modal.classList.add('hidden');
    currentManagingEventId = null;
}

function switchAdminTab(tabName) {
    const detailsTab = document.getElementById('admin-tab-details');
    const memoriesTab = document.getElementById('admin-tab-memories');
    const detailsBtn = document.getElementById('admin-tab-btn-details');
    const memoriesBtn = document.getElementById('admin-tab-btn-memories');

    if (tabName === 'details') {
        detailsTab.classList.remove('hidden');
        memoriesTab.classList.add('hidden');
        detailsBtn.className = "px-3 py-1.5 rounded-lg bg-amber-500 text-slate-950 font-bold";
        memoriesBtn.className = "px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300";
    } else {
        detailsTab.classList.add('hidden');
        memoriesTab.classList.remove('hidden');
        memoriesBtn.className = "px-3 py-1.5 rounded-lg bg-amber-500 text-slate-950 font-bold";
        detailsBtn.className = "px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300";
    }
}

function handleUpdateEvent(e) {
    e.preventDefault();
    if (!currentManagingEventId) return;

    const eventId = currentManagingEventId;
    const audioFile = document.getElementById('editAudioFile').files[0];
    const bgFile = document.getElementById('editBgFile').files[0];

    const readFileAsDataURL = (file) => {
        return new Promise((resolve) => {
            if (!file) return resolve(null);
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.readAsDataURL(file);
        });
    };

    Promise.all([
        readFileAsDataURL(audioFile),
        readFileAsDataURL(bgFile)
    ]).then(([newAudioBase64, newBgBase64]) => {
        
        eventsRef.child(eventId).child('config').once('value', snapshot => {
            const oldConfig = snapshot.val() || {};

            const updatedConfig = {
                ...oldConfig,
                eventTitle: document.getElementById('editEventTitle').value,
                date: document.getElementById('editEventDate').value,
                venue: document.getElementById('editEventVenue').value,
                welcomeMsg: document.getElementById('editEventWelcome').value,
                audioUrl: newAudioBase64 || oldConfig.audioUrl,
                customBg: newBgBase64 || oldConfig.customBg
            };

            eventsRef.child(eventId).child('config').set(updatedConfig).then(() => {
                alert("Event details updated successfully!");
                closeManageModal();
            });
        });
    });
}

function loadAdminMemories(eventId, memoriesData) {
    const grid = document.getElementById('adminMemoriesGrid');
    if (!grid) return;

    if (!memoriesData) {
        grid.innerHTML = `<p class="col-span-3 text-center text-slate-500 py-4">No memories uploaded yet.</p>`;
        return;
    }

    let html = [];
    Object.keys(memoriesData).forEach(memoryId => {
        const item = memoriesData[memoryId];
        if (item.media && Array.isArray(item.media)) {
            item.media.forEach((imgUrl) => {
                html.push(`
                    <div class="relative group bg-slate-950 rounded-xl overflow-hidden border border-slate-800 aspect-square">
                        <img src="${imgUrl}" class="w-full h-full object-cover">
                        <div class="absolute inset-0 bg-black/75 opacity-0 group-hover:opacity-100 transition flex flex-col justify-between p-2">
                            <span class="text-[10px] text-amber-300 truncate">${escapeHtml(item.name)}</span>
                            <button onclick="deleteMemoryItem('${eventId}', '${memoryId}')" class="bg-red-600 hover:bg-red-500 text-white py-1 px-2 rounded text-[10px] font-bold"><i class="fa-solid fa-trash mr-1"></i> Delete</button>
                        </div>
                    </div>
                `);
            });
        }
    });

    grid.innerHTML = html.length > 0 ? html.join('') : `<p class="col-span-3 text-center text-slate-500 py-4">No photos found.</p>`;
}

function deleteMemoryItem(eventId, memoryId) {
    if (confirm("Adakah anda pasti untuk memadam item memori ini secara kekal?")) {
        eventsRef.child(eventId).child('memories').child(memoryId).remove().then(() => {
            alert("Memory deleted successfully.");
            eventsRef.child(eventId).once('value', snapshot => {
                const data = snapshot.val();
                loadAdminMemories(eventId, data.memories);
            });
        });
    }
}

function showQrCode(url, title, eventId) {
    lastSelectedBaseUrl = url;
    lastSelectedEventId = eventId;
    const qrModal = document.getElementById('qrModal');
    const qrModalTitle = document.getElementById('qrModalTitle');
    const qrModalUrl = document.getElementById('qrModalUrl');
    const tableInput = document.getElementById('qrTableInput');

    if (qrModalTitle) qrModalTitle.innerText = title;
    if (qrModalUrl) qrModalUrl.innerText = url;
    if (tableInput) tableInput.value = '';
    
    const qrContainer = document.getElementById('qrcode');
    if (qrContainer) {
        qrContainer.innerHTML = '';
        new QRCode(qrContainer, { text: url, width: 150, height: 150 });
    }
    if (qrModal) qrModal.classList.remove('hidden');
}

function updateQrWithTable() {
    if (!lastSelectedBaseUrl) return;
    const tableInput = document.getElementById('qrTableInput');
    const tableVal = tableInput ? tableInput.value.trim() : '';
    let finalUrl = lastSelectedBaseUrl;
    if (tableVal) {
        finalUrl += `&table=${encodeURIComponent(tableVal)}`;
    }
    const qrModalUrl = document.getElementById('qrModalUrl');
    if (qrModalUrl) qrModalUrl.innerText = finalUrl;
    const qrContainer = document.getElementById('qrcode');
    if (qrContainer) {
        qrContainer.innerHTML = '';
        new QRCode(qrContainer, { text: finalUrl, width: 150, height: 150 });
    }
}

function copyQrUrl() {
    const qrModalUrl = document.getElementById('qrModalUrl');
    if (!qrModalUrl || !qrModalUrl.innerText) return;
    const text = qrModalUrl.innerText;
    if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(() => alert("Link QR berjaya disalin!"));
    } else {
        prompt("Salin link ini:", text);
    }
}

function closeQrModal() {
    const qrModal = document.getElementById('qrModal');
    if (qrModal) qrModal.classList.add('hidden');
}

function showEventStats(eventId) {
    lastSelectedEventId = eventId;
    eventsRef.child(eventId).once('value', (snapshot) => {
        const data = snapshot.val();
        if (!data || !data.memories) {
            alert("No memories data recorded for this event yet.");
            return;
        }
        const memories = Object.values(data.memories);
        let totalWishes = memories.filter(m => m.wish && m.wish.length > 0).length;
        let totalPhotos = 0;
        let totalVoices = memories.filter(m => m.audio !== null).length;

        memories.forEach(m => {
            if (m.media && Array.isArray(m.media)) totalPhotos += m.media.length;
        });

        const modalBody = document.getElementById('statModalBody');
        if (modalBody) {
            modalBody.innerHTML = `
                <div class="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                    <p>📌 <b>Total Posts:</b> ${memories.length}</p>
                    <p>💬 <b>Total Wishes:</b> ${totalWishes}</p>
                    <p>🖼️ <b>Total Photos/Videos:</b> ${totalPhotos}</p>
                    <p>🎙️ <b>Total Voice Notes:</b> ${totalVoices}</p>
                </div>
            `;
        }
        const statModal = document.getElementById('statModal');
        if (statModal) statModal.classList.remove('hidden');
    });
}

function closeStatModal() {
    const statModal = document.getElementById('statModal');
    if (statModal) statModal.classList.add('hidden');
}

function exportCurrentEventWishesCsv() {
    const eventId = currentManagingEventId || lastSelectedEventId;
    if (!eventId) return alert("Sila pilih majlis terlebih dahulu.");
    exportWishesCsv(eventId);
}

function exportWishesCsv(eventId) {
    if (!eventsRef) return;
    eventsRef.child(eventId).once('value', snapshot => {
        const data = snapshot.val();
        if (!data || !data.memories) return alert("Tiada data ucapan untuk dieksport.");

        const memories = Object.values(data.memories);
        let csvContent = "Nama Tetamu,Meja,Masa,Ucapan,Gambar,Voice Note,Jumlah Likes\n";

        memories.forEach(m => {
            const name = `"${(m.name || '').replace(/"/g, '""')}"`;
            const table = `"${(m.table || '').replace(/"/g, '""')}"`;
            const dateStr = `"${(m.dateStr || '').replace(/"/g, '""')}"`;
            const wish = `"${(m.wish || '').replace(/"/g, '""')}"`;
            const hasMedia = (m.media && m.media.length > 0) ? `${m.media.length} Foto` : "Tiada";
            const hasAudio = m.audio ? "Ada" : "Tiada";
            const likes = m.likes || 0;

            csvContent += `${name},${table},${dateStr},${wish},${hasMedia},${hasAudio},${likes}\n`;
        });

        const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `lenterakita-ucapan-${eventId}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });
}

function deleteEvent(eventId) {
    if (confirm(`Padam acara '${eventId}' secara kekal? Semua data memori akan hilang.`)) {
        eventsRef.child(eventId).remove().then(() => alert("Event deleted."));
    }
}

function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
