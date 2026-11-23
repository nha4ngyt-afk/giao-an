(() => {
'use strict';

/* =====================================================================
 * CẤU HÌNH
 * ===================================================================== */
const CFG = Object.assign({
  GOOGLE_CLIENT_ID: '',
  GOOGLE_API_KEY: '',
  DRIVE_FOLDER_ID: '',
  DRIVE_FOLDER_NAME: 'Quản lý giáo án - Dữ liệu web',
  APP_TITLE: 'PHẦN MỀM QUẢN LÝ GIÁO ÁN / BÀI GIẢNG DẠNG SỐ',
  APP_VERSION: '',
}, window.APP_CONFIG || {});
for (const k of ['GOOGLE_CLIENT_ID', 'GOOGLE_API_KEY', 'DRIVE_FOLDER_ID']) {
  CFG[k] = String(CFG[k] || '').trim();
}
// Cho phép dán cả đường dẫn thư mục Drive thay vì chỉ mã
const folderInUrl = /folders\/([\w-]+)/.exec(CFG.DRIVE_FOLDER_ID);
if (folderInUrl) CFG.DRIVE_FOLDER_ID = folderInUrl[1];

// Chưa có Client ID => chế độ dùng thử (lưu trong trình duyệt)
const DEMO = !CFG.GOOGLE_CLIENT_ID;

const TABS = [
  { id: 'tailieu', label: 'Tài liệu', upload: 'Tải lên tài liệu', accept: '' },
  { id: 'baigiang', label: 'Bài giảng', upload: 'Tải lên bài giảng', accept: '' },
  { id: 'presentation', label: 'Presentation', upload: 'Tải lên presentation', accept: '.ppt,.pptx,.pps,.ppsx,.odp,.key,.pdf' },
  { id: 'video', label: 'Video tham khảo', upload: 'Tải lên video', accept: 'video/*' },
  { id: 'huongdan', label: 'Hướng dẫn - Liên hệ', isGuide: true },
];
const LIST_TAB_IDS = TABS.filter(t => !t.isGuide).map(t => t.id);

const DEFAULT_INFO = {
  owner: 'Nguyễn Văn A',
  participants: [],
  guide: [
    'Trang web lưu trữ giáo án, bài giảng, bài trình chiếu và video tham khảo của đề tài.',
    '',
    '• Chọn một tab (Tài liệu, Bài giảng, Presentation, Video tham khảo) để xem danh sách tệp.',
    '• Bấm vào một dòng để chọn, rồi bấm "Xem / Mở" (hoặc bấm đúp vào dòng) để xem tệp ngay trên trang.',
    '• Trong cửa sổ xem, dùng "Mở tab mới" hoặc "Tải về" khi cần.',
    '',
    'Dành cho người quản lý: bấm "Đăng nhập" ở góc trên bên phải bằng tài khoản Google để tải lên, ghi chú, xóa tệp và chỉnh sửa thông tin đề tài.',
  ].join('\n'),
  contact: '(Chưa có thông tin liên hệ)',
};

const state = {
  tab: TABS[0].id,
  items: [],
  info: { ...DEFAULT_INFO },
  selected: null,
  admin: false,
  loading: true,
  error: '',
  unconfigured: false,
};

/* =====================================================================
 * TIỆN ÍCH
 * ===================================================================== */
const $ = id => document.getElementById(id);

function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else n.setAttribute(k, v === true ? '' : v);
  }
  n.append(...kids.filter(k => k != null));
  return n;
}

class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function abortError() { return new DOMException('Đã hủy', 'AbortError'); }

function fmtSize(n) {
  if (!n) return '';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  const num = i === 0 ? String(n) : n.toLocaleString('vi-VN', { maximumFractionDigits: n < 10 ? 1 : 0 });
  return num + ' ' + units[i];
}

function fmtDate(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

const GOOGLE_TYPES = {
  'application/vnd.google-apps.document': 'G-DOC',
  'application/vnd.google-apps.spreadsheet': 'G-SHEET',
  'application/vnd.google-apps.presentation': 'G-SLIDE',
};
function fileType(item) {
  const m = /\.([A-Za-z0-9]{1,8})$/.exec(item.name || '');
  if (m) return m[1].toUpperCase();
  if (GOOGLE_TYPES[item.mime]) return GOOGLE_TYPES[item.mime];
  const sub = ((item.mime || '').split('/')[1] || '').toUpperCase();
  return sub && sub.length <= 8 ? sub : '—';
}

function normalizeInfo(raw) {
  const info = { ...DEFAULT_INFO };
  if (raw && typeof raw === 'object') {
    for (const k of ['owner', 'guide', 'contact']) {
      if (typeof raw[k] === 'string') info[k] = raw[k];
    }
    if (Array.isArray(raw.participants)) {
      info.participants = raw.participants.map(p => String(p).trim()).filter(Boolean);
    }
  }
  return info;
}

/** Biến văn bản thuần thành các nút DOM, tự tạo đường dẫn cho địa chỉ web và email. */
function linkify(text) {
  const frag = document.createDocumentFragment();
  const re = /(https?:\/\/[^\s<>"']+)|([\w.+-]+@[\w-]+(?:\.[\w-]+)+)/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    let hit = m[0];
    const trail = /[.,;:!?)\]]+$/.exec(hit);
    if (trail) hit = hit.slice(0, -trail[0].length);
    frag.append(text.slice(last, m.index));
    const a = el('a', { text: hit });
    if (m[1]) { a.href = hit; a.target = '_blank'; a.rel = 'noopener noreferrer'; }
    else a.href = 'mailto:' + hit;
    frag.append(a);
    last = m.index + hit.length;
    re.lastIndex = last;
  }
  frag.append(text.slice(last));
  return frag;
}

