// ==========================================
// VOCAB APP LOGIC (Luyện tập từ vựng & Giao diện)
// ==========================================

const DB_NAME = 'VocabDB';
const DB_VERSION = 3;
const STORE_NAME = 'words';

let db;
let originalWords = [];    
let activeWords = [];      
let currentPhase = 'context'; 
let currentDisplayMode = 'en'; 
let showAnswersAll = false;
let masteredWordIds = new Set(); 
let yellowMasteredIds = new Set(); 
let consecutiveCorrect = {};       
let wordInputs = {};       
let sentenceInputs = {};   
let feedbackHints = {}; 

let completedRounds = 0;       
let wordScoreHistory = {};     
let currentRoundScores = {};   
let frozenAvgScores = {};      

let isRaceMode = false;
let isCountdownActive = false;
let raceTimerInterval = null;
let raceTimeMax = 0;
let raceTimeRemaining = 0;
let activeRaceWordId = null;

let timerSeconds = 0;
let timerInterval = null;

// --- QUẢN LÝ ĐẾM GIỜ ---
function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerSeconds = 0;
    const timerDisplay = document.getElementById('timerDisplay');
    const bestDisplay = document.getElementById('bestTimeDisplay');
    
    const bestTime = localStorage.getItem('vocab_best_time');
    if (bestTime) {
        bestDisplay.textContent = formatTime(parseInt(bestTime));
    }

    timerInterval = setInterval(() => {
        timerSeconds++;
        timerDisplay.textContent = formatTime(timerSeconds);
    }, 1000);
}

function stopAndSaveTimer() {
    if (timerInterval) clearInterval(timerInterval);
    const bestTime = localStorage.getItem('vocab_best_time');
    if (!bestTime || timerSeconds < parseInt(bestTime)) {
        localStorage.setItem('vocab_best_time', timerSeconds);
        alert(`🏆 Chúc mừng! Bạn đã đạt thời gian học nhanh nhất mới: ${formatTime(timerSeconds)}`);
    }
}

function formatTime(totalSec) {
    const m = Math.floor(totalSec / 60).toString().padStart(2, '0');
    const s = (totalSec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
}

// --- XỬ LÝ CHẾ ĐỘ ĐUA (RACE MODE) ---
function runRaceCountdown(onComplete) {
    isCountdownActive = true;
    stopRaceTimer();
    const modal = document.getElementById('countdownModal');
    const countdownEl = document.getElementById('countdownText');
    modal.classList.add('active');

    let count = 3;
    countdownEl.textContent = count;

    const timer = setInterval(() => {
        count--;
        if (count > 0) {
            countdownEl.textContent = count;
        } else if (count === 0) {
            countdownEl.textContent = "BẮT ĐẦU!";
        } else {
            clearInterval(timer);
            modal.classList.remove('active');
            isCountdownActive = false;
            if (onComplete) onComplete();
        }
    }, 700);
}

function stopRaceTimer() {
    if (raceTimerInterval) {
        clearInterval(raceTimerInterval);
        raceTimerInterval = null;
    }
}

function startRaceTimerForWord(word, correctAnswer) {
    stopRaceTimer();
    if (!isRaceMode || isCountdownActive || masteredWordIds.has(word.id)) return;

    activeRaceWordId = word.id;
    const wordLen = correctAnswer ? correctAnswer.length : 5;
    raceTimeMax = Math.max(3200, 2200 + wordLen * 550);
    raceTimeRemaining = raceTimeMax;

    const hpFill = document.getElementById('hpBarFill');
    if (hpFill) hpFill.style.height = '100%';

    const tick = 50;
    raceTimerInterval = setInterval(() => {
        raceTimeRemaining -= tick;
        if (raceTimeRemaining <= 0) {
            raceTimeRemaining = 0;
            if (hpFill) hpFill.style.height = '0%';
            stopRaceTimer();

            // Lần đầu gõ (ở đây là hết giờ) -> Ghi nhận 0 điểm & reset chuỗi về 0
            if (currentRoundScores[word.id] === undefined) {
                currentRoundScores[word.id] = 0;
                consecutiveCorrect[word.id] = 0;
                word.consecutiveCorrect = 0;
                saveWordConsecutiveStatus(word.id, 0);
            }

            playWrongSound();
            feedbackHints[word.id] = {
                type: 'wrong',
                text: '⏱️ Hết thời gian! Nhận 0 điểm. Chuỗi đúng đã bị reset về 0!'
            };
            render();
            focusFirstInput();
        } else {
            if (hpFill) hpFill.style.height = (raceTimeRemaining / raceTimeMax * 100) + '%';
        }
    }, tick);
}

// --- QUẢN LÝ DATABASE & NĂNG LỰC HỌC ---
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
                store.createIndex('english', 'english', { unique: false });
                store.createIndex('nextReviewDate', 'nextReviewDate', { unique: false });
            }
        };
    });
}

