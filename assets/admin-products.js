/* --- 관리 화면 상품 표 (admin.html) ---
   입구가 「관리자: staff · admin」 일 때만 admin.js 가 showProducts(true) 로 연다.
   - products 를 조건 없이 전부 읽는다 (손님에게 숨긴 isVisible false 도 보인다)
   - 줄마다 문서 ID · name · price · stock · 품절 토글 · 노출 토글 · 「고치기」
   - 품절 켜기 = stock 0 · 끄기 = 재고 숫자(1 이상 정수)를 물어서 저장
   - 노출 = isVisible true / false
   - 고치기 = price · summary · stock (price · stock 은 숫자로 저장)
   - 「새 상품」 = 자동 문서 ID · isVisible false · createdAt 은 서버 시각
   - 사진 = products/문서 ID/main.jpg 에 고른 파일 그대로 올리고, 다 올라간 뒤에 그 경로 글자를 imagePath 에 적는다
     (다운로드 URL 은 문서에 적지 않는다 - 표의 작은 사진을 보여 줄 때만 받는다)
   상품을 지우는 단추는 두지 않는다. 저장이 실패하면 오류 글을 줄이지 않고 그 줄 옆에 그대로 적는다. */
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getFirestore, collection, doc, getDocs, addDoc, updateDoc, serverTimestamp, Timestamp, deleteField, query, orderBy, limit } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-storage.js";

// index.html 과 같은 Firebase 설정
const firebaseConfig = {
  apiKey: "AIzaSyC9IOJWMP2AL0JvLg_Ipq_EV0h2ChQrRAg",
  authDomain: "haru-shop-80c06.firebaseapp.com",
  projectId: "haru-shop-80c06",
  storageBucket: "haru-shop-80c06.firebasestorage.app",
  messagingSenderId: "205447160425",
  appId: "1:205447160425:web:3b845512888e3c30e7b8f8"
};

// 화면이 이미 연결해 두었으면 그것을 쓰고, 없을 때만 새로 연결한다
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);
// 버킷은 설정의 storageBucket 값 그대로
const storage = getStorage(app);

const section = document.querySelector("#admin-products");
const table = document.querySelector("#product-table");
const listNote = document.querySelector("#product-list-result");

// 오류 글을 줄이지 않고 그대로 적는다 (오류 코드가 글에 없으면 뒤에 붙인다)
function errorText(err) {
  const text = String(err);
  return err && err.code && !text.includes(err.code) ? text + " (" + err.code + ")" : text;
}

function say(note, text, isError) {
  note.style.color = isError ? "#c0392b" : "";
  note.textContent = text;
}

// 0 · 1 처럼 min 이상인 정수 글자만 숫자로 바꾼다. 아니면 null
function toCount(text, min) {
  const t = String(text ?? "").trim();
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  return n >= min ? n : null;
}