function toast(msg, isError = false) {
  const t = el('div', { class: 'toast' + (isError ? ' is-err' : ''), text: msg, role: isError ? 'alert' : null });
  $('toasts').append(t);
  setTimeout(() => t.remove(), isError ? 7000 : 3500);
}

function explain(e) {
  if (e instanceof ApiError) {
    if (e.status === 401) return 'Phiên đăng nhập đã hết hạn. Hãy bấm Đăng nhập lại.';
    if (e.status === 404) return 'Không tìm thấy dữ liệu trên Google Drive (đã bị xóa hoặc chưa được chia sẻ).';
    return 'Google từ chối yêu cầu: ' + e.message;
  }
  if (e instanceof TypeError) return 'Không kết nối được tới máy chủ Google. Kiểm tra mạng rồi thử lại.';
  return (e && e.message) || String(e);
}

const safeStore = (area) => ({
  get(k) { try { return window[area].getItem(k); } catch { return null; } },
  set(k, v) { try { window[area].setItem(k, v); } catch { /* bỏ qua */ } },
  del(k) { try { window[area].removeItem(k); } catch { /* bỏ qua */ } },
});
const local = safeStore('localStorage');
const session = safeStore('sessionStorage');

/* =====================================================================
 * KHO LƯU TRỮ 1: DÙNG THỬ (IndexedDB trong trình duyệt)
 * ===================================================================== */
const demoStore = (() => {
  const INFO_KEY = 'giaoan.demo.info';

  function open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('giaoan-demo', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('files', { keyPath: 'id' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function tx(mode, fn) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction('files', mode);
      const req = fn(t.objectStore('files'));
      t.oncomplete = () => { db.close(); resolve(req ? req.result : undefined); };
      t.onerror = t.onabort = () => { db.close(); reject(t.error || new Error('Không ghi được dữ liệu vào trình duyệt.')); };
    });
  }
  const strip = ({ blob, ...item }) => item;

  return {
    async restore() { return true; },   // dùng thử: luôn có quyền quản lý
    async load() {
      const rows = await tx('readonly', s => s.getAll());
      let info = null;
      try { info = JSON.parse(local.get(INFO_KEY)); } catch { /* chưa có */ }
      return { items: rows.map(strip), info };
    },
    async saveInfo(info) { local.set(INFO_KEY, JSON.stringify(info)); },
    async upload(file, { category, note }, onProgress, signal) {
      if (signal && signal.aborted) throw abortError();
      const id = (crypto.randomUUID && crypto.randomUUID()) || `f${Date.now()}${Math.random().toString(36).slice(2)}`;
      const row = {
        id, name: file.name, mime: file.type || '', size: file.size,
        created: new Date().toISOString(), note, category, blob: file,
      };
      await tx('readwrite', s => s.put(row));
      onProgress(1);
      return strip(row);
    },
    async updateNote(id, note) {
      const row = await tx('readonly', s => s.get(id));
      if (!row) throw new Error('Không tìm thấy tệp.');
      row.note = note;
      await tx('readwrite', s => s.put(row));
    },
    async remove(id) { await tx('readwrite', s => s.delete(id)); },
    async preview(item) {
      const row = await tx('readonly', s => s.get(item.id));
      if (!row) throw new Error('Không tìm thấy tệp.');
      const url = URL.createObjectURL(row.blob);
      const mime = item.mime || '';
      let kind = 'none';
      if (mime.startsWith('image/')) kind = 'image';
      else if (mime.startsWith('video/')) kind = 'video';
      else if (mime.startsWith('audio/')) kind = 'audio';
      else if (mime === 'application/pdf' || mime === 'text/plain') kind = 'iframe';
      return {
        kind, src: url, download: url, downloadName: item.name,
        open: kind === 'none' ? null : url,
        message: 'Chế độ dùng thử không xem trước được định dạng này. Hãy bấm "Tải về" để mở bằng phần mềm trên máy.',
        revoke: () => URL.revokeObjectURL(url),
      };
    },
    removeHint: 'Tệp sẽ bị xóa khỏi trình duyệt này.',
    removedMsg: 'Đã xóa tệp.',
  };
})();

/* =====================================================================
 * KHO LƯU TRỮ 2: GOOGLE DRIVE
 *  - Người xem: đọc thư mục công khai bằng API key (không cần đăng nhập)
 *  - Người quản lý: đăng nhập Google (quyền drive.file) để ghi
 * ===================================================================== */
