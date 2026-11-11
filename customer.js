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

// Semak URL Parameter (?event=... & ?table=...)
const urlParams = new URLSearchParams(window.location.search);
let currentEventId = urlParams.get('event');
let currentTable = urlParams.get('table') || urlParams.get('meja') || '';
let currentEventConfig = null;

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
let cameraStream = null;
let currentFacingMode = 'environment';
let activeFilterClass = 'filter-normal';
let sliderIndexes = {};

// Instagram Story Viewer States
let activeStoryItems = [];
let currentStoryIndex = 0;
let storyTimer = null;

// Showcase Carousel States (Landing Page)
let currentShowcaseIndex = 0;
let showcaseInterval = null;

document.addEventListener('DOMContentLoaded', () => {
    initAppRouting();
});

// Routing pintar antara Landing Page & Guest Event View
function initAppRouting() {
    const landingDashboard = document.getElementById('landingDashboard');
    const guestAppWrapper = document.getElementById('guestAppWrapper');

    if (!currentEventId) {
        // Paparkan Landing Dashboard rasmi jika tiada event parameter
        if (landingDashboard) landingDashboard.classList.remove('hidden');
        if (guestAppWrapper) guestAppWrapper.classList.add('hidden');
        document.title = "LenteraKita - Digital Memory Wall & Buku Tetamu Moden";
        initShowcaseAutoPlay();
    } else {
        // Paparkan Paparan Tetamu Majlis jika ada ?event=...
        if (landingDashboard) landingDashboard.classList.add('hidden');
        if (guestAppWrapper) guestAppWrapper.classList.remove('hidden');
        initGuestView();
    }
}

// Logik Showcase Bergerak / Auto-Rotating Carousel di Landing Page
function initShowcaseAutoPlay() {
    if (showcaseInterval) clearInterval(showcaseInterval);
    showcaseInterval = setInterval(() => {
        nextShowcaseSlide();
    }, 4500);
}

function setShowcaseSlide(index) {
    const totalSlides = 4;
    currentShowcaseIndex = (index + totalSlides) % totalSlides;
    
    for (let i = 0; i < totalSlides; i++) {
        const slide = document.getElementById(`showcase-slide-${i}`);
        const dot = document.getElementById(`showcase-dot-${i}`);
        if (slide) {
            if (i === currentShowcaseIndex) {
                slide.classList.remove('opacity-0', 'z-0');
                slide.classList.add('opacity-100', 'z-10');
            } else {
                slide.classList.remove('opacity-100', 'z-10');
                slide.classList.add('opacity-0', 'z-0');
            }
        }
        if (dot) {
            if (i === currentShowcaseIndex) {
                dot.className = "px-2.5 sm:px-3 py-1 rounded-full text-[10px] font-bold bg-amber-500 text-slate-950 transition";
            } else {
                dot.className = "px-2.5 sm:px-3 py-1 rounded-full text-[10px] font-bold bg-white/15 text-slate-300 hover:bg-white/25 transition";
            }
        }
    }
}

function nextShowcaseSlide() {
    setShowcaseSlide(currentShowcaseIndex + 1);
}

function prevShowcaseSlide() {
    setShowcaseSlide(currentShowcaseIndex - 1);
}

// Carian Kod Acara dari Landing Page
function handleLandingEventSearch(e) {
    if (e) e.preventDefault();
    const input = document.getElementById('landingEventCodeInput');
    if (!input || !input.value.trim()) return;
    const code = input.value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
    window.location.href = `index.html?event=${encodeURIComponent(code)}`;
}

