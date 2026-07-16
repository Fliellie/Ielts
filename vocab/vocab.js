document.addEventListener('DOMContentLoaded', () => {
    // 1. LẤY CÁC PHẦN TỬ GIAO DIỆN
    const reviewBtn = document.getElementById('reviewBtn');
    const quizBtn = document.getElementById('quizBtn'); // <-- Thêm dòng này
    const importBtn = document.getElementById('importBtn');
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

    // Sự kiện chuyển hướng sang trang mode2.html khi click "Mode kiểm tra miệng"
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

        // Tạo store nếu DB trống (Đề phòng người dùng vào trang này đầu tiên)
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
            
            // Lọc các từ có ngày ôn tập bằng hoặc nhỏ hơn ngày hôm nay
            const todayWords = allWords.filter(word => word.nextReviewDate <= todayStr);

            // Xóa dòng thông báo "Đang tải..."
            vocabListBody.innerHTML = "";

            if (todayWords.length === 0) {
                vocabListBody.innerHTML = `<tr><td colspan="3" class="empty-text">Thảnh thơi quá! Hôm nay không có từ nào cần ôn tập.</td></tr>`;
                return;
            }

            // Đổ dữ liệu, đánh số thứ tự (STT) và render lên bảng
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

    // Kích hoạt tiến trình lấy dữ liệu khi tải trang xong
    initAndFetchTodayWords();
});