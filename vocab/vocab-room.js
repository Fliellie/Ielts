// Cấu hình tên CSDL IndexedDB theo sơ đồ thiết kế
const DB_NAME = 'VocabDB';
const DB_VERSION = 2;
const STORE_NAME = 'words';

let db;
let currentWord = null;
let reviewQueue = [];

// Các biến cờ để theo dõi trạng thái nâng cao của từ hiện tại
let isRetryingWrongWord = false; // Đang trong chế độ bắt gõ lại cho đúng
let isTestingReverseSide = false; // Đang trong chế độ kiểm tra chiều ngược lại sau khi sửa sai

// Chế độ học mặc định toàn cục do người dùng chọn: 'vi' (đoán Tiếng Việt) hoặc 'en' (đoán Tiếng Anh)
let currentMode = 'vi'; 

// 1. Khởi tạo và mở kết nối IndexedDB
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

function getTodayString() {
    const localDate = new Date(Date.now() + 7 * 60 * 60 * 1000); 
    return localDate.toISOString().split('T')[0]; 
}

// 2. Tải dữ liệu hàng đợi
function loadReviewWords() {
    return new Promise((resolve, reject) => {
        const todayStr = getTodayString();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => {
            const allWords = request.result;
            reviewQueue = [];

            allWords.forEach(word => {
                if (word.nextReviewDate < todayStr) {
                    word.nextReviewDate = todayStr;
                    store.put(word); 
                }
                if (word.nextReviewDate === todayStr) {
                    // Khởi tạo thêm thuộc tính phụ phục vụ thuật toán mới nếu chưa có
                    word.isFailedInSession = false; 
                    word.isPassedFirstRound = false;
                    reviewQueue.push(word);
                }
            });
        };

        tx.oncomplete = () => {
            console.log("Hàng đợi tải xong. Số lượng:", reviewQueue.length);
            resolve();
        };
        tx.onerror = () => reject(tx.error);
    });
}

// 3. Quản lý trạng thái giao diện hiển thị
function switchState(stateName) {
    document.getElementById('review-state').classList.add('hidden');
    document.getElementById('correct-state').classList.add('hidden');
    document.getElementById('wrong-state').classList.add('hidden');
    document.getElementById('empty-state').classList.add('hidden');

    if (stateName === 'review') {
        document.getElementById('review-state').classList.remove('hidden');
        document.getElementById('answer-input').value = '';
        document.getElementById('answer-input').focus();
    } else if (stateName === 'correct') {
        document.getElementById('correct-state').classList.remove('hidden');
    } else if (stateName === 'wrong') {
        document.getElementById('wrong-state').classList.remove('hidden');
    } else if (stateName === 'empty') {
        document.getElementById('empty-state').classList.remove('hidden');
    }
}