function initGuestView() {
    if (!eventsRef || !currentEventId) return;

    // Auto-isi nombor meja daripada URL jika ada (?table=M05)
    if (currentTable) {
        const tableInput = document.getElementById('tableNo');
        const tableBadge = document.getElementById('disp-table-badge');
        if (tableInput) tableInput.value = currentTable;
        if (tableBadge) {
            tableBadge.innerText = `Meja: ${currentTable}`;
            tableBadge.classList.remove('hidden');
        }
    }

    // Dengar konfigurasi tema & maklumat majlis
    eventsRef.child(currentEventId).child('config').on('value', (snapshot) => {
        const cfg = snapshot.val();
        if (cfg) {
            currentEventConfig = cfg;
            applyDynamicTheme(cfg);
            document.title = `${cfg.eventTitle || 'Majlis'} - LenteraKita Memory Wall`;

            const titleEl = document.getElementById('disp-wedding-title');
            const groomEl = document.getElementById('disp-groom-bride');
            const dateEl = document.getElementById('disp-wedding-date');
            const welcomeEl = document.getElementById('disp-welcome-msg');

            if (titleEl) titleEl.innerText = cfg.title || "LenteraKita";
            if (groomEl) groomEl.innerText = cfg.eventTitle || "Wedding Event";
            if (dateEl) dateEl.innerText = `${cfg.date || ''} • ${cfg.venue || ''}`;
            if (welcomeEl) welcomeEl.innerText = cfg.welcomeMsg || "Selamat datang ke majlis kami!";

            const welcomeCard = document.getElementById('welcomeCardContainer');
            const bgElement = document.getElementById('dynamicBg');
            let bgSource = cfg.customBg;

            if (!bgSource && memoryFeed.length > 0) {
                const latestPhoto = memoryFeed.find(item => item.media && item.media.length > 0);
                if (latestPhoto) bgSource = latestPhoto.media[0];
            }

            if (bgSource) {
                if (welcomeCard) welcomeCard.style.backgroundImage = `url('${bgSource}')`;
                if (bgElement) bgElement.style.backgroundImage = `url('${bgSource}')`;
            }

            const bgAudio = document.getElementById('bgAudio');
            if (bgAudio && cfg.audioUrl && !bgAudio.src) {
                bgAudio.src = cfg.audioUrl;
                bgAudio.play().catch(() => {
                    console.log("Auto-play blocked by browser policy. User can click music button.");
                });
            }
        }
    });

    // Dengar suapan memori tetamu secara masa nyata
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
        renderVoiceVault();
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
    const welcomeCard = document.getElementById('welcomeCardContainer');
    if (!bgElement) return;
    const latestPhoto = memoryFeed.find(item => item.media && item.media.length > 0);
    if (latestPhoto && latestPhoto.media[0]) {
        bgElement.style.backgroundImage = `url('${latestPhoto.media[0]}')`;
        if (welcomeCard && !welcomeCard.style.backgroundImage) {
            welcomeCard.style.backgroundImage = `url('${latestPhoto.media[0]}')`;
        }
    }
}

function toggleSidebar() {
    const sidebar = document.getElementById('appSidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if (!sidebar) return;
    sidebar.classList.toggle('-translate-x-full');
    overlay.classList.toggle('hidden');
}

function switchTab(tabName) {
    if (tabName === 'tv') {
        openTvMode();
        return;
    }
    ['feed', 'explore', 'voice'].forEach(t => {
        const el = document.getElementById(`tab-${t}`);
        const nav = document.getElementById(`nav-${t}`);
        if (el) el.classList.add('hidden');
        if (nav) nav.classList.remove('active');
    });

    const targetTab = document.getElementById(`tab-${tabName}`);
    const targetNav = document.getElementById(`nav-${tabName}`);
    if (targetTab) targetTab.classList.remove('hidden');
    if (targetNav) targetNav.classList.add('active');

    if (tabName === 'explore') renderExploreGrid();
    if (tabName === 'voice') renderVoiceVault();
}

function addWishTag(tagText) {
    const wishInput = document.getElementById('guestWish');
    if (wishInput) {
        wishInput.value = wishInput.value ? wishInput.value + " " + tagText : tagText;
    }
}

// --- Live Camera & Aesthetic Filter Studio ---
async function openCameraModal() {
    const modal = document.getElementById('cameraModal');
    const video = document.getElementById('cameraVideo');
    if (!modal || !video) return;

    modal.classList.remove('hidden');
    selectedMediaFiles = [];
    updateCameraThumbBadge();

    try {
        if (cameraStream) {
            cameraStream.getTracks().forEach(t => t.stop());
        }
        cameraStream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: currentFacingMode }, 
            audio: false 
        });
        video.srcObject = cameraStream;
    } catch (err) {
        console.warn("Akses kamera disekat atau gagal:", err);
        // Fallback mesra pengguna: beritahu pengguna mereka boleh pilih gambar dari galeri
        alert("Kebenaran kamera tidak aktif atau disekat oleh pelayar. Anda masih boleh memilih gambar daripada Galeri Telefon anda!");
    }
}

function closeCameraModal() {
    const modal = document.getElementById('cameraModal');
    if (modal) modal.classList.add('hidden');
    if (cameraStream) {
        cameraStream.getTracks().forEach(t => t.stop());
        cameraStream = null;
    }
}

function setCameraFilter(filterName, btnElement) {
    activeFilterClass = filterName;
    const video = document.getElementById('cameraVideo');
    if (video) {
        video.className = `w-full h-full object-cover ${filterName} transition-all duration-300`;
    }
    document.querySelectorAll('.filter-chip').forEach(b => {
        b.className = "filter-chip px-3 py-1.5 rounded-full bg-white/20 text-white font-medium text-[11px] flex-shrink-0";
    });
    btnElement.className = "filter-chip px-3 py-1.5 rounded-full bg-amber-500 text-slate-950 font-bold text-[11px] flex-shrink-0";
}

