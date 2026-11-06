// ==========================================
// AUDIO SYSTEM (Nhạc nền & Hiệu ứng âm thanh)
// ==========================================

const bgmPlaylist = [
    "Burgundy - Like You Mean It (freetouse.com).mp3",
    "Dagored - Urban Timelapse (freetouse.com).mp3",
    "Luke Bergs - Sunlight (freetouse.com).mp3"
];
let currentTrackIndex = 0;

const bgmAudio = document.getElementById('bgmAudio');
if (bgmAudio) {
    bgmAudio.volume = 0.3; 

    bgmAudio.addEventListener('ended', () => {
        currentTrackIndex = (currentTrackIndex + 1) % bgmPlaylist.length;
        bgmAudio.src = bgmPlaylist[currentTrackIndex];
        bgmAudio.play().catch(err => console.log("Lỗi phát bài tiếp theo:", err));
    });
}

function toggleBGM() {
    const btn = document.getElementById('toggleBgmBtn');
    if (!bgmAudio) return;

    if (bgmAudio.paused) {
        if (!bgmAudio.src || bgmAudio.src === "" || bgmAudio.src.endsWith("mode2.html")) {
            bgmAudio.src = bgmPlaylist[currentTrackIndex];
        }
        bgmAudio.play().then(() => {
            if (btn) btn.textContent = "🔇 Tắt Nhạc Nền";
        }).catch(err => {
            console.log("Không thể phát audio tự động:", err);
            alert("Vui lòng tương tác với trang trước khi bật nhạc!");
        });
    } else {
        bgmAudio.pause();
        if (btn) btn.textContent = "🎵 Bật Nhạc Nền";
    }
}

let audioCtx = null;
function getAudioContext() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    return audioCtx;
}

// Khởi tạo AudioContext khi có tương tác người dùng
['click', 'keydown', 'touchstart'].forEach(evt => {
    window.addEventListener(evt, () => { getAudioContext(); }, { once: true });
});

// Phát âm thanh khi trả lời sai
function playWrongSound() {
    try {
        const ctx = getAudioContext();
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(120, now);
        osc.frequency.exponentialRampToValueAtTime(40, now + 0.25);

        gain.gain.setValueAtTime(0.3, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.25);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + 0.25);
    } catch (e) {}
}

// Phát âm thanh khi trả lời đúng
function playCorrectSound() {
    try {
        const ctx = getAudioContext();
        const now = ctx.currentTime;
        const notes = [523.25, 659.25, 783.99, 1046.50];
        
        notes.forEach((freq, idx) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            const startTime = now + idx * 0.06;

            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, startTime);

            gain.gain.setValueAtTime(0.2, startTime);
            gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.2);

            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.start(startTime);
            osc.stop(startTime + 0.2);
        });
    } catch (e) {}
}
// chứa logic âm thanh