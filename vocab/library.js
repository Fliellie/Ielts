// Cấu hình kết nối cơ sở dữ liệu IndexedDB đồng bộ với hệ thống
const DB_NAME = 'VocabDB';
const DB_VERSION = 2;
const STORE_NAME = 'words';

let db;
let allWords = []; // Lưu trữ tất cả từ vựng tải từ cơ sở dữ liệu

// 1. Khởi tạo và kết nối IndexedDB
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

// 2. Lấy toàn bộ danh sách từ vựng từ Database
function loadAllWords() {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => {
            allWords = request.result;
            resolve();
        };

        request.onerror = () => reject(request.error);
    });
}

// 3. Hiển thị dữ liệu lên bảng thư viện
function renderLibrary() {
    const listBody = document.getElementById('libraryListBody');
    listBody.innerHTML = '';

    if (allWords.length === 0) {
        listBody.innerHTML = `
            <tr>
                <td colspan="5" class="empty-notify">Thư viện trống trơn! Hãy thêm vài từ mới trước nhé.</td>
            </tr>
        `;
        return;
    }

    allWords.forEach((word, index) => {
        const row = document.createElement('tr');
        
        // Định dạng lại ngày hiển thị cho dễ nhìn (DD/MM/YYYY)
        let formattedDate = 'Chưa rõ';
        if (word.nextReviewDate) {
            const parts = word.nextReviewDate.split('-');
            if (parts.length === 3) {
                formattedDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
            } else {
                formattedDate = word.nextReviewDate;
            }
        }

        row.innerHTML = `
            <td>${index + 1}</td>
            <td><strong>${word.english}</strong></td>
            <td>${word.vietnamese}</td>
            <td>${formattedDate}</td>
            <td>
                <input type="checkbox" class="select-vocab-cb" data-id="${word.id}">
            </td>
        `;

        listBody.appendChild(row);
    });
}

// 4. Xóa các từ vựng đã được tích chọn khỏi IndexedDB
async function deleteSelectedWords() {
    const checkboxes = document.querySelectorAll('.select-vocab-cb:checked');
    const idsToDelete = Array.from(checkboxes).map(cb => Number(cb.getAttribute('data-id')));

    if (idsToDelete.length === 0) {
        alert("Bạn chưa chọn từ nào để xóa cả!");
        return;
    }

    const confirmDelete = confirm(`Bạn có chắc muốn xóa vĩnh viễn ${idsToDelete.length} từ đã chọn khỏi dữ liệu?`);
    if (!confirmDelete) return;

    try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);

        // Chạy vòng lặp để xóa từng id một
        for (const id of idsToDelete) {
            await new Promise((resolve, reject) => {
                const request = store.delete(id);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        }

        // Đợi transaction hoàn tất
        tx.oncomplete = async () => {
            alert("Đã xóa các từ được chọn thành công!");
            await loadAllWords(); // Tải lại danh sách mới
            renderLibrary(); // Render lại giao diện
        };

    } catch (error) {
        console.error("Lỗi khi thực hiện xóa từ vựng:", error);
        alert("Đã xảy ra lỗi trong quá trình xóa dữ liệu!");
    }
}

// --- LẮNG NGHE SỰ KIỆN GIAO DIỆN ---

// Nút quay lại trang vocab.html
document.getElementById('backBtn').addEventListener('click', () => {
    window.location.href = 'vocab.html';
});

// Nút thùng rác dùng để thực thi xóa các mục đã tích chọn
document.getElementById('deleteSelectedBtn').addEventListener('click', () => {
    deleteSelectedWords();
});

// Tự động khởi chạy khi tải trang xong
window.addEventListener('DOMContentLoaded', async () => {
    try {
        await initDB();
        await loadAllWords();
        renderLibrary();
    } catch (error) {
        console.error("Lỗi khởi tạo thư viện:", error);
        const listBody = document.getElementById('libraryListBody');
        listBody.innerHTML = `<tr><td colspan="5" class="empty-notify" style="color: red;">Không thể tải dữ liệu từ cơ sở dữ liệu!</td></tr>`;
    }
});