// Xóa từ vựng trực tiếp khỏi IndexedDB
function deleteWordFromDB(wordId) {
    if (!db) return;
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.delete(wordId);
    
    tx.onerror = (e) => {
        console.error("Lỗi khi xóa từ khỏi IndexedDB:", e.target.error);
    };
}

// Cập nhật số lần đúng liên tiếp vào IndexedDB
function saveWordConsecutiveStatus(wordId, count) {
    if (!db) return;
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const getReq = store.get(wordId);
    
    getReq.onsuccess = () => {
        const wordData = getReq.result;
        if (wordData) {
            wordData.consecutiveCorrect = count;
            store.put(wordData);
        }
    };
}

function getDateStringWithOffset(offsetDays = 0) {
    const localDate = new Date(Date.now() + (7 * 60 * 60 * 1000) + (offsetDays * 24 * 60 * 60 * 1000));
    return localDate.toISOString().split('T')[0];
}

function getTodayString() {
    return getDateStringWithOffset(0);
}

function processDuplicates(wordsList) {
    const enCounts = {};
    const viCounts = {};

    wordsList.forEach(w => {
        const en = w.english.trim().toLowerCase();
        const vi = w.vietnamese.trim().toLowerCase();
        enCounts[en] = (enCounts[en] || 0) + 1;
        viCounts[vi] = (viCounts[vi] || 0) + 1;
    });

    const enTracker = {};
    const viTracker = {};

    return wordsList.map(w => {
        const wordCopy = { ...w };
        const en = w.english.trim().toLowerCase();
        const vi = w.vietnamese.trim().toLowerCase();

        if (enCounts[en] > 1) {
            enTracker[en] = (enTracker[en] || 0) + 1;
            wordCopy.displayEnglish = `${w.english} (${enTracker[en]})`;
        } else {
            wordCopy.displayEnglish = w.english;
        }

        if (viCounts[vi] > 1) {
            viTracker[vi] = (viTracker[vi] || 0) + 1;
            wordCopy.displayVietnamese = `${w.vietnamese} (${viTracker[vi]})`;
        } else {
            wordCopy.displayVietnamese = w.vietnamese;
        }

        return wordCopy;
    });
}

function loadAndBalanceWords() {
    return new Promise((resolve, reject) => {
        const todayStr = getTodayString();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => {
            const allWords = request.result || [];

            let dueWords = allWords.filter(word => {
                if (!word.nextReviewDate) word.nextReviewDate = todayStr;
                return word.nextReviewDate <= todayStr;
            });

            // 🟢 ĐÃ CẬP NHẬT: Giới hạn tối đa 10 từ học mỗi ngày
            if (dueWords.length > 10) {
                dueWords = dueWords.slice(0, 10);
            }

            originalWords = processDuplicates(dueWords);
            originalWords.forEach(w => {
                if (!w.timesLearned) w.timesLearned = 1;
                wordScoreHistory[w.id] = [];
                // Nối lại chuỗi đúng từ DB
                consecutiveCorrect[w.id] = w.consecutiveCorrect || 0;
            });

            activeWords = JSON.parse(JSON.stringify(originalWords));
            resolve();
        };
        request.onerror = () => reject(request.error);
    });
}

