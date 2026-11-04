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

// --- 2. URL PARSER & STATE ---
const urlParams = new URLSearchParams(window.location.search);
let currentEventId = urlParams.get('event') || 'walimah-haziq';
let memoryFeed = [];
let selectedMediaFiles = [];
let mediaRecorder = null;
let audioChunks = [];
let recordedAudioBase64 = null;
let recordTimerInterval = null;
let recordSeconds = 0;
let currentFilter = 'all';
let tvSlideshowInterval = null;
let tvCurrentIndex = 0;

document.addEventListener('DOMContentLoaded', () => {
    initGuestView();
});

// --- 3. GUEST VIEW & FIREBASE SYNC ---
function initGuestView() {
    if (!eventsRef) return;

    // Cari bahagian ini di dalam initGuestView() di customer.js dan kemaskini:
    eventsRef.child(currentEventId).child('config').on('value', (snapshot) => {
        const cfg = snapshot.val();
        if (cfg) {
            applyDynamicTheme(cfg);
            document.getElementById('disp-wedding-title').innerText = cfg.title || "LenteraKita";
            document.getElementById('disp-groom-bride').innerText = cfg.eventTitle || "Majlis Kenangan";
            document.getElementById('disp-wedding-date').innerText = `${cfg.date || ''} • ${cfg.venue || ''}`;
            document.getElementById('disp-welcome-msg').innerText = cfg.welcomeMsg || "Selamat datang!";

            // Set Background Kotak Welcome & Background Blur Keseluruhan
            const welcomeCard = document.getElementById('welcomeCardContainer');
            const bgElement = document.getElementById('dynamicBg');
            
            let bgSource = cfg.customBg; // Gambar pilihan admin
            
            if (!bgSource && memoryFeed.length > 0) {
                const latestPhoto = memoryFeed.find(item => item.media && item.media.length > 0);
                if (latestPhoto) bgSource = latestPhoto.media[0];
            }

            if (bgSource) {
                if (welcomeCard) welcomeCard.style.backgroundImage = `url('${bgSource}')`;
                if (bgElement) bgElement.style.backgroundImage = `url('${bgSource}')`;
            }
        }
    });

    eventsRef.child(currentEventId).child('memories').on('value', (snapshot) => {
        const data = snapshot.val();
        memoryFeed = [];
        if (data) {
            Object.keys(data).forEach(key => {
                memoryFeed.push({ id: key, ...data[key] });
            });
            memoryFeed.sort((a, b) => b.timestamp - a.timestamp);
        }
        renderFeed();
        updateDynamicBackground();
    });
}

function applyDynamicTheme(cfg) {
    const root = document.documentElement;
    if (cfg.themeBg) root.style.setProperty('--bg-color', cfg.themeBg);
    if (cfg.themeAccent) root.style.setProperty('--accent-color', cfg.themeAccent);
}

function updateDynamicBackground() {
    const bgElement = document.getElementById('dynamicBg');
    if (!bgElement) return;
    const latestPhoto = memoryFeed.find(item => item.media && item.media.length > 0);
    if (latestPhoto && latestPhoto.media[0]) {
        bgElement.style.backgroundImage = `url('${latestPhoto.media[0]}')`;
    }
}

