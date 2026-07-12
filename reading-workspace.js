// ==========================================================================
// KHÔNG GIAN BÊN TRONG TRANG LUYỆN ĐỌC (READING WORKSPACE MODULE)
// ==========================================================================

let currentArticleData = null; 
let selectedTextGlobal = "";   // Lưu trữ từ/cụm từ đang được bôi đen
let countdownInterval = null;  // Quản lý bộ đếm thời gian
const DEFAULT_LIMIT_SECONDS = 20 * 60; // 20 phút chuẩn IELTS cho 1 bài đọc
let secondsLeft = DEFAULT_LIMIT_SECONDS;

// Cấu hình Database Từ vựng độc lập (Đã nâng lên phiên bản 2 đồng bộ hệ thống)
const VOCAB_DB_NAME = 'VocabDB';
const VOCAB_DB_VERSION = 2;
const VOCAB_STORE_NAME = 'words';

// Hàm này được gọi tự động từ reading.js khi bấm "Mở học"
function initReadingWorkspace(article) {
    console.log("Workspace đang khởi tạo bài đọc...", article);
    currentArticleData = article;
    selectedTextGlobal = "";
    
    // 1. RESET GIAO DIỆN CHUẨN
    const liveTransDisplay = document.getElementById("live-translated-text");
    if (liveTransDisplay) {
        liveTransDisplay.textContent = "Bôi đen từ hoặc đoạn văn bất kỳ để dịch tại đây...";
    }
    
    const sidebar = document.getElementById("quiz-sidebar-container");
    if (sidebar) sidebar.innerHTML = ""; 

    // 2. KIỂM TRA BỘ CÂU HỎI QUA THẺ TEMPLATE
    if (!article.questions || article.questions.length === 0) {
        triggerAiPopupViaTemplate();
    } else {
        renderWorkspaceQuiz(article.questions);
    }

    // 3. KÍCH HOẠT SỰ KIỆN BÔI ĐEN VĂN BẢN (MOUSEUP)
    const textZone = document.getElementById("text-render-area");
    if (textZone) {
        textZone.removeAttribute("onmouseup"); // Xóa sự kiện inline nếu có
        textZone.onmouseup = handleTextSelection; // Gán trực tiếp tránh trùng lặp hàm
    }

    // 4. KHỞI ĐỘNG ĐỒNG HỒ ĐẾM NGƯỢC 
    startWorkspaceTimer();
}