// --- THUẬT TOÁN ĐÁNH GIÁ ĐỘ CHÍNH XÁC ---
function getLevenshteinDistance(a, b) {
    a = a.toLowerCase().trim();
    b = b.toLowerCase().trim();
    const matrix = [];

    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }
    return matrix[b.length][a.length];
}

function calculateAccuracyScore(typed, target) {
    typed = typed.toLowerCase().trim();
    target = target.toLowerCase().trim();

    if (typed === target) return 10;
    if (target.length === 0) return 0;

    const dist = getLevenshteinDistance(typed, target);
    const maxLength = Math.max(typed.length, target.length);

    let accuracy = (1 - (dist / maxLength)) * 10;
    if (accuracy < 0) accuracy = 0;

    return Math.round(accuracy * 10) / 10;
}

function getAverageScore(wordId) {
    if (frozenAvgScores[wordId] !== undefined) {
        return frozenAvgScores[wordId];
    }

    const history = wordScoreHistory[wordId] || [];
    const currentScore = currentRoundScores[wordId];

    const allScores = [...history];
    if (currentScore !== undefined) {
        allScores.push(currentScore);
    }

    if (allScores.length === 0) return 0;

    const sum = allScores.reduce((a, b) => a + b, 0);
    return Math.round((sum / allScores.length) * 10) / 10;
}

function formatExampleText(str) {
    if (!str) return '';
    return str.replace(/\((.*?)\)/g, '<span class="highlight-target">($1)</span>');
}

function focusFirstInput() {
    setTimeout(() => {
        const firstInput = document.querySelector('.word-input-box:not([disabled])');
        if (firstInput) {
            firstInput.focus();
            firstInput.select();
        }
    }, 80);
}