function toggleSidebar() {
    const sidebar = document.getElementById('appSidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if (!sidebar) return;
    sidebar.classList.toggle('-translate-x-full');
    overlay.classList.toggle('hidden');
}

function switchTab(tab) {
    const formTab = document.getElementById('tab-form');
    const feedTab = document.getElementById('tab-feed');
    if (!formTab || !feedTab) return;

    if (tab === 'form') {
        formTab.classList.remove('hidden');
        feedTab.classList.add('hidden');
    } else if (tab === 'feed') {
        formTab.classList.add('hidden');
        feedTab.classList.remove('hidden');
    } else if (tab === 'tv') {
        openTvMode();
    }
}

function addWishTag(tagText) {
    const wishInput = document.getElementById('guestWish');
    if (wishInput) {
        wishInput.value = wishInput.value ? wishInput.value + " " + tagText : tagText;
    }
}

function handleFileSelect(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    selectedMediaFiles = [];
    const previewContainer = document.getElementById('mediaPreviewContainer');
    const placeholder = document.getElementById('uploadPlaceholder');
    if (!previewContainer || !placeholder) return;

    previewContainer.innerHTML = '';
    previewContainer.classList.remove('hidden');
    placeholder.classList.add('hidden');

    Array.from(files).forEach((file) => {
        const reader = new FileReader();
        reader.onload = function(e) {
            selectedMediaFiles.push(e.target.result);
            previewContainer.innerHTML += `<div class="relative aspect-square rounded-lg overflow-hidden border border-white/20"><img src="${e.target.result}" class="w-full h-full object-cover"></div>`;
        };
        reader.readAsDataURL(file);
    });
}

function clearMediaSelection() {
    selectedMediaFiles = [];
    const mediaInput = document.getElementById('mediaInput');
    const placeholder = document.getElementById('uploadPlaceholder');
    const previewContainer = document.getElementById('mediaPreviewContainer');
    if (mediaInput) mediaInput.value = '';
    if (placeholder) placeholder.classList.remove('hidden');
    if (previewContainer) {
        previewContainer.innerHTML = '';
        previewContainer.classList.add('hidden');
    }
}

async function toggleRecording() {
    const recordBtn = document.getElementById('recordBtn');
    const statusText = document.getElementById('recordStatus');
    const timerText = document.getElementById('recordTimer');

    if (mediaRecorder && mediaRecorder.state === "recording") {
        mediaRecorder.stop();
        return;
    }
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        mediaRecorder.ondataavailable = (e) => audioChunks.push(e.data);
        mediaRecorder.onstart = () => {
            if (recordBtn) recordBtn.classList.replace('bg-red-600', 'bg-amber-500');
            if (statusText) statusText.innerText = "Merekam...";
            if (timerText) timerText.classList.remove('hidden');
            recordSeconds = 0;
            recordTimerInterval = setInterval(() => {
                recordSeconds++;
                if (recordSeconds >= 30) toggleRecording();
            }, 1000);
        };
        mediaRecorder.onstop = () => {
            clearInterval(recordTimerInterval);
            if (recordBtn) recordBtn.classList.replace('bg-amber-500', 'bg-red-600');
            if (statusText) statusText.innerText = "Selesai!";
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            const reader = new FileReader();
            reader.onloadend = () => {
                recordedAudioBase64 = reader.result;
                const audioPreview = document.getElementById('audioPreview');
                const audioContainer = document.getElementById('audioPreviewContainer');
                if (audioPreview) audioPreview.src = recordedAudioBase64;
                if (audioContainer) audioContainer.classList.remove('hidden');
            };
            reader.readAsDataURL(audioBlob);
            stream.getTracks().forEach(t => t.stop());
        };
        mediaRecorder.start();
    } catch (err) { alert("Mikrofon ditolak."); }
}

function clearAudioRecording() {
    recordedAudioBase64 = null;
    const audioContainer = document.getElementById('audioPreviewContainer');
    const statusText = document.getElementById('recordStatus');
    const timerText = document.getElementById('recordTimer');
    if (audioContainer) audioContainer.classList.add('hidden');
    if (statusText) statusText.innerText = "Tekan mikrofon untuk mula rakam";
    if (timerText) timerText.classList.add('hidden');
}

function handleFormSubmit(e) {
    e.preventDefault();
    const nameInput = document.getElementById('guestName');
    const tableInput = document.getElementById('tableNo');
    const wishInput = document.getElementById('guestWish');
    if (!nameInput) return;

    const name = nameInput.value.trim();
    const table = tableInput ? tableInput.value.trim() : '';
    const wish = wishInput ? wishInput.value.trim() : '';
    if (!name) return alert("Sila masukkan nama!");

    const submitBtn = document.getElementById('submitBtn');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = `<i class="fa-solid fa-spinner animate-spin mr-2"></i> Menghantar...`;
    }

    const newMemory = {
        name, table: table || 'Tetamu', wish: wish || '',
        media: selectedMediaFiles.length > 0 ? selectedMediaFiles : null,
        audio: recordedAudioBase64 || null,
        timestamp: Date.now(),
        dateStr: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    eventsRef.child(currentEventId).child('memories').push(newMemory).then(() => {
        resetForm();
        switchTab('feed');
    });
}

function resetForm() {
    const form = document.getElementById('guestForm');
    if (form) form.reset();
    clearMediaSelection();
    clearAudioRecording();
    const submitBtn = document.getElementById('submitBtn');
    if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `<i class="fa-solid fa-paper-plane mr-2"></i> Hantar Kenangan`;
    }
}

function renderFeed() {
    const feedGrid = document.getElementById('feedGrid');
    if (!feedGrid) return;

    let filtered = memoryFeed.filter(item => {
        if (currentFilter === 'photo') return item.media !== null;
        if (currentFilter === 'voice') return item.audio !== null;
        return true;
    });

    if (filtered.length === 0) {
        feedGrid.innerHTML = `<div class="col-span-3 py-10 text-center text-slate-400 text-xs">Belum ada kenangan.</div>`;
        return;
    }

    let tilesHtml = [];
    filtered.forEach(item => {
        if (item.media && Array.isArray(item.media)) {
            item.media.forEach(imgUrl => {
                tilesHtml.push(`
                    <div class="memory-tile" onclick="openDetailModal('${item.id}')">
                        <img src="${imgUrl}" alt="Memory">
                        ${item.audio ? `<div class="absolute bottom-1 left-1 bg-black/60 px-1.5 py-0.5 rounded text-[9px] text-amber-300"><i class="fa-solid fa-microphone"></i></div>` : ''}
                    </div>
                `);
            });
        } else if (item.audio) {
            tilesHtml.push(`
                <div class="memory-tile flex flex-col items-center justify-center bg-slate-900 p-2 text-center" onclick="openDetailModal('${item.id}')">
                    <i class="fa-solid fa-microphone-lines text-amber-400 text-xl mb-1"></i>
                    <span class="text-[10px] text-amber-200 truncate w-full">${escapeHtml(item.name)}</span>
                </div>
            `);
        }
    });
    feedGrid.innerHTML = tilesHtml.join('');
}