function formatDisplayDate(dateStr) {
    const parts = dateStr.split('-');
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

// 4. Tiến hành hiển thị từ tiếp theo hoặc cấu hình các trạng thái đặc biệt
function nextQuestion() {
    if (reviewQueue.length === 0) {
        currentWord = null;
        switchState('empty');
        return;
    }

    currentWord = reviewQueue[0]; 
    document.getElementById('word-date').textContent = formatDisplayDate(currentWord.nextReviewDate);
    
    const modeInstruction = document.getElementById('mode-instruction');
    const inputPlaceholder = document.getElementById('input-placeholder-label');
    const wordDisplay = document.getElementById('word-english');

    // Xác định chiều hiển thị (Xử lý thông minh giữa chế độ mặc định và chế độ đảo chiều ngược lại)
    let activeMode = currentMode;
    if (isTestingReverseSide) {
        activeMode = (currentMode === 'vi' ? 'en' : 'vi'); // Đảo ngược chế độ hiện tại
    }

    if (activeMode === 'vi') {
        modeInstruction.textContent = isTestingReverseSide ? "✨ Đảo chiều kiểm tra! Xem từ Anh đoán nghĩa Việt:" : "Nhìn từ tiếng Anh đoán ý nghĩa:";
        inputPlaceholder.textContent = "điền định nghĩa tiếng việt của bạn";
        wordDisplay.textContent = currentWord.english;
    } else {
        modeInstruction.textContent = isTestingReverseSide ? "✨ Đảo chiều kiểm tra! Xem nghĩa Việt đoán từ Anh:" : "Nhìn định nghĩa đoán từ tiếng Anh:";
        inputPlaceholder.textContent = "điền chính xác từ tiếng anh";
        wordDisplay.textContent = currentWord.vietnamese;
    }

    switchState('review');
}
/**
 * Hàm chuẩn hóa chuỗi: Chuyển về viết thường, xóa sạch dấu cách, 
 * dấu ngoặc và tất cả các ký tự đặc biệt (chỉ giữ lại chữ cái và chữ số).
 */
function cleanString(str) {
    if (!str) return "";
    return str
        .toLowerCase()                             // Chuyển thành viết thường
        .replace(/[\s\(\)\[\]\{\}\-\,\.\?\!\:\;\_\"\']/g, "") // Xóa dấu cách, các loại ngoặc và dấu câu thông dụng
        .normalize("NCD")                          // Giữ nguyên dấu tiếng Việt chuẩn hóa (nếu có)
        .trim();
}
// Hàm tìm ngày trống tiếp theo tuân thủ quy tắc: Không quá 20 từ/ngày
function findNextAvailableDate(startInterval) {
    return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => {
            const allWords = request.result;
            let currentCheckInterval = startInterval;
            let foundDateStr = "";

            while (true) {
                const checkDate = new Date(Date.now() + 7 * 60 * 60 * 1000);
                checkDate.setDate(checkDate.getDate() + currentCheckInterval);
                const checkDateStr = checkDate.toISOString().split('T')[0];

                // Đếm xem ngày checkDateStr đang có bao nhiêu từ hẹn ôn tập
                const count = allWords.filter(w => w.nextReviewDate === checkDateStr).length;

                if (count < 20) {
                    foundDateStr = checkDateStr;
                    break;
                }
                currentCheckInterval++; // Nếu đầy (>=20), tịnh tiến sang ngày tiếp theo
            }
            resolve({ dateStr: foundDateStr, finalInterval: currentCheckInterval });
        };
    });
}

// 5. Cập nhật thuật toán Space Repetition nâng cao vào CSDL
async function updateWordInDB(word, isCorrectFirstTime) {
    let interval = word.interval || 1; 

    if (isCorrectFirstTime) {
        // Đúng hoàn toàn 2 chiều ngay lần đầu -> Giãn cách tầm 3 ngày hoặc x2 nếu interval cũ lớn
        interval = interval === 1 ? 3 : interval * 2;
        if (interval >= 32) {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            tx.objectStore(STORE_NAME).delete(word.id);
            return;
        }
    } else {
        // Có bất kì lỗi sai nào trong cả buổi -> Reset tiến trình về ngày mai (interval = 1)
        interval = 1;
    }

    // Tìm ngày thích hợp (không quá 20 từ)
    const { dateStr, finalInterval } = await findNextAvailableDate(interval);

    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    
    word.interval = finalInterval;
    word.nextReviewDate = dateStr;
    
    // Xóa các thuộc tính phụ trước khi lưu vào DB
    delete word.isFailedInSession;
    delete word.isPassedFirstRound;

    store.put(word); 
}

// 6. Xử lý sự kiện kiểm tra đáp án dựa trên Mode đang áp dụng
// 6. Xử lý sự kiện kiểm tra đáp án dựa trên Mode đang áp dụng (Đã sửa logic chuẩn hóa)
function checkAnswer() {
    const inputField = document.getElementById('answer-input');
    
    // Sử dụng hàm cleanString để lọc sạch đáp án người dùng nhập
    const userAnswer = cleanString(inputField.value);
    
    let activeMode = currentMode;
    if (isTestingReverseSide) {
        activeMode = (currentMode === 'vi' ? 'en' : 'vi');
    }

    // Sử dụng hàm cleanString để lọc sạch đáp án gốc trong CSDL
    const rawCorrectAnswer = activeMode === 'vi' ? currentWord.vietnamese : currentWord.english;
    const correctAnswer = cleanString(rawCorrectAnswer);

    // Tiến hành so sánh chuỗi trần sau khi đã gọt sạch ký tự thừa
    if (userAnswer === correctAnswer && correctAnswer !== "") {
        // TRƯỜNG HỢP: ĐÁP ÁN ĐÚNG
        if (isRetryingWrongWord) {
            // Đang bắt gõ lại cho đúng -> Gõ đúng xong chuyển qua kiểm tra chiều ngược lại liền
            isRetryingWrongWord = false;
            isTestingReverseSide = true;
            nextQuestion();
        } 
        else if (isTestingReverseSide) {
            // Hoàn thành kiểm tra nốt vế ngược lại của từ bị lỗi
            isTestingReverseSide = false;
            // Đẩy từ lỗi này xuống cuối hàng đợi để cuối buổi kiểm tra lại
            const failedWord = reviewQueue.shift();
            reviewQueue.push(failedWord);
            switchState('correct');
        } 
        else {
            // Đúng ngay từ trạng thái bình thường ban đầu
            if (currentWord.isFailedInSession) {
                // Từ này từng sai trước đó, nay đã lết về cuối hàng đợi và gõ đúng lần nữa -> Tốt, đẩy sang ngày khác
                const passedWord = reviewQueue.shift();
                updateWordInDB(passedWord, false); // Cập nhật sang ngày hôm khác (Hệ số sai)
                switchState('correct');
            } else {
                // Đúng hoàn hảo ngay lần đầu tiên trong ngày!
                if (!currentWord.isPassedFirstRound) {
                    // Mới chỉ đúng chiều thứ nhất -> Chuyển sang bắt kiểm tra nốt chiều thứ 2 luôn
                    currentWord.isPassedFirstRound = true;
                    isTestingReviewSide = true;
                    nextQuestion();
                } else {
                    // Đã đúng nốt cả chiều thứ 2 -> Hoàn hảo! Cho qua từ này
                    isTestingReverseSide = false;
                    const perfectWord = reviewQueue.shift();
                    updateWordInDB(perfectWord, true); // Thưởng hệ số xa (3 ngày)
                    switchState('correct');
                }
            }
        }
    } else {
        // TRƯỜNG HỢP: ĐÁP ÁN SAI
        currentWord.isFailedInSession = true; // Đánh dấu từ này đã từng sai
        isTestingReverseSide = false; // Thiết lập lại, hủy trạng thái đảo chiều nếu có
        
        // Thiết lập màn hình báo sai (Hiển thị chuỗi gốc đầy đủ để người dùng biết họ sai ở đâu)
        if (activeMode === 'vi') {
            document.getElementById('wrong-eng').textContent = currentWord.english;
            document.getElementById('correct-viet').textContent = currentWord.vietnamese;
        } else {
            document.getElementById('wrong-eng').textContent = currentWord.vietnamese;
            document.getElementById('correct-viet').textContent = currentWord.english;
        }
        
        isRetryingWrongWord = true; // Kích hoạt cờ bắt buộc gõ lại từ đầu
        switchState('wrong');
    }
}

// --- LẮNG NGHE SỰ KIỆN KHỞI CHẠY ---

document.getElementById('modeToggleBtn').addEventListener('click', (e) => {
    // Reset các trạng thái đặc biệt khi người dùng chủ động đổi chế độ
    isRetryingWrongWord = false;
    isTestingReverseSide = false;

    if (currentMode === 'vi') {
        currentMode = 'en';
        e.target.textContent = "Chế độ: Viết Tiếng Anh";
        e.target.classList.add('active-en');
    } else {
        currentMode = 'vi';
        e.target.textContent = "Chế độ: Đọc Nghĩa";
        e.target.classList.remove('active-en');
    }
    if (currentWord && !document.getElementById('review-state').classList.contains('hidden')) {
        nextQuestion();
    }
});

document.getElementById('backBtn').addEventListener('click', () => {
    window.location.href = 'vocab.html';
});

document.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
        const reviewVisible = !document.getElementById('review-state').classList.contains('hidden');
        const correctVisible = !document.getElementById('correct-state').classList.contains('hidden');
        const wrongVisible = !document.getElementById('wrong-state').classList.contains('hidden');

        if (reviewVisible) {
            checkAnswer();
        } else if (correctVisible) {
            nextQuestion(); 
        } else if (wrongVisible) {
            // Khi đang ở màn hình báo sai, ấn enter sẽ quay lại ô nhập để bắt gõ cho đúng luôn
            switchState('review');
        }
    }
});

window.addEventListener('DOMContentLoaded', async () => {
    try {
        await initDB();
        await loadReviewWords();
        nextQuestion();
    } catch (error) {
        console.error("Lỗi khởi tạo ứng dụng:", error);
    }
});