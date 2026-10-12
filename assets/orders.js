/* --- 내 주문 (Firestore · 실시간) ---
   마이페이지의 「내 주문」 목록을 Firestore 의 orders 컬렉션에서 실시간으로 듣는다.
   로그인한 사람의 UID 와 userId 가 같은 주문만 쿼리로 고른다.
   로그인 상태를 지켜보는 일은 auth.js 가 한다 - 여기서는 확인이 끝나기를 기다렸다가 한 번만 건다. */
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
const auth = getAuth(app);

// 주문한 날을 「2026. 10. 12.」 처럼 적는다 (아직 시각이 안 찍힌 주문은 빈칸)
function dayText(createdAt) {
  return createdAt && createdAt.toDate ? createdAt.toDate().toLocaleDateString("ko-KR") : "";
}

// status 값마다 손님이 읽는 말 (Firestore 에 저장된 값은 그대로 두고 화면의 말만 바꾼다)
const STATUS_TEXT = {
  paid: "주문 접수",
  preparing: "포장 중",
  shipped: "배송 출발",
  delivered: "도착 완료",
  canceled: "주문 취소됨"
};
// 단계 줄에 들어가는 네 값 - 이 순서대로 간다 (canceled 는 줄에 넣지 않는다)
const STEPS = ["paid", "preparing", "shipped", "delivered"];

// 네 단계를 한 줄로 그리고 지금 단계를 눈에 띄게 표시한다
function stepLine(status) {
  const line = document.createElement("div");
  line.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:8px;font-size:13px;color:var(--sub)";
  STEPS.forEach((step, i) => {
    if (i > 0) {
      const bar = document.createElement("span");
      bar.textContent = "-";
      line.appendChild(bar);
    }
    const dot = document.createElement("span");
    dot.textContent = STATUS_TEXT[step];
    dot.style.cssText = step === status
      ? "padding:2px 10px;border-radius:999px;background:var(--accent);color:#fff;font-weight:700"
      : "padding:2px 10px;border-radius:999px;border:1px solid var(--line)";
    line.appendChild(dot);
  });
  return line;
}

// 주문 한 건을 그린다 - 주문한 날 · 상품 이름 · 합계 · 손님이 읽는 말, 그 아래 단계 줄
function orderRow(order) {
  const li = document.createElement("li");
  li.style.cssText = "padding:12px 0;border-bottom:1px solid var(--line, #e5e0d8)";

  const top = document.createElement("div");
  top.style.cssText = "display:flex;gap:16px;align-items:baseline";

  const day = document.createElement("span");
  day.textContent = dayText(order.createdAt);
  day.style.cssText = "font-size:13px;color:var(--sub)";

  const name = document.createElement("span");
  name.textContent = (order.items || []).map(item => item.name).join(", ");
  name.style.cssText = "flex:1";

  const total = document.createElement("span");
  total.textContent = Number(order.totalPrice).toLocaleString("ko-KR") + "원";

  // 다섯 값이 아닌 값이 들어 있으면 「확인 중」
  const status = document.createElement("span");
  status.textContent = STATUS_TEXT[order.status] || "확인 중";
  status.style.cssText = "font-weight:700";

  top.append(day, name, total, status);
  li.appendChild(top);

  // 단계 줄은 네 값일 때만 그린다 (canceled 와 모르는 값은 말만 보여 준다)
  if (STEPS.includes(order.status)) li.appendChild(stepLine(order.status));
  return li;
}

// 받은 주문 한 벌로 목록을 다시 그린다 (최신순 정렬은 여기서 한다)
function paintOrders(orders) {
  const list = document.querySelector("#my-orders");
  const empty = document.querySelector("#my-orders-empty");
  if (!list) return;

  orders.sort((a, b) => {
    const at = a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : 0;
    const bt = b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : 0;
    return bt - at;
  });

  list.textContent = "";
  orders.forEach(order => list.appendChild(orderRow(order)));
  if (empty) empty.hidden = orders.length > 0;
}

// 더 바뀔 일이 없는 상태 - 내 주문이 전부 이 둘 가운데 하나면 그만 듣는다
const DONE = ["delivered", "canceled"];

// 로그인한 사람의 주문만 듣는다 - 리스너는 여기 한 군데서만 건다
function listenMyOrders(uid) {
  const myOrders = query(collection(db, "orders"), where("userId", "==", uid));
  // onSnapshot 이 돌려준 「끊는 함수」를 받아 둔다
  const unsubscribe = onSnapshot(myOrders, (snapshot) => {
    console.log("[주문 알림] 내 주문 " + snapshot.size + "건을 받았습니다");
    const orders = [];
    snapshot.forEach((doc) => orders.push({ id: doc.id, ...doc.data() }));
    paintOrders(orders);

    // 내 주문이 전부 끝났으면 리스너를 해제하고 안내 한 줄을 보여 준다
    if (orders.length > 0 && orders.every(order => DONE.includes(order.status))) {
      unsubscribe();
      console.log("[그만 듣기] 내 주문이 전부 끝나 리스너를 해제했습니다");
      const stopped = document.querySelector("#my-orders-stopped");
      if (stopped) stopped.hidden = false;
      showRecheck(myOrders);
    }
  }, (err) => {
    console.error(err);
    const empty = document.querySelector("#my-orders-empty");
    if (empty) { empty.hidden = false; empty.textContent = "주문을 불러오지 못했습니다"; }
  });
}

// 리스너를 해제한 뒤에만 「다시 확인」 버튼을 보여 준다
// 누르면 같은 쿼리로 한 번만 읽어 와서 다시 그린다 - 리스너는 다시 걸지 않는다
function showRecheck(myOrders) {
  const btn = document.querySelector("#my-orders-recheck");
  if (!btn) return;
  btn.hidden = false;
  btn.onclick = async () => {
    btn.disabled = true;
    const snapshot = await getDocs(myOrders);
    const orders = [];
    snapshot.forEach((doc) => orders.push({ id: doc.id, ...doc.data() }));
    paintOrders(orders);
    btn.disabled = false;
  };
}

// 로그인한 사람이 누구인지 확인된 뒤에 듣기 시작한다
if (document.querySelector("#my-orders")) {
  auth.authStateReady().then(() => {
    const user = auth.currentUser;
    if (user) listenMyOrders(user.uid);
  });
}
