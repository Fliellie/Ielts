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
        if (!silent) alert(`Đã thêm thành công từ: "${english}"`);
    };
    request.onerror = () => {
        if (!silent) alert(`Từ "${english}" đã tồn tại hoặc có lỗi xảy ra.`);
    };
}

// 3. Hàm gọi API Google Translate để lấy nghĩa
async function fetchGoogleTranslation(text) {
    try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=vi&dt=t&q=${encodeURIComponent(text.trim())}`;
        const response = await fetch(url);
        const data = await response.json();
        
        if (data && data[0] && data[0][0] && data[0][0][0]) {
            return data[0][0][0].trim();
        }
    } catch (error) {
        console.error("Lỗi Google Translate:", error);
    }
    return null;
}

// Lấy các phần tử giao diện
const englishInput = document.getElementById('english-input');
const vietnameseInput = document.getElementById('vietnamese-input');
const autoTranslateCb = document.getElementById('autoTranslateCb');

// 4. Xử lý Logic thông minh khi người dùng dán/nhập định dạng đơn lẻ "Từ - Nghĩa" vào ô 1
englishInput.addEventListener('input', (e) => {
    const value = e.target.value;
    
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
            englishInput.value = parts[0].trim();
            vietnameseInput.value = parts[1].trim();
            vietnameseInput.focus(); 
        }
    }
});

// 5. ĐÃ THAY ĐỔI: Sự kiện khi click nút "Thêm" (Dịch tự động ngay tại đây nếu được kích hoạt)
document.getElementById('addBtn').addEventListener('click', async () => {
    const eng = englishInput.value.trim();
    let vie = vietnameseInput.value.trim();

    if (!eng) {
        alert("Vui lòng điền từ mới tiếng Anh trước nhé!");
        englishInput.focus();
        return;
    }

    // Nếu ô định nghĩa trống VÀ nút "Tự động dịch" đang được tích chọn
    if (!vie && autoTranslateCb.checked) {
        vietnameseInput.placeholder = "Đang tự động dịch...";
        
        const translatedResult = await fetchGoogleTranslation(eng);
        
        if (translatedResult) {
            vie = translatedResult;
            vietnameseInput.value = vie; // Điền nghĩa dịch được vào ô để người dùng nhìn thấy
        } else {
            alert("Không thể tự động dịch từ này. Vui lòng tự điền định nghĩa nhé!");
            vietnameseInput.placeholder = "Ví dụ: Xin chào (Bỏ trống nếu dán danh sách nhiều từ)";
            vietnameseInput.focus();
            return;
        }
    }

    // Kiểm tra cuối cùng trước khi lưu
    if (!vie) {
        alert("Vui lòng điền định nghĩa hoặc tích chọn ô 'Tự động dịch' ở góc trên nhé!");
        vietnameseInput.focus();
        return;
    }

    // Lưu từ vựng vào Database
    saveWordToDB(eng, vie);

    // Xóa form và reset placeholder chuẩn bị cho từ tiếp theo
    englishInput.value = '';
    vietnameseInput.value = '';
    vietnameseInput.placeholder = "Ví dụ: Xin chào (Bỏ trống nếu dán danh sách nhiều từ)";
    englishInput.focus();
});

// 6. Xử lý sự kiện dán định dạng danh sách từ hàng loạt
document.getElementById('bulkImportBtn').addEventListener('click', () => {
    const rawText = englishInput.value;
    
    if (!rawText.trim()) {
        alert("Vui lòng dán danh sách từ của bạn vào ô 'từ mới của bạn' trước khi bấm nút này nhé!");
        return;
    }

    const lines = rawText.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);
    
    let validWords = [];
    const separators = [':', '-', '/'];

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

    if (validWords.length > 20) {
        const confirmProgress = confirm(`⚠️ Cảnh báo: Bạn chuẩn bị thêm ${validWords.length} từ. Nhồi nhét học quá 20 từ một lúc sẽ làm giảm hiệu quả ghi nhớ đáng kể đấy! Bạn vẫn muốn tiếp tục chứ?`);
        if (!confirmProgress) return;
    }

    validWords.forEach(word => {
        saveWordToDB(word.eng, word.vie, true);
    });

    alert(`🎉 Đã xử lý và nạp thành công ${validWords.length} từ mới vào hệ thống học!`);
    
    englishInput.value = '';
    vietnameseInput.value = '';
});

// Quay lại trang chủ 
document.getElementById('backBtn').addEventListener('click', () => {
    window.location.href = 'vocab.html';
});

// Khởi chạy kết nối CSDL khi vào trang
window.addEventListener('DOMContentLoaded', () => {
    initDB().catch(err => console.error("Không thể kết nối IndexedDB:", err));
});