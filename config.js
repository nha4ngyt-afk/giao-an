/*
 * CẤU HÌNH TRANG WEB — chỉ cần sửa file này.
 * Xem hướng dẫn từng bước trong file HUONG-DAN-CAI-DAT.md
 *
 * Khi GOOGLE_CLIENT_ID còn để trống, trang chạy ở "chế độ dùng thử":
 * tệp chỉ lưu trong trình duyệt đang mở, chưa lên Google Drive.
 */
window.APP_CONFIG = {
  // Mã OAuth Client ID (dạng 1234567890-abcxyz.apps.googleusercontent.com)
  GOOGLE_CLIENT_ID: "781363596999-jqneusfrosk1ri5gqjf7rhva35d2udva.apps.googleusercontent.com",

  // API key (dạng AIzaSy...) — dùng để người xem đọc danh sách tệp mà không cần đăng nhập
  GOOGLE_API_KEY: "AIzaSyAQmL2ghSZol-JLlYqGvluZrZxib8m7lKU",

  // Mã thư mục Google Drive chứa dữ liệu.
  // Để trống ở lần đầu; sau khi bạn đăng nhập lần đầu, trang web sẽ hiện mã để bạn dán vào đây.
  DRIVE_FOLDER_ID: "1f1sN-2zhXAuwtSxg57ABw5U2-LKrxo9H",

  // Tên thư mục sẽ được tạo trong Google Drive của bạn
  DRIVE_FOLDER_NAME: "Quản lý giáo án - Dữ liệu web",

  // Chữ hiển thị trên thanh tiêu đề
  APP_TITLE: "PHẦN MỀM QUẢN LÝ GIÁO ÁN / BÀI GIẢNG DẠNG SỐ",
  APP_VERSION: "v1.0 — Bản web",
};