function switchCameraFacing() {
    currentFacingMode = currentFacingMode === 'environment' ? 'user' : 'environment';
    openCameraModal();
}

// Tangkap gambar dengan mampatan saiz automatik (max 1200px, JPEG 0.80)
function capturePhotoFromCamera() {
    const video = document.getElementById('cameraVideo');
    const canvas = document.getElementById('cameraCanvas');
    if (!video || !canvas) return;

    let width = video.videoWidth || 720;
    let height = video.videoHeight || 1280;
    const maxDim = 1200;

    // Rescale jika saiz terlalu besar
    if (width > maxDim || height > maxDim) {
        if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
        } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
        }
    }

    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    ctx.filter = window.getComputedStyle(video).getPropertyValue('filter');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.80);
    selectedMediaFiles.push(dataUrl);

    updateCameraThumbBadge();
    
    const thumbBox = document.getElementById('thumbPreviewBox');
    if (thumbBox) {
        thumbBox.innerHTML = `<img src="${dataUrl}" class="w-full h-full object-cover">`;
        thumbBox.classList.add('scale-110', 'border-amber-400');
        setTimeout(() => thumbBox.classList.remove('scale-110', 'border-amber-400'), 200);
    }
}

// Muat naik gambar dari Galeri Telefon dengan mampatan automatik
async function handleGalleryUpload(e) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file.type.startsWith('image/')) continue;
        try {
            const compressed = await compressImageFile(file, 1200, 0.78);
            selectedMediaFiles.push(compressed);
        } catch (err) {
            console.error("Gagal mampatkan gambar galeri:", err);
        }
    }

    updateCameraThumbBadge();
    const thumbBox = document.getElementById('thumbPreviewBox');
    if (thumbBox && selectedMediaFiles.length > 0) {
        thumbBox.innerHTML = `<img src="${selectedMediaFiles[selectedMediaFiles.length - 1]}" class="w-full h-full object-cover">`;
    }
    e.target.value = '';
}

function compressImageFile(file, maxDim = 1200, quality = 0.78) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                let width = img.width;
                let height = img.height;
                if (width > maxDim || height > maxDim) {
                    if (width > height) {
                        height = Math.round((height * maxDim) / width);
                        width = maxDim;
                    } else {
                        width = Math.round((width * maxDim) / height);
                        height = maxDim;
                    }
                }
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.onerror = reject;
            img.src = event.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// Tambah Cop Bingkai Watermark Pengantin
function applyWatermarkToImage(dataUrl, eventTitle) {
    return new Promise((resolve) => {
        if (!eventTitle) return resolve(dataUrl);
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);

            // Lapisan gelap bawah
            const barHeight = Math.max(38, Math.round(canvas.height * 0.065));
            ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
            ctx.fillRect(0, canvas.height - barHeight, canvas.width, barHeight);

            // Garisan emas
            ctx.strokeStyle = '#E5C158';
            ctx.lineWidth = Math.max(2, Math.round(canvas.height * 0.004));
            ctx.beginPath();
            ctx.moveTo(0, canvas.height - barHeight);
            ctx.lineTo(canvas.width, canvas.height - barHeight);
            ctx.stroke();

            // Teks Watermark
            const fontSize = Math.max(13, Math.round(barHeight * 0.42));
            ctx.font = `600 ${fontSize}px sans-serif`;
            ctx.fillStyle = '#E5C158';
            ctx.textBaseline = 'middle';
            ctx.fillText(`✨ LenteraKita • ${eventTitle}`, 16, canvas.height - (barHeight / 2));

            resolve(canvas.toDataURL('image/jpeg', 0.82));
        };
        img.onerror = () => resolve(dataUrl);
        img.src = dataUrl;
    });
}

function updateCameraThumbBadge() {
    const badge = document.getElementById('capturedCountBadge');
    if (badge) badge.innerText = `${selectedMediaFiles.length} Photos`;
}

// --- POPUP WISHES MODAL ---
function openWishesPopup() {
    if (selectedMediaFiles.length === 0) {
        return alert("Sila tangkap atau pilih sekurang-kurangnya satu gambar terlebih dahulu!");
    }
    closeCameraModal();

    const popup = document.getElementById('wishesPopupModal');
    const previewContainer = document.getElementById('popupMediaPreview');
    if (popup) popup.classList.remove('hidden');

    if (previewContainer) {
        previewContainer.innerHTML = selectedMediaFiles.map(url => `
            <div class="relative aspect-square rounded-lg overflow-hidden border border-white/20">
                <img src="${url}" class="w-full h-full object-cover">
            </div>
        `).join('');
    }
}

