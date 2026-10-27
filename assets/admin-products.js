/* --- 관리 화면 상품 표 (admin.html) ---
   입구가 「관리자: staff · admin」 일 때만 보인다.
   products 를 조건 없이 전부 읽는다 - 숨긴 상품(isVisible false)도 보인다.
   품절 토글은 stock, 노출 토글은 isVisible 을 바꾼다. 지우는 버튼은 없다. */
import { getFirestore, collection, doc, getDocs, updateDoc, addDoc, serverTimestamp, deleteField, query, orderBy, limit } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-storage.js";

let db = null;
// 버킷은 설정의 storageBucket 값 그대로
let storage = null;
const MAX = 5 * 1024 * 1024;

/* --- 사진 ---
   올리기 전에 크기 · 종류를 본다. 사진이 다 올라간 뒤에만 imagePath 에 경로 글자를 적는다. */
function checkFile(file) {
  if (!file.type.startsWith("image/")) return "이미지 파일만 올릴 수 있습니다";
  if (file.size >= MAX) return "5MB 넘는 사진은 올릴 수 없습니다";
  return "";
}

function uploadPhoto(id, file, note) {
  // 맨 앞에 / 를 붙이지 않는다. 예: products/p1/main.jpg
  const path = "products/" + id + "/main.jpg";
  return new Promise((resolve, reject) => {
    const task = uploadBytesResumable(ref(storage, path), file);
    task.on("state_changed",
      s => { note.textContent = "올리는 중 … " + (s.totalBytes ? Math.round(s.bytesTransferred / s.totalBytes * 100) : 0) + "%"; },
      err => reject(err),
      async () => {
        try { await updateDoc(doc(db, "products", id), { imagePath: path, updatedAt: serverTimestamp() }); resolve(path); }
        catch (err) { reject(err); }
      });
  });
}
const box = document.querySelector("#products");
const tbody = document.querySelector("#product-rows");
const newBtn = document.querySelector("#btn-new");
const newForm = document.querySelector("#new-form");
const newNote = document.querySelector("#new-result");

// 오류 글을 줄이지 않고 그대로 적는다
function errorText(err) {
  const text = String(err);
  return err && err.code && !text.includes(err.code) ? text + " (" + err.code + ")" : text;
}

function el(tag, text, attrs) {
  const e = document.createElement(tag);
  if (text !== undefined && text !== null) e.textContent = text;
  Object.assign(e, attrs || {});
  return e;
}

function toggleBtn(on) {
  const b = el("button", on ? "켬" : "끔", { type: "button", className: on ? "btn" : "btn ghost" });
  b.style.cssText = "padding:5px 12px;font-size:13px";
  return b;
}