function filterFeed(type) {
    currentFilter = type;
    ['all', 'photo', 'voice'].forEach(t => {
        const btn = document.getElementById(`filter-${t}`);
        if (!btn) return;
        btn.className = (t === type) ? "px-3 py-1 rounded-lg font-medium bg-amber-500 text-slate-950 text-xs" : "px-3 py-1 rounded-lg font-medium text-slate-300 hover:text-white text-xs";
    });
    renderFeed();
}

function openDetailModal(itemId) {
    const item = memoryFeed.find(m => m.id === itemId);
    if (!item) return;

    let mediaHtml = '';
    if (item.media && Array.isArray(item.media)) {
        mediaHtml = item.media.map(url => `<div class="rounded-xl overflow-hidden border border-white/15 bg-slate-950 flex justify-center mb-2"><img src="${url}" class="max-h-[40vh] object-contain w-full"></div>`).join('');
    }

    const modalContent = document.getElementById('modalContent');
    if (modalContent) {
        modalContent.innerHTML = `
            <div class="flex items-center space-x-3 border-b border-white/10 pb-3">
                <div class="w-10 h-10 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-300 font-bold">${escapeHtml(item.name.charAt(0).toUpperCase())}</div>
                <div>
                    <h4 class="font-serif font-bold text-amber-200 text-sm">${escapeHtml(item.name)}</h4>
                    <span class="text-[10px] text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">Meja: ${escapeHtml(item.table)} • ${item.dateStr || ''}</span>
                </div>
            </div>
            ${mediaHtml}
            ${item.wish ? `<div class="bg-slate-900/60 p-3 rounded-xl border border-white/10"><p class="text-xs text-slate-200 italic">"${escapeHtml(item.wish)}"</p></div>` : ''}
            ${item.audio ? `<div class="bg-slate-900/90 p-3 rounded-xl border border-amber-500/30 space-y-1"><p class="text-[10px] text-amber-300"><i class="fa-solid fa-microphone mr-1"></i> Ucapan Suara:</p><audio controls src="${item.audio}" class="w-full h-8"></audio></div>` : ''}
        `;
    }
    const detailModal = document.getElementById('detailModal');
    if (detailModal) detailModal.classList.remove('hidden');
}

function closeDetailModal() {
    const detailModal = document.getElementById('detailModal');
    if (detailModal) detailModal.classList.add('hidden');
}

let isAudioPlaying = true;
function toggleBackgroundAudio() {
    const bgAudio = document.getElementById('bgAudio');
    const audioIcon = document.getElementById('audioIcon');
    if (!bgAudio || !bgAudio.src) return alert("Tiada lagu latar untuk majlis ini.");
    if (bgAudio.paused) {
        bgAudio.play();
        if (audioIcon) audioIcon.className = "fa-solid fa-music animate-pulse text-amber-300";
    } else {
        bgAudio.pause();
        if (audioIcon) audioIcon.className = "fa-solid fa-volume-xmark text-slate-400";
    }
}

function openTvMode() {
    const tvModal = document.getElementById('tvModal');
    if (tvModal) tvModal.classList.remove('hidden');
    tvCurrentIndex = 0;
    renderTvSlide();
    if (tvSlideshowInterval) clearInterval(tvSlideshowInterval);
    tvSlideshowInterval = setInterval(() => {
        if (memoryFeed.length > 0) {
            tvCurrentIndex = (tvCurrentIndex + 1) % memoryFeed.length;
            renderTvSlide();
        }
    }, 6000);
}

function closeTvMode() {
    const tvModal = document.getElementById('tvModal');
    if (tvModal) tvModal.classList.add('hidden');
    if (tvSlideshowInterval) clearInterval(tvSlideshowInterval);
}

function renderTvSlide() {
    const container = document.getElementById('tvSlideContainer');
    if (!container) return;
    if (memoryFeed.length === 0) {
        container.innerHTML = `<p class="text-slate-300 text-sm">Menunggu ucapan...</p>`;
        return;
    }
    const item = memoryFeed[tvCurrentIndex];
    let firstImg = (item.media && item.media.length > 0) ? item.media[0] : '';
    container.innerHTML = `
        <span class="px-3 py-1 bg-amber-500/20 text-amber-300 rounded-full text-xs">${escapeHtml(item.name)} (${escapeHtml(item.table)})</span>
        ${item.wish ? `<h3 class="text-xl md:text-2xl font-serif text-amber-100 italic">"${escapeHtml(item.wish)}"</h3>` : ''}
        ${firstImg ? `<img src="${firstImg}" class="max-h-64 mx-auto rounded-2xl border border-white/20 shadow-2xl">` : ''}
    `;
}

function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}