// --- RENDER GIAO DIỆN ---
function render() {
    const container = document.getElementById('wordListContainer');
    container.innerHTML = '';

    document.getElementById('roundCounterBadge').textContent = `Vòng: ${completedRounds + 1}`;

    const hpWrapper = document.getElementById('hpBarWrapper');
    if (hpWrapper) {
        hpWrapper.style.display = (isRaceMode && currentPhase === 'main') ? 'flex' : 'none';
    }

    if (activeWords.length === 0) {
        container.innerHTML = `<div style="text-align:center; font-size:1.6rem; color:#fde047; margin-top:30px;">
            Không có từ vựng nào cần học hôm nay!
        </div>`;
        return;
    }

    const banner = document.getElementById('phaseBanner');
    const phaseBtn = document.getElementById('phaseActionButton');

    if (currentPhase === 'context') {
        banner.textContent = 'Lượt 1: Ngữ cảnh (Luyện câu ví dụ)';
        phaseBtn.textContent = 'Lượt 2 ->';
    } else {
        const modeTitle = isRaceMode ? '🏎️ CHẾ ĐỘ ĐUA' : '🌱 THÔNG THƯỜNG';
        banner.textContent = `Lượt 2 [${modeTitle}] (Vòng ${completedRounds + 1}): Nhấn TAB để Xáo Trộn nhanh. Điền hết hãy ấn Xáo Trộn để ôn lại, nếu hoàn thành hãy nhấn Nộp Bài.`;
        phaseBtn.textContent = 'Nộp bài';
    }

    activeWords.forEach((word, index) => {
        const wordRow = document.createElement('div');
        wordRow.className = 'word-row';

        const isMastered = masteredWordIds.has(word.id);
        const isYellowMastered = yellowMasteredIds.has(word.id);
        const questionText = currentDisplayMode === 'en' ? word.displayVietnamese : word.displayEnglish;
        const correctAnswer = currentDisplayMode === 'en' ? word.english : word.vietnamese;

        const indexDiv = document.createElement('div');
        indexDiv.className = 'word-index';
        indexDiv.textContent = index + 1;

        const questionCard = document.createElement('div');
        questionCard.className = 'word-card-question';
        questionCard.textContent = questionText;

        const checkboxContainer = document.createElement('div');
        checkboxContainer.className = 'word-checkbox-container';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'word-checkbox';
        if (isYellowMastered) {
            checkbox.classList.add('yellow-checkbox');
        }
        checkbox.checked = isMastered;

        checkbox.addEventListener('change', () => {
            if (checkbox.checked) {
                masteredWordIds.add(word.id);
                frozenAvgScores[word.id] = getAverageScore(word.id);
            } else {
                masteredWordIds.delete(word.id);
                yellowMasteredIds.delete(word.id);
                delete frozenAvgScores[word.id];
            }
            render();
        });
        checkboxContainer.appendChild(checkbox);

        wordRow.appendChild(indexDiv);
        wordRow.appendChild(questionCard);
        wordRow.appendChild(checkboxContainer);

        if (currentPhase === 'context') {
            const isNewWord = (word.timesLearned <= 2);
            const contextBox = document.createElement('div');
            contextBox.className = 'context-display-box';

            const ex1 = word.example1 || `(1. Ví dụ mẫu cho: ${word.english})`;
            const ex2 = word.example2 || `(2. Ví dụ mẫu cho: ${word.english})`;

            const formattedEx1 = formatExampleText(ex1);
            const formattedEx2 = formatExampleText(ex2);

            if (isNewWord) {
                contextBox.innerHTML = `
                    <div class="context-example-item">1. ${formattedEx1}</div>
                    <div class="context-example-item">2. ${formattedEx2}</div>
                `;
            } else {
                let isRevealed = word._showContext || false;
                if (isRevealed) {
                    contextBox.innerHTML = `
                        <div class="context-example-item">1. ${formattedEx1}</div>
                        <div class="context-example-item">2. ${formattedEx2}</div>
                    `;
                } else {
                    contextBox.innerHTML = `<div class="context-hidden">các từ đã cũ sẽ bị ẩn như này (trừ khi ấn vào)</div>`;
                }

                contextBox.addEventListener('click', () => {
                    word._showContext = !word._showContext;
                    render();
                });
            }

            wordRow.appendChild(contextBox);
        } 
        else {
            const inputColumn = document.createElement('div');
            inputColumn.className = 'input-wrapper-column';

            const inputAnswer = document.createElement('input');
            inputAnswer.type = 'text';
            inputAnswer.className = 'word-input-box';
            if (isYellowMastered) {
                inputAnswer.classList.add('yellow-mastered');
            }
            inputAnswer.dataset.index = index;

            if (isMastered) {
                inputAnswer.disabled = true;
                inputAnswer.value = correctAnswer;
            } else {
                inputAnswer.value = showAnswersAll ? correctAnswer : (wordInputs[word.id] || '');
            }

            inputAnswer.addEventListener('focus', () => {
                if (isRaceMode && !isCountdownActive && !masteredWordIds.has(word.id)) {
                    if (activeRaceWordId !== word.id || raceTimeRemaining <= 0) {
                        startRaceTimerForWord(word, correctAnswer);
                    }
                }
            });

            inputAnswer.addEventListener('keydown', (e) => {
                if (!e.repeat && (e.key.length === 1 || e.key === 'Backspace' || e.key === 'Delete')) {
                    inputAnswer.classList.remove('is-shaking');
                    void inputAnswer.offsetWidth;
                    inputAnswer.classList.add('is-shaking');
                }

                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    let nextIdx = index + 1;
                    while (nextIdx < activeWords.length) {
                        const nextWord = activeWords[nextIdx];
                        if (!masteredWordIds.has(nextWord.id)) {
                            const nextInput = document.querySelector(`input[data-index="${nextIdx}"]`);
                            if (nextInput) { nextInput.focus(); break; }
                        }
                        nextIdx++;
                    }
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    stopRaceTimer();
                    gradeSingleWord(word, inputAnswer.value, inputAnswer, index, activeWords);
                }
            });

            inputAnswer.addEventListener('animationend', () => {
                inputAnswer.classList.remove('is-shaking');
            });

            inputAnswer.addEventListener('input', (e) => {
                wordInputs[word.id] = e.target.value;
            });

            inputColumn.appendChild(inputAnswer);

            if (feedbackHints[word.id]) {
                const hintDiv = document.createElement('div');
                hintDiv.className = feedbackHints[word.id].type === 'partial' ? 'partial-hint-text' : 'wrong-hint-text';
                hintDiv.textContent = feedbackHints[word.id].text;
                inputColumn.appendChild(hintDiv);
            }

            const currentScore = currentRoundScores[word.id] !== undefined ? `${currentRoundScores[word.id]}/10` : '--';
            const avgScore = getAverageScore(word.id);
            const streakCount = consecutiveCorrect[word.id] || 0;

            const scoreBadge = document.createElement('div');
            scoreBadge.className = 'score-badge';
            scoreBadge.innerHTML = `
                <div>Lượt này: ${currentScore}</div>
                <div style="color: ${isYellowMastered ? '#f59e0b' : '#6ee7b7'};">TB: ${avgScore}/10</div>
                <div style="font-size: 0.85rem; color: #fde047;">Chuỗi đúng: ${streakCount}/3</div>
            `;

            wordRow.appendChild(inputColumn);
            wordRow.appendChild(scoreBadge);
        }

        container.appendChild(wordRow);
    });
}

