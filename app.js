document.addEventListener("DOMContentLoaded", () => {
    // Chỉ tìm danh sách các nút một lần duy nhất
    const modeButtons = document.querySelectorAll(".mode-btn");

    modeButtons.forEach(button => {
        button.addEventListener("click", () => {
            const tabName = button.getAttribute("data-tab");

            // Gom tất cả logic chuyển hướng vào một cấu trúc điều hướng gọn gàng
            if (tabName === "reading") {
                window.location.href = "reading.html";
            } else if (tabName === "writing") {
                window.location.href = "writing.html";
            }
            
            // Nếu sau này bạn làm thêm trang vocab hoặc grammar, chỉ cần thêm ở đây:
            else if (tabName === "vocab") {
                window.location.href = "vocab/vocab.html";
            }
        });
    });
});