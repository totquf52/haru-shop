/* --- 관리 화면 상품 표 (admin.html) ---
   입구가 「관리자: staff · admin」 일 때만 보인다.
   products 를 조건 없이 전부 읽는다 - 숨긴 상품(isVisible false)도 보인다.
   품절 토글은 stock, 노출 토글은 isVisible 을 바꾼다. 지우는 버튼은 없다. */
import { getFirestore, collection, doc, getDocs, updateDoc, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

let db = null;
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
      try { await updateDoc(doc(db, "products", id), { stock: 0 }); await loadProducts(); }
      catch (err) { console.error(err); note.textContent = errorText(err); }
      return;
    }
    askStock(tr, id, note);
  });

  // 노출 토글 - 손님 목록에 보일지 말지
  const visBtn = toggleBtn(visible);
  visBtn.addEventListener("click", async () => {
    note.textContent = "";
    try { await updateDoc(doc(db, "products", id), { isVisible: !visible }); await loadProducts(); }
    catch (err) { console.error(err); note.textContent = errorText(err); }
  });

  // 고치기 - price · summary · stock
  const editBtn = el("button", "고치기", { type: "button", className: "btn ghost" });
  editBtn.style.cssText = "padding:5px 12px;font-size:13px";
  editBtn.addEventListener("click", () => openEdit(tr, id, d, note));

  const cells = [el("td", id), el("td", d.name || ""), el("td", Number(d.price).toLocaleString("ko-KR")), el("td", String(stock))];
  const tdSold = el("td"); tdSold.appendChild(soldBtn);
  const tdVis = el("td"); tdVis.appendChild(visBtn);
  const tdEdit = el("td"); tdEdit.append(editBtn, note);
  tr.append(...cells, tdSold, tdVis, tdEdit);
  return tr;
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
    try { await updateDoc(doc(db, "products", id), { stock: n }); await loadProducts(); }
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
  const save = el("button", "저장", { type: "button", className: "btn" });
  save.style.cssText = "padding:5px 14px;font-size:13px";
  save.addEventListener("click", async () => {
    note.textContent = "";
    try {
      // price · stock 은 숫자로 저장한다
      await updateDoc(doc(db, "products", id), { price: Number(price.value), summary: summary.value, stock: Number(stock.value) });
      await loadProducts();
    } catch (err) { console.error(err); note.textContent = errorText(err); }
  });
  td.append("가격", price, "설명", summary, "재고", stock, save);
  extra.appendChild(td);
  tr.after(extra);
}

function closeExtra(tr) {
  const next = tr.nextElementSibling;
  if (next && next.classList.contains("extra")) next.remove();
}

/* --- 표 읽기 - 조건 없이 전부 --- */
export async function loadProducts() {
  try {
    const snap = await getDocs(collection(db, "products"));
    tbody.replaceChildren(...snap.docs.map(s => row(s.id, s.data())));
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
  try {
    const ref = await addDoc(collection(db, "products"), {
      name: f.get("name"),
      price: Number(f.get("price")),
      summary: f.get("summary"),
      stock: Number(f.get("stock")),
      isVisible: false,
      createdAt: serverTimestamp()
    });
    newNote.textContent = "저장했습니다 - 문서 ID " + ref.id;
    newForm.reset();
    await loadProducts();
  } catch (err) { console.error(err); newNote.textContent = "저장하지 못했습니다.\n" + errorText(err); }
});

export async function showProducts(app) {
  db = getFirestore(app);
  box.hidden = false;
  await loadProducts();
}
