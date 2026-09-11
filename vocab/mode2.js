const DB_NAME = 'VocabDB';
const DB_VERSION = 2;
const STORE_NAME = 'words';

let db;
let todayWords = []; 
let currentDisplayMode = 'en'; 
let showAnswersAll = false; 
let masteredWordIds = new Set(); 
let revealedWordIds = new Set(); 
let wordRatings = {}; 

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

// 2. LẤY TỪ HÔM NAY VÀ SỬA LỖI TỪ BỊ KẸT TRONG QUÁ KHỨ
function loadTodayWords() {
    return new Promise((resolve, reject) => {
        const todayStr = getTodayString();
        const tx = db.transaction(STORE_NAME, 'readwrite'); // Dùng readwrite để tự động cập nhật ngày quá hạn
        const store = tx.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => {
            const allWords = request.result;
            todayWords = [];

            allWords.forEach(word => {
                // Nếu ngày học trong quá khứ (< hôm nay), tự động kéo về hôm nay
                if (word.nextReviewDate < todayStr) {
                    word.nextReviewDate = todayStr;
                    store.put(word);
                }

                // Đưa các từ của ngày hôm nay vào danh sách học
                if (word.nextReviewDate === todayStr) {
                    todayWords.push(word);
                    wordRatings[word.id] = 3; // Mặc định điểm là 3 (Tốt)
                }
            });
        };

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

function renderWords() {
    const container = document.getElementById('wordListContainer');
    container.innerHTML = '';

    if (todayWords.length === 0) {
        container.innerHTML = `<div style="text-align:center; font-size:1.6rem; color:#718096;">Hôm nay thảnh thơi quá! Không có từ nào cần kiểm tra.</div>`;
        return;
    }

    const toggleAnswersBtn = document.getElementById('toggleAnswersBtn');
    if (toggleAnswersBtn) {
        toggleAnswersBtn.textContent = showAnswersAll ? "ẩn đáp án" : "hiện đáp án";
    }

    todayWords.forEach((word, index) => {
        const wordRow = document.createElement('div');
        const isMastered = masteredWordIds.has(word.id);
        const isSingleRevealed = revealedWordIds.has(word.id);
        const isAnswerVisible = showAnswersAll || isSingleRevealed;

        wordRow.className = isMastered ? 'word-row hidden-word' : 'word-row';

        let questionText = currentDisplayMode === 'en' ? word.vietnamese : word.english;
        let answerText = '— — —';

        if (isAnswerVisible) {
            answerText = currentDisplayMode === 'en' ? word.english : word.vietnamese;
        }

        wordRow.innerHTML = `
            <div class="word-index">${index + 1}</div>
            <div class="word-card-question">${questionText}</div>
            <div class="word-checkbox-container">
                <input type="checkbox" class="word-checkbox" ${isMastered ? 'checked' : ''} data-id="${word.id}">
            </div>
            <div class="word-card-answer">${answerText}</div>
            <button class="btn-reveal-single" data-id="${word.id}">${isAnswerVisible ? '👁️' : '🔒'}</button>
        `;

        const checkbox = wordRow.querySelector('.word-checkbox');
        checkbox.addEventListener('change', (e) => {
            if (e.target.checked) masteredWordIds.add(word.id);
            else masteredWordIds.delete(word.id);
            renderWords();
        });

        const btnReveal = wordRow.querySelector('.btn-reveal-single');
        btnReveal.addEventListener('click', () => {
            if (revealedWordIds.has(word.id)) {
                revealedWordIds.delete(word.id);
            } else {
                revealedWordIds.add(word.id);
            }
            renderWords();
        });

        container.appendChild(wordRow);
    });
}

function shuffleWords() {
    for (let i = todayWords.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [todayWords[i], todayWords[j]] = [todayWords[j], todayWords[i]];
    }
    showAnswersAll = false;
    revealedWordIds.clear();
    renderWords();
}

function renderRatingModal() {
    const ratingList = document.getElementById('ratingList');
    ratingList.innerHTML = '';

    todayWords.forEach((word, index) => {
        const row = document.createElement('div');
        row.className = 'rating-row';

        const currentScore = wordRatings[word.id] || 3;

        row.innerHTML = `
            <div style="font-size: 1.8rem; width: 25px;">${index + 1}</div>
            <div class="rating-word-box">${word.english} (${word.vietnamese})</div>
            <div class="rating-options">
                ${[1, 2, 3, 4].map(num => `
                    <div class="rating-circle ${currentScore === num ? 'selected' : ''}" data-id="${word.id}" data-score="${num}">
                        ${num}
                    </div>
                `).join('')}
            </div>
        `;

        row.querySelectorAll('.rating-circle').forEach(circle => {
            circle.addEventListener('click', (e) => {
                const score = parseInt(e.target.getAttribute('data-score'));
                const wId = parseInt(e.target.getAttribute('data-id'));
                wordRatings[wId] = score;
                renderRatingModal(); 
            });
        });

        ratingList.appendChild(row);
    });
}

// HÀM TÌM NGÀY TRỐNG BẰNG TÍNH TOÁN TRỰC TIẾP (KHÔNG MỞ TRANSACTION MỚI)
function findNextAvailableDateSync(allWords, startInterval) {
    let currentCheckInterval = startInterval;
    let foundDateStr = "";

    while (true) {
        const checkDate = new Date(Date.now() + 7 * 60 * 60 * 1000);
        checkDate.setDate(checkDate.getDate() + currentCheckInterval);
        const checkDateStr = checkDate.toISOString().split('T')[0];

        // Đếm số lượng từ đụng lịch trên ngày checkDateStr
        const count = allWords.filter(w => w.nextReviewDate === checkDateStr).length;

        if (count < 20) {
            foundDateStr = checkDateStr;
            break;
        }
        currentCheckInterval++; // Nếu đầy (>=20 từ), đẩy lùi sang ngày hôm sau
    }
    return { dateStr: foundDateStr, finalInterval: currentCheckInterval };
}

// 7. SỬA LỖI KHÔNG CHUYỂN TRANG VÀ TÍNH LỊCH MỚI CHÍNH XÁC
function saveRatingsAndFinish() {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const getAllReq = store.getAll();

    getAllReq.onsuccess = () => {
        const allWords = getAllReq.result;

        for (const word of todayWords) {
            const rating = wordRatings[word.id] || 3;
            let currentInterval = word.interval || 1;
            let newInterval = 1;

            if (rating === 1) {
                newInterval = 1;
            } else if (rating === 2) {
                newInterval = currentInterval === 1 ? 2 : Math.floor(currentInterval * 1.3);
            } else if (rating === 3) {
                newInterval = currentInterval === 1 ? 3 : currentInterval * 2;
            } else if (rating === 4) {
                newInterval = currentInterval === 1 ? 5 : Math.floor(currentInterval * 2.5);
            }

            // Tốt nghiệp từ vựng
            if (newInterval >= 32) {
                store.delete(word.id);
                continue;
            }

            // Tính toán ngày khả thi mà không bị treo DB
            const { dateStr, finalInterval } = findNextAvailableDateSync(allWords, newInterval);

            word.interval = finalInterval;
            word.nextReviewDate = dateStr;

            // Cập nhật lại mảng local để các từ phía sau tính đúng số lượng giới hạn 20 từ/ngày
            const existingWordInAll = allWords.find(w => w.id === word.id);
            if (existingWordInAll) {
                existingWordInAll.nextReviewDate = dateStr;
            }

            store.put(word);
        }
    };

    // Sự kiện hoàn tất ghi nhận thành công -> Hiện thông báo và chuyển hướng
    tx.oncomplete = () => {
        alert("Đã lưu kết quả đánh giá và cập nhật lịch ôn tập thành công!");
        window.location.href = 'vocab.html';
    };

    tx.onerror = (error) => {
        console.error("Lỗi khi lưu dữ liệu:", error);
        alert("Có lỗi xảy ra trong quá trình lưu dữ liệu!");
    };
}

// --- EVENT LISTENERS ---

document.getElementById('toggleModeBtn').addEventListener('click', (e) => {
    if (currentDisplayMode === 'en') {
        currentDisplayMode = 'vi';
        e.target.textContent = "trả lời tiếng việt";
    } else {
        currentDisplayMode = 'en';
        e.target.textContent = "trả lời tiếng anh";
    }
    showAnswersAll = false;
    revealedWordIds.clear();
    renderWords();
});

document.getElementById('shuffleBtn').addEventListener('click', shuffleWords);

document.getElementById('toggleAnswersBtn').addEventListener('click', () => {
    showAnswersAll = !showAnswersAll;
    renderWords();
});

document.getElementById('showAllBtn').addEventListener('click', () => {
    masteredWordIds.clear();
    renderWords();
});

document.getElementById('backBtn').addEventListener('click', () => {
    window.location.href = 'vocab.html';
});

document.getElementById('submitBtn').addEventListener('click', () => {
    renderRatingModal();
    document.getElementById('ratingModal').classList.add('active');
});

document.getElementById('modalBackBtn').addEventListener('click', () => {
    document.getElementById('ratingModal').classList.remove('active');
});

document.getElementById('modalOkBtn').addEventListener('click', () => {
    saveRatingsAndFinish();
});

document.addEventListener('keydown', (event) => {
    if (event.code === 'Space' && !document.getElementById('ratingModal').classList.contains('active')) {
        event.preventDefault();
        showAnswersAll = !showAnswersAll;
        renderWords();
    }
});

window.addEventListener('DOMContentLoaded', async () => {
    try {
        await initDB();
        await loadTodayWords();
        renderWords();
    } catch (error) {
        console.error("Lỗi khi tải dữ liệu:", error);
    }
});