/* --- 한 줄 --- */
function row(id, d) {
  const tr = el("tr");
  tr.dataset.id = id;
  const stock = Number(d.stock);
  const soldOut = stock === 0;
  const visible = d.isVisible !== false;

  const note = el("p", "", { className: "row-note" });
  note.style.cssText = "margin:4px 0 0;font-size:12.5px;color:#b3261e;white-space:pre-wrap;overflow-wrap:anywhere";

  // 품절 토글 - 켜면 stock 0, 끄면 재고 숫자를 물어 그 숫자로
  const soldBtn = toggleBtn(soldOut);
  soldBtn.addEventListener("click", async () => {
    note.textContent = "";
    if (!soldOut) {
      try { await updateDoc(doc(db, "products", id), { stock: 0, updatedAt: serverTimestamp() }); await loadProducts(); }
      catch (err) { console.error(err); note.textContent = errorText(err); }
      return;
    }
    askStock(tr, id, note);
  });

  // 노출 토글 - 손님 목록에 보일지 말지
  const visBtn = toggleBtn(visible);
  visBtn.addEventListener("click", async () => {
    note.textContent = "";
    try { await updateDoc(doc(db, "products", id), { isVisible: !visible, updatedAt: serverTimestamp() }); await loadProducts(); }
    catch (err) { console.error(err); note.textContent = errorText(err); }
  });

  // 고치기 - price · summary · stock
  const editBtn = el("button", "고치기", { type: "button", className: "btn ghost" });
  editBtn.style.cssText = "padding:5px 12px;font-size:13px";
  editBtn.addEventListener("click", () => openEdit(tr, id, d, note));

  // imagePath 가 있으면 작은 사진
  const tdName = el("td");
  if (d.imagePath) {
    const img = el("img", null, { alt: "" });
    img.style.cssText = "width:36px;height:36px;object-fit:cover;border-radius:6px;vertical-align:middle;margin-right:8px";
    getDownloadURL(ref(storage, d.imagePath)).then(u => { img.src = u; }).catch(err => console.error(err));
    tdName.appendChild(img);
  }
  tdName.append(d.name || "");
  const cells = [el("td", id), tdName, el("td", Number(d.price).toLocaleString("ko-KR")), el("td", String(stock))];
  const tdSold = el("td"); tdSold.appendChild(soldBtn);
  const tdVis = el("td"); tdVis.appendChild(visBtn);
  // 내리기 / 되돌리기 - 문서는 지우지 않는다 (소프트 삭제)
  const downBtn = el("button", d.deletedAt ? "되돌리기" : "내리기", { type: "button", className: "btn ghost" });
  downBtn.style.cssText = "padding:5px 12px;font-size:13px;margin-left:6px";
  downBtn.addEventListener("click", () => d.deletedAt ? restore(id, note) : confirmDown(id, d.name || id, note));
  const tdEdit = el("td"); tdEdit.append(editBtn, downBtn, note);
  tr.append(...cells, tdSold, tdVis, tdEdit);
  return tr;
}

/* --- 내리기 · 되돌리기 ---
   확인 창은 무엇을 하는지 상품 이름으로 묻는다. 로그(adminLogs)는 함수가 쓴다 - 화면은 읽기만 한다. */
const dialog = document.querySelector("#down-dialog");
const dialogText = document.querySelector("#down-text");
const undoBar = document.querySelector("#undo-bar");
const undoText = document.querySelector("#undo-text");
const undoBtn = document.querySelector("#btn-undo");
let pending = null;

function confirmDown(id, name, note) {
  pending = { id, note };
  dialogText.textContent = "『" + name + "』을 가게에서 내립니다";
  dialog.hidden = false;
}
document.querySelector("#down-cancel").addEventListener("click", () => { dialog.hidden = true; pending = null; });
document.querySelector("#down-ok").addEventListener("click", async () => {
  dialog.hidden = true;
  if (!pending) return;
  const { id, note } = pending;
  pending = null;
  try {
    // 지우지 않고 표시만 - 내린 시각(서버 시각) · 손님 목록에서 숨김
    await updateDoc(doc(db, "products", id), { deletedAt: serverTimestamp(), isVisible: false });
    const name = (all.find(p => p.id === id) || { d: {} }).d.name || id;
    undoText.textContent = "『" + name + "』을 내렸습니다.";
    undoBtn.onclick = () => restore(id, note);
    undoBar.hidden = false;
    await loadProducts();
  } catch (err) { console.error(err); note.textContent = errorText(err); }
});

async function restore(id, note) {
  try {
    // deletedAt 필드를 아예 지우고 다시 보이게
    await updateDoc(doc(db, "products", id), { deletedAt: deleteField(), isVisible: true });
    undoBar.hidden = true;
    await loadProducts();
  } catch (err) { console.error(err); note.textContent = errorText(err); }
}