function closeWishesPopup() {
    const popup = document.getElementById('wishesPopupModal');
    if (popup) popup.classList.add('hidden');
}

// --- INSTAGRAM STORY VIEWER (Tap-to-advance) ---
function openStoryViewer(startIndex = 0) {
    activeStoryItems = memoryFeed.filter(item => item.media && item.media.length > 0);
    if (activeStoryItems.length === 0) return alert("Tiada story gambar untuk dipaparkan.");

    currentStoryIndex = startIndex;
    const modal = document.getElementById('storyViewerModal');
    if (modal) modal.classList.remove('hidden');

    renderCurrentStorySlide();
}

function closeStoryViewer() {
    const modal = document.getElementById('storyViewerModal');
    if (modal) modal.classList.add('hidden');
    if (storyTimer) clearTimeout(storyTimer);
}

function renderCurrentStorySlide() {
    if (storyTimer) clearTimeout(storyTimer);
    if (currentStoryIndex < 0) currentStoryIndex = 0;
    if (currentStoryIndex >= activeStoryItems.length) {
        closeStoryViewer();
        return;
    }

    const item = activeStoryItems[currentStoryIndex];
    const imgEl = document.getElementById('storyMediaImg');
    const avatarEl = document.getElementById('storyAvatar');
    const usernameEl = document.getElementById('storyUsername');
    const metaEl = document.getElementById('storyMeta');
    const footerEl = document.getElementById('storyWishFooter');
    const barsContainer = document.getElementById('storyProgressBars');

    if (imgEl && item.media && item.media[0]) imgEl.src = item.media[0];
    if (avatarEl) avatarEl.innerText = item.name ? item.name.charAt(0).toUpperCase() : 'G';
    if (usernameEl) usernameEl.innerText = item.name || 'Guest';
    if (metaEl) metaEl.innerText = `Table: ${item.table || '-'} • ${item.dateStr || ''}`;
    if (footerEl) footerEl.innerHTML = item.wish ? `"${escapeHtml(item.wish)}"` : '<span class="italic opacity-60">Tiada ucapan</span>';

    // Progress Bars atas ala Instagram
    if (barsContainer) {
        barsContainer.innerHTML = activeStoryItems.map((_, idx) => `
            <div class="h-1 flex-grow rounded-full bg-white/30 overflow-hidden">
                <div class="h-full bg-white transition-all duration-linear ${idx < currentStoryIndex ? 'w-full' : idx === currentStoryIndex ? 'w-full animate-[pulse_1s_infinite]' : 'w-0'}"></div>
            </div>
        `).join('');
    }

    storyTimer = setTimeout(() => {
        nextStorySlide();
    }, 5000);
}

function nextStorySlide() {
    currentStoryIndex++;
    renderCurrentStorySlide();
}

function prevStorySlide() {
    currentStoryIndex--;
    renderCurrentStorySlide();
}

// --- Voice Vault Recording ---
async function toggleRecording() {
    const recordBtn = document.getElementById('recordBtn');
    const statusText = document.getElementById('recordStatus');
    const timerText = document.getElementById('recordTimer');

    if (mediaRecorder && mediaRecorder.state === "recording") {
        mediaRecorder.stop();
        return;
    }

    try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            alert("Pelayar web anda tidak menyokong rakaman audio.");
            return;
        }

        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        let options = { mimeType: 'audio/webm' };
        if (!MediaRecorder.isTypeSupported('audio/webm')) {
            if (MediaRecorder.isTypeSupported('audio/mp4')) {
                options = { mimeType: 'audio/mp4' };
            } else {
                options = {};
            }
        }

        mediaRecorder = new MediaRecorder(stream, options);
        audioChunks = [];

        mediaRecorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) audioChunks.push(e.data);
        };

        mediaRecorder.onstart = () => {
            if (recordBtn) recordBtn.classList.replace('bg-red-600', 'bg-amber-500');
            if (statusText) statusText.innerText = "Sedang merakam suara...";
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
            if (statusText) statusText.innerText = "Rakaman berjaya disimpan!";
            
            const audioBlob = new Blob(audioChunks, { type: options.mimeType || 'audio/webm' });
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
    } catch (err) {
        alert("Gagal mengakses mikrofon. Sila benarkan akses mikrofon dalam tetapan pelayar anda.");
    }
}

