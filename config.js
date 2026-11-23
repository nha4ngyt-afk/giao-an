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

  // Mã thư mục Google Drive chứa dữ liệu.
  // Để trống ở lần đầu; sau khi bạn đăng nhập lần đầu, trang web sẽ hiện mã để bạn dán vào đây.
  DRIVE_FOLDER_ID: "1f1sN-2zhXAuwtSxg57ABw5U2-LKrxo9H",

  // Địa chỉ bộ kiểm tra quyền (Google Apps Script, dạng https://script.google.com/macros/s/.../exec).
  // Trang riêng tư: người xem đăng nhập Google, bộ này kiểm tra họ có được cấp quyền không rồi mới trả danh sách tệp.
  ACCESS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbxPuMPkAPe5mAGeHVOejornsqqQ8QY0qNJeRPf6y6iMi2vQfHfUK53zofjKo2XHWV0/exec",

  // Tên thư mục sẽ được tạo trong Google Drive của bạn
  DRIVE_FOLDER_NAME: "Quản lý giáo án - Dữ liệu web",

  // Chữ hiển thị trên thanh tiêu đề
  APP_TITLE: "PHẦN MỀM QUẢN LÝ GIÁO ÁN / BÀI GIẢNG DẠNG SỐ",
  APP_VERSION: "v1.0 — Bản web",
};
