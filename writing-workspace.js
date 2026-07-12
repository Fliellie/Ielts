let ieltsTopics = { task1: [], task2: [] };

// --- 1. KHỞI TẠO CƠ SỞ DỮ LIỆU INDEXEDDB ---
const DB_NAME = "IeltsWritingDB";
const DB_VERSION = 1;

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        // Tạo cấu trúc database nếu chạy lần đầu
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains("custom_topics")) {
                // Tạo store lưu trữ đề tự chọn, dùng key tự động tăng kết hợp taskKey
                db.createObjectStore("custom_topics", { keyPath: "id" });
            }
        };

        request.onsuccess = (event) => resolve(event.target.result);
        request.onerror = (event) => reject(event.target.error);
    });
}

// Hàm lấy tất cả đề tự chọn từ IndexedDB
async function getAllCustomTopics() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction("custom_topics", "readonly");
        const store = transaction.objectStore("custom_topics");
        const request = store.getAll();

        request.onsuccess = () => {
            const allItems = request.result;
            const customData = { task1: [], task2: [] };
            
            // Phân loại data lấy từ DB ra đúng vị trí task
            allItems.forEach(item => {
                if (item.taskKey === "task1") customData.task1.push(item);
                if (item.taskKey === "task2") customData.task2.push(item);
            });
            resolve(customData);
        };
        request.onerror = () => reject(request.error);
    });
}

// Hàm thêm một đề tự chọn mới vào IndexedDB
async function saveCustomTopic(topic) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction("custom_topics", "readwrite");
        const store = transaction.objectStore("custom_topics");
        const request = store.add(topic);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

// --- 2. XỬ LÝ DOMLOADED ĐỂ RENDER GIAO DIỆN ---
document.addEventListener("DOMContentLoaded", async () => {
    const task1Container = document.getElementById("task1-grid-container");
    const task2Container = document.getElementById("task2-grid-container");

    if (!task1Container || !task2Container) {
        console.error("Không tìm thấy các phần tử container trên giao diện HTML.");
        return;
    }

    task1Container.innerHTML = "";
    task2Container.innerHTML = "";

    try {
        // Tải dữ liệu mặc định từ file json
        const response = await fetch('topics.json');
        const defaultTopics = await response.json();
        
        // Tải dữ liệu tùy chỉnh bền vững từ IndexedDB thay vì localStorage
        const customTopics = await getAllCustomTopics();
        
        // Hợp nhất dữ liệu
        ieltsTopics.task1 = [...(defaultTopics.task1 || []), ...(customTopics.task1 || [])];
        ieltsTopics.task2 = [...(defaultTopics.task2 || []), ...(customTopics.task2 || [])];
    } catch (error) {
        console.error("Lỗi khi tải hoặc cấu hình dữ liệu:", error);
        return;
    }

    // Hàm render từng ô số
    function renderTopicBox(topic, container, taskPrefix) {
        const numBox = document.createElement("div");
        numBox.className = "num-box";
        numBox.id = `num-topic-${topic.id}`;
        
        numBox.textContent = topic.isCustom ? `C${topic.id.split('-')[2]}` : topic.id;

        if (topic.isCustom) {
            numBox.classList.add("custom-topic-box");
        }

        numBox.addEventListener("click", () => {
            sessionStorage.setItem("activeWritingTopic", JSON.stringify(topic));
            
            const displayPrefix = topic.isCustom 
                ? `[Đề Tự Chọn ${taskPrefix} - ${numBox.textContent}]:` 
                : `[Đề Số ${topic.id}]:`;
                
            sessionStorage.setItem("activeWritingPrefix", displayPrefix);
            window.location.href = "writing-editor.html";
        });

        container.appendChild(numBox);
    }

    // Render các đề hiện tại
    ieltsTopics.task1.forEach(topic => renderTopicBox(topic, task1Container, "Task 1"));
    ieltsTopics.task2.forEach(topic => renderTopicBox(topic, task2Container, "Task 2"));

    // Tạo nút Thêm mới (+)
    createAddMoreButton(task1Container, "task1", "Task 1");
    createAddMoreButton(task2Container, "task2", "Task 2");

    // Hàm khởi tạo nút bấm thêm đề và lưu trực tiếp vào IndexedDB
    function createAddMoreButton(container, taskKey, taskLabel) {
        const addMoreBox = document.createElement("div");
        addMoreBox.className = "num-box btn-add-more";
        addMoreBox.textContent = "+";
        
        addMoreBox.addEventListener("click", async () => {
            const customPrompt = prompt(`Nhập nội dung đề bài tự chọn cho ${taskLabel}:`);
            if (!customPrompt || !customPrompt.trim()) return;

            // Đếm số lượng đề custom hiện tại của task này để tạo ID tự tăng
            const currentCustomCount = ieltsTopics[taskKey].filter(t => t.isCustom).length;
            const newCustomId = `c-${taskKey}-${currentCustomCount + 1}`;
            
            // Xây dựng object dữ liệu lưu vào IndexedDB
            const newTopic = { 
                id: newCustomId, 
                taskKey: taskKey, // Thuộc tính để lọc phân loại dữ liệu khi query DB
                prompt: customPrompt.trim(), 
                isCustom: true 
            };
            
            if (taskKey === "task1") {
                newTopic.image_url = ""; 
            }

            try {
                // Lưu vào IndexedDB một cách đồng bộ & an toàn
                await saveCustomTopic(newTopic);
                
                // Lưu nhanh vào session để trang editor sử dụng ngay lập tức
                sessionStorage.setItem("activeWritingTopic", JSON.stringify(newTopic));
                sessionStorage.setItem("activeWritingPrefix", `[Đề Tự Chọn ${taskLabel} - C${currentCustomCount + 1}]:`);
                
                window.location.href = "writing-editor.html";
            } catch (err) {
                console.error("Không thể lưu đề bài vào IndexedDB:", err);
                alert("Đã xảy ra lỗi khi lưu đề bài, vui lòng thử lại!");
            }
        });

        container.appendChild(addMoreBox);
    }
});