// 숫자로 읽히는 글자만 숫자로 바꾼다. 빈 칸이나 숫자가 아니면 null
function toNumber(text) {
  const t = String(text ?? "").trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/* --- 사진 --- */
// 올리기 전에 막는다 - 문제가 있으면 보여 줄 글, 없으면 null
function photoProblem(file) {
  if (!file.type.startsWith("image/")) return "이미지 파일만 올릴 수 있습니다";
  if (file.size >= 5 * 1024 * 1024) return "5MB 넘는 사진은 올릴 수 없습니다";
  return null;
}

// products/문서 ID/main.jpg 에 고른 파일 그대로 올린다 (같은 경로면 덮어 올린다).
// 올라가는 동안 onPercent(몇 %) 를 부르고, 다 올라가면 경로 글자를 돌려준다
function uploadPhoto(id, file, onPercent) {
  // 맨 앞에 / 를 붙이지 않는다. 예: products/p1/main.jpg
  const path = "products/" + id + "/main.jpg";
  return new Promise((resolve, reject) => {
    const task = uploadBytesResumable(ref(storage, path), file);
    task.on("state_changed",
      snapshot => {
        // 진행률 - 올라간 만큼 ÷ 전체
        onPercent(snapshot.totalBytes ? Math.round(snapshot.bytesTransferred / snapshot.totalBytes * 100) : 0);
      },
      reject,
      () => resolve(path)
    );
  });
}

// 파일을 고르는 칸 - 고르는 순간에도 막아야 할 파일이면 note 에 적는다
function photoInput(input, note) {
  input.addEventListener("change", () => {
    const file = input.files[0];
    const problem = file && photoProblem(file);
    if (problem) say(note, problem, true);
  });
}

// 표의 작은 사진 - imagePath 가 있을 때만, 그 경로로 다운로드 URL 을 받아 보여 준다
function thumb(path) {
  const box = document.createElement("span");
  if (!path) return box;
  getDownloadURL(ref(storage, path)).then(url => {
    const img = document.createElement("img");
    img.alt = "";
    img.width = 48;
    img.height = 48;
    img.style.cssText = "display:block;object-fit:cover;border-radius:6px";
    img.src = url;
    box.replaceChildren(img);
  }).catch(err => {
    // 오류 글은 줄이지 않고 콘솔에 그대로 찍는다
    console.error(err);
  });
  return box;
}

function cell(content) {
  const td = document.createElement("td");
  if (content instanceof Node) td.append(content);
  else td.textContent = content === undefined ? "" : String(content);
  return td;
}

function checkbox(checked, label) {
  const lab = document.createElement("label");
  lab.style.cssText = "display:inline-flex;align-items:center;gap:4px;white-space:nowrap";
  const box = document.createElement("input");
  box.type = "checkbox";
  box.checked = checked;
  lab.append(box, label);
  return { lab, box };
}

function field(labelText, value, type) {
  const lab = document.createElement("label");
  lab.textContent = labelText;
  const input = document.createElement("input");
  input.type = type;
  if (type === "number") input.inputMode = "numeric";
  input.value = value === undefined ? "" : String(value);
  lab.append(input);
  return { lab, input };
}

/* --- 상품 한 개 ---
   <tbody> 한 묶음에 보통 줄과 고치기 칸을 넣는다. 저장이 되면 새 값으로 묶음을 통째로 다시 그린다. */
function paintProduct(id, data, message) {
  const group = document.createElement("tbody");
  const row = document.createElement("tr");

  // 그 줄 옆 - 저장 결과 · 오류 글
  const note = document.createElement("span");
  note.style.cssText = "font-size:13px;white-space:pre-wrap;overflow-wrap:anywhere";
  if (message) say(note, message);

  const soldOut = checkbox(data.stock === 0, "품절");
  const visible = checkbox(data.isVisible === true, "노출");

  const editBtn = document.createElement("button");
  editBtn.type = "button";
  editBtn.className = "btn ghost";
  editBtn.textContent = "고치기";

  // 「내린 상품」 필터에서는 「되돌리기」, 그 밖에서는 「내리기」
  const restoring = view.filter === "removed";
  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "btn ghost";
  removeBtn.textContent = restoring ? "되돌리기" : "내리기";

  row.append(
    cell(thumb(data.imagePath)), cell(id), cell(data.name), cell(data.price), cell(data.stock),
    cell(soldOut.lab), cell(visible.lab), cell(editBtn), cell(removeBtn), cell(note)
  );

  removeBtn.addEventListener("click", async () => {
    if (!restoring && !(await confirmRemove(data.name))) return;
    removeBtn.disabled = true;
    say(note, "저장하는 중…");
    try {
      await setRemoved(id, !restoring);
    } catch (err) {
      say(note, "저장하지 못했습니다.\n" + errorText(err), true);
      removeBtn.disabled = false;
      return;
    }
    group.replaceWith(paintProduct(id, products.find(p => p.id === id).data, restoring ? "되돌렸습니다." : "내렸습니다."));
    if (!restoring) showUndo(id, data.name);
  });

  // 저장한다. 실패하면 오류 글을 그 줄 옆에 적고 false 를 돌려준다
  async function save(changes) {
    say(note, "저장하는 중…");
    try {
      // 고친 시각 - 서버 시계로 같이 적는다
      await updateDoc(doc(db, "products", id), { ...changes, updatedAt: serverTimestamp() });
    } catch (err) {
      say(note, "저장하지 못했습니다.\n" + errorText(err), true);
      return false;
    }
    // 읽어 둔 목록의 updatedAt 은 「최근에 고친 순」 정렬에만 쓰는 지금 시각 (문서에는 서버 시각이 적힌다)
    const next = { ...data, ...changes, updatedAt: Timestamp.now() };
    // 읽어 둔 목록에도 새 값을 적어 둔다 (다음에 필터 · 검색 · 정렬할 때 쓴다)
    remember(id, next);
    group.replaceWith(paintProduct(id, next, "저장했습니다."));
    return true;
  }

  // 누르는 동안 막아 두고, 실패하면 토글을 누르기 전으로 되돌린다
  async function saveToggle(box, changes) {
    box.disabled = true;
    const ok = await save(changes);
    if (!ok) { box.checked = !box.checked; box.disabled = false; }
  }

  // 품절 - 켜면 stock 0, 끄면 재고 숫자를 묻는다
  soldOut.box.addEventListener("change", () => {
    if (soldOut.box.checked) { saveToggle(soldOut.box, { stock: 0 }); return; }

    const answer = prompt("재고 숫자를 넣어 주세요 (1 이상 정수)", "");
    // 묻는 창을 닫았으면 품절 그대로
    if (answer === null) { soldOut.box.checked = true; return; }
    const stock = toCount(answer, 1);
    if (stock === null) {
      soldOut.box.checked = true;
      say(note, "재고는 1 이상 정수로 넣어 주세요: " + answer, true);
      return;
    }
    saveToggle(soldOut.box, { stock });
  });

  // 노출 - 손님 목록에 보일지 말지
  visible.box.addEventListener("change", () => saveToggle(visible.box, { isVisible: visible.box.checked }));

  /* --- 고치기 칸 --- */
  const editRow = document.createElement("tr");
  editRow.hidden = true;
  const editCell = document.createElement("td");
  editCell.colSpan = 10;
  const form = document.createElement("div");
  form.style.cssText = "display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end";
  const price = field("price", data.price, "number");
  const summary = field("summary", data.summary, "text");
  const stock = field("stock", data.stock, "number");
  const photo = field("사진", "", "file");
  photo.input.accept = "image/*";
  photoInput(photo.input, note);
  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "btn";
  saveBtn.textContent = "저장";
  form.append(price.lab, summary.lab, stock.lab, photo.lab, saveBtn);
  editCell.append(form);
  editRow.append(editCell);

  editBtn.addEventListener("click", () => { editRow.hidden = !editRow.hidden; });

  saveBtn.addEventListener("click", async () => {
    // price · stock 은 숫자로 바꿔서 저장한다 (글자로 저장하지 않는다)
    const p = toNumber(price.input.value);
    const s = toCount(stock.input.value, 0);
    if (p === null) { say(note, "price 는 숫자로 넣어 주세요: " + price.input.value, true); return; }
    if (s === null) { say(note, "stock 은 0 이상 정수로 넣어 주세요: " + stock.input.value, true); return; }
    // 사진을 골랐으면 올리기 전에 먼저 본다
    const file = photo.input.files[0];
    const problem = file && photoProblem(file);
    if (problem) { say(note, problem, true); return; }

    saveBtn.disabled = true;
    const changes = { price: p, summary: summary.input.value, stock: s };
    if (file) {
      // 같은 경로에 덮어 올리고, 다 올라간 뒤에만 imagePath 를 함께 저장한다
      // 올리기가 실패하면 아무것도 저장하지 않는다
      try {
        changes.imagePath = await uploadPhoto(id, file, percent => say(note, "올리는 중 … " + percent + "%"));
      } catch (err) {
        say(note, "사진을 올리지 못했습니다.\n" + errorText(err), true);
        saveBtn.disabled = false;
        return;
      }
    }
    const ok = await save(changes);
    if (!ok) saveBtn.disabled = false;
  });

  group.append(row, editRow);
  return group;
}

/* --- 상품 표 ---
   Firestore 에서는 조건 없이 한 번만 읽어 둔다 (골라 읽기 · 정렬해 읽기 · 개수 제한 없음).
   필터 · 검색 · 정렬은 읽어 둔 목록에서 화면이 한다 - 단추를 눌러도 Firestore 에 다시 묻지 않는다. */
// 읽어 둔 상품 전부 - { id, data }
let products = [];
// 지금 고른 필터 · 검색 · 정렬
const view = { filter: "all", search: "", sort: "stock" };

const countLine = document.querySelector("#product-count");
const searchBox = document.querySelector("#product-search");
const sortBox = document.querySelector("#product-sort");
const filterBtns = document.querySelectorAll("[data-filter]");

function remember(id, data) {
  const item = products.find(p => p.id === id);
  if (item) item.data = data;
}

const FILTERS = {
  all: () => true,
  soldout: d => d.stock === 0,
  hidden: d => d.isVisible === false,
  removed: d => d.deletedAt != null
};

const SORTS = {
  // 재고가 숫자가 아닌 상품은 맨 뒤
  stock: (a, b) => {
    const x = typeof a.data.stock === "number" ? a.data.stock : Infinity;
    const y = typeof b.data.stock === "number" ? b.data.stock : Infinity;
    return x === y ? 0 : x < y ? -1 : 1;
  },
  name: (a, b) => String(a.data.name ?? "").localeCompare(String(b.data.name ?? ""), "ko"),
  // updatedAt 이 늦은 것이 위 · updatedAt 이 없는 상품은 맨 아래
  updated: (a, b) => {
    const x = a.data.updatedAt instanceof Timestamp ? a.data.updatedAt.toMillis() : -Infinity;
    const y = b.data.updatedAt instanceof Timestamp ? b.data.updatedAt.toMillis() : -Infinity;
    return x === y ? 0 : x > y ? -1 : 1;
  }
};

// 필터 · 검색 · 정렬을 겹쳐서 표를 다시 그린다
function render() {
  table.querySelectorAll("tbody").forEach(el => el.remove());
  // 영어는 대소문자를 가리지 않는다
  const word = view.search.trim().toLowerCase();
  const shown = products
    .filter(p => FILTERS[view.filter](p.data))
    .filter(p => !word || String(p.data.name ?? "").toLowerCase().includes(word))
    .sort(SORTS[view.sort]);
  shown.forEach(p => table.append(paintProduct(p.id, p.data)));
  countLine.textContent = "지금 보이는 상품 " + shown.length + "개 / 전체 " + products.length + "개";
}

/* --- 내리기 · 되돌리기 ---
   문서를 지우지 않는다. 내리기 = deletedAt 에 서버 시각 + isVisible false,
   되돌리기 = deletedAt 필드를 아예 지우고 isVisible true. 다른 저장과 같이 updatedAt 도 서버 시각으로 적는다. */
async function setRemoved(id, removed) {
  await updateDoc(doc(db, "products", id), {
    deletedAt: removed ? serverTimestamp() : deleteField(),
    isVisible: !removed,
    updatedAt: serverTimestamp()
  });
  // 읽어 둔 목록에도 적는다 - 시각은 화면 필터 · 정렬에만 쓰는 지금 시각 (문서에는 서버 시각이 적힌다)
  const item = products.find(p => p.id === id);
  if (!item) return;
  const next = { ...item.data, isVisible: !removed, updatedAt: Timestamp.now() };
  if (removed) next.deletedAt = Timestamp.now();
  else delete next.deletedAt;
  item.data = next;
}

// 확인 창 - 「내리기」 를 누르면 true, 「그만두기」 나 Esc 면 false
const removeDialog = document.querySelector("#remove-dialog");
function confirmRemove(name) {
  document.querySelector("#remove-text").textContent = "『" + (name ?? "") + "』을 가게에서 내립니다";
  removeDialog.returnValue = "";
  removeDialog.showModal();
  return new Promise(resolve => {
    removeDialog.addEventListener("close", () => resolve(removeDialog.returnValue === "remove"), { once: true });
  });
}

// 내린 뒤 화면 아래 한 줄 안내 - 「되돌리기」 를 누르면 방금 내린 상품을 되돌린다
const undoBar = document.querySelector("#undo-bar");
const undoText = document.querySelector("#undo-text");
const undoBtn = document.querySelector("#btn-undo");
let undoId = null;

function showUndo(id, name) {
  undoId = id;
  undoText.textContent = "『" + (name ?? "") + "』을 내렸습니다.";
  undoBtn.hidden = false;
  undoBtn.disabled = false;
  undoBar.hidden = false;
}

undoBtn.addEventListener("click", async () => {
  if (!undoId) return;
  undoBtn.disabled = true;
  try {
    await setRemoved(undoId, false);
  } catch (err) {
    undoText.textContent = "되돌리지 못했습니다.\n" + errorText(err);
    undoBtn.disabled = false;
    return;
  }
  undoId = null;
  undoText.textContent = "되돌렸습니다.";
  undoBtn.hidden = true;
  render();
});

/* --- 최근 활동 ---
   함수가 adminLogs 에 남긴 것을 at 이 최신인 것부터 열 줄 읽는다 (관리 화면은 adminLogs 에 쓰지 않는다).
   상품 이름은 이미 읽어 둔 products 에서 productId 로 찾는다. */
// 바뀐 필드 이름을 보여 줄 때만 한국어로 바꾼다 (adminLogs 문서 값은 그대로). 목록에 없는 이름은 그대로
const KEY_NAMES = {
  deletedAt: "내림 표시",
  isVisible: "노출",
  stock: "재고",
  price: "가격",
  name: "이름",
  summary: "설명",
  imagePath: "사진"
};

const logRows = document.querySelector("#log-rows");
const logNote = document.querySelector("#log-result");

async function loadLogs() {
  logRows.replaceChildren();
  say(logNote, "최근 활동을 읽는 중…");
  try {
    const snap = await getDocs(query(collection(db, "adminLogs"), orderBy("at", "desc"), limit(10)));
    snap.docs.forEach(d => {
      const log = d.data();
      const item = products.find(p => p.id === log.productId);
      const tr = document.createElement("tr");
      tr.append(
        cell(log.at instanceof Timestamp ? log.at.toDate().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : ""),
        // 찾지 못하면 productId 를 그대로 적는다
        cell(item ? item.data.name : log.productId),
        cell(log.action),
        cell(Array.isArray(log.changedKeys) ? log.changedKeys.map(k => Object.hasOwn(KEY_NAMES, k) ? KEY_NAMES[k] : k).join(", ") : log.changedKeys)
      );
      logRows.append(tr);
    });
    say(logNote, snap.size ? "" : "아직 활동이 없습니다.");
  } catch (err) {
    say(logNote, "최근 활동을 읽지 못했습니다.\n" + errorText(err), true);
  }
}

async function loadProducts() {
  table.querySelectorAll("tbody").forEach(el => el.remove());
  countLine.textContent = "";
  say(listNote, "상품을 읽는 중…");
  try {
    // 조건 없이 전부 - 숨긴 상품 · 품절 상품도
    const snap = await getDocs(collection(db, "products"));
    products = snap.docs.map(d => ({ id: d.id, data: d.data() }));
    say(listNote, "");
    render();
  } catch (err) {
    products = [];
    say(listNote, "상품을 읽지 못했습니다.\n" + errorText(err), true);
  }
  // 상품 이름을 찾을 수 있게 상품을 읽은 뒤에 읽는다
  await loadLogs();
}

filterBtns.forEach(btn => btn.addEventListener("click", () => {
  view.filter = btn.dataset.filter;
  // 고른 단추만 진하게
  filterBtns.forEach(b => {
    const on = b === btn;
    b.className = on ? "btn" : "btn ghost";
    b.setAttribute("aria-pressed", String(on));
  });
  render();
}));
searchBox.addEventListener("input", () => { view.search = searchBox.value; render(); });
sortBox.addEventListener("change", () => { view.sort = sortBox.value; render(); });

// admin.js 가 부른다 - 입구가 관리자이면 true
export async function showProducts(show) {
  section.hidden = !show;
  if (!show) {
    table.querySelectorAll("tbody").forEach(el => el.remove());
    logRows.replaceChildren();
    undoBar.hidden = true;
    products = [];
    return;
  }
  await loadProducts();
}

/* --- 새 상품 --- */
const newBox = document.querySelector("#new-product-box");
const newNote = document.querySelector("#new-product-result");
const newName = document.querySelector("#new-name");
const newPrice = document.querySelector("#new-price");
const newSummary = document.querySelector("#new-summary");
const newStock = document.querySelector("#new-stock");
const newPhoto = document.querySelector("#new-photo");
const newSave = document.querySelector("#btn-new-save");
photoInput(newPhoto, newNote);

document.querySelector("#btn-new-product").addEventListener("click", () => {
  newBox.hidden = !newBox.hidden;
  if (!newBox.hidden) newName.focus();
});

newSave.addEventListener("click", async () => {
  // price · stock 은 숫자로 바꿔서 저장한다 (글자로 저장하지 않는다)
  const price = toNumber(newPrice.value);
  const stock = toCount(newStock.value, 0);
  if (price === null) { say(newNote, "price 는 숫자로 넣어 주세요: " + newPrice.value, true); return; }
  if (stock === null) { say(newNote, "stock 은 0 이상 정수로 넣어 주세요: " + newStock.value, true); return; }
  // 사진을 골랐으면 문서를 만들기 전에 먼저 본다
  const file = newPhoto.files[0];
  const problem = file && photoProblem(file);
  if (problem) { say(newNote, problem, true); return; }

  newSave.disabled = true;
  say(newNote, "저장하는 중…");
  try {
    // 1) 문서 ID 는 자동으로 붙인다
    const docRef = await addDoc(collection(db, "products"), {
      name: newName.value,
      price,
      summary: newSummary.value,
      stock,
      // 새 상품은 손님 목록에 숨겨 둔다
      isVisible: false,
      // 만든 시각 - 서버 시계로 적는다
      createdAt: serverTimestamp(),
      // 고친 시각 - 서버 시계로 적는다
      updatedAt: serverTimestamp()
    });
    let done = "만들었습니다. 문서 ID: " + docRef.id;

    if (file) {
      // 2) 그 문서 ID 로 products/문서 ID/main.jpg 에 올린다
      let path;
      try {
        path = await uploadPhoto(docRef.id, file, percent => say(newNote, "올리는 중 … " + percent + "%"));
      } catch (err) {
        // 올리기가 실패하면 imagePath 는 적지 않는다
        say(newNote, "문서는 만들었지만(문서 ID: " + docRef.id + ") 사진을 올리지 못했습니다.\n" + errorText(err), true);
        newSave.disabled = false;
        await loadProducts();
        return;
      }
      // 3) 다 올라간 뒤에 imagePath 에 경로 글자를 적는다
      await updateDoc(docRef, { imagePath: path, updatedAt: serverTimestamp() });
      done += " · 사진: " + path;
    }

    say(newNote, done);
    [newName, newPrice, newSummary, newStock, newPhoto].forEach(el => { el.value = ""; });
    newBox.hidden = true;
    // 새 상품이 보이게 표를 다시 읽는다
    await loadProducts();
  } catch (err) {
    say(newNote, "저장하지 못했습니다.\n" + errorText(err), true);
  }
  newSave.disabled = false;
});
