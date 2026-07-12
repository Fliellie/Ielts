// ==========================================
// CẤU HÌNH BIẾN TOÀN CỤC (GLOBAL SCOPE)
// ==========================================
let selectedTopic = null;
let timerInterval = null;
let totalSeconds = 40 * 60;
let isTimerRunning = false;

// Cấu hình IndexedDB toàn cục để mọi hàm đều gọi được
const DB_NAME = "IELTS_Minimalist_DB";
const STORE_NAME = "writing_images";
let db = null; 

// ==========================================
// CÁC HÀM XỬ LÝ INDEXEDDB TOÀN CỤC
// ==========================================

// Hàm lưu File ảnh vào IndexedDB
function saveImageToDB(file) {
    if (!db || !selectedTopic) return;
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    // Dùng id của đề (Ví dụ: T1-01, c-task1-1) để lưu riêng biệt
    store.put({ id: selectedTopic.id, fileData: file }); 
}

function deleteImageFromDB() {
    if (!db || !selectedTopic) return;
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    // Xóa chính xác ảnh của đề đang làm
    store.delete(selectedTopic.id);
}

// Hàm lấy ảnh lên và hiển thị lại khi reload trang
// Hàm helper hiển thị ảnh từ đường dẫn URL có sẵn (dùng cho topics.json)
function renderImageUrlPreview(url) {
    const imgPreview = document.getElementById("writing-image-preview");
    const imgPlaceholder = document.getElementById("image-upload-placeholder");
    const imgPreviewContainer = document.getElementById("image-preview-container");

    if (!imgPreview || !imgPlaceholder || !imgPreviewContainer) return;

    imgPreview.src = url;
    imgPlaceholder.classList.add("hidden");
    imgPreviewContainer.classList.remove("hidden");
}

// Cập nhật hàm loadSavedImage kiểm tra cả 2 nguồn ảnh
function loadSavedImage() {
    if (!selectedTopic) return;

    // 1. ƯU TIÊN: Nếu đề bài trong JSON có sẵn image_url và không trống
    if (selectedTopic.image_url && selectedTopic.image_url.trim() !== "") {
        renderImageUrlPreview(selectedTopic.image_url);
        return; // Đã tìm thấy ảnh mặc định của đề, dừng hàm không cần check DB nữa
    }

    // 2. DỰ PHÒNG: Nếu JSON không có ảnh, tìm ảnh do người dùng tự upload lưu trong IndexedDB
    if (!db) return; // Nếu DB chưa mở kết nối thành công thì dừng ở đây
    
    const transaction = db.transaction([STORE_NAME], "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(selectedTopic.id);

    request.onsuccess = (e) => {
        if (e.target.result) {
            const file = e.target.result.fileData;
            renderImagePreview(file); // Hàm hiển thị File object cũ của bạn
        }
    };
}

// Hàm render ảnh ra giao diện DOM
function renderImagePreview(file) {
    const imgPreview = document.getElementById("writing-image-preview");
    const imgPlaceholder = document.getElementById("image-upload-placeholder");
    const imgPreviewContainer = document.getElementById("image-preview-container");

    if (!imgPreview || !imgPlaceholder || !imgPreviewContainer) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        imgPreview.src = e.target.result;
        imgPlaceholder.classList.add("hidden");
        imgPreviewContainer.classList.remove("hidden");
    };
    reader.readAsDataURL(file);
}

// Khởi tạo kết nối IndexedDB ngay khi file script được tải
const dbRequest = indexedDB.open(DB_NAME, 1);
dbRequest.onupgradeneeded = (e) => {
    let database = e.target.result;
    if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "id" });
    }
};
dbRequest.onsuccess = (e) => {
    db = e.target.result;
    // Nếu DOM đã load xong thì khôi phục ảnh luôn, còn chưa thì để DOMContentLoaded xử lý
    if (document.readyState === "complete" || document.readyState === "interactive") {
        loadSavedImage();
    }
};