// ==========================================================================
// XỬ LÝ BÔI ĐEN VÀ DỊCH TẠI CHỖ (API GOOGLE TRỰC TIẾP)
// ==========================================================================
function handleTextSelection() {
    const selection = window.getSelection().toString().trim();
    const liveTransDisplay = document.getElementById("live-translated-text");

    if (!selection || selection === selectedTextGlobal) return;
    
    const totalWords = selection.split(/\s+/).length;

    if (totalWords > 3) {
        if (!confirm("Bạn có chắc muốn dịch hơi nhiều như này không?")) {
            window.getSelection().removeAllRanges();
            return;
        }
    }

    selectedTextGlobal = selection; 

    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=vi&dt=t&q=${encodeURIComponent(selection)}`;
    if (liveTransDisplay) liveTransDisplay.textContent = "Đang dịch...";
    
    fetch(url)
        .then(res => res.json())
        .then(data => {
            if (data && data[0] && liveTransDisplay) {
                const translation = data[0].map(item => item[0]).join("");
                liveTransDisplay.textContent = translation;
            }
        })
        .catch(() => {
            if (liveTransDisplay) liveTransDisplay.textContent = "❌ Lỗi kết nối dịch thuật.";
        });
}

// ==========================================================================
// XỬ LÝ LƯU TỪ VÀO SỔ TAY (ĐÃ SỬA: Đồng bộ Version 2, tự động khởi tạo kho lưu trữ an toàn)
// ==========================================================================
document.getElementById("btn-add-to-notebook").onclick = function() {
    if (!selectedTextGlobal) {
        alert("Vui lòng bôi đen một từ hoặc cụm từ tiếng Anh trong văn bản trước!");
        return;
    }
    
    const meaningElement = document.getElementById("live-translated-text");
    const meaning = meaningElement ? meaningElement.textContent : "";
    
    if (meaning === "Đang dịch..." || meaning.startsWith("Bôi đen")) {
        alert("Vui lòng đợi bản dịch load xong rồi bấm lưu nhé!");
        return;
    }

    let finalMeaning = prompt(`Xác nhận hoặc sửa lại nghĩa tiếng Việt cho từ "${selectedTextGlobal}":`, meaning);
    if (finalMeaning === null) return; 
    if (finalMeaning.trim() === "") {
        alert("Nghĩa tiếng Việt không được để trống!");
        return;
    }

    // Mở kết nối ngắn hạn tới VocabDB của bạn
    const req = indexedDB.open(VOCAB_DB_NAME, VOCAB_DB_VERSION);

    // Đảm bảo tạo store nếu cấu trúc dữ liệu chưa có trên môi trường mới
    req.onupgradeneeded = function(event) {
        const database = event.target.result;
        if (!database.objectStoreNames.contains(VOCAB_STORE_NAME)) {
            const store = database.createObjectStore(VOCAB_STORE_NAME, { keyPath: 'id', autoIncrement: true });
            store.createIndex('english', 'english', { unique: true });
            store.createIndex('nextReviewDate', 'nextReviewDate', { unique: false });
            console.log(`🎉 Đã tự động khởi tạo ObjectStore '${VOCAB_STORE_NAME}' tại Version 2!`);
        }
    };

    req.onsuccess = function(e) {
        const vocabDbInstance = e.target.result;
        try {
            const tx = vocabDbInstance.transaction(VOCAB_STORE_NAME, 'readwrite');
            const store = tx.objectStore(VOCAB_STORE_NAME);

            // Chuẩn hóa ngày theo đúng múi giờ Việt Nam (UTC+7)
            const localDate = new Date(Date.now() + 7 * 60 * 60 * 1000); 
            const todayStr = localDate.toISOString().split('T')[0];

            const newWord = {
                english: selectedTextGlobal.trim(),
                vietnamese: finalMeaning.trim(),
                nextReviewDate: todayStr, 
                interval: 1 
            };

            const addReq = store.add(newWord);
            
            addReq.onsuccess = function() {
                alert(`🎉 Đã thêm thành công từ: "${selectedTextGlobal}" vào sổ tay ôn tập!`);
                vocabDbInstance.close();
            };
            
            addReq.onerror = function() {
                alert(`Từ "${selectedTextGlobal}" đã tồn tại trong sổ tay từ vựng của bạn.`);
                vocabDbInstance.close();
            };
        } catch(err) {
            console.error("Lỗi thao tác Store từ vựng:", err);
            vocabDbInstance.close();
        }
    };

    req.onerror = function() {
        alert("Không thể kết nối đến CSDL VocabDB.");
    };
};

// ==========================================================================
// LOGIC ĐỒNG HỒ ĐẾM NGƯỢC (TIMER MANAGEMENT)
// ==========================================================================
function startWorkspaceTimer() {
    if (countdownInterval) clearInterval(countdownInterval);
    
    secondsLeft = DEFAULT_LIMIT_SECONDS;
    updateTimerDisplay();

    countdownInterval = setInterval(() => {
        secondsLeft--;
        updateTimerDisplay();

        if (secondsLeft === 60) {
            const timerEl = document.getElementById("reading-timer");
            if (timerEl) {
                timerEl.style.animation = "blink 1s infinite";
                timerEl.style.backgroundColor = "#FFF5F5";
            }
        }

        if (secondsLeft <= 0) {
            clearInterval(countdownInterval);
            alert("⏰ Đã hết 20 phút làm bài! Hệ thống sẽ tự động nộp bài và chấm điểm.");
            executeQuizSubmission(); 
        }
    }, 1000);
}

function updateTimerDisplay() {
    const minutes = Math.floor(secondsLeft / 60);
    const seconds = secondsLeft % 60;
    
    const strMinutes = minutes < 10 ? "0" + minutes : minutes;
    const strSeconds = seconds < 10 ? "0" + seconds : seconds;
    
    const timerElement = document.getElementById("reading-timer");
    if (timerElement) {
        timerElement.textContent = `${strMinutes}:${strSeconds}`;
    }
}

// ==========================================================================
// RENDER CÂU HỎI VÀ LOGIC CHẤM ĐIỂM / NỘP BÀI
// ==========================================================================
function renderWorkspaceQuiz(questions) {
    const sidebar = document.getElementById("quiz-sidebar-container");
    if (!sidebar) return;
    sidebar.innerHTML = `<h3 style="color:#62C4DA; margin-bottom:15px; border-bottom: 2px solid #62C4DA; padding-bottom:5px;">✍️ Đề Thi Đọc Hiểu</h3>`;

    questions.forEach((item, qIndex) => {
        const qBlock = document.createElement("div");
        qBlock.className = "quiz-block-item";
        qBlock.style.marginBottom = "22px";
        qBlock.style.background = "#F7FAFC";
        qBlock.style.padding = "15px";
        qBlock.style.borderRadius = "12px";

        qBlock.innerHTML = `
            <p style="font-weight:600; font-size:14px; margin-bottom:10px; color:#2D3748;">Câu ${qIndex + 1}: ${item.q}</p>
            <div class="options-group" id="group-q-${qIndex}">
                ${item.options.map((opt, oIndex) => `
                    <label style="display:flex; align-items:center; font-size:13px; margin-bottom:8px; cursor:pointer; gap:8px;">
                        <input type="radio" name="workspace-q-${qIndex}" value="${oIndex}">
                        <span>${opt}</span>
                    </label>
                `).join('')}
            </div>
            <p id="workspace-explain-${qIndex}" class="hidden" style="font-size:12.5px; color:#4A5568; background:#FFF5F5; padding:10px; border-radius:8px; margin-top:10px; border-left:4.5px solid #FA855A; line-height:1.5;">
                💡 <strong>Giải thích:</strong> ${item.explain}
            </p>
        `;
        sidebar.appendChild(qBlock);
    });
}

function executeQuizSubmission() {
    if (countdownInterval) clearInterval(countdownInterval); 

    if (!currentArticleData || !currentArticleData.questions || currentArticleData.questions.length === 0) {
        return null;
    }

    const questions = currentArticleData.questions;
    let totalCorrect = 0;
    let unanswered = false;

    questions.forEach((item, qIndex) => {
        const selectedRadio = document.querySelector(`input[name="workspace-q-${qIndex}"]:checked`);
        const explainBox = document.getElementById(`workspace-explain-${qIndex}`);
        
        if (explainBox) explainBox.classList.remove("hidden");

        if (!selectedRadio) {
            unanswered = true;
        } else {
            const userAnswer = Number(selectedRadio.value);
            if (userAnswer === item.correct) {
                totalCorrect++;
                selectedRadio.parentElement.style.color = "#62C4DA";
                selectedRadio.parentElement.style.fontWeight = "bold";
            } else {
                selectedRadio.parentElement.style.color = "#C93638";
                selectedRadio.parentElement.style.fontWeight = "bold";
            }
        }
        
        const allRadios = document.querySelectorAll(`input[name="workspace-q-${qIndex}"]`);
        allRadios.forEach(r => r.disabled = true);
    });

    return { totalCorrect, totalQuestions: questions.length, unanswered };
}

document.getElementById("btn-submit-quiz").onclick = function() {
    if (!currentArticleData || !currentArticleData.questions || currentArticleData.questions.length === 0) {
        alert("Bài đọc này hiện chưa có bộ câu hỏi để nộp!");
        return;
    }

    if (confirm("Bạn có chắc chắn muốn nộp bài chấm điểm ngay bây giờ?")) {
        const res = executeQuizSubmission();
        if (!res) return;
        
        if (res.unanswered) {
            alert(`Bạn chưa hoàn thành hết tất cả các câu hỏi đâu nhé!\nKết quả của bạn: Đúng ${res.totalCorrect}/${res.totalQuestions} câu.`);
        } else {
            alert(`🎉 Kết quả bài làm: Bạn trả lời chính xác ${res.totalCorrect}/${res.totalQuestions} câu! Hãy đọc phần giải thích chi tiết ở cột bên phải nhé.`);
        }
    }
};

document.getElementById("btn-close-article").onclick = function() {
    if (countdownInterval) clearInterval(countdownInterval); 
    
    document.getElementById("reading-area").classList.add("hidden");
    document.getElementById("import-section").classList.remove("hidden");
    
    const sidebar = document.getElementById("quiz-sidebar-container");
    if (sidebar) sidebar.innerHTML = "";
};

// ==========================================================================
// POPUP AI TEMPLATE (Đã đồng bộ chuẩn xác với cấu hình của file reading.js)
// ==========================================================================
function triggerAiPopupViaTemplate() {
    const template = document.getElementById("ai-popup-template");
    if (!template) return;

    const clone = template.content.cloneNode(true);
    document.body.appendChild(clone);

    const popupElement = document.getElementById("ai-generator-popup");
    const btnCopy = document.getElementById("btn-popup-copy-prompt");
    const btnImport = document.getElementById("btn-popup-import-answer");
    const btnClose = document.getElementById("btn-popup-close");

    btnCopy.onclick = function() {
        const strictPrompt = `Dưới đây là một bài đọc IELTS:\n\n"""\n${currentArticleData.content}\n"""\n\nHãy đóng vai chuyên gia khảo thí IELTS. Nhiệm vụ của bạn là tạo ra chính xác 5 câu hỏi trắc nghiệm đọc hiểu dựa trên văn bản trên.\n\nBẮT BUỘC TRẢ VỀ DƯỚI ĐỊNH DẠNG CHUỖI JSON MẢNG (ARRAY OF OBJECTS), KHÔNG ĐƯỢC CHỨA BẤT KỲ VĂN BẢN GIẢI THÍCH NÀO KHÁC NGOÀI JSON.\n\nCấu trúc JSON chính xác như sau:\n[\n  {\n    "q": "Nội dung câu hỏi 1?",\n    "options": ["Đáp án A", "Đáp án B", "Đáp án C", "Đáp án D"],\n    "correct": 0,\n    "explain": "Giải thích chi tiết tại sao chọn đáp án này bằng tiếng Việt."\n  }\n]\n*(Chú ý: "correct" là index chỉ mục của đáp án đúng trong mảng options, ví dụ: 0 ứng với đáp án đầu tiên, 1 ứng với đáp án thứ 2...)*`;
        navigator.clipboard.writeText(strictPrompt).then(() => alert("Đã copy Prompt định dạng JSON chuẩn!"));
    };

    btnImport.onclick = function() {
        const aiJsonRaw = prompt("Hãy dán đoạn mã JSON từ AI vào đây:");
        if (!aiJsonRaw) return;

        try {
            const parsedQuestions = JSON.parse(aiJsonRaw.trim());
            if (!Array.isArray(parsedQuestions)) throw new Error("Dữ liệu phải là mảng.");

            // ĐỒNG BỘ CHUẨN: Gọi đúng tên CSDL "IELTS_Minimalist_DB" và phiên bản từ file reading.js
            const openReadingDb = indexedDB.open("IELTS_Minimalist_DB", 2); 
            
            openReadingDb.onsuccess = function(e) {
                const dbRead = e.target.result;
                try {
                    const transaction = dbRead.transaction(["reading_articles"], "readwrite");
                    const store = transaction.objectStore("reading_articles");
                    const getReq = store.get(currentArticleData.id);

                    getReq.onsuccess = function() {
                        const art = getReq.result;
                        art.questions = parsedQuestions;
                        store.put(art);
                        transaction.oncomplete = function() {
                            alert("🎉 Đồng bộ dữ liệu câu hỏi thành công!");
                            if(popupElement) popupElement.remove();
                            renderWorkspaceQuiz(parsedQuestions);
                            dbRead.close();
                            if (typeof loadLibrary === "function") loadLibrary();
                        };
                    };
                } catch(err) {
                    console.error("Lỗi lưu câu hỏi:", err);
                    dbRead.close();
                }
            };
        } catch (err) {
            alert("Lỗi! JSON không đúng định dạng. " + err.message);
        }
    };

    btnClose.onclick = function() { if(popupElement) popupElement.remove(); };
}
// Thêm vào cuối file reading-workspace.js hoặc khu vực gán sự kiện click của bạn

// ==========================================================================
// TÍNH NĂNG CẢI TIẾN: CHẾ ĐỘ TẬP TRUNG & NOTE TẠM THỜI (RAM ONLY)
// ==========================================================================

const layoutWrapper = document.getElementById("workspace-layout-wrapper");
const btnToggleReading = document.getElementById("btn-toggle-reading");
const btnToggleQuiz = document.getElementById("btn-toggle-quiz");

const scratchpadEl = document.getElementById("temporary-scratchpad");
const btnOpenScratchpad = document.getElementById("btn-open-scratchpad");
const btnCloseScratchpad = document.getElementById("btn-close-scratchpad");
const scratchpadTextarea = document.querySelector(".scratchpad-textarea");

// Biến lưu trữ RAM nội dung Note (Hủy hoàn toàn khi F5 hoặc chuyển trang)
let ramNoteContent = "";

// 1. Logic xử lý nút "Tập trung đọc"
btnToggleReading.onclick = function() {
    // Nếu đang bật tập trung đọc thì tắt đi, ngược lại thì bật lên và hủy chế độ kia
    if (layoutWrapper.classList.contains("focus-reading-mode")) {
        layoutWrapper.classList.remove("focus-reading-mode");
        btnToggleReading.classList.remove("btn-toggle-active");
    } else {
        layoutWrapper.classList.add("focus-reading-mode");
        layoutWrapper.classList.remove("focus-quiz-mode");
        
        btnToggleReading.classList.add("btn-toggle-active");
        btnToggleQuiz.classList.remove("btn-toggle-active");
    }
};

// 2. Logic xử lý nút "Tập trung trả lời"
btnToggleQuiz.onclick = function() {
    if (layoutWrapper.classList.contains("focus-quiz-mode")) {
        layoutWrapper.classList.remove("focus-quiz-mode");
        btnToggleQuiz.classList.remove("btn-toggle-active");
    } else {
        layoutWrapper.classList.add("focus-quiz-mode");
        layoutWrapper.classList.remove("focus-reading-mode");
        
        btnToggleQuiz.classList.add("btn-toggle-active");
        btnToggleReading.classList.remove("btn-toggle-active");
    }
};

// 3. Quản lý trạng thái Sổ tay ghi chú tạm thời
btnOpenScratchpad.onclick = function() {
    scratchpadEl.classList.remove("hidden");
    // Đồng bộ và giữ lại chuỗi text từ RAM đổ vào giao diện nhập liệu
    scratchpadTextarea.value = ramNoteContent;
    scratchpadTextarea.focus();
};

btnCloseScratchpad.onclick = function() {
    scratchpadEl.classList.add("hidden");
};

// Cập nhật liên tục dữ liệu vào biến RAM bất cứ khi nào người dùng gõ phím
scratchpadTextarea.oninput = function(e) {
    ramNoteContent = e.target.value;
};

// Đảm bảo khi người dùng quay về thư viện, các chế độ phóng to và Note sẽ được ẩn sạch sẽ
const originalCloseArticle = document.getElementById("btn-close-article").onclick;
document.getElementById("btn-close-article").onclick = function() {
    if (layoutWrapper) {
        layoutWrapper.classList.remove("focus-reading-mode", "focus-quiz-mode");
    }
    if (btnToggleReading) btnToggleReading.classList.remove("btn-toggle-active");
    if (btnToggleQuiz) btnToggleQuiz.classList.remove("btn-toggle-active");
    if (scratchpadEl) scratchpadEl.classList.add("hidden");
    
    // Gọi lại các logic dọn dẹp biến đếm thời gian cũ ban đầu của hệ thống
    if (typeof originalCloseArticle === "function") originalCloseArticle();
};