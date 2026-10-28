/* --- 관리 화면 주문 탭 (admin.html) ---
   입구가 「관리자: staff · admin」 일 때만 admin.js 가 showOrders(true) 로 연다.
   - 목록 = orders 를 createdAt 최근 순으로 20개씩 · 「더 보기」로 다음 20개
   - 상태 고르기 = 고른 상태만 Firestore 에서 읽어 온다 (where status == … · 다 읽고 화면에서 고르지 않는다)
   - 상세 = 줄을 누르면 연다
   - 상태 버튼 = 지금 상태에서 다음으로 갈 버튼 하나만
       paid → 「포장 시작」(preparing) · preparing → 「배송 시작」(shipped) · shipped → 「배송 완료」(delivered)
       delivered · canceled 는 버튼 없음 · 취소 버튼은 두지 않는다 (환불은 포트원에서 먼저, 상태는 웹훅이 바꾼다)
   - 「바꾸기」 = status · statusUpdatedAt(서버 시각) 두 필드만 고친다. adminLogs 에는 쓰지 않는다
   실패하면 오류 글을 줄이지 않고 브라우저 콘솔에 그대로 남긴다 (색인을 만들라는 오류의 링크가 보이게). 화면에는 한 줄만. */
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getFirestore, collection, doc, getDoc, getDocs, updateDoc, serverTimestamp, query, where, orderBy, limit, startAfter } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

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

// 한 번에 읽는 주문 수
const PAGE = 20;

// 지금 상태 → 다음 상태와 버튼 글자 (여기에 없는 상태는 버튼 없음)
const NEXT = {
  paid: { to: "preparing", label: "포장 시작" },
  preparing: { to: "shipped", label: "배송 시작" },
  shipped: { to: "delivered", label: "배송 완료" }
};

const statusPick = document.querySelector("#order-status");
const rows = document.querySelector("#order-rows");
const listNote = document.querySelector("#order-list-result");
const moreBtn = document.querySelector("#btn-order-more");
const detail = document.querySelector("#order-detail");
const detailNote = document.querySelector("#order-detail-result");
const dialog = document.querySelector("#order-dialog");
const dialogText = document.querySelector("#order-dialog-text");

// 마지막으로 받은 문서 - 「더 보기」가 여기서부터 읽는다
let lastDoc = null;

// .btn 은 display 가 정해져 있어 hidden 만으로는 안 숨는다 - 직접 끈다
function showMore(show) {
  moreBtn.style.display = show ? "" : "none";
}

function say(note, text, isError) {
  note.style.color = isError ? "#c0392b" : "";
  note.textContent = text;
}

// 실패하면 오류 글을 줄이지 않고 콘솔에 그대로 남기고, 화면에는 한 줄만
function fail(note, what, err) {
  console.error(err);
  say(note, what + " - 자세한 오류는 브라우저 콘솔에 있습니다.", true);
}

// Timestamp 를 서울 시각 글자로
function when(ts) {
  return ts && ts.toDate ? ts.toDate().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : "";
}

function won(n) {
  return typeof n === "number" ? n.toLocaleString("ko-KR") + "원" : String(n ?? "");
}

function cell(text) {
  const td = document.createElement("td");
  td.textContent = text;
  return td;
}

// 목록 한 줄 - 주문 번호 · 금액 · 상태 · 주문 시각
function paintRow(snap) {
  const d = snap.data();
  const tr = document.createElement("tr");
  tr.style.cursor = "pointer";
  tr.append(cell(snap.id), cell(won(d.totalPrice)), cell(d.status ?? ""), cell(when(d.createdAt)));
  tr.addEventListener("click", () => openDetail(snap.id));
  rows.append(tr);
}

// 고른 상태로 쿼리를 만든다 - 「전체」면 상태 조건 없이
function orderQuery(after) {
  const parts = [collection(db, "orders")];
  if (statusPick.value !== "all") parts.push(where("status", "==", statusPick.value));
  parts.push(orderBy("createdAt", "desc"));
  if (after) parts.push(startAfter(after));
  parts.push(limit(PAGE));
  return query(...parts);
}