const driveStore = (() => {
  const API = 'https://www.googleapis.com/drive/v3';
  const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
  const SCOPE = 'https://www.googleapis.com/auth/drive.file';
  const FOLDER_MIME = 'application/vnd.google-apps.folder';
  const META_NAME = '_thong-tin-de-tai.json';
  const FIELDS = 'id,name,mimeType,size,createdTime,description,properties';
  const LS_FOLDER = 'giaoan.folderId';
  const SS_TOKEN = 'giaoan.token';

  const drive = {
    token: null,
    tokenExp: 0,
    folderId: CFG.DRIVE_FOLDER_ID || local.get(LS_FOLDER) || '',
    metaId: null,
    keyError: null,
  };

  /* ---------- Đăng nhập (Google Identity Services) ---------- */
  let gisPromise = null;
  function loadGis() {
    if (!gisPromise) {
      gisPromise = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://accounts.google.com/gsi/client';
        s.async = true;
        s.onload = () => resolve();
        s.onerror = () => {
          gisPromise = null;
          reject(new Error('Không tải được thư viện đăng nhập của Google. Kiểm tra kết nối mạng.'));
        };
        document.head.append(s);
      });
    }
    return gisPromise;
  }

  async function requestToken() {
    await loadGis();
    return new Promise((resolve, reject) => {
      const client = google.accounts.oauth2.initTokenClient({
        client_id: CFG.GOOGLE_CLIENT_ID,
        scope: SCOPE,
        callback: (r) => {
          if (r.error) {
            reject(new Error(r.error === 'access_denied'
              ? 'Bạn chưa cấp quyền truy cập Google Drive.'
              : 'Đăng nhập không thành công: ' + (r.error_description || r.error)));
            return;
          }
          if (!google.accounts.oauth2.hasGrantedAllScopes(r, SCOPE)) {
            reject(new Error('Bạn cần đánh dấu cho phép quyền Google Drive khi đăng nhập.'));
            return;
          }
          drive.token = r.access_token;
          drive.tokenExp = Date.now() + (Number(r.expires_in || 3600) - 60) * 1000;
          session.set(SS_TOKEN, JSON.stringify({ t: drive.token, e: drive.tokenExp }));
          resolve(drive.token);
        },
        error_callback: (e) => {
          const type = e && e.type;
          reject(new Error(
            type === 'popup_failed_to_open' ? 'Trình duyệt đã chặn cửa sổ đăng nhập. Hãy cho phép cửa sổ bật lên (pop-up) cho trang này.'
            : type === 'popup_closed' ? 'Bạn đã đóng cửa sổ đăng nhập.'
            : 'Đăng nhập không thành công.'));
        },
      });
      client.requestAccessToken({ prompt: '' });
    });
  }

  function validToken() {
    return drive.token && Date.now() < drive.tokenExp ? drive.token : null;
  }
  async function ensureToken() { return validToken() || requestToken(); }
  function dropToken() {
    drive.token = null;
    drive.tokenExp = 0;
    session.del(SS_TOKEN);
  }

  /* ---------- Gọi Drive API ---------- */
  async function call(path, { method = 'GET', params = {}, body, contentType, auth = 'token', raw = false } = {}) {
    const url = new URL(path.startsWith('http') ? path : API + path);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const headers = {};
    if (auth === 'key') url.searchParams.set('key', CFG.GOOGLE_API_KEY);
    else headers.Authorization = 'Bearer ' + (await ensureToken());

    let payload;
    if (body !== undefined) {
      if (typeof body === 'string') { payload = body; headers['Content-Type'] = contentType || 'text/plain'; }
      else { payload = JSON.stringify(body); headers['Content-Type'] = 'application/json; charset=UTF-8'; }
    }
    const res = await fetch(url, { method, headers, body: payload, cache: 'no-store' });
    if (!res.ok) {
      let msg = 'Lỗi ' + res.status;
      try { msg = (await res.json()).error.message || msg; } catch { /* không phải JSON */ }
      if (res.status === 401 && auth !== 'key') dropToken();
      throw new ApiError(res.status, msg);
    }
    if (res.status === 204) return null;
    return raw ? res.text() : res.json();
  }

  /** Đọc dữ liệu: ưu tiên API key (đúng như người xem thấy), lỗi thì dùng phiên đăng nhập. */
  async function read(path, params, raw = false) {
    if (CFG.GOOGLE_API_KEY) {
      try { return await call(path, { params, raw, auth: 'key' }); }
      catch (e) {
        if (!validToken()) throw e;
        drive.keyError = e;
      }
    } else if (!validToken()) {
      throw new Error('Trang chưa có GOOGLE_API_KEY trong config.js nên người xem chưa đọc được dữ liệu. Người quản lý vẫn có thể đăng nhập.');
    }
    return call(path, { params, raw, auth: 'token' });
  }

  const toItem = f => ({
    id: f.id,
    name: f.name,
    mime: f.mimeType || '',
    size: Number(f.size) || 0,
    created: f.createdTime,
    note: f.description || '',
    category: f.properties && LIST_TAB_IDS.includes(f.properties.category) ? f.properties.category : LIST_TAB_IDS[0],
  });

  /* ---------- Thư mục dữ liệu ---------- */
  async function getFolder(id) {
    try {
      const f = await call('/files/' + encodeURIComponent(id), {
        params: { fields: 'id,trashed,capabilities(canAddChildren),permissions(type,role)' },
      });
      return !f.trashed && f.capabilities && f.capabilities.canAddChildren ? f : null;
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    }
  }

  /** Xác định thư mục dữ liệu của tài khoản đang đăng nhập; tạo mới nếu chưa có. */
  async function resolveFolder() {
    let folder = null;
    if (drive.folderId) {
      folder = await getFolder(drive.folderId);
      if (!folder) {
        if (CFG.DRIVE_FOLDER_ID) {
          throw new Error('Tài khoản Google này không có quyền quản lý dữ liệu của trang (hoặc DRIVE_FOLDER_ID trong config.js chưa đúng).');
        }
        drive.folderId = '';
        local.del(LS_FOLDER);
      }
    }
    if (!folder) {
      const found = await call('/files', {
        params: {
          q: `mimeType = '${FOLDER_MIME}' and appProperties has { key='giaoanRoot' and value='1' } and trashed = false`,
          fields: 'files(id)',
          orderBy: 'createdTime',
        },
      });
      if (found.files && found.files.length) folder = await getFolder(found.files[0].id);
      if (!folder) {
        folder = await call('/files', {
          method: 'POST',
          params: { fields: 'id' },
          body: { name: CFG.DRIVE_FOLDER_NAME, mimeType: FOLDER_MIME, appProperties: { giaoanRoot: '1' } },
        });
      }
      drive.folderId = folder.id;
    }
    // Chia sẻ "bất kỳ ai có đường liên kết đều xem được" để người xem không cần đăng nhập
    if (!(folder.permissions || []).some(p => p.type === 'anyone')) {
      await call(`/files/${encodeURIComponent(drive.folderId)}/permissions`, {
        method: 'POST',
        body: { role: 'reader', type: 'anyone' },
      });
    }
    local.set(LS_FOLDER, drive.folderId);
  }

  /* ---------- Tải lên ---------- */
  function xhrSend({ method, url, headers = {}, body, onProgress, signal }) {
    return new Promise((resolve, reject) => {
      if (signal && signal.aborted) { reject(abortError()); return; }
      const xhr = new XMLHttpRequest();
      xhr.open(method, url);
      for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
      if (onProgress) {
        xhr.upload.onprogress = e => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
      }
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try { resolve(JSON.parse(xhr.responseText)); } catch { resolve({}); }
        } else {
          let msg = 'Lỗi ' + xhr.status;
          try { msg = JSON.parse(xhr.responseText).error.message || msg; } catch { /* không phải JSON */ }
          reject(new ApiError(xhr.status, msg));
        }
      };
      xhr.onerror = () => reject(new Error('Mất kết nối trong khi tải lên.'));
      xhr.onabort = () => reject(abortError());
      if (signal) signal.addEventListener('abort', () => xhr.abort(), { once: true });
      xhr.send(body);
    });
  }

  function multipart(metadata, content, contentType) {
    const boundary = 'giaoan' + Math.random().toString(36).slice(2);
    const head = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
                 `--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`;
    const tail = `\r\n--${boundary}--`;
    return { blob: new Blob([head, content, tail]), type: `multipart/related; boundary=${boundary}` };
  }

  async function upload(file, { category, note }, onProgress, signal) {
    const token = await ensureToken();
    if (!drive.folderId) await resolveFolder();
    const type = file.type || 'application/octet-stream';
    const metadata = {
      name: file.name,
      parents: [drive.folderId],
      description: note || '',
      properties: { category },
    };

    // Tải lên dạng "resumable": phù hợp cả với video dung lượng lớn
    const init = await fetch(`${UPLOAD_API}/files?uploadType=resumable&fields=${encodeURIComponent(FIELDS)}`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': type,
        'X-Upload-Content-Length': String(file.size),
      },
      body: JSON.stringify(metadata),
      signal,
    });
    if (!init.ok) {
      let msg = 'Lỗi ' + init.status;
      try { msg = (await init.json()).error.message || msg; } catch { /* không phải JSON */ }
      if (init.status === 401) dropToken();
      throw new ApiError(init.status, msg);
    }
    const sessionUrl = init.headers.get('Location');

    let created;
    if (sessionUrl) {
      created = await xhrSend({ method: 'PUT', url: sessionUrl, headers: { 'Content-Type': type }, body: file, onProgress, signal });
    } else {
      // Dự phòng: trình duyệt không đọc được địa chỉ phiên tải lên => gửi một lần (multipart)
      const mp = multipart(metadata, file, type);
      created = await xhrSend({
        method: 'POST',
        url: `${UPLOAD_API}/files?uploadType=multipart&fields=${encodeURIComponent(FIELDS)}`,
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': mp.type },
        body: mp.blob, onProgress, signal,
      });
    }
    return toItem({
      name: file.name, mimeType: type, size: file.size,
      createdTime: new Date().toISOString(), description: note || '', properties: { category },
      ...created,
    });
  }

  /* ---------- Thông tin đề tài (một tệp JSON nhỏ trong thư mục dữ liệu) ---------- */
  let saveQueue = Promise.resolve();

  async function writeInfo(info) {
    const content = JSON.stringify(info, null, 2);
    const jsonType = 'application/json; charset=UTF-8';
    if (!drive.folderId) await resolveFolder();
    if (drive.metaId) {
      try {
        await call(`${UPLOAD_API}/files/${encodeURIComponent(drive.metaId)}`, {
          method: 'PATCH', params: { uploadType: 'media' }, body: content, contentType: jsonType,
        });
        return;
      } catch (e) {
        if (!(e instanceof ApiError && e.status === 404)) throw e;
        drive.metaId = null;   // tệp thông tin đã bị xóa => tạo lại
      }
    }
    const mp = multipart({ name: META_NAME, parents: [drive.folderId], mimeType: 'application/json' }, content, jsonType);
    const created = await xhrSend({
      method: 'POST',
      url: `${UPLOAD_API}/files?uploadType=multipart&fields=id`,
      headers: { Authorization: 'Bearer ' + (await ensureToken()), 'Content-Type': mp.type },
      body: mp.blob,
    });
    drive.metaId = created.id || null;
  }

  const NOT_OURS = 'Tệp này không do trang web tải lên nên không sửa/xóa được tại đây. Hãy thao tác trực tiếp trong Google Drive.';

  return {
    get folderId() { return drive.folderId; },
    get keyError() { return drive.keyError; },
    preload() { loadGis().catch(() => { /* sẽ báo lỗi khi bấm Đăng nhập */ }); },

    /** Khôi phục phiên đăng nhập còn hạn sau khi tải lại trang. */
    async restore() {
      try {
        const saved = JSON.parse(session.get(SS_TOKEN));
        if (!saved || !saved.t || Date.now() >= saved.e) return false;
        drive.token = saved.t;
        drive.tokenExp = saved.e;
        await resolveFolder();
        return true;
      } catch {
        dropToken();
        return false;
      }
    },
    async signIn() {
      await requestToken();
      try { await resolveFolder(); }
      catch (e) { dropToken(); throw e; }
    },
    signOut() { dropToken(); },

    async load() {
      drive.keyError = null;
      if (!drive.folderId) return { items: [], info: null, unconfigured: true };
      if (!/^[\w-]+$/.test(drive.folderId)) throw new Error('DRIVE_FOLDER_ID trong config.js không hợp lệ.');
      const files = [];
      let pageToken = '';
      do {
        const params = {
          q: `'${drive.folderId}' in parents and trashed = false`,
          fields: `nextPageToken,files(${FIELDS})`,
          pageSize: '1000',
          orderBy: 'createdTime desc',
        };
        if (pageToken) params.pageToken = pageToken;
        const page = await read('/files', params);
        files.push(...(page.files || []));
        pageToken = page.nextPageToken || '';
      } while (pageToken);

      const meta = files.find(f => f.name === META_NAME);
      drive.metaId = meta ? meta.id : null;
      let info = null;
      if (meta) {
        try { info = JSON.parse(await read('/files/' + encodeURIComponent(meta.id), { alt: 'media' }, true)); }
        catch (e) { console.warn('Không đọc được thông tin đề tài:', e); }
      }
      return {
        items: files.filter(f => f !== meta && f.mimeType !== FOLDER_MIME).map(toItem),
        info,
      };
    },

    saveInfo(info) {
      // Lưu lần lượt: hai lần lưu sát nhau không được tạo ra hai tệp thông tin
      const run = saveQueue.then(() => writeInfo(info));
      saveQueue = run.catch(() => { /* lỗi đã trả về cho nơi gọi */ });
      return run;
    },

    upload,

    async updateNote(id, note) {
      try { await call('/files/' + encodeURIComponent(id), { method: 'PATCH', body: { description: note } }); }
      catch (e) { throw (e instanceof ApiError && (e.status === 404 || e.status === 403)) ? new Error(NOT_OURS) : e; }
    },
    async remove(id) {
      try { await call('/files/' + encodeURIComponent(id), { method: 'PATCH', body: { trashed: true } }); }
      catch (e) { throw (e instanceof ApiError && (e.status === 404 || e.status === 403)) ? new Error(NOT_OURS) : e; }
    },
    async preview(item) {
      const id = encodeURIComponent(item.id);
      return {
        kind: 'iframe',
        src: `https://drive.google.com/file/d/${id}/preview`,
        open: `https://drive.google.com/file/d/${id}/view`,
        download: `https://drive.google.com/uc?export=download&id=${id}`,
      };
    },
    removeHint: 'Tệp sẽ được chuyển vào Thùng rác của Google Drive và có thể khôi phục trong 30 ngày.',
    removedMsg: 'Đã chuyển tệp vào Thùng rác của Google Drive.',
  };
})();