/* --- 최근 활동 - 함수가 남긴 adminLogs 를 최신 것부터 열 줄 --- */
const logBox = document.querySelector("#log-rows");
// 바뀐 필드 이름을 보여 줄 때만 한국어로 - adminLogs 값은 그대로 둔다
const KO = { deletedAt: "내림 표시", isVisible: "노출", stock: "재고", price: "가격", name: "이름", summary: "설명", imagePath: "사진" };
async function loadLogs() {
  try {
    const snap = await getDocs(query(collection(db, "adminLogs"), orderBy("at", "desc"), limit(10)));
    const names = Object.fromEntries(all.map(p => [p.id, p.d.name]));
    logBox.replaceChildren(...snap.docs.map(s => {
      const g = s.data();
      const when = g.at ? g.at.toDate().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : "";
      return el("li", when + "   " + (names[g.productId] || g.productId) + "   " + g.action + "   " + (g.changedKeys || []).map(k => KO[k] || k).join(" · "));
    }));
    if (!snap.size) logBox.replaceChildren(el("li", "아직 활동이 없습니다"));
  } catch (err) { console.error(err); logBox.replaceChildren(el("li", "최근 활동을 불러오지 못했습니다. " + errorText(err))); }
}

// 품절을 끌 때 - 줄 아래에 재고 칸을 연다
function askStock(tr, id, note) {
  closeExtra(tr);
  const extra = el("tr", null, { className: "extra" });
  const td = el("td"); td.colSpan = 7;
  const input = el("input", null, { type: "number", min: "1", step: "1", placeholder: "재고 숫자" });
  input.style.cssText = "width:120px;padding:6px 8px;margin-right:8px";
  const save = el("button", "재고 저장", { type: "button", className: "btn" });
  save.style.cssText = "padding:5px 12px;font-size:13px";
  save.addEventListener("click", async () => {
    const n = Number(input.value);
    if (!Number.isInteger(n) || n < 1) { note.textContent = "재고는 1 이상 정수로 넣어 주세요."; return; }
    try { await updateDoc(doc(db, "products", id), { stock: n, updatedAt: serverTimestamp() }); await loadProducts(); }
    catch (err) { console.error(err); note.textContent = errorText(err); }
  });
  td.append("품절을 끕니다. 재고 ", input, save);
  extra.appendChild(td);
  tr.after(extra);
}

// 고치기 칸
function openEdit(tr, id, d, note) {
  closeExtra(tr);
  const extra = el("tr", null, { className: "extra" });
  const td = el("td"); td.colSpan = 7;
  const price = el("input", null, { type: "number", value: d.price, id: "edit-price" });
  const summary = el("input", null, { type: "text", value: d.summary || "", id: "edit-summary" });
  const stock = el("input", null, { type: "number", value: d.stock, id: "edit-stock" });
  [price, stock].forEach(i => i.style.cssText = "width:110px;padding:6px 8px;margin:0 12px 0 4px");
  summary.style.cssText = "width:280px;padding:6px 8px;margin:0 12px 0 4px";
  const photo = el("input", null, { type: "file", accept: "image/*", id: "edit-photo" });
  photo.style.cssText = "margin:0 12px 0 4px";
  const save = el("button", "저장", { type: "button", className: "btn" });
  save.style.cssText = "padding:5px 14px;font-size:13px";
  const status = el("span", "");
  status.style.cssText = "margin-left:10px;font-size:13px";
  save.addEventListener("click", async () => {
    note.textContent = "";
    const file = photo.files[0];
    if (file) { const msg = checkFile(file); if (msg) { note.textContent = msg; return; } }
    try {
      // price · stock 은 숫자로 저장한다
      await updateDoc(doc(db, "products", id), { price: Number(price.value), summary: summary.value, stock: Number(stock.value), updatedAt: serverTimestamp() });
      // 사진을 골랐으면 같은 경로에 덮어 올리고, 다 올라간 뒤 imagePath 를 적는다
      if (file) await uploadPhoto(id, file, status);
      await loadProducts();
    } catch (err) { console.error(err); note.textContent = errorText(err); }
  });
  td.append("가격", price, "설명", summary, "재고", stock, "사진", photo, save, status);
  extra.appendChild(td);
  tr.after(extra);
}

function closeExtra(tr) {
  const next = tr.nextElementSibling;
  if (next && next.classList.contains("extra")) next.remove();
}

