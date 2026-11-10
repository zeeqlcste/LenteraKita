// --- 1. FIREBASE CONFIGURATION ---
const firebaseConfig = {
    databaseURL: "https://lenterakita-default-rtdb.asia-southeast1.firebasedatabase.app/"
};

let db = null;
let eventsRef = null;

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
        alert("Password salah! (Password: haziqkacak123)");
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
            audioUrl: document.getElementById('eventAudioUrl').value.trim(),
            customBg: document.getElementById('eventCustomBg').value.trim(),
            createdAt: Date.now()
        }
    };

    eventsRef.child(eventId).update(eventData).then(() => {
        alert(`Majlis '${eventId}' berjaya disimpan!`);
        const form = document.getElementById('createEventForm');
        if (form) form.reset();
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
            container.innerHTML = `<p class="text-xs text-slate-500 col-span-2">Tiada majlis didaftarkan.</p>`;
            if (badge) badge.innerText = `0 Majlis`;
            return;
        }

        const eventKeys = Object.keys(allEvents);
        if (badge) badge.innerText = `${eventKeys.length} Majlis`;

        container.innerHTML = eventKeys.map(key => {
            const ev = allEvents[key].config || {};
            const guestUrl = `${window.location.origin}/index.html?event=${key}`;
            return `
                <div class="bg-slate-950 border border-slate-800 p-4 rounded-xl space-y-3">
                    <div>
                        <span class="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">${ev.eventType || 'Majlis'}</span>
                        <h3 class="font-bold text-sm text-slate-100 mt-1">${escapeHtml(ev.eventTitle || key)}</h3>
                        <p class="text-[11px] text-slate-400">${escapeHtml(ev.date || '')}</p>
                    </div>
                    <div class="grid grid-cols-2 gap-2 pt-1">
                        <button onclick="showQrCode('${guestUrl}', '${escapeHtml(ev.eventTitle || key)}')" class="py-1.5 bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/30 rounded-lg text-xs font-medium">
                            <i class="fa-solid fa-qrcode mr-1"></i> QR Code
                        </button>
                        <button onclick="showEventStats('${key}')" class="py-1.5 bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30 border border-cyan-500/30 rounded-lg text-xs font-medium">
                            <i class="fa-solid fa-chart-bar mr-1"></i> Statistik
                        </button>
                    </div>
                    <div class="flex space-x-2 pt-1">
                        <a href="${guestUrl}" target="_blank" class="flex-1 py-1.5 text-center bg-slate-800 text-slate-200 hover:bg-slate-700 rounded-lg text-xs font-medium">Preview</a>
                        <button onclick="deleteEvent('${key}')" class="px-3 py-1.5 bg-red-900/40 text-red-400 border border-red-500/20 rounded-lg text-xs"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </div>
            `;
        }).join('');
    });
}

function showQrCode(url, title) {
    const qrModal = document.getElementById('qrModal');
    const qrModalTitle = document.getElementById('qrModalTitle');
    const qrModalUrl = document.getElementById('qrModalUrl');
    if (qrModalTitle) qrModalTitle.innerText = title;
    if (qrModalUrl) qrModalUrl.innerText = url;
    
    const qrContainer = document.getElementById('qrcode');
    if (qrContainer) {
        qrContainer.innerHTML = '';
        new QRCode(qrContainer, { text: url, width: 160, height: 160 });
    }
    if (qrModal) qrModal.classList.remove('hidden');
}

function closeQrModal() {
    const qrModal = document.getElementById('qrModal');
    if (qrModal) qrModal.classList.add('hidden');
}

function showEventStats(eventId) {
    eventsRef.child(eventId).once('value', (snapshot) => {
        const data = snapshot.val();
        if (!data || !data.memories) {
            alert("Belum ada sebarang data kenangan untuk majlis ini.");
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
                    <p>📌 <b>Jumlah Keseluruhan Hantaran:</b> ${memories.length}</p>
                    <p>💬 <b>Jumlah Ucapan (Wish):</b> ${totalWishes}</p>
                    <p>🖼️ <b>Jumlah Gambar/Video:</b> ${totalPhotos}</p>
                    <p>🎙️ <b>Jumlah Voice Note:</b> ${totalVoices}</p>
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

function deleteEvent(eventId) {
    if (confirm(`Padam majlis '${eventId}' secara kekal?`)) {
        eventsRef.child(eventId).remove().then(() => alert("Dipadam."));
    }
}

function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function handleCreateEvent(e) {
    e.preventDefault();
    if (!eventsRef) return;

    const eventIdInput = document.getElementById('eventId');
    if (!eventIdInput) return;

    const eventId = eventIdInput.value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
    
    // Ambil fail yang di-browse oleh admin
    const audioFile = document.getElementById('audioFilePicker').files[0];
    const bgFile = document.getElementById('bgFilePicker').files[0];

    // Fungsi pembantu untuk tukar fail kepada Base64
    const readFileAsDataURL = (file) => {
        return new Promise((resolve) => {
            if (!file) return resolve(null);
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.readAsDataURL(file);
        });
    };

    // Jalankan proses pembacaan fail serentak
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
                audioUrl: audioBase64 || "", // Simpan fail audio dalam bentuk data string
                customBg: bgBase64 || "",     // Simpan fail gambar background dalam bentuk data string
                createdAt: Date.now()
            }
        };

        eventsRef.child(eventId).update(eventData).then(() => {
            alert(`Majlis '${eventId}' berjaya disimpan dengan fail pilihan anda!`);
            const form = document.getElementById('createEventForm');
            if (form) form.reset();
        });
    });
}  