const store = DEMO ? demoStore : driveStore;

/* =====================================================================
 * HIỂN THỊ
 * ===================================================================== */
const currentTab = () => TABS.find(t => t.id === state.tab);
const visibleItems = () => state.items
  .filter(it => it.category === state.tab)
  .sort((a, b) => String(b.created).localeCompare(String(a.created)));
const selectedItem = () => state.items.find(it => it.id === state.selected && it.category === state.tab) || null;
const needsSetup = () => !DEMO && state.admin && !!driveStore.folderId && CFG.DRIVE_FOLDER_ID !== driveStore.folderId;

function renderChrome() {
  $('appTitle').textContent = CFG.APP_TITLE;
  $('appVersion').textContent = CFG.APP_VERSION;
  document.title = CFG.APP_TITLE.charAt(0) + CFG.APP_TITLE.slice(1).toLowerCase();
  $('btnAuth').hidden = DEMO;
  $('btnAuthLabel').textContent = state.admin ? 'Đăng xuất' : 'Đăng nhập';
  $('btnAuth').title = state.admin ? 'Thoát chế độ quản lý' : 'Dành cho người quản lý trang';
}

function renderNotice() {
  const box = $('notice');
  box.replaceChildren();
  if (DEMO) {
    box.append('Chế độ dùng thử: trang chưa kết nối Google Drive nên tệp chỉ lưu trong trình duyệt này. Làm theo file HUONG-DAN-CAI-DAT.md để kết nối.');
  } else if (needsSetup()) {
    box.append('Người xem chưa thấy được dữ liệu vì config.js chưa có DRIVE_FOLDER_ID.');
    const b = el('button', { type: 'button', text: 'Xem mã thư mục' });
    b.addEventListener('click', showSetup);
    box.append(b);
  } else if (state.admin && driveStore.keyError) {
    box.append('API key chưa hoạt động nên người xem chưa đọc được dữ liệu. Google báo: ' + driveStore.keyError.message);
  } else if (state.admin && !CFG.GOOGLE_API_KEY) {
    box.append('config.js chưa có GOOGLE_API_KEY nên người xem chưa đọc được dữ liệu.');
  }
  box.hidden = !box.hasChildNodes();
}

