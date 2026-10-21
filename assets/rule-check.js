/* --- 규칙 확인 화면 (rule-check.html) ---
   보안 규칙이 무엇을 허용하는지 버튼을 눌러 확인한다. 가게 메뉴에는 넣지 않는다 - 주소를 직접 넣어서 연다.
   버튼 셋
   - 주문 전체 읽기 : orders 를 조건 없이 한 번 읽어 표로 보여 준다
   - 내 주문 금액 고치기 : userId 가 내 UID 인 주문 하나의 totalPrice 만 1 로 바꾼다
   - 상품 가격 0원으로 : products/p1 의 price 만 0 으로 바꾼다
   성공하면 받은 내용이나 바꾼 문서 ID 를, 실패하면 오류 글을 줄이지 않고 그대로 버튼 아래에 적는다. */
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getFirestore, collection, doc, query, where, limit, getDocs, updateDoc } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-functions.js";

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
// 서버 함수 calcOrderTotal (us-central1)
const calcOrderTotal = httpsCallable(getFunctions(app, "us-central1"), "calcOrderTotal");

const checking = document.querySelector("#rule-checking");
const loginLine = document.querySelector("#rule-login");
const panel = document.querySelector("#rule-panel");

// 오류 글을 줄이지 않고 그대로 적는다 (오류 코드가 글에 없으면 뒤에 붙인다)
function errorText(err) {
  const text = String(err);
  return err && err.code && !text.includes(err.code) ? text + " (" + err.code + ")" : text;
}

// 버튼 아래 결과 칸에 글 한 줄
function say(box, text, isError) {
  const p = document.createElement("p");
  p.style.cssText = "margin:0;white-space:pre-wrap;overflow-wrap:anywhere" + (isError ? ";color:#c0392b" : "");
  p.textContent = text;
  box.replaceChildren(p);
}

// 버튼을 누르는 동안 막아 두고, 성공이든 실패든 끝나면 다시 연다 (실패해도 화면이 멈추지 않는다)
function wire(btnId, boxId, run) {
  const btn = document.querySelector(btnId);
  const box = document.querySelector(boxId);
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    say(box, "요청하는 중…");
    try {
      await run(box);
    } catch (err) {
      say(box, "거부 · 실패: " + errorText(err), true);
    }
    btn.disabled = false;
  });
}

/* --- 주문 전체 읽기 ---
   조건 없이 orders 전체를 한 번 읽는다 (「내 것만」 조건을 붙이지 않는다) */
async function readAllOrders(box) {
  const uid = auth.currentUser.uid;
  const snap = await getDocs(collection(db, "orders"));
  const others = snap.docs.filter(d => d.data().userId !== uid).length;

  const summary = document.createElement("p");
  summary.style.cssText = "margin:0 0 10px;font-weight:700";
  summary.textContent = "허용 · 전체 " + snap.size + "건 · 그중 내 UID가 아닌 것 " + others + "건";

  const table = document.createElement("table");
  table.className = "cart";
  const head = document.createElement("tr");
  ["문서 ID", "userId", "totalPrice"].forEach(t => {
    const th = document.createElement("th");
    th.textContent = t;
    head.appendChild(th);
  });
  table.appendChild(head);

  snap.docs.forEach(d => {
    const data = d.data();
    const tr = document.createElement("tr");
    [d.id, data.userId ?? "", data.totalPrice ?? ""].forEach(v => {
      const td = document.createElement("td");
      td.style.overflowWrap = "anywhere";
      td.textContent = String(v);
      tr.appendChild(td);
    });
    table.appendChild(tr);
  });

  box.replaceChildren(summary, table);
}

/* --- 내 주문 금액 고치기 ---
   userId 가 내 UID 인 주문 하나를 찾아 그 문서의 totalPrice 만 1 로 바꾼다 */
async function fixMyOrder(box) {
  const uid = auth.currentUser.uid;
  const snap = await getDocs(query(collection(db, "orders"), where("userId", "==", uid), limit(1)));
  if (snap.empty) {
    say(box, "내 UID 로 된 주문이 없습니다. 바꾼 문서 없음");
    return;
  }
  const target = snap.docs[0];
  await updateDoc(doc(db, "orders", target.id), { totalPrice: 1 });
  say(box, "허용 · 바꾼 문서 ID: " + target.id + " (totalPrice → 1)");
}

/* --- 상품 가격 0원으로 ---
   products/p1 문서의 price 만 0 으로 바꾼다 */
async function priceZero(box) {
  await updateDoc(doc(db, "products", "p1"), { price: 0 });
  say(box, "허용 · 바꾼 문서 ID: p1 (price → 0)");
}

/* --- 서버에게 금액 묻기 ---
   calcOrderTotal 에 productId "p1", quantity 2 를 보낸다 */
async function askTotal(box) {
  const res = await calcOrderTotal({ productId: "p1", quantity: 2 });
  say(box, "totalPrice: " + res.data.totalPrice);
}

/* --- 가격 바꿔 보내기 ---
   같은 요청에 price: 100 을 덧붙여 보낸다 */
async function sendWithPrice(box) {
  const res = await calcOrderTotal({ productId: "p1", quantity: 2, price: 100 });
  say(box, "totalPrice: " + res.data.totalPrice);
}

/* --- 화면 열기 --- */
await auth.authStateReady();
checking.hidden = true;

if (auth.currentUser) {
  document.querySelector("#rule-email").textContent = auth.currentUser.email || "";
  document.querySelector("#rule-uid").textContent = auth.currentUser.uid;
  panel.hidden = false;

  wire("#btn-read-all", "#result-read-all", readAllOrders);
  wire("#btn-fix-my-order", "#result-fix-my-order", fixMyOrder);
  wire("#btn-price-zero", "#result-price-zero", priceZero);
  wire("#btn-ask-total", "#result-ask-total", askTotal);
  wire("#btn-send-price", "#result-send-price", sendWithPrice);
} else {
  loginLine.hidden = false;
}
