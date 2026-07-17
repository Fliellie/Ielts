document.addEventListener('DOMContentLoaded', () => {
    // 1. LẤY CÁC PHẦN TỬ GIAO DIỆN
    const reviewBtn = document.getElementById('reviewBtn');
    const quizBtn = document.getElementById('quizBtn'); 
    const importBtn = document.getElementById('importBtn');
    const libraryBtn = document.getElementById('libraryBtn'); // <-- Lấy phần tử nút mới
    const backButton = document.getElementById('backBtn');
    const vocabListBody = document.getElementById('vocab-list-body');

    // Cấu hình IndexedDB đồng bộ với vocab-room.js
    const DB_NAME = 'VocabDB';
    const DB_VERSION = 2;
    const STORE_NAME = 'words';
    let db;

    // 2. LOGIC ĐIỀU HƯỚNG CÁC NÚT BẤM
    if (reviewBtn) {
        reviewBtn.addEventListener('click', () => {
            window.location.href = 'vocab-room.html';
        });
    }

    if (quizBtn) {
        quizBtn.addEventListener('click', () => {
            window.location.href = 'mode2.html';
        });
    }

    if (importBtn) {
        importBtn.addEventListener('click', () => {
            window.location.href = 'import.html';
        });
    }

    // Gắn sự kiện chuyển hướng cho nút xem toàn bộ từ vựng
    if (libraryBtn) {
        libraryBtn.addEventListener('click', () => {
            window.location.href = 'library.html'; // Tên trang danh sách từ vựng của bạn
        });
    }

    if (backButton) {
        backButton.addEventListener('click', function() {
            window.location.href = '../index.html';
        });
    }

    // 3. LOGIC KẾT NỐI INDEXEDDB & ĐỔ DỮ LIỆU LÊN BẢNG
    function getTodayString() {
        const localDate = new Date(Date.now() + 7 * 60 * 60 * 1000); 
        return localDate.toISOString().split('T')[0]; 
    }

    function initAndFetchTodayWords() {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        
        request.onerror = () => {
            console.error("Lỗi mở database:", request.error);
            vocabListBody.innerHTML = `<tr><td colspan="3" class="empty-text" style="color:red">Không thể tải dữ liệu!</td></tr>`;
        };

        request.onsuccess = () => {
            db = request.result;
            displayTodayWords();
        };

        request.onupgradeneeded = (event) => {
            const database = event.target.result;
            if (!database.objectStoreNames.contains(STORE_NAME)) {
                const store = database.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
                store.createIndex('english', 'english', { unique: true });
                store.createIndex('nextReviewDate', 'nextReviewDate', { unique: false });
            }
        };
    }

    function displayTodayWords() {
        const todayStr = getTodayString();
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => {
            const allWords = request.result;
            const todayWords = allWords.filter(word => word.nextReviewDate <= todayStr);

            vocabListBody.innerHTML = "";

            if (todayWords.length === 0) {
                vocabListBody.innerHTML = `<tr><td colspan="3" class="empty-text">Thảnh thơi quá! Hôm nay không có từ nào cần ôn tập.</td></tr>`;
                return;
            }

            todayWords.forEach((word, index) => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td class="text-center">${index + 1}</td>
                    <td><strong>${word.english}</strong></td>
                    <td>${word.vietnamese}</td>
                `;
                vocabListBody.appendChild(row);
            });
        };

        request.onerror = () => {
            console.error("Lỗi lấy dữ liệu từ store:", request.error);
        };
    }

    initAndFetchTodayWords();
});