function renderTopic() {
  $('ownerName').textContent = state.info.owner.trim() || '(Chưa đặt tên chủ đề tài)';
  const people = $('participants');
  const list = state.info.participants;
  people.textContent = list.length ? list.join(', ') : '(Chưa có người tham gia)';
  people.classList.toggle('is-empty', !list.length);
  $('btnEditInfo').hidden = !state.admin;
}

function renderTabs() {
  const bar = $('tabs');
  bar.replaceChildren(...TABS.map(t => {
    const on = t.id === state.tab;
    return el('button', {
      class: 'tab', type: 'button', role: 'tab', id: 'tab-' + t.id,
      'aria-selected': String(on), 'aria-controls': 'panel', tabindex: on ? '0' : '-1',
      'data-tab': t.id, text: t.label,
    });
  }));
}

function renderList(focusSelected = false) {
  const tab = currentTab();
  const items = visibleItems();
  if (state.selected && !items.some(it => it.id === state.selected)) state.selected = null;

  $('btnUpload').hidden = !state.admin;
  $('btnUploadLabel').textContent = tab.upload;
  $('btnNote').hidden = !state.admin;
  $('btnDelete').hidden = !state.admin;
  $('count').textContent = `${items.length} mục`;

  $('rows').replaceChildren(...items.map(it =>
    el('tr', { 'data-id': it.id, title: it.name },
      el('td', {}, el('span', { class: 'fname', text: it.name }), it.size ? el('span', { class: 'fsize', text: fmtSize(it.size) }) : null),
      el('td', { class: 'c-type', text: fileType(it) }),
      el('td', { class: 'c-date', text: fmtDate(it.created) }),
      el('td', { class: 'c-note', text: it.note }),
    )));

  const empty = $('empty');
  let msg = '';
  if (state.loading) msg = 'Đang tải dữ liệu…';
  else if (state.error) msg = state.error;
  else if (state.unconfigured) msg = 'Trang chưa được thiết lập. Người quản lý hãy bấm "Đăng nhập" ở góc trên để bắt đầu.';
  else if (!items.length) msg = state.admin ? `Chưa có tệp nào. Bấm "${tab.upload}" hoặc kéo thả tệp vào đây.` : 'Chưa có tệp nào.';
  empty.textContent = msg;
  empty.hidden = !msg || (items.length > 0 && !state.error);

  applySelection(focusSelected);
}