/* --- 필터 · 검색 · 정렬 ---
   Firestore 에는 한 번만 묻는다. 고르고 줄 세우는 일은 한 번 읽어 둔 목록에서 화면이 한다. */
let all = [];
let filter = "all";
const filterBtns = document.querySelectorAll("[data-filter]");
const searchBox = document.querySelector("#search");
const sortBox = document.querySelector("#sort");
const countLine = document.querySelector("#count-line");

function render() {
  const q = (searchBox.value || "").trim().toLowerCase();
  let list = all.filter(p => {
    if (filter === "soldout" && Number(p.d.stock) !== 0) return false;
    if (filter === "hidden" && p.d.isVisible !== false) return false;
    if (filter === "down" && !p.d.deletedAt) return false;
    if (q && !String(p.d.name || "").toLowerCase().includes(q)) return false;
    return true;
  });
  if (sortBox.value === "stock") list = [...list].sort((a, b) => Number(a.d.stock) - Number(b.d.stock));
  // 최근에 고친 순 - updatedAt 이 늦은 것이 위, 없는 상품은 맨 아래
  if (sortBox.value === "recent") list = [...list].sort((a, b) => (b.d.updatedAt ? b.d.updatedAt.toMillis() : -1) - (a.d.updatedAt ? a.d.updatedAt.toMillis() : -1));
  if (sortBox.value === "name") list = [...list].sort((a, b) => String(a.d.name || "").localeCompare(String(b.d.name || ""), "ko"));
  countLine.textContent = "지금 보이는 상품 " + list.length + "개 / 전체 " + all.length + "개";
  filterBtns.forEach(b => b.className = b.dataset.filter === filter ? "btn" : "btn ghost");
  tbody.replaceChildren(...list.map(p => row(p.id, p.d)));
}

filterBtns.forEach(b => b.addEventListener("click", () => { filter = b.dataset.filter; render(); }));
searchBox.addEventListener("input", render);
sortBox.addEventListener("change", render);

/* --- 표 읽기 - 조건 없이 전부 --- */
export async function loadProducts() {
  try {
    const snap = await getDocs(collection(db, "products"));
    all = snap.docs.map(s => ({ id: s.id, d: s.data() }));
    render();
    await loadLogs();
  } catch (err) {
    console.error(err);
    tbody.replaceChildren(el("tr", null)); tbody.firstChild.appendChild(el("td", "상품을 불러오지 못했습니다. " + errorText(err)));
  }
}

/* --- 새 상품 - 자동 ID · 숨긴 채로 · 서버 시각 --- */
newBtn.addEventListener("click", () => { newForm.hidden = !newForm.hidden; newNote.textContent = ""; });
newForm.addEventListener("submit", async e => {
  e.preventDefault();
  newNote.textContent = "";
  const f = new FormData(newForm);
  const file = f.get("photo");
  const hasFile = file && file.size > 0;
  if (hasFile) { const msg = checkFile(file); if (msg) { newNote.textContent = msg; return; } }
  try {
    // 1) 숨긴 채로 문서를 먼저 만든다
    const docRef = await addDoc(collection(db, "products"), {
      name: f.get("name"),
      price: Number(f.get("price")),
      summary: f.get("summary"),
      stock: Number(f.get("stock")),
      isVisible: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    // 2) 그 문서 ID 로 사진을 올리고 3) 다 올라간 뒤 imagePath 를 적는다
    if (hasFile) {
      try { await uploadPhoto(docRef.id, file, newNote); }
      catch (err) { console.error(err); newNote.textContent = "문서 " + docRef.id + " 는 만들었지만 사진을 올리지 못했습니다.\n" + errorText(err); await loadProducts(); return; }
    }
    newNote.textContent = "저장했습니다 - 문서 ID " + docRef.id;
    newForm.reset();
    await loadProducts();
  } catch (err) { console.error(err); newNote.textContent = "저장하지 못했습니다.\n" + errorText(err); }
});

export async function showProducts(app) {
  db = getFirestore(app);
  storage = getStorage(app);
  box.hidden = false;
  await loadProducts();
}