// --- CHẤM ĐIỂM VÀ TỰ ĐỘNG XÓA TỪ ---
function gradeSingleWord(word, userText, inputElement, index, visibleWords) {
    if (!userText || userText.trim() === '') return;

    const correctAnswer = currentDisplayMode === 'en' ? word.english : word.vietnamese;
    
    let rawTyped = userText;
    if (rawTyped.includes('->')) {
        rawTyped = rawTyped.split('->')[0].trim();
    }

    const calculatedScore = calculateAccuracyScore(rawTyped, correctAnswer);
    const isExact = (calculatedScore === 10);

    // 🔴 CHỈ TÍNH ĐIỂM & CHUỖI ĐÚNG Ở LẦN GÕ ĐẦU TIÊN TRONG VÒNG
    const isFirstAttempt = (currentRoundScores[word.id] === undefined);

    if (isFirstAttempt) {
        currentRoundScores[word.id] = calculatedScore;

        if (isExact) {
            consecutiveCorrect[word.id] = (consecutiveCorrect[word.id] || 0) + 1;
            word.consecutiveCorrect = consecutiveCorrect[word.id];
        } else {
            // Lần đầu điểm < 10 (sai/gần đúng) -> Reset chuỗi đúng về 0!
            consecutiveCorrect[word.id] = 0;
            word.consecutiveCorrect = 0;
            saveWordConsecutiveStatus(word.id, 0);
        }
    }

    // 🟢 KHI GÕ ĐÚNG TỪ (Dù là lần đầu hay gõ lại)
    if (isExact) {
        playCorrectSound();
        delete feedbackHints[word.id];
        wordInputs[word.id] = correctAnswer;

        // 🟢 XÓA VĨNH VIỄN KHỎI DB: Khi chuỗi đúng đạt từ 3 trở lên
        if (consecutiveCorrect[word.id] >= 3) {
            deleteWordFromDB(word.id);
            alert(`🎉 Chúc mừng! Từ "${word.english}" đã đúng 3 lần liên tiếp và được xóa vĩnh viễn khỏi hệ thống!`);

            activeWords = activeWords.filter(w => w.id !== word.id);
            originalWords = originalWords.filter(w => w.id !== word.id);

            render();
            focusFirstInput();
            return;
        }

        // Lưu trạng thái chuỗi đúng vào IndexedDB
        saveWordConsecutiveStatus(word.id, consecutiveCorrect[word.id]);

        if (consecutiveCorrect[word.id] >= 3 && !masteredWordIds.has(word.id)) {
            masteredWordIds.add(word.id);
            yellowMasteredIds.add(word.id);
            frozenAvgScores[word.id] = getAverageScore(word.id);
        }

        inputElement.classList.add('flash-correct');
        setTimeout(() => inputElement.classList.remove('flash-correct'), 600);

        render();

        // Tự động nhảy sang ô tiếp theo
        let nextIdx = index + 1;
        while (nextIdx < visibleWords.length) {
            const nextWord = visibleWords[nextIdx];
            if (!masteredWordIds.has(nextWord.id)) {
                const nextInput = document.querySelector(`input[data-index="${nextIdx}"]`);
                if (nextInput) { nextInput.focus(); break; }
            }
            nextIdx++;
        }
    } else {
        playWrongSound();

        const dist = getLevenshteinDistance(rawTyped, correctAnswer);

        if (dist <= 2) {
            feedbackHints[word.id] = {
                type: 'partial',
                text: `${rawTyped} !sai ít! ${correctAnswer}`
            };
            inputElement.classList.add('flash-partial');
            setTimeout(() => inputElement.classList.remove('flash-partial'), 600);
        } else {
            feedbackHints[word.id] = {
                type: 'wrong',
                text: `Chưa chính xác! Đáp án đúng: ${correctAnswer}`
            };
            inputElement.classList.add('flash-wrong');
            setTimeout(() => inputElement.classList.remove('flash-wrong'), 600);
        }

        wordInputs[word.id] = rawTyped;
        render();

        setTimeout(() => {
            const currentInput = document.querySelector(`input[data-index="${index}"]`);
            if (currentInput) {
                currentInput.focus();
                currentInput.select();
            }
        }, 50);
    }
}

