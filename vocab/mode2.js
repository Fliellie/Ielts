// Cấu hình kết nối cơ sở dữ liệu IndexedDB đồng bộ với hệ thống của bạn
const DB_NAME = 'VocabDB';
const DB_VERSION = 2;
const STORE_NAME = 'words';

let db;
let todayWords = []; // Lưu trữ danh sách từ ôn tập của ngày hôm nay
let currentDisplayMode = 'en'; // Chế độ mặc định: 'en' (trả lời tiếng Anh), 'vi' (trả lời tiếng Việt)
let showAnswers = false; // Trạng thái ẩn/hiện đáp án thực sự ở cột màu vàng

// 1. Khởi tạo và kết nối IndexedDB
function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            db = request.result;
            resolve(db);
        };
        request.onupgradeneeded = (event) => {
            const database = event.target.result;
            if (!database.objectStoreNames.contains(STORE_NAME)) {
                const store = database.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
                store.createIndex('english', 'english', { unique: true });
                store.createIndex('nextReviewDate', 'nextReviewDate', { unique: false });
            }
        };
    });
}

// Lấy ngày hôm nay định dạng YYYY-MM-DD theo múi giờ địa phương GMT+7
function getTodayString() {
    const localDate = new Date(Date.now() + 7 * 60 * 60 * 1000); 
    return localDate.toISOString().split('T')[0]; 
}

// 2. Lấy danh sách từ cần ôn tập hôm nay
function loadTodayWords() {
    return new Promise((resolve, reject) => {
        const todayStr = getTodayString();
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => {
            const allWords = request.result;
            todayWords = allWords.filter(word => word.nextReviewDate <= todayStr);
            resolve();
        };

        request.onerror = () => reject(request.error);
    });
}

// 3. Render danh sách từ ra các ô card song song Đề bài và Đáp án
function renderWords() {
    const container = document.getElementById('wordListContainer');
    container.innerHTML = '';

    if (todayWords.length === 0) {
        container.innerHTML = `<div class="empty-notify">Hôm nay thảnh thơi quá! Không có từ nào cần kiểm tra.</div>`;
        return;
    }

    todayWords.forEach((word, index) => {
        const wordRow = document.createElement('div');
        wordRow.className = 'word-row';

        let questionText = '';
        let answerText = '';

        if (currentDisplayMode === 'en') {
            // Chế độ "trả lời tiếng anh": Cột trái hiển thị nghĩa Việt, Cột phải hiển thị từ Anh (ẩn/hiện)
            questionText = word.vietnamese;
            answerText = showAnswers ? word.english : '— — —';
        } else {
            // Chế độ "trả lời tiếng việt": Cột trái hiển thị từ Anh, Cột phải hiển thị nghĩa Việt (ẩn/hiện)
            questionText = word.english;
            answerText = showAnswers ? word.vietnamese : '— — —';
        }

        wordRow.innerHTML = `
            <div class="word-index">${index + 1}</div>
            <div class="word-card-question">${questionText}</div>
            <div class="word-card-answer">${answerText}</div>
        `;
        container.appendChild(wordRow);
    });
}

// 4. Thuật toán xáo trộn ngẫu nhiên danh sách từ (Fisher-Yates Shuffle)
function shuffleWords() {
    for (let i = todayWords.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [todayWords[i], todayWords[j]] = [todayWords[j], todayWords[i]];
    }
    // Sau khi xáo trộn thì ẩn đáp án đi
    showAnswers = false; 
    renderWords();
}

// --- LẮNG NGHE SỰ KIỆN GIAO DIỆN ---

// Đổi chế độ học
document.getElementById('toggleModeBtn').addEventListener('click', (e) => {
    if (currentDisplayMode === 'en') {
        currentDisplayMode = 'vi';
        e.target.textContent = "trả lời tiếng việt";
    } else {
        currentDisplayMode = 'en';
        e.target.textContent = "trả lời tiếng anh";
    }
    showAnswers = false; // Ẩn đáp án khi đổi chế độ
    renderWords();
});

// Nút xáo trộn
document.getElementById('shuffleBtn').addEventListener('click', () => {
    shuffleWords();
});

// Nút quay lại
document.getElementById('backBtn').addEventListener('click', () => {
    window.location.href = 'vocab.html';
});

// LẮNG NGHE PHÍM SPACE (DẤU CÁCH) ĐỂ LẬT MỞ ĐÁP ÁN
document.addEventListener('keydown', (event) => {
    if (event.code === 'Space') {
        event.preventDefault(); // Tránh bị cuộn trang xuống khi nhấn Space
        showAnswers = !showAnswers;
        renderWords();
    }
});

// Khởi chạy ứng dụng
window.addEventListener('DOMContentLoaded', async () => {
    try {
        await initDB();
        await loadTodayWords();
        renderWords();
    } catch (error) {
        console.error("Lỗi khi tải dữ liệu kiểm tra miệng:", error);
    }
});