/** Cập nhật dòng đang chọn mà không dựng lại bảng (để bấm đúp vẫn nhận đúng dòng). */
function applySelection(focus = false) {
  const rows = [...$('rows').children];
  let current = null;
  rows.forEach((tr, i) => {
    const on = tr.dataset.id === state.selected;
    tr.setAttribute('aria-selected', String(on));
    // Chỉ một dòng nằm trong thứ tự phím Tab: dòng đang chọn, hoặc dòng đầu tiên
    tr.tabIndex = on || (!state.selected && i === 0) ? 0 : -1;
    if (on) current = tr;
  });
  const picked = !!current;
  $('btnOpen').disabled = !picked;
  $('btnNote').disabled = !picked;
  $('btnDelete').disabled = !picked;
  if (focus && current) current.focus();
}

function selectRow(id, focus = true) {
  state.selected = id;
  applySelection(focus);
}

function renderGuide() {
  $('guideText').replaceChildren(linkify(state.info.guide));
  $('contactText').replaceChildren(linkify(state.info.contact));
  $('btnEditGuide').hidden = !state.admin;
}

function render() {
  renderChrome();
  renderNotice();
  renderTopic();
  renderTabs();
  const isGuide = !!currentTab().isGuide;
  $('listView').hidden = isGuide;
  $('guideView').hidden = !isGuide;
  $('panel').setAttribute('aria-labelledby', 'tab-' + state.tab);
  if (isGuide) renderGuide(); else renderList();
}

/* =====================================================================
 * THAO TÁC
 * ===================================================================== */
async function reload() {
  state.loading = true;
  state.error = '';
  render();
  try {
    const data = await store.load();
    state.items = data.items;
    state.info = normalizeInfo(data.info);
    state.unconfigured = !!data.unconfigured;
  } catch (e) {
    state.items = [];
    state.error = explain(e);
  }
  state.loading = false;
  render();
}

function setTab(id, focus = false) {
  state.tab = id;
  state.selected = null;
  render();
  if (focus) $('tab-' + id).focus();
}

async function withBusy(button, label, fn) {
  const kids = [...button.childNodes];   // giữ lại biểu tượng + chữ gốc của nút
  button.disabled = true;
  button.textContent = label;
  try { return await fn(); }
  finally { button.disabled = false; button.replaceChildren(...kids); }
}

const submitButton = e => e.submitter || e.target.querySelector('[type="submit"]');

function confirmBox(title, text, okLabel) {
  return new Promise(resolve => {
    const dlg = $('dlgConfirm');
    $('confirmTitle').textContent = title;
    $('confirmText').textContent = text;
    $('confirmOk').textContent = okLabel;
    dlg.returnValue = '';
    dlg.addEventListener('close', () => resolve(dlg.returnValue === 'ok'), { once: true });
    dlg.showModal();
  });
}

/* ---------- Đăng nhập / đăng xuất ---------- */
function showSetup() {
  $('setupId').textContent = driveStore.folderId;
  $('dlgSetup').showModal();
}

async function toggleAuth() {
  if (state.admin) {
    driveStore.signOut();
    state.admin = false;
    render();
    toast('Đã đăng xuất.');
    return;
  }
  const btn = $('btnAuth');
  btn.disabled = true;
  $('btnAuthLabel').textContent = 'Đang đăng nhập…';
  try {
    await driveStore.signIn();
    state.admin = true;
    await reload();
    toast('Đã đăng nhập quản lý.');
    if (needsSetup()) showSetup();
  } catch (e) {
    toast(explain(e), true);
  } finally {
    btn.disabled = false;
    renderChrome();
  }
}

/* ---------- Xem / mở ---------- */
let activePreview = null;

