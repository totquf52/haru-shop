/* --- 내 주문 (Firestore) ---
   마이페이지의 「내 주문」 목록. orders 컬렉션에서 userId 가 로그인한 사람의 UID 와 같은 주문만 듣는다 (onSnapshot).
   주문 문서가 바뀌면 새로고침 없이 목록을 다시 그린다.
   주문 상태를 바꾸는 일은 하지 않는다 - 읽기만 한다. dataLayer 에는 아무것도 보내지 않는다. */
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getFirestore, collection, query, where, onSnapshot, getDocs } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

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
// 누가 로그인했는지 읽는다 (로그인 상태를 지켜보는 일은 auth.js 가 한다)
const auth = getAuth(app);

// 오류 글을 줄이지 않고 그대로 적는다 (오류 코드가 글에 없으면 뒤에 붙인다)
function errorText(err) {
  const text = String(err);
  return err && err.code && !text.includes(err.code) ? text + " (" + err.code + ")" : text;
}

// 주문 시각(createdAt)을 밀리초로 - 서버 시각이 아직 안 적힌 주문은 방금 것으로 본다
function orderTime(d) {
  return d.createdAt && typeof d.createdAt.toMillis === "function" ? d.createdAt.toMillis() : Date.now();
}

function note(box, text) {
  const p = document.createElement("p");
  p.className = "empty";
  p.style.cssText = "white-space:pre-wrap;overflow-wrap:anywhere";
  p.textContent = text;
  box.replaceChildren(p);
}

/* --- 주문 상태를 손님이 읽는 말로 ---
   저장된 status 값은 그대로 두고 화면에 적는 말만 바꾼다. 영어 값은 화면에 적지 않는다. */
// 단계 줄 - 순서대로 네 단계
const STEPS = [
  { status: "paid", label: "결제 완료" },
  { status: "preparing", label: "상품 준비 중" },
  { status: "shipped", label: "배송 중" },
  { status: "delivered", label: "배송 완료" }
];

function paintStatus(cell, status) {
  const now = STEPS.findIndex(s => s.status === status);

  const label = document.createElement("div");
  label.style.fontWeight = "700";
  // 취소는 단계 줄에 넣지 않는다. 표에 없는 값은 「확인 중」
  label.textContent = now >= 0 ? STEPS[now].label : status === "canceled" ? "주문 취소" : "확인 중";
  cell.appendChild(label);
  if (now < 0) return;

  const line = document.createElement("ol");
  line.style.cssText = "list-style:none;display:flex;flex-wrap:wrap;gap:6px;margin:8px 0 0;padding:0;font-size:12px";
  STEPS.forEach((s, i) => {
    const li = document.createElement("li");
    li.textContent = s.label;
    // 지금 단계는 색을 채워 눈에 띄게, 아직 오지 않은 단계는 흐리게
    li.style.cssText = "padding:2px 10px;border-radius:999px;border:1px solid var(--line);"
      + (i === now ? "background:var(--accent);border-color:var(--accent);color:var(--accent-ink);font-weight:700"
        : i < now ? "color:var(--ink)" : "color:var(--sub);opacity:.6");
    if (i === now) li.setAttribute("aria-current", "step");
    line.appendChild(li);
  });
  cell.appendChild(line);
}

// 받은 주문을 최신순으로 줄 세워 표로 그린다 (정렬은 쿼리가 아니라 여기서 한다)
function paintOrders(box, docs) {
  if (!docs.length) { note(box, "아직 주문이 없습니다."); return; }

  const rows = docs
    .map(snap => snap.data())
    .sort((a, b) => orderTime(b) - orderTime(a));

  const table = document.createElement("table");
  table.className = "cart";
  const head = table.createTHead().insertRow();
  ["주문한 날", "상품", "합계", "상태"].forEach(t => {
    const th = document.createElement("th");
    th.textContent = t;
    head.appendChild(th);
  });

  const body = table.createTBody();
  rows.forEach(d => {
    const tr = body.insertRow();
    const items = Array.isArray(d.items) ? d.items : [];
    [
      new Date(orderTime(d)).toLocaleDateString("ko-KR"),
      items.map(i => i.quantity > 1 ? i.name + " × " + i.quantity : i.name).join(", "),
      typeof d.totalPrice === "number" ? won(d.totalPrice) : String(d.totalPrice ?? "")
    ].forEach(text => { tr.insertCell().textContent = text; });
    paintStatus(tr.insertCell(), d.status);
  });

  box.replaceChildren(table);
}