function validateAllInputsFilled() {
    if (currentPhase === 'context') return true;
    for (let word of activeWords) {
        if (masteredWordIds.has(word.id)) continue; 
        const val = wordInputs[word.id];
        if (!val || val.trim().length === 0) return false;
    }
    return true;
}

function shuffleWords() {
    stopRaceTimer();
    if (currentPhase === 'main' && !validateAllInputsFilled()) {
        alert("⚠️ Chỉ khi mọi ô (chưa tích) đã được điền ít nhất 1 chữ thì mới được nhấn Xáo Trộn hoặc Nộp Bài!");
        return;
    }

    if (currentPhase === 'main') {
        activeWords.forEach(word => {
            if (!masteredWordIds.has(word.id)) {
                let score = currentRoundScores[word.id];
                if (score === undefined) {
                    const text = wordInputs[word.id] || '';
                    let rawTyped = text.includes('->') ? text.split('->')[0].trim() : text;
                    const correctAnswer = currentDisplayMode === 'en' ? word.english : word.vietnamese;
                    score = calculateAccuracyScore(rawTyped, correctAnswer);
                }
                if (!wordScoreHistory[word.id]) wordScoreHistory[word.id] = [];
                wordScoreHistory[word.id].push(score);
            } else {
                if (!wordScoreHistory[word.id]) wordScoreHistory[word.id] = [];
                wordScoreHistory[word.id].push(10);
            }
        });

        completedRounds++;
        currentRoundScores = {}; 
    }

    for (let i = activeWords.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [activeWords[i], activeWords[j]] = [activeWords[j], activeWords[i]];
    }

    wordInputs = {};
    feedbackHints = {};
    showAnswersAll = false;
    render();
    focusFirstInput();
}

function submitAndFinish() {
    stopRaceTimer();
    if (!validateAllInputsFilled()) {
        alert("⚠️ Chỉ khi mọi ô (chưa tích) đã được điền ít nhất 1 chữ thì mới được nhấn Nộp Bài!");
        return;
    }

    stopAndSaveTimer();

    const todayStr = getTodayString();
    localStorage.setItem('vocab_completed_date', todayStr);

    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    originalWords.forEach(word => {
        const finalAvgScore = getAverageScore(word.id);
        word.timesLearned = (word.timesLearned || 1) + 1;

        word.consecutiveCorrect = consecutiveCorrect[word.id] || 0;

        let currentInterval = word.interval || 1;
        let newInterval = 1;

        if (finalAvgScore >= 9) {
            newInterval = currentInterval === 1 ? 4 : Math.round(currentInterval * 2.3);
        } else if (finalAvgScore >= 5) {
            newInterval = currentInterval === 1 ? 2 : Math.round(currentInterval * 1.5);
        } else if (finalAvgScore >= 3) {
            newInterval = currentInterval === 1 ? 1 : Math.round(currentInterval * 1.2);
        } else {
            newInterval = 1; 
        }

        word.interval = newInterval;
        word.nextReviewDate = getDateStringWithOffset(newInterval);

        delete word.displayEnglish;
        delete word.displayVietnamese;

        store.put(word);
    });

    tx.oncomplete = () => {
        alert("🎉 Đã hoàn thành ca học! Kết quả đã được ghi nhận vào hệ thống.");
        window.location.href = 'vocab.html';
    };

    tx.onerror = (event) => {
        console.error("Lỗi khi lưu dữ liệu IndexedDB:", event.target.error);
        alert("Đã hoàn thành ca học! Đang quay lại trang chủ...");
        window.location.href = 'vocab.html';
    };
}