async function openSelected() {
  const item = selectedItem();
  if (!item) return;
  let p;
  try { p = await store.preview(item); }
  catch (e) { toast(explain(e), true); return; }
  activePreview = p;

  $('viewName').textContent = item.name;
  const open = $('viewOpen'), dl = $('viewDownload');
  open.hidden = !p.open;
  if (p.open) open.href = p.open;
  dl.href = p.download;
  if (p.downloadName) {
    dl.setAttribute('download', p.downloadName);
    dl.removeAttribute('target');
  } else {
    // Tệp trên Drive: mở ở tab mới để trang Google (nếu có cảnh báo tệp lớn) không thay thế trang này
    dl.removeAttribute('download');
    dl.target = '_blank';
    dl.rel = 'noopener';
  }

  let node;
  if (p.kind === 'iframe') node = el('iframe', { src: p.src, title: item.name, allow: 'autoplay; fullscreen', allowfullscreen: true });
  else if (p.kind === 'image') node = el('img', { src: p.src, alt: item.name });
  else if (p.kind === 'video') node = el('video', { src: p.src, controls: true });
  else if (p.kind === 'audio') node = el('audio', { src: p.src, controls: true });
  else node = el('p', { class: 'viewer__msg', text: p.message });
  $('viewBody').replaceChildren(node);
  $('dlgView').showModal();
}

function closePreview() {
  $('viewBody').replaceChildren();   // dừng video / giải phóng khung xem
  if (activePreview && activePreview.revoke) activePreview.revoke();
  activePreview = null;
}

/* ---------- Xóa ---------- */
async function deleteSelected() {
  const item = selectedItem();
  if (!item || !state.admin) return;
  const ok = await confirmBox('Xóa tệp này?', `"${item.name}" — ${store.removeHint}`, 'Xóa');
  if (!ok) return;
  try {
    await withBusy($('btnDelete'), 'Đang xóa…', () => store.remove(item.id));
    state.items = state.items.filter(it => it.id !== item.id);
    state.selected = null;
    toast(store.removedMsg);
  } catch (e) {
    toast(explain(e), true);
  }
  renderList();
}

/* ---------- Ghi chú ---------- */
function editNote() {
  const item = selectedItem();
  if (!item || !state.admin) return;
  $('noteFile').textContent = item.name;
  $('inNote').value = item.note;
  $('dlgNote').showModal();
}

async function saveNote(e) {
  e.preventDefault();
  const item = selectedItem();
  if (!item) { $('dlgNote').close(); return; }
  const note = $('inNote').value.trim();
  try {
    await withBusy(submitButton(e), 'Đang lưu…', () => store.updateNote(item.id, note));
    item.note = note;
    $('dlgNote').close();
    renderList();
    toast('Đã lưu ghi chú.');
  } catch (err) {
    toast(explain(err), true);
  }
}

/* ---------- Thông tin đề tài, hướng dẫn ---------- */
function editInfo() {
  $('inOwner').value = state.info.owner;
  $('inPeople').value = state.info.participants.join('\n');
  $('dlgInfo').showModal();
}

function editGuide() {
  $('inGuide').value = state.info.guide;
  $('inContact').value = state.info.contact;
  $('dlgGuide').showModal();
}

async function saveInfo(e, dialog, patch) {
  e.preventDefault();
  const next = normalizeInfo({ ...state.info, ...patch });
  try {
    await withBusy(submitButton(e), 'Đang lưu…', () => store.saveInfo(next));
    state.info = next;
    dialog.close();
    render();
    toast('Đã lưu.');
  } catch (err) {
    toast(explain(err), true);
  }
}

/* ---------- Tải lên ---------- */
const up = { files: [], running: false, ctrl: null };

function openUpload(files) {
  if (!state.admin || !files.length || currentTab().isGuide) return;
  const tab = currentTab();
  up.files = files;
  up.running = false;
  $('uploadTitle').textContent = `${tab.upload} (${files.length} tệp)`;
  $('uploadList').replaceChildren(...files.map(f =>
    el('li', {},
      el('div', { class: 'uplist__row' },
        el('span', { class: 'uplist__name', text: f.name }),
        el('span', { class: 'uplist__meta', text: fmtSize(f.size) || '0 B' })),
      el('div', { class: 'bar', hidden: true }, el('i')))));
  $('inUploadNote').value = '';
  $('inUploadNote').disabled = false;
  $('uploadNoteField').hidden = false;
  $('btnUploadGo').hidden = false;
  $('btnUploadGo').disabled = false;
  $('btnUploadCancel').textContent = 'Hủy';
  $('dlgUpload').showModal();
}

async function runUpload(e) {
  e.preventDefault();
  if (up.running) return;
  const tab = currentTab();
  const note = $('inUploadNote').value.trim();
  const ctrl = up.ctrl = new AbortController();
  up.running = true;
  $('btnUploadGo').disabled = true;
  $('inUploadNote').disabled = true;

  const rows = [...$('uploadList').children];
  let ok = 0, failed = 0;
  for (let i = 0; i < up.files.length && !ctrl.signal.aborted; i++) {
    const meta = rows[i].querySelector('.uplist__meta');
    const bar = rows[i].querySelector('.bar');
    const fill = bar.firstElementChild;
    bar.hidden = false;
    meta.textContent = '0%';
    rows[i].scrollIntoView({ block: 'nearest' });
    try {
      const item = await store.upload(up.files[i], { category: tab.id, note }, (p) => {
        const pct = Math.min(100, Math.round(p * 100));
        fill.style.width = pct + '%';
        meta.textContent = pct + '%';
      }, ctrl.signal);
      state.items.unshift(item);
      ok++;
      fill.style.width = '100%';
      meta.textContent = 'Xong';
      meta.className = 'uplist__meta is-ok';
      renderList();
    } catch (err) {
      if (err && err.name === 'AbortError') { meta.textContent = 'Đã hủy'; break; }
      failed++;
      bar.hidden = true;
      meta.textContent = explain(err);
      meta.className = 'uplist__meta is-err';
    }
  }
  up.running = false;

  if (ctrl.signal.aborted) {
    toast(ok ? `Đã hủy. ${ok} tệp đã tải lên trước đó.` : 'Đã hủy tải lên.');
  } else if (!failed) {
    $('dlgUpload').close();
    toast(`Đã tải lên ${ok} tệp.`);
  } else {
    // Giữ hộp thoại để người dùng đọc lỗi của từng tệp
    $('btnUploadGo').hidden = true;
    $('uploadNoteField').hidden = true;
    $('btnUploadCancel').textContent = 'Đóng';
    toast(`${failed} tệp tải lên không thành công.`, true);
  }
}