// 더 바뀔 일이 없는 주문 상태
const DONE = ["delivered", "canceled"];

/* --- 멈춤 안내와 「다시 확인」 ---
   리스너를 해제한 뒤에만 주문 목록 아래에 붙인다.
   「다시 확인」은 내 주문을 한 번만 읽어 와 다시 그린다 - 리스너를 다시 걸지 않는다. */
function showStopped(box, q) {
  const p = document.createElement("p");
  p.style.cssText = "margin:12px 0 0;font-size:13px;color:var(--sub)";
  p.textContent = "모든 주문이 끝나 실시간 확인을 멈췄습니다. 새로 고치면 다시 확인합니다.";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn ghost";
  btn.id = "order-recheck";
  btn.style.cssText = "margin-left:10px;padding:6px 14px;font-size:13px";
  btn.textContent = "다시 확인";
  p.appendChild(btn);

  const result = document.createElement("p");
  result.style.cssText = "margin:8px 0 0;font-size:13px;white-space:pre-wrap;overflow-wrap:anywhere";

  btn.addEventListener("click", async () => {
    btn.disabled = true;
    result.textContent = "";
    try {
      // 한 번 읽고 끝 - 듣는 것이 아니라서 그 뒤에 바뀐 것은 다시 눌러야 보인다
      const snap = await getDocs(q);
      paintOrders(box, snap.docs);
      // 다시 그리면 안내와 단추가 지워지니 새로 붙인다
      showStopped(box, q);
    } catch (err) {
      // 오류 글은 줄이지 않고 화면에 그대로 보여 준다. 보이던 목록은 그대로 둔다
      console.error(err);
      result.textContent = "주문을 불러오지 못했습니다.\n" + errorText(err);
      btn.disabled = false;
    }
  });

  box.append(p, result);
}

// 리스너는 한 번만 건다
let listening = false;

async function listenOrders() {
  const box = document.querySelector("#order-list");
  if (!box || listening) return;
  listening = true;

  note(box, "주문을 불러오는 중…");
  // 브라우저가 기억하는 로그인을 다 읽은 뒤에 - 누구인지 확인된 다음에야 듣기 시작한다
  await auth.authStateReady();
  const user = auth.currentUser;
  // 로그인하지 않았으면 듣지 않는다 (auth.js 가 로그인 화면으로 돌려보낸다)
  if (!user) return;

  // 내 주문만 - 거르는 일을 Firestore 쿼리가 한다. 정렬(orderBy)은 넣지 않는다
  // 듣기와 「다시 확인」이 같은 쿼리를 쓴다
  const q = query(collection(db, "orders"), where("userId", "==", user.uid));
  // onSnapshot 이 돌려준 함수 - 부르면 그만 듣는다
  const stop = onSnapshot(
    q,
    snap => {
      console.log("[주문 알림] 주문 " + snap.size + "건을 받았습니다");
      paintOrders(box, snap.docs);

      // 주문이 전부 끝났으면(delivered · canceled) 더 바뀔 일이 없으니 그만 듣는다
      // 주문이 한 건도 없을 때는 새 주문이 들어올 수 있으니 계속 듣는다
      const allDone = snap.size > 0 && snap.docs.every(d => DONE.includes(d.data().status));
      if (!allDone) return;
      stop();
      console.log("[그만 듣기] 주문 " + snap.size + "건이 모두 끝나 리스너를 해제했습니다");
      showStopped(box, q);
    },
    err => {
      // 오류 글은 줄이지 않고 화면에 그대로 보여 준다
      console.error(err);
      note(box, "주문을 불러오지 못했습니다.\n" + errorText(err));
    }
  );
}

listenOrders();
