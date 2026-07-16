const DB_NAME = 'VocabDB';
const DB_VERSION = 2;
const STORE_NAME = 'words';
let db;

// 1. Kết nối IndexedDB trùng khớp với hệ thống review
function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            const database = event.target.result;
            if (!database.objectStoreNames.contains(STORE_NAME)) {
                const store = database.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
                store.createIndex('english', 'english', { unique: true });
                store.createIndex('nextReviewDate', 'nextReviewDate', { unique: false });
                console.log("🎉 Đã tạo kho chứa 'words' thành công tại version 2!");
            }
        };

        request.onsuccess = () => {
            db = request.result;
            resolve();
        };
        
        request.onerror = () => reject(request.error);
    });
}

// Lấy chuỗi ngày hôm nay định dạng YYYY-MM-DD theo múi giờ Việt Nam đồng bộ
function getTodayString() {
    const localDate = new Date(Date.now() + 7 * 60 * 60 * 1000); 
    return localDate.toISOString().split('T')[0];
}

// 2. Hàm thêm từ mới vào Cơ sở dữ liệu
function saveWordToDB(english, vietnamese, silent = false) {
    if (!english || !vietnamese) return;

    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    const newWord = {
        english: english.trim(),
        vietnamese: vietnamese.trim(),
        nextReviewDate: getTodayString(), 
        interval: 1 
    };

    const request = store.add(newWord);
    request.onsuccess = () => {
        // Nếu import hàng loạt (silent = true) thì không hiện alert liên tục làm phiền người dùng
        if (!silent) alert(`Đã thêm thành công từ: "${english}"`);
    };
    request.onerror = () => {
        if (!silent) alert(`Từ "${english}" đã tồn tại hoặc có lỗi xảy ra.`);
    };
}

// 3. Xử lý Logic thông minh khi người dùng Copy-Paste định dạng ĐƠN LẺ "Từ - Nghĩa" vào ô 1
document.getElementById('english-input').addEventListener('input', (e) => {
    const value = e.target.value;
    
    // Nếu phát hiện chuỗi có xuống dòng (nhiều từ), tắt tính năng tự tách của ô đơn lẻ này để nút Bulk xử lý
    if (value.includes('\n') || value.includes('\r')) return;

    const separators = [':', '-', '/'];
    let detectedSeparator = null;

    for (let sep of separators) {
        if (value.includes(sep)) {
            detectedSeparator = sep;
            break;
        }
    }

    if (detectedSeparator) {
        const parts = value.split(detectedSeparator);
        if (parts.length >= 2) {
            document.getElementById('english-input').value = parts[0].trim();
            document.getElementById('vietnamese-input').value = parts[1].trim();
            document.getElementById('vietnamese-input').focus(); 
        }
    }
});

// 4. Sự kiện khi click nút "Thêm" thủ công (1 từ lẻ)
document.getElementById('addBtn').addEventListener('click', () => {
    const eng = document.getElementById('english-input').value;
    const vie = document.getElementById('vietnamese-input').value;

    if (!eng.trim() || !vie.trim()) {
        alert("Vui lòng điền đầy đủ cả từ mới lẫn định nghĩa nhé!");
        return;
    }

    saveWordToDB(eng, vie);

    document.getElementById('english-input').value = '';
    document.getElementById('vietnamese-input').value = '';
    document.getElementById('english-input').focus();
});

// 5. ĐÃ SỬA: Xử lý sự kiện dán định dạng danh sách từ trực tiếp từ ô nhập liệu
document.getElementById('bulkImportBtn').addEventListener('click', () => {
    // Lấy dữ liệu văn bản từ ô nhập liệu english-input
    const rawText = document.getElementById('english-input').value;
    
    if (!rawText.trim()) {
        alert("Vui lòng dán danh sách từ của bạn vào ô 'từ mới của bạn' trước khi bấm nút này nhé!");
        return;
    }

    // Tách văn bản thành các dòng độc lập
    const lines = rawText.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);
    
    let validWords = [];
    const separators = [':', '-', '/'];

    // Lọc và phân tích cấu trúc từng dòng để đếm số từ hợp lệ
    lines.forEach(line => {
        let detectedSep = separators.find(sep => line.includes(sep));
        if (detectedSep) {
            const [eng, vie] = line.split(detectedSep);
            if (eng && vie && eng.trim() && vie.trim()) {
                validWords.push({ eng: eng.trim(), vie: vie.trim() });
            }
        }
    });

    if (validWords.length === 0) {
        alert("Không tìm thấy từ nào đúng định dạng (Ví dụ: hello: xin chào hoặc hello - xin chào). Hãy kiểm tra lại!");
        return;
    }

    // Kiểm tra nếu danh sách vượt quá 20 từ -> Đưa ra cảnh báo học quá nhiều
    if (validWords.length > 20) {
        const confirmProgress = confirm(`⚠️ Cảnh báo: Bạn chuẩn bị thêm ${validWords.length} từ. Nhồi nhét học quá 20 từ một lúc sẽ làm giảm hiệu quả ghi nhớ đáng kể đấy! Bạn vẫn muốn tiếp tục chứ?`);
        if (!confirmProgress) return; // Dừng lại nếu người dùng bấm Hủy
    }

    // Tiến hành nạp dữ liệu vào IndexedDB
    validWords.forEach(word => {
        saveWordToDB(word.eng, word.vie, true); // Đặt true để ẩn alert lẻ tẻ từng từ
    });

    alert(`🎉 Đã xử lý và nạp thành công ${validWords.length} từ mới vào hệ thống học!`);
    
    // Reset lại form sau khi nạp xong
    document.getElementById('english-input').value = '';
    document.getElementById('vietnamese-input').value = '';
});

// Quay lại trang chủ 
document.getElementById('backBtn').addEventListener('click', () => {
    window.location.href = 'vocab.html';
});

// Khởi chạy kết nối CSDL khi vào trang
window.addEventListener('DOMContentLoaded', () => {
    initDB().catch(err => console.error("Không thể kết nối IndexedDB:", err));
});