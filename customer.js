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
let cameraStream = null;
let currentFacingMode = 'environment';
let activeFilterClass = 'filter-normal';
let sliderIndexes = {};

document.addEventListener('DOMContentLoaded', () => {
    initGuestView();
});

function initGuestView() {
    if (!eventsRef) return;

    eventsRef.child(currentEventId).child('config').on('value', (snapshot) => {
        const cfg = snapshot.val();
        if (cfg) {
            applyDynamicTheme(cfg);
            const titleEl = document.getElementById('disp-wedding-title');
            const groomEl = document.getElementById('disp-groom-bride');
            const dateEl = document.getElementById('disp-wedding-date');
            const welcomeEl = document.getElementById('disp-welcome-msg');

            if (titleEl) titleEl.innerText = cfg.title || "LenteraKita";
            if (groomEl) groomEl.innerText = cfg.eventTitle || "Wedding Event";
            if (dateEl) dateEl.innerText = `${cfg.date || ''} • ${cfg.venue || ''}`;
            if (welcomeEl) welcomeEl.innerText = cfg.welcomeMsg || "Welcome to our celebration!";

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
                bgAudio.play().catch(() => console.log("Auto-play blocked."));
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
    ['feed', 'explore', 'capture', 'voice'].forEach(t => {
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
        alert("Camera access denied or unavailable. Sila pastikan guna HTTPS / Localhost.");
        closeCameraModal();
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

function capturePhotoFromCamera() {
    const video = document.getElementById('cameraVideo');
    const canvas = document.getElementById('cameraCanvas');
    if (!video || !canvas) return;

    canvas.width = video.videoWidth || 720;
    canvas.height = video.videoHeight || 1280;
    const ctx = canvas.getContext('2d');

    ctx.filter = window.getComputedStyle(video).getPropertyValue('filter');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.90);
    selectedMediaFiles.push(dataUrl);

    updateCameraThumbBadge();
    
    const thumbBox = document.getElementById('thumbPreviewBox');
    if (thumbBox) {
        thumbBox.innerHTML = `<img src="${dataUrl}" class="w-full h-full object-cover">`;
        thumbBox.classList.add('scale-110', 'border-amber-400');
        setTimeout(() => thumbBox.classList.remove('scale-110', 'border-amber-400'), 200);
    }
}

function updateCameraThumbBadge() {
    const badge = document.getElementById('capturedCountBadge');
    if (badge) badge.innerText = `${selectedMediaFiles.length} Photos`;
}

function proceedToWishesStep() {
    if (selectedMediaFiles.length === 0) {
        return alert("Sila tangkap sekurang-kurangnya satu gambar terlebih dahulu!");
    }
    closeCameraModal();
    switchTab('capture');

    const previewContainer = document.getElementById('mediaPreviewContainer');
    if (previewContainer) {
        previewContainer.classList.remove('hidden');
        previewContainer.innerHTML = selectedMediaFiles.map(url => `
            <div class="relative aspect-square rounded-lg overflow-hidden border border-white/20">
                <img src="${url}" class="w-full h-full object-cover">
            </div>
        `).join('');
    }
}

function handleFileSelect(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    const previewContainer = document.getElementById('mediaPreviewContainer');
    if (!previewContainer) return;

    previewContainer.classList.remove('hidden');

    Array.from(files).forEach((file) => {
        const reader = new FileReader();
        reader.onload = function(e) {
            selectedMediaFiles.push(e.target.result);
            previewContainer.innerHTML += `<div class="relative aspect-square rounded-lg overflow-hidden border border-white/20"><img src="${e.target.result}" class="w-full h-full object-cover"></div>`;
        };
        reader.readAsDataURL(file);
    });
}

// --- Voice Vault Recording (Dibaiki & Dioptimumkan) ---
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
        
        // Pilih format yang disokong oleh pelayar (Chrome/Safari)
        let options = { mimeType: 'audio/webm' };
        if (!MediaRecorder.isTypeSupported('audio/webm')) {
            if (MediaRecorder.isTypeSupported('audio/mp4')) {
                options = { mimeType: 'audio/mp4' };
            } else {
                options = {}; // Guna default pelayar
            }
        }

        mediaRecorder = new MediaRecorder(stream, options);
        audioChunks = [];

        mediaRecorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) {
                audioChunks.push(e.data);
            }
        };

        mediaRecorder.onstart = () => {
            if (recordBtn) recordBtn.classList.replace('bg-red-600', 'bg-amber-500');
            if (statusText) statusText.innerText = "Sedang merakam suara...";
            if (timerText) timerText.classList.remove('hidden');
            recordSeconds = 0;
            recordTimerInterval = setInterval(() => {
                recordSeconds++;
                if (recordSeconds >= 30) {
                    toggleRecording(); // Auto stop lepas 30 saat
                }
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
        console.error("Mic error:", err);
        alert("Gagal mengakses mikrofon. Pastikan kebenaran mikrofon (Microphone Permission) telah diberikan pada pelayar web anda.");
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
        table: 'Voice Vault',
        wish: 'Voice Note Wish 🎙️',
        media: null,
        audio: recordedAudioBase64,
        likes: 0,
        comments: [],
        timestamp: Date.now(),
        dateStr: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    eventsRef.child(currentEventId).child('memories').push(newVoiceMemory).then(() => {
        alert("Voice note berjaya dihantar!");
        clearAudioRecording();
        if (nameInput) nameInput.value = '';
        switchTab('feed');
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

function handleFormSubmit(e) {
    e.preventDefault();
    const nameInput = document.getElementById('guestName');
    const tableInput = document.getElementById('tableNo');
    const wishInput = document.getElementById('guestWish');
    if (!nameInput) return;

    const name = nameInput.value.trim();
    const table = tableInput ? tableInput.value.trim() : '';
    const wish = wishInput ? wishInput.value.trim() : '';
    if (!name) return alert("Sila masukkan nama anda!");

    const submitBtn = document.getElementById('submitBtn');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = `<i class="fa-solid fa-spinner animate-spin mr-2"></i> Sedang menghantar...`;
    }

    const newMemory = {
        name, table: table || 'Guest', wish: wish || '',
        media: selectedMediaFiles.length > 0 ? selectedMediaFiles : null,
        audio: null,
        likes: 0,
        comments: [],
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
    selectedMediaFiles = [];
    const previewContainer = document.getElementById('mediaPreviewContainer');
    if (previewContainer) {
        previewContainer.innerHTML = '';
        previewContainer.classList.add('hidden');
    }
    const submitBtn = document.getElementById('submitBtn');
    if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `Submit Memory`;
    }
}

// --- Render Feed & Carousel Slider (Download Diperbaiki) ---
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
        storiesBar.innerHTML = memoryFeed.map(item => {
            const thumb = (item.media && item.media.length > 0) ? item.media[0] : 'https://images.unsplash.com/photo-1519741497674-611481863552?q=80&w=200';
            return `
                <div class="flex flex-col items-center space-x-1 cursor-pointer flex-shrink-0" onclick="openDetailModal('${item.id}')">
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

        // Fungsi Download Diperbaiki menggunakan Blob supaya tidak terhalang oleh CORS pelayar
        const firstImgUrl = (item.media && item.media[0]) ? item.media[0] : '';
        const downloadBtnHtml = firstImgUrl ? `
            <button onclick="downloadImage('${firstImgUrl}')" class="text-xs text-amber-300 bg-amber-500/20 px-2.5 py-1 rounded-lg border border-amber-500/30 hover:bg-amber-500/30" title="Muat turun gambar">
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
                        <input type="text" id="comment-input-${item.id}" placeholder="Tambah komen..." class="flex-grow bg-slate-950 border border-white/10 rounded-lg px-2.5 py-1 text-[11px] text-white outline-none focus:border-amber-400">
                        <button onclick="postComment('${item.id}')" class="px-3 py-1 bg-amber-500 text-slate-950 text-[11px] font-bold rounded-lg hover:bg-amber-400">Post</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    renderExploreGrid();
}

// Fungsi Muat Turun Selamat (Mengelakkan isu CORS & Download Error)
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
        // Fallback jika fetch dihalang
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
    const commenterName = prompt("Masukkan nama anda untuk komen:", "Guest") || "Guest";

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
    if (detailModal) detailModal.classList.add('hidden'); // Fix typo to remove hidden
    if (detailModal) detailModal.classList.remove('hidden');
}

function closeDetailModal() {
    const detailModal = document.getElementById('detailModal');
    if (detailModal) detailModal.classList.add('hidden');
}

function toggleBackgroundAudio() {
    const bgAudio = document.getElementById('bgAudio');
    const audioIcon = document.getElementById('audioIcon');
    if (!bgAudio || !bgAudio.src) return alert("Tiada muzik latar belakang ditetapkan.");
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
        container.innerHTML = `<p class="text-slate-300 text-sm">Menunggu ucapan daripada tetamu...</p>`;
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