// --- XỬ LÝ SỰ KIỆN LẮNG NGHE (LISTENERS) ---
document.addEventListener('keydown', (e) => {
    if (e.key === 'Tab' && currentPhase === 'main') {
        e.preventDefault(); 
        shuffleWords();
    }
});

document.getElementById('toggleBgmBtn').addEventListener('click', toggleBGM);

document.getElementById('phaseActionButton').addEventListener('click', () => {
    if (currentPhase === 'context') {
        document.getElementById('modeSelectionModal').classList.add('active');
    } else {
        submitAndFinish();
    }
});

document.getElementById('selectRaceModeBtn').addEventListener('click', () => {
    isRaceMode = true;
    document.getElementById('modeSelectionModal').classList.remove('active');
    currentPhase = 'main';
    startTimer();
    render();

    runRaceCountdown(() => {
        focusFirstInput();
    });
});

document.getElementById('selectNormalModeBtn').addEventListener('click', () => {
    isRaceMode = false;
    document.getElementById('modeSelectionModal').classList.remove('active');
    currentPhase = 'main';
    startTimer();
    render();
    focusFirstInput();
});

document.getElementById('shuffleBtn').addEventListener('click', shuffleWords);

document.getElementById('toggleModeBtn').addEventListener('click', (e) => {
    if (currentDisplayMode === 'en') {
        currentDisplayMode = 'vi';
        e.target.textContent = "trả lời tiếng việt";
    } else {
        currentDisplayMode = 'en';
        e.target.textContent = "trả lời tiếng anh";
    }
    render();
    if (currentPhase === 'main') focusFirstInput();
});

document.getElementById('toggleAnswersBtn').addEventListener('click', () => {
    showAnswersAll = !showAnswersAll;
    render();
    if (currentPhase === 'main') focusFirstInput();
});

document.getElementById('showAllBtn').addEventListener('click', () => {
    masteredWordIds.clear();
    yellowMasteredIds.clear();
    consecutiveCorrect = {};
    frozenAvgScores = {};
    render();
    if (currentPhase === 'main') focusFirstInput();
});

const backBtn = document.getElementById('backBtn');
if (backBtn) {
    backBtn.addEventListener('click', (e) => {
        e.preventDefault();
        window.location.href = 'vocab.html';
    });
}

const promptModal = document.getElementById('aiPromptModal');
document.getElementById('promptAiBtn').addEventListener('click', () => {
    const samplePrompt = `Hãy đóng vai giáo viên tiếng Anh. Hãy cho tôi 10 từ vựng ngẫu nhiên trình độ B1/B2.
Mỗi từ gồm: "english", "vietnamese", "example1", "example2" (từ mới được bọc ngoặc đơn trong ví dụ).
Trả về JSON thuần mảng:
[
  {
    "english": "enhance",
    "vietnamese": "nâng cao",
    "example1": "You can (enhance) your skills by practicing daily.",
    "example2": "The new feature will (enhance) user experience."
  }
]`;
    document.getElementById('aiPromptText').value = samplePrompt;
    promptModal.classList.add('active');
});

document.getElementById('closePromptModalBtn').addEventListener('click', () => {
    promptModal.classList.remove('active');
});

document.getElementById('copyPromptBtn').addEventListener('click', () => {
    const copyText = document.getElementById('aiPromptText');
    copyText.select();
    navigator.clipboard.writeText(copyText.value);
    alert("Đã sao chép Prompt vào bộ nhớ tạm!");
});

window.addEventListener('DOMContentLoaded', async () => {
    try {
        await initDB();
        await loadAndBalanceWords();
        render();
    } catch (err) {
        console.error("Lỗi khởi chạy hệ thống:", err);
    }
});