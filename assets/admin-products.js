/* --- 관리 화면 상품 표 (admin.html) ---
   입구가 「관리자: staff · admin」 일 때만 admin.js 가 showProducts(true) 로 연다.
   - products 를 조건 없이 전부 읽는다 (손님에게 숨긴 isVisible false 도 보인다)
   - 줄마다 문서 ID · name · price · stock · 품절 토글 · 노출 토글 · 「고치기」
   - 품절 켜기 = stock 0 · 끄기 = 재고 숫자(1 이상 정수)를 물어서 저장
   - 노출 = isVisible true / false
   - 고치기 = price · summary · stock (price · stock 은 숫자로 저장)
   - 「새 상품」 = 자동 문서 ID · isVisible false · createdAt 은 서버 시각
   상품을 지우는 단추는 두지 않는다. 저장이 실패하면 오류 글을 줄이지 않고 그 줄 옆에 그대로 적는다. */
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getFirestore, collection, doc, getDocs, addDoc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

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

  row.append(
    cell(id), cell(data.name), cell(data.price), cell(data.stock),
    cell(soldOut.lab), cell(visible.lab), cell(editBtn), cell(note)
  );

  // 저장한다. 실패하면 오류 글을 그 줄 옆에 적고 false 를 돌려준다
  async function save(changes) {
    say(note, "저장하는 중…");
    try {
      await updateDoc(doc(db, "products", id), changes);
    } catch (err) {
      say(note, "저장하지 못했습니다.\n" + errorText(err), true);
      return false;
    }
    group.replaceWith(paintProduct(id, { ...data, ...changes }, "저장했습니다."));
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
  editCell.colSpan = 8;
  const form = document.createElement("div");
  form.style.cssText = "display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end";
  const price = field("price", data.price, "number");
  const summary = field("summary", data.summary, "text");
  const stock = field("stock", data.stock, "number");
  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "btn";
  saveBtn.textContent = "저장";
  form.append(price.lab, summary.lab, stock.lab, saveBtn);
  editCell.append(form);
  editRow.append(editCell);

  editBtn.addEventListener("click", () => { editRow.hidden = !editRow.hidden; });

  saveBtn.addEventListener("click", async () => {
    // price · stock 은 숫자로 바꿔서 저장한다 (글자로 저장하지 않는다)
    const p = toNumber(price.input.value);
    const s = toCount(stock.input.value, 0);
    if (p === null) { say(note, "price 는 숫자로 넣어 주세요: " + price.input.value, true); return; }
    if (s === null) { say(note, "stock 은 0 이상 정수로 넣어 주세요: " + stock.input.value, true); return; }
    saveBtn.disabled = true;
    const ok = await save({ price: p, summary: summary.input.value, stock: s });
    if (!ok) saveBtn.disabled = false;
  });

  group.append(row, editRow);
  return group;
}

/* --- 상품 표 --- */
async function loadProducts() {
  table.querySelectorAll("tbody").forEach(el => el.remove());
  say(listNote, "상품을 읽는 중…");
  try {
    // 조건 없이 전부 - 숨긴 상품도
    const snap = await getDocs(collection(db, "products"));
    snap.docs.forEach(d => table.append(paintProduct(d.id, d.data())));
    say(listNote, "상품 " + snap.size + "개");
  } catch (err) {
    say(listNote, "상품을 읽지 못했습니다.\n" + errorText(err), true);
  }
}

// admin.js 가 부른다 - 입구가 관리자이면 true
export async function showProducts(show) {
  section.hidden = !show;
  if (!show) {
    table.querySelectorAll("tbody").forEach(el => el.remove());
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
const newSave = document.querySelector("#btn-new-save");

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

  newSave.disabled = true;
  say(newNote, "저장하는 중…");
  try {
    // 문서 ID 는 자동으로 붙인다
    const ref = await addDoc(collection(db, "products"), {
      name: newName.value,
      price,
      summary: newSummary.value,
      stock,
      // 새 상품은 손님 목록에 숨겨 둔다
      isVisible: false,
      // 만든 시각 - 서버 시계로 적는다
      createdAt: serverTimestamp()
    });
    say(newNote, "만들었습니다. 문서 ID: " + ref.id);
    [newName, newPrice, newSummary, newStock].forEach(el => { el.value = ""; });
    newBox.hidden = true;
    // 새 상품이 보이게 표를 다시 읽는다
    await loadProducts();
  } catch (err) {
    say(newNote, "저장하지 못했습니다.\n" + errorText(err), true);
  }
  newSave.disabled = false;
});
