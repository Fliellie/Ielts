// ==========================================================================
// CONFIG CƠ SỞ DỮ LIỆU INDEXEDDB
// ==========================================================================
const DB_NAME = "IELTS_Minimalist_DB";
const DB_VERSION = 2;
const STORE_NAME = "reading_articles";
let db;

function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = (e) => reject(e);
        request.onsuccess = (e) => { db = e.target.result; resolve(db); };
        request.onupgradeneeded = (e) => {
            let database = e.target.result;
            if (!database.objectStoreNames.contains(STORE_NAME)) {
                database.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
            }
        };
    });
}

// Thêm bài đọc vào IndexedDB
function saveArticle(title, content) {
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const article = { title, content, questions: [], createdAt: new Date().getTime() };
    
    store.add(article);
    transaction.oncomplete = () => {
        loadLibrary();
        document.getElementById("direct-text-input").value = "";
    };
}

// Lấy toàn bộ danh sách bài đọc hiển thị ra Thư Viện ngoài
function loadLibrary() {
    const transaction = db.transaction([STORE_NAME], "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
        const articles = request.result;
        const injector = document.getElementById("library-injector");
        document.getElementById("lib-count").textContent = articles.length;
        injector.innerHTML = "";

        if (articles.length === 0) {
            injector.innerHTML = `<p class="empty-state">Thư viện trống. Hãy tải file hoặc dán văn bản phía trên để học!</p>`;
            return;
        }

        articles.forEach(art => {
            const hasQuiz = art.questions && art.questions.length > 0;
            const card = document.createElement("div");
            card.className = "library-card";
            card.innerHTML = `
                <h4>📄 ${art.title}</h4>
                <p>${art.content.substring(0, 100)}...</p>
                <div style="margin-top: 5px; font-size: 12px; color: ${hasQuiz ? '#62C4DA' : '#FA855A'}">
                    ${hasQuiz ? '✅ Đã có bộ câu hỏi' : '⚠️ Chưa có câu hỏi'}
                </div>
                <div class="card-actions" style="margin-top: 10px;">
                    <button class="btn btn-primary btn-sm btn-open" data-id="${art.id}">Mở học</button>
                    <button class="btn btn-danger btn-sm btn-delete" data-id="${art.id}">Xóa</button>
                </div>
            `;
            injector.appendChild(card);
        });

        // Đăng ký sự kiện nút bấm ngoài Thư viện
        document.querySelectorAll(".btn-open").forEach(b => b.addEventListener("click", (e) => openArticle(e.target.dataset.id)));
        document.querySelectorAll(".btn-delete").forEach(b => b.addEventListener("click", (e) => deleteArticle(e.target.dataset.id)));
    };
}

function deleteArticle(id) {
    if (confirm("Bạn có chắc muốn xóa bài đọc này khỏi thư viện máy?")) {
        const transaction = db.transaction([STORE_NAME], "readwrite");
        const store = transaction.objectStore(STORE_NAME);
        store.delete(Number(id));
        transaction.oncomplete = () => loadLibrary();
    }
}

// ==========================================================================
// LOGIC XỬ LÝ NHẬP FILE & ĐẶT TÊN THEO 3 TỪ ĐẦU BÀI
// ==========================================================================
function processAndSaveRawText(rawText) {
    const cleanText = rawText.trim();
    if (!cleanText) return;

    // Đặt tên bài đọc tự động theo 3 từ đầu
    const words = cleanText.split(/\s+/);
    const title = words.slice(0, 3).join(" ") + (words.length > 3 ? "..." : "");

    saveArticle(title, cleanText);
}

function extractPDFText(file) {
    const fileReader = new FileReader();
    fileReader.onload = function() {
        const typedarray = new Uint8Array(this.result);
        pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js";
        
        pdfjsLib.getDocument(typedarray).promise.then(pdf => {
            let maxPages = pdf.numPages;
            let countPromises = [];
            for (let j = 1; j <= maxPages; j++) {
                let page = pdf.getPage(j);
                countPromises.push(page.then(page => {
                    return page.getTextContent().then(textContent => {
                        return textContent.items.map(item => item.str).join(" ");
                    });
                }));
            }
            return Promise.all(countPromises);
        }).then(pageTexts => {
            processAndSaveRawText(pageTexts.join("\n\n"));
        }).catch(err => alert("Lỗi xử lý file PDF: " + err.message));
    };
    fileReader.readAsArrayBuffer(file);
}

// ==========================================================================
// ĐIỀU HƯỚNG VÀO TRANG LUYỆN ĐỌC (Hàm mở bài gọn nhẹ)
// ==========================================================================
let currentArticleId = null;

function openArticle(id) {
    currentArticleId = Number(id);
    const transaction = db.transaction([STORE_NAME], "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(currentArticleId);

    request.onsuccess = () => {
        const art = request.result;
        
        // Chỉ xử lý bật/hiển thị khung sườn UI của bài đọc
        document.getElementById("active-article-title").textContent = art.title;
        document.getElementById("text-render-area").textContent = art.content;
        
        document.getElementById("import-section").classList.add("hidden");
        document.getElementById("reading-area").classList.remove("hidden");

        // Gọi hàm kích hoạt không gian luyện đọc (Sẽ viết ở file/phần tiếp theo)
        if (typeof initReadingWorkspace === "function") {
            initReadingWorkspace(art);
        }
    };
}

// ==========================================================================
// KHỞI TẠO EVENT LISTENERS BAN ĐẦU
// ==========================================================================
document.addEventListener("DOMContentLoaded", () => {
    initDB().then(() => loadLibrary());

    const dropZone = document.getElementById("drop-zone");
    const fileUploader = document.getElementById("file-uploader");
    const btnSubmitText = document.getElementById("btn-submit-text");
    const btnCloseArticle = document.getElementById("btn-close-article");

    // Kéo thả file ngoại vi
    dropZone.addEventListener("dragover", (e) => { e.preventDefault(); dropZone.style.backgroundColor = "#F0FCFF"; });
    dropZone.addEventListener("dragleave", () => dropZone.style.backgroundColor = "white");
    dropZone.addEventListener("drop", (e) => {
        e.preventDefault();
        dropZone.style.backgroundColor = "white";
        if (e.dataTransfer.files.length > 0) handleUploadedFile(e.dataTransfer.files[0]);
    });

    fileUploader.addEventListener("change", (e) => {
        if (e.target.files.length > 0) handleUploadedFile(e.target.files[0]);
    });

    function handleUploadedFile(file) {
        if (file.type === "text/plain") {
            const reader = new FileReader();
            reader.onload = (e) => processAndSaveRawText(e.target.result);
            reader.readAsText(file);
        } else if (file.type === "application/pdf") {
            extractPDFText(file);
        } else {
            alert("Vui lòng tải tệp định dạng .txt hoặc .pdf!");
        }
    }

    // Nạp bằng cách dán Text trực tiếp
    btnSubmitText.addEventListener("click", () => {
        const inputData = document.getElementById("direct-text-input").value;
        if (!inputData.trim()) return alert("Vui lòng nhập nội dung bài đọc trước!");
        processAndSaveRawText(inputData);
    });

    // Đóng bài đọc, quay ra lại màn hình Thư viện
    btnCloseArticle.addEventListener("click", () => {
        document.getElementById("reading-area").classList.add("hidden");
        document.getElementById("import-section").classList.remove("hidden");
    });
});