/* =====================================================================
 * GẮN SỰ KIỆN
 * ===================================================================== */
function bindEvents() {
  // Tab
  $('tabs').addEventListener('click', e => {
    const b = e.target.closest('[data-tab]');
    if (b) setTab(b.dataset.tab);
  });
  $('tabs').addEventListener('keydown', e => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const i = TABS.findIndex(t => t.id === state.tab);
    const next = TABS[(i + (e.key === 'ArrowRight' ? 1 : -1) + TABS.length) % TABS.length];
    e.preventDefault();
    setTab(next.id, true);
  });

  // Bảng tệp
  const rows = $('rows');
  rows.addEventListener('click', e => {
    const tr = e.target.closest('tr[data-id]');
    if (tr) selectRow(tr.dataset.id);
  });
  rows.addEventListener('dblclick', e => {
    const tr = e.target.closest('tr[data-id]');
    if (!tr) return;
    selectRow(tr.dataset.id);
    openSelected();
  });
  rows.addEventListener('keydown', e => {
    const tr = e.target.closest('tr[data-id]');
    if (!tr) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const other = e.key === 'ArrowDown' ? tr.nextElementSibling : tr.previousElementSibling;
      if (other) { e.preventDefault(); selectRow(other.dataset.id); }
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      selectRow(tr.dataset.id);
      if (e.key === 'Enter') openSelected();
    } else if (e.key === 'Delete' && state.admin) {
      selectRow(tr.dataset.id);
      deleteSelected();
    }
  });

  // Thanh công cụ
  $('btnOpen').addEventListener('click', openSelected);
  $('btnDelete').addEventListener('click', deleteSelected);
  $('btnNote').addEventListener('click', editNote);
  $('btnUpload').addEventListener('click', () => {
    const picker = $('filePicker');
    picker.accept = currentTab().accept || '';
    picker.click();
  });
  $('filePicker').addEventListener('change', e => {
    const files = [...e.target.files];
    e.target.value = '';
    openUpload(files);
  });

  // Kéo thả tệp vào bảng
  const wrap = $('tableWrap');
  const hasFiles = e => e.dataTransfer && [...e.dataTransfer.types].includes('Files');
  let dragDepth = 0;
  wrap.addEventListener('dragenter', e => {
    if (!state.admin || !hasFiles(e)) return;
    e.preventDefault();
    dragDepth++;
    $('dropHint').hidden = false;
  });
  wrap.addEventListener('dragover', e => { if (state.admin && hasFiles(e)) e.preventDefault(); });
  wrap.addEventListener('dragleave', () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) $('dropHint').hidden = true;
  });
  wrap.addEventListener('drop', e => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth = 0;
    $('dropHint').hidden = true;
    openUpload([...e.dataTransfer.files]);
  });
  // Thả tệp ra ngoài bảng: không để trình duyệt tự mở tệp, rời khỏi trang
  for (const type of ['dragover', 'drop']) {
    window.addEventListener(type, e => { if (hasFiles(e)) e.preventDefault(); });
  }

  // Hộp thoại
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-close]');
    if (b) b.closest('dialog').close();
  });
  $('btnEditInfo').addEventListener('click', editInfo);
  $('btnEditGuide').addEventListener('click', editGuide);
  $('formInfo').addEventListener('submit', e => saveInfo(e, $('dlgInfo'), {
    owner: $('inOwner').value.trim(),
    participants: $('inPeople').value.split('\n'),
  }));
  $('formGuide').addEventListener('submit', e => saveInfo(e, $('dlgGuide'), {
    guide: $('inGuide').value.trim(),
    contact: $('inContact').value.trim(),
  }));
  $('formNote').addEventListener('submit', saveNote);
  $('formUpload').addEventListener('submit', runUpload);
  $('btnUploadCancel').addEventListener('click', () => $('dlgUpload').close());
  $('dlgUpload').addEventListener('close', () => { if (up.running && up.ctrl) up.ctrl.abort(); });
  $('dlgView').addEventListener('close', closePreview);

  $('btnCopyId').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(driveStore.folderId);
      toast('Đã sao chép mã thư mục.');
    } catch {
      toast('Không sao chép tự động được. Hãy bôi đen mã rồi nhấn Ctrl+C.', true);
    }
  });

  $('btnAuth').addEventListener('click', toggleAuth);
}

/* =====================================================================
 * KHỞI ĐỘNG
 * ===================================================================== */
async function init() {
  bindEvents();
  render();
  if (!DEMO) driveStore.preload();
  state.admin = await store.restore();
  await reload();
}

init();
})();