// ==========================================
// KHI GIAO DIỆN (DOM) ĐÃ SẴN SÀNG
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
    // Gọi lại lần nữa để phòng trường hợp DB mở xong trước khi DOM dựng xong
    if (db) { loadSavedImage(); }

    const imgInput = document.getElementById("writing-image-input");
    const imgPlaceholder = document.getElementById("image-upload-placeholder");
    const imgPreviewContainer = document.getElementById("image-preview-container");
    const imgPreview = document.getElementById("writing-image-preview");
    const removeImgBtn = document.getElementById("btn-remove-image");
    const textarea = document.getElementById("writing-main-input");
    const clockDisplay = document.getElementById("writing-clock");
    const toggleTimerBtn = document.getElementById("btn-toggle-timer");

    // Tải dữ liệu đề bài
    const rawTopic = sessionStorage.getItem("activeWritingTopic");
    const prefix = sessionStorage.getItem("activeWritingPrefix") || "Đề bài:";
    // Khai báo các biến liên quan tới Focus Mode
    const btnFocusMode = document.getElementById("btn-focus-mode");
    const bodyLayout = document.querySelector(".writing-body-layout");

    // Xử lý bật/tắt chế độ Focus Mode
    if (btnFocusMode && bodyLayout) {
        btnFocusMode.addEventListener("click", () => {
            const isFocus = bodyLayout.classList.toggle("focus-active");
            btnFocusMode.classList.toggle("active");
            
            if (isFocus) {
                btnFocusMode.textContent = "📺 Show Image Split";
            } else {
                btnFocusMode.textContent = "🔍 Focus On Writing";
            }
        });
    }
    
    if (!rawTopic) {
        alert("Không tìm thấy dữ liệu đề bài! Đang quay lại trang danh sách.");
        window.location.href = "writing.html";
        return;
    }
    
    selectedTopic = JSON.parse(rawTopic);
    document.getElementById("active-topic-title").innerHTML = `<strong>${prefix}</strong> ${selectedTopic.prompt}`;

    // Xử lý file ảnh đầu vào
    function processImage(file) {
        if (!file || !file.type.startsWith("image/")) return;

        if (file.size > 5 * 1024 * 1024) {
            alert("Kích thước ảnh quá lớn! Vui lòng chọn ảnh dưới 5MB.");
            return;
        }

        renderImagePreview(file);
        saveImageToDB(file); 
    }

    // Sự kiện Thay đổi input file
    imgInput.addEventListener("change", (e) => {
        if (e.target.files.length > 0) processImage(e.target.files[0]);
    });

    // Sự kiện Dán ảnh (Ctrl + V)
    document.addEventListener("paste", (e) => {
        const items = (e.clipboardData || window.clipboardData).items;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf("image") !== -1) {
                const file = items[i].getAsFile();
                
                const dataTransfer = new DataTransfer();
                dataTransfer.items.add(file);
                imgInput.files = dataTransfer.files; 

                processImage(file);
                break;
            }
        }
    });

    // Sự kiện nút Xóa ảnh
    removeImgBtn.addEventListener("click", () => {
        imgPreview.src = ""; 
        imgInput.value = "";
        imgPreviewContainer.classList.add("hidden");
        imgPlaceholder.classList.remove("hidden");
        deleteImageFromDB(); 
    });

    // Đếm giờ làm bài
    function updateClockDisplay() {
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        clockDisplay.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    toggleTimerBtn.addEventListener("click", () => {
        if (isTimerRunning) {
            clearInterval(timerInterval);
            isTimerRunning = false;
            toggleTimerBtn.textContent = "Tiếp tục";
            toggleTimerBtn.style.backgroundColor = "#62C4DA";
        } else {
            isTimerRunning = true;
            toggleTimerBtn.textContent = "Tạm dừng";
            toggleTimerBtn.style.backgroundColor = "#FA855A";
            timerInterval = setInterval(() => {
                if (totalSeconds <= 0) {
                    clearInterval(timerInterval);
                    alert("⏰ Đã hết thời gian làm bài luận 40 phút!");
                    return;
                }
                totalSeconds--;
                updateClockDisplay();
            }, 1000);
        }
    });

    toggleTimerBtn.click(); // Auto chạy đồng hồ khi vào trang

    // Đếm số từ realtime
    textarea.addEventListener("input", () => {
        const text = textarea.value.trim();
        document.getElementById("writing-word-count").textContent = text === "" ? 0 : text.split(/\s+/).length;
    });

    // Copy Prompt chấm điểm AI
    document.getElementById("btn-export-ai-prompt").addEventListener("click", () => {
        const userEssay = textarea.value.trim();
        if (!userEssay) { 
            alert("Hãy gõ nội dung bài viết luận trước khi xuất bản!"); 
            return; 
        }
        clearInterval(timerInterval);

        const fullPrompt = `Hãy đóng vai là một giám khảo chấm thi IELTS chuyên nghiệp giàu kinh nghiệm. Hãy đánh giá bài luận (IELTS Writing Task 2) sau đây của tôi dựa theo 4 tiêu chí cốt lõi: Task Achievement, Coherence & Cohesion, Lexical Resource, và Grammatical Range & Accuracy.

ĐỀ BÀI (TOPIC):
"""
${selectedTopic.prompt}
"""

BÀI LÀM CỦA TÔI:
"""
${userEssay}
"""

YÊU CẦU ĐÁNH GIÁ:
1. Dự đoán Band điểm tổng thể và Band điểm chi tiết cho từng tiêu chí.
2. Sửa lỗi ngữ pháp, chính tả, hoặc cách dùng từ chưa tự nhiên trực tiếp trong bài luận (chỉ rõ chỗ sai và phương án thay thế).
3. Đề xuất một số từ vựng ăn điểm (Collocations, Idioms) nâng cao liên quan trực tiếp đến chủ đề này để nâng band.`;

        navigator.clipboard.writeText(fullPrompt).then(() => {
            alert("🎉 Đã copy Bài làm + Prompt chấm AI thành công! Hãy dán vào mô hình AI của bạn để chấm.");
        });
    });

    // Hủy bài làm
    document.getElementById("btn-cancel-writing").addEventListener("click", () => {
        if (confirm("Hủy bài luận hiện tại? Toàn bộ chữ bạn vừa gõ sẽ bị xóa sạch.")) {
            clearInterval(timerInterval);
            sessionStorage.removeItem("activeWritingTopic");
            deleteImageFromDB(); // Hoạt động hoàn hảo vì hàm đã ra scope global
            window.location.href = "writing.html";
        }
    });
});