function clearAudioRecording() {
    recordedAudioBase64 = null;
    const audioContainer = document.getElementById('audioPreviewContainer');
    const statusText = document.getElementById('recordStatus');
    const timerText = document.getElementById('recordTimer');
    if (audioContainer) audioContainer.classList.add('hidden');
    if (statusText) statusText.innerText = "Tekan mikrofon untuk mula merakam (Maks 30s)";
    if (timerText) timerText.classList.add('hidden');
}

function submitVoiceNote() {
    if (!recordedAudioBase64) return alert("Sila rakam suara terlebih dahulu!");
    const nameInput = document.getElementById('voiceSenderName');
    const name = nameInput ? nameInput.value.trim() : "Tetamu";
    if (!name) return alert("Sila masukkan nama anda!");

    const newVoiceMemory = {
        name: name,
        table: currentTable || 'Voice Vault',
        wish: 'Voice Note Wish 🎙️',
        media: null,
        audio: recordedAudioBase64,
        likes: 0,
        comments: [],
        timestamp: Date.now(),
        dateStr: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    eventsRef.child(currentEventId).child('memories').push(newVoiceMemory).then(() => {
        alert("Pesanan suara berjaya dihantar ke buku tetamu!");
        clearAudioRecording();
        if (nameInput) nameInput.value = '';
        switchTab('voice');
    });
}

function renderVoiceVault() {
    const listContainer = document.getElementById('voiceNotesList');
    if (!listContainer) return;

    const voiceMemories = memoryFeed.filter(item => item.audio !== null);

    if (voiceMemories.length === 0) {
        listContainer.innerHTML = `<div class="py-10 text-center text-slate-400 text-xs">Tiada voice note lagi. Jadilah yang pertama!</div>`;
        return;
    }

    listContainer.innerHTML = voiceMemories.map(item => `
        <div class="glass-card p-3 rounded-2xl border border-amber-500/30 space-y-2">
            <div class="flex justify-between items-center">
                <span class="text-xs font-bold text-amber-200"><i class="fa-solid fa-microphone text-amber-400 mr-1.5"></i> ${escapeHtml(item.name)}</span>
                <span class="text-[10px] text-slate-400">${item.dateStr || ''}</span>
            </div>
            <audio controls src="${item.audio}" class="w-full h-8"></audio>
        </div>
    `).join('');
}

// Menghantar memori tetamu ke Firebase
async function handleFormSubmit(e) {
    e.preventDefault();
    const nameInput = document.getElementById('guestName');
    const tableInput = document.getElementById('tableNo');
    const wishInput = document.getElementById('guestWish');
    const watermarkCheck = document.getElementById('addWatermarkCheck');
    if (!nameInput) return;

    const name = nameInput.value.trim();
    const table = tableInput ? tableInput.value.trim() : (currentTable || 'Guest');
    const wish = wishInput ? wishInput.value.trim() : '';
    if (!name) return alert("Sila masukkan nama anda!");

    const submitBtn = document.getElementById('submitBtn');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = `<i class="fa-solid fa-spinner animate-spin mr-2"></i> Sedang memproses...`;
    }

    // Jika pengguna memilih watermark, capkan pada gambar
    let processedMedia = [...selectedMediaFiles];
    if (watermarkCheck && watermarkCheck.checked && processedMedia.length > 0) {
        const titleForWatermark = (currentEventConfig && currentEventConfig.eventTitle) ? currentEventConfig.eventTitle : 'Walimatulurus';
        processedMedia = await Promise.all(processedMedia.map(url => applyWatermarkToImage(url, titleForWatermark)));
    }

    const newMemory = {
        name,
        table: table || 'Guest',
        wish: wish || '',
        media: processedMedia.length > 0 ? processedMedia : null,
        audio: null,
        likes: 0,
        comments: [],
        timestamp: Date.now(),
        dateStr: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    eventsRef.child(currentEventId).child('memories').push(newMemory).then(() => {
        closeWishesPopup();
        resetForm();
        switchTab('feed');
    }).catch(err => {
        alert("Gagal menghantar ucapan. Sila cuba sebentar lagi.");
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = `Submit Memory`;
        }
    });
}

function resetForm() {
    const form = document.getElementById('guestForm');
    if (form) form.reset();
    if (currentTable) {
        const tableInput = document.getElementById('tableNo');
        if (tableInput) tableInput.value = currentTable;
    }
    selectedMediaFiles = [];
    const submitBtn = document.getElementById('submitBtn');
    if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `Submit Memory`;
    }
}

// --- Render Feed & Stories Highlights ---
function renderFeed() {
    const feedContainer = document.getElementById('igFeedContainer');
    const storiesBar = document.getElementById('storiesHighlightsBar');
    if (!feedContainer) return;

    if (memoryFeed.length === 0) {
        feedContainer.innerHTML = `<div class="py-12 text-center text-slate-400 text-xs">Tiada memori lagi. Jadilah yang pertama berkongsi!</div>`;
        if (storiesBar) storiesBar.innerHTML = `<p class="text-[10px] text-slate-400 px-2">Tiada stories</p>`;
        return;
    }

    if (storiesBar) {
        storiesBar.innerHTML = memoryFeed.map((item, idx) => {
            const thumb = (item.media && item.media.length > 0) ? item.media[0] : 'https://images.unsplash.com/photo-1519741497674-611481863552?q=80&w=200';
            return `
                <div class="flex flex-col items-center space-x-1 cursor-pointer flex-shrink-0" onclick="openStoryViewer(${idx})">
                    <div class="story-ring">
                        <div class="story-inner"><img src="${thumb}" alt="Story"></div>
                    </div>
                    <span class="text-[10px] text-slate-300 truncate w-16 text-center mt-1">${escapeHtml(item.name)}</span>
                </div>
            `;
        }).join('');
    }

    feedContainer.innerHTML = memoryFeed.map(item => {
        let mediaSliderHtml = '';
        if (item.media && Array.isArray(item.media)) {
            const slides = item.media.map((url, idx) => `
                <div class="slide-item w-full h-full flex-shrink-0 relative flex items-center justify-center bg-black">
                    <img src="${url}" class="w-full h-full object-contain max-h-[450px]">
                    <span class="absolute top-2 right-2 bg-black/60 text-white text-[10px] px-2 py-0.5 rounded-full">${idx + 1}/${item.media.length}</span>
                </div>
            `).join('');

            mediaSliderHtml = `
                <div class="relative w-full bg-slate-950 overflow-hidden border-y border-white/10 group">
                    <div id="slider-${item.id}" class="flex transition-transform duration-300 ease-in-out w-full" style="transform: translateX(0%);">
                        ${slides}
                    </div>
                    ${item.media.length > 1 ? `
                        <button onclick="slideMedia('${item.id}', -1, ${item.media.length})" class="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/80 text-white w-7 h-7 rounded-full flex items-center justify-center text-xs"><i class="fa-solid fa-chevron-left"></i></button>
                        <button onclick="slideMedia('${item.id}', 1, ${item.media.length})" class="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/80 text-white w-7 h-7 rounded-full flex items-center justify-center text-xs"><i class="fa-solid fa-chevron-right"></i></button>
                    ` : ''}
                </div>
            `;
        }

        const commentsList = item.comments ? Object.values(item.comments).map(c => `<p class="text-[11px] text-slate-300"><strong class="text-amber-300">${escapeHtml(c.name)}:</strong> ${escapeHtml(c.text)}</p>`).join('') : '';
        const firstImgUrl = (item.media && item.media[0]) ? item.media[0] : '';
        const downloadBtnHtml = firstImgUrl ? `
            <button onclick="downloadImage('${firstImgUrl}')" class="text-xs text-amber-300 bg-amber-500/20 px-2.5 py-1 rounded-lg border border-amber-500/30 hover:bg-amber-500/30 transition" title="Muat turun gambar">
                <i class="fa-solid fa-download mr-1"></i> Save
            </button>` : '';

        return `
            <div class="bg-slate-900/85 backdrop-blur-md rounded-2xl border border-white/10 overflow-hidden shadow-lg space-y-2 pb-3">
                <div class="flex items-center justify-between p-3 pb-0">
                    <div class="flex items-center space-x-2">
                        <div class="w-8 h-8 rounded-full bg-amber-500/25 border border-amber-500/40 flex items-center justify-center text-amber-300 font-bold text-xs">
                            ${escapeHtml(item.name.charAt(0).toUpperCase())}
                        </div>
                        <div>
                            <p class="text-xs font-bold text-amber-200">${escapeHtml(item.name)}</p>
                            <p class="text-[10px] text-slate-400">Table: ${escapeHtml(item.table)} • ${item.dateStr || ''}</p>
                        </div>
                    </div>
                    ${downloadBtnHtml}
                </div>

                ${mediaSliderHtml}

                <div class="flex justify-between items-center px-4 py-1 text-lg text-slate-200">
                    <div class="flex space-x-4 items-center">
                        <button onclick="toggleLike('${item.id}')" class="transition text-slate-300 hover:text-rose-500"><i class="fa-regular fa-heart text-xl" id="like-icon-${item.id}"></i></button>
                        <span class="text-xs text-slate-300 font-mono" id="like-count-${item.id}">${item.likes || 0}</span>
                        <button onclick="openDetailModal('${item.id}')" class="transition text-slate-300 hover:text-amber-300"><i class="fa-regular fa-comment text-xl"></i></button>
                    </div>
                </div>

                ${item.wish ? `<div class="px-4 text-xs"><p class="text-slate-200"><strong class="text-amber-300 mr-1">${escapeHtml(item.name)}</strong> ${escapeHtml(item.wish)}</p></div>` : ''}

                ${item.audio ? `
                    <div class="px-4">
                        <div class="bg-slate-950 p-2 rounded-xl border border-amber-500/30 flex items-center space-x-2">
                            <i class="fa-solid fa-microphone text-amber-400"></i>
                            <audio controls src="${item.audio}" class="w-full h-7"></audio>
                        </div>
                    </div>
                ` : ''}

                <div class="px-4 pt-1 space-y-1">
                    <div id="comments-box-${item.id}" class="space-y-1 max-h-24 overflow-y-auto">${commentsList}</div>
                    <div class="flex space-x-2 pt-1">
                        <input type="text" id="comment-input-${item.id}" placeholder="Tambah doa & komen..." class="flex-grow bg-slate-950 border border-white/10 rounded-lg px-2.5 py-1 text-[11px] text-white outline-none focus:border-amber-400">
                        <button onclick="postComment('${item.id}')" class="px-3 py-1 bg-amber-500 text-slate-950 text-[11px] font-bold rounded-lg hover:bg-amber-400 transition">Post</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    renderExploreGrid();
}

async function downloadImage(url) {
    try {
        const response = await fetch(url);
        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = blobUrl;
        a.download = `lenterakita-${Date.now()}.jpg`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(blobUrl);
        document.body.removeChild(a);
    } catch (err) {
        window.open(url, '_blank');
    }
}

function slideMedia(itemId, direction, totalSlides) {
    if (!sliderIndexes[itemId]) sliderIndexes[itemId] = 0;
    sliderIndexes[itemId] += direction;
    if (sliderIndexes[itemId] < 0) sliderIndexes[itemId] = totalSlides - 1;
    if (sliderIndexes[itemId] >= totalSlides) sliderIndexes[itemId] = 0;

    const slider = document.getElementById(`slider-${itemId}`);
    if (slider) {
        slider.style.transform = `translateX(-${sliderIndexes[itemId] * 100}%)`;
    }
}

function toggleLike(itemId) {
    const icon = document.getElementById(`like-icon-${itemId}`);
    const countEl = document.getElementById(`like-count-${itemId}`);
    if (!icon || !countEl) return;

    const memoryRef = eventsRef.child(currentEventId).child('memories').child(itemId);
    memoryRef.once('value', snapshot => {
        const data = snapshot.val();
        let currentLikes = data.likes || 0;
        if (icon.classList.contains('fa-regular')) {
            icon.classList.replace('fa-regular', 'fa-solid');
            icon.classList.add('text-rose-500');
            currentLikes += 1;
        } else {
            icon.classList.replace('fa-solid', 'fa-regular');
            icon.classList.remove('text-rose-500');
            currentLikes = Math.max(0, currentLikes - 1);
        }
        memoryRef.update({ likes: currentLikes });
        countEl.innerText = currentLikes;
    });
}

function postComment(itemId) {
    const input = document.getElementById(`comment-input-${itemId}`);
    if (!input || !input.value.trim()) return;

    const commentText = input.value.trim();
    const commenterName = prompt("Masukkan nama anda untuk komen:", "Tetamu") || "Tetamu";

    const newComment = { name: commenterName, text: commentText, timestamp: Date.now() };
    eventsRef.child(currentEventId).child('memories').child(itemId).child('comments').push(newComment).then(() => {
        input.value = '';
    });
}

function filterFeed(type) {
    currentFilter = type;
    ['all', 'photo', 'voice'].forEach(t => {
        const btn = document.getElementById(`filter-${t}`);
        if (!btn) return;
        btn.className = (t === type) ? "px-2.5 py-1 rounded-lg font-medium bg-amber-500 text-slate-950 text-xs" : "px-2.5 py-1 rounded-lg font-medium text-slate-300 text-xs";
    });
    renderExploreGrid();
}

function renderExploreGrid() {
    const feedGrid = document.getElementById('feedGrid');
    if (!feedGrid) return;
    let filtered = memoryFeed.filter(item => {
        if (currentFilter === 'photo') return item.media !== null;
        if (currentFilter === 'voice') return item.audio !== null;
        return true;
    });
    let tilesHtml = [];
    filtered.forEach(item => {
        if (item.media && Array.isArray(item.media)) {
            item.media.forEach(imgUrl => {
                tilesHtml.push(`
                    <div class="memory-tile aspect-square relative overflow-hidden cursor-pointer" onclick="openDetailModal('${item.id}')">
                        <img src="${imgUrl}" class="w-full h-full object-cover">
                    </div>
                `);
            });
        }
    });
    feedGrid.innerHTML = tilesHtml.length > 0 ? tilesHtml.join('') : `<div class="col-span-3 py-10 text-center text-slate-400 text-xs">Tiada media dijumpai.</div>`;
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
                    <span class="text-[10px] text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/25">Table: ${escapeHtml(item.table)} • ${item.dateStr || ''}</span>
                </div>
            </div>
            ${mediaHtml}
            ${item.wish ? `<div class="bg-slate-900/60 p-3 rounded-xl border border-white/10"><p class="text-xs text-slate-200 italic">"${escapeHtml(item.wish)}"</p></div>` : ''}
            ${item.audio ? `<div class="bg-slate-900/90 p-3 rounded-xl border border-amber-500/30 space-y-1"><p class="text-[10px] text-amber-300"><i class="fa-solid fa-microphone mr-1"></i> Voice Note:</p><audio controls src="${item.audio}" class="w-full h-8"></audio></div>` : ''}
        `;
    }
    const detailModal = document.getElementById('detailModal');
    if (detailModal) detailModal.classList.remove('hidden');
}

function closeDetailModal() {
    const detailModal = document.getElementById('detailModal');
    if (detailModal) detailModal.classList.add('hidden');
}

// --- Maklumat Majlis (Profile Modal) ---
function openProfileModal() {
    const modal = document.getElementById('profileModal');
    if (!modal) return;

    const titleEl = document.getElementById('profileEventTitle');
    const dateEl = document.getElementById('profileEventDate');
    const venueEl = document.getElementById('profileEventVenue');
    const memCountEl = document.getElementById('profileMemoriesCount');
    const photoCountEl = document.getElementById('profilePhotosCount');

    if (currentEventConfig) {
        if (titleEl) titleEl.innerText = currentEventConfig.eventTitle || currentEventId;
        if (dateEl) dateEl.innerText = currentEventConfig.date || '-';
        if (venueEl) venueEl.innerText = currentEventConfig.venue || '-';
    }

    if (memCountEl) memCountEl.innerText = memoryFeed.length;
    if (photoCountEl) {
        let totalPhotos = 0;
        memoryFeed.forEach(m => {
            if (m.media && Array.isArray(m.media)) totalPhotos += m.media.length;
        });
        photoCountEl.innerText = totalPhotos;
    }

    modal.classList.remove('hidden');
}

function closeProfileModal() {
    const modal = document.getElementById('profileModal');
    if (modal) modal.classList.add('hidden');
}

function copyCurrentEventLink() {
    const url = window.location.href;
    if (navigator.clipboard) {
        navigator.clipboard.writeText(url).then(() => {
            alert("Pautan majlis berjaya disalin!");
        }).catch(() => {
            prompt("Salin pautan ini:", url);
        });
    } else {
        prompt("Salin pautan ini:", url);
    }
}

function toggleBackgroundAudio() {
    const bgAudio = document.getElementById('bgAudio');
    const audioIcon = document.getElementById('audioIcon');
    if (!bgAudio || !bgAudio.src) return alert("Tiada muzik latar belakang ditetapkan untuk majlis ini.");
    if (bgAudio.paused) {
        bgAudio.play();
        if (audioIcon) audioIcon.className = "fa-solid fa-music animate-pulse text-amber-300";
    } else {
        bgAudio.pause();
        if (audioIcon) audioIcon.className = "fa-solid fa-volume-xmark text-slate-400";
    }
}

// --- Live TV Mode Slideshow ---
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
        container.innerHTML = `<p class="text-slate-300 text-sm">Menunggu ucapan pertama daripada para tetamu...</p>`;
        return;
    }
    const item = memoryFeed[tvCurrentIndex];
    let firstImg = (item.media && item.media.length > 0) ? item.media[0] : '';
    container.innerHTML = `
        <span class="px-3 py-1 bg-amber-500/20 text-amber-300 rounded-full text-xs">${escapeHtml(item.name)} (Table ${escapeHtml(item.table)})</span>
        ${item.wish ? `<h3 class="text-xl md:text-2xl font-serif text-amber-100 italic">"${escapeHtml(item.wish)}"</h3>` : ''}
        ${firstImg ? `<img src="${firstImg}" class="max-h-64 mx-auto rounded-2xl border border-white/20 shadow-2xl">` : ''}
    `;
}

function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
