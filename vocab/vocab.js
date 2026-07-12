document.addEventListener('DOMContentLoaded', () => {
    // 1. LẤY CÁC PHẦN TỬ GIAO DIỆN
    const reviewBtn = document.getElementById('reviewBtn');
    const importBtn = document.getElementById('importBtn');
    const backButton = document.getElementById('backBtn');

    // 2. LOGIC NÚT "ÔN TẬP NGAY"
    if (reviewBtn) {
        reviewBtn.addEventListener('click', () => {
            // Chuyển hướng sang trang phòng ôn tập từ mới (Ngang hàng ngoài gốc)
            window.location.href = 'vocab-room.html';
        });
    }

    // 3. LOGIC NÚT "THÊM TỪ MỚI"
    if (importBtn) {
        importBtn.addEventListener('click', () => {
            // Chuyển hướng sang trang nhập liệu (Ngang hàng ngoài gốc)
            window.location.href = 'import.html';
        });
    }

    // 4. LOGIC NÚT "QUAY LẠI" (Đã sửa đường dẫn phẳng chuẩn GitHub Pages)
    if (backButton) {
        backButton.addEventListener('click', function() {
            // Vì file đã ra ngoài thư mục gốc, gọi trực tiếp không cần dùng "../"
            window.location.href = '../index.html';
        });
    }
});