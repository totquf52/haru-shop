/* --- 내 주문 (Firestore · 실시간) ---
   마이페이지의 「내 주문」 목록을 Firestore 의 orders 컬렉션에서 실시간으로 듣는다.
   로그인한 사람의 UID 와 userId 가 같은 주문만 쿼리로 고른다.
   로그인 상태를 지켜보는 일은 auth.js 가 한다 - 여기서는 확인이 끝나기를 기다렸다가 한 번만 건다. */
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getFirestore, collection, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
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

// 주문 한 건을 한 줄로 그린다 - 주문한 날 · 상품 이름 · 합계 · status 값 그대로
function orderRow(order) {
  const li = document.createElement("li");
  li.style.cssText = "display:flex;gap:16px;align-items:baseline;padding:12px 0;border-bottom:1px solid var(--line, #e5e0d8)";

  const day = document.createElement("span");
  day.textContent = dayText(order.createdAt);
  day.style.cssText = "font-size:13px;color:var(--sub)";

  const name = document.createElement("span");
  name.textContent = (order.items || []).map(item => item.name).join(", ");
  name.style.cssText = "flex:1";

  const total = document.createElement("span");
  total.textContent = Number(order.totalPrice).toLocaleString("ko-KR") + "원";

  const status = document.createElement("span");
  status.textContent = order.status;
  status.style.cssText = "font-weight:700";

  li.append(day, name, total, status);
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

// 로그인한 사람의 주문만 듣는다 - 리스너는 여기 한 군데서만 건다
function listenMyOrders(uid) {
  const myOrders = query(collection(db, "orders"), where("userId", "==", uid));
  onSnapshot(myOrders, (snapshot) => {
    console.log("[주문 알림] 내 주문 " + snapshot.size + "건을 받았습니다");
    const orders = [];
    snapshot.forEach((doc) => orders.push({ id: doc.id, ...doc.data() }));
    paintOrders(orders);
  }, (err) => {
    console.error(err);
    const empty = document.querySelector("#my-orders-empty");
    if (empty) { empty.hidden = false; empty.textContent = "주문을 불러오지 못했습니다"; }
  });
}

// 로그인한 사람이 누구인지 확인된 뒤에 듣기 시작한다
if (document.querySelector("#my-orders")) {
  auth.authStateReady().then(() => {
    const user = auth.currentUser;
    if (user) listenMyOrders(user.uid);
  });
}