// more 가 false 면 처음부터, true 면 이어서 20개
async function loadOrders(more) {
  if (!more) {
    rows.replaceChildren();
    lastDoc = null;
  }
  showMore(false);
  say(listNote, "읽는 중…");
  try {
    const snap = await getDocs(orderQuery(more ? lastDoc : null));
    snap.docs.forEach(paintRow);
    if (snap.docs.length) lastDoc = snap.docs[snap.docs.length - 1];
    showMore(snap.docs.length === PAGE);
    say(listNote, rows.children.length ? "" : "주문이 없습니다.");
  } catch (err) {
    fail(listNote, "주문을 읽지 못했습니다", err);
  }
}

// 상세 한 줄
function line(label, value) {
  const p = document.createElement("p");
  p.style.margin = "0 0 6px";
  const b = document.createElement("b");
  b.textContent = label + " : ";
  p.append(b, document.createTextNode(value));
  return p;
}

function itemsText(items) {
  if (!Array.isArray(items)) return String(items ?? "");
  return items.map(it => (it.name ?? it.productId ?? "") + " × " + (it.qty ?? it.quantity ?? 1)).join(", ");
}

async function openDetail(id) {
  detail.hidden = false;
  detail.replaceChildren();
  say(detailNote, "읽는 중…");
  let snap;
  try {
    snap = await getDoc(doc(db, "orders", id));
  } catch (err) {
    fail(detailNote, "주문을 읽지 못했습니다", err);
    return;
  }
  say(detailNote, "");
  const d = snap.data() || {};

  const h = document.createElement("h4");
  h.style.margin = "0 0 12px";
  h.textContent = "주문 상세";
  detail.append(h,
    line("주문 번호", id),
    line("산 것", itemsText(d.items)),
    line("금액", won(d.totalPrice)),
    line("상태", d.status ?? ""),
    line("받은 시각", when(d.receivedAt)),
    line("처리 표시", (d.processStatus ?? "") + (d.processError ? " - " + d.processError : "")));
  if (d.mailStatus) detail.append(line("메일 표시", d.mailStatus));
  if (d.statusUpdatedAt) detail.append(line("상태를 바꾼 시각", when(d.statusUpdatedAt)));

  // 지금 상태에서 다음으로 갈 버튼 하나만
  const next = NEXT[d.status];
  if (next) {
    const btn = document.createElement("button");
    btn.className = "btn";
    btn.type = "button";
    btn.style.margin = "12px 0 0";
    btn.textContent = next.label;
    btn.addEventListener("click", () => changeStatus(id, next.to, btn));
    detail.append(btn);
  }
}

// 확인 창 - 「바꾸기」면 true
function confirmChange(id, to) {
  dialogText.textContent = "주문 " + id + "를 " + to + "로 바꿉니다";
  dialog.returnValue = "";
  dialog.showModal();
  return new Promise(resolve => {
    dialog.addEventListener("close", () => resolve(dialog.returnValue === "change"), { once: true });
  });
}

async function changeStatus(id, to, btn) {
  if (!(await confirmChange(id, to))) return;
  btn.disabled = true;
  say(detailNote, "바꾸는 중…");
  try {
    // status 와 statusUpdatedAt 두 필드만 고친다 - 시각은 서버 시각
    await updateDoc(doc(db, "orders", id), { status: to, statusUpdatedAt: serverTimestamp() });
  } catch (err) {
    btn.disabled = false;
    fail(detailNote, "상태를 바꾸지 못했습니다", err);
    return;
  }
  // 상세를 새로 불러와 새 상태와 다음 버튼을 보여 준다
  await openDetail(id);
  // 목록의 상태 글자도 맞춘다
  await loadOrders(false);
}

statusPick.addEventListener("change", () => {
  detail.hidden = true;
  say(detailNote, "");
  loadOrders(false);
});
moreBtn.addEventListener("click", () => loadOrders(true));

// admin.js 가 부른다 - 입구가 관리자이면 true
export async function showOrders(show) {
  if (!show) {
    rows.replaceChildren();
    detail.hidden = true;
    lastDoc = null;
    return;
  }
  await loadOrders(false);
}
