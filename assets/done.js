/* --- 주문 완료 (결제 결과 받기) ---
   결제 결과는 이 화면 한 곳에서만 받는다. 주소 뒤에 붙은 paymentId · code · message 를 읽는다.
   - PC : 결제 화면이 결제창의 결과를 주소 뒤에 붙여 넘긴다
   - 휴대폰 : 포트원 결제창이 redirectUrl(이 화면) 뒤에 붙여 넘긴다
   code 가 있으면 실패나 닫기 - 주문을 만들지 않고 장바구니도 그대로 둔다.
   code 가 없고 paymentId 가 있으면 성공 - 로그인한 사람이면 paymentId 를 문서 ID 로 orders 에 주문 한 장을 쓴다.
   paymentId 도 code 도 없으면 아무것도 하지 않는다. */
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getFirestore, doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
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

// 오류 글을 줄이지 않고 그대로 적는다 (오류 코드가 글에 없으면 뒤에 붙인다)
function errorText(err) {
  const text = String(err);
  return err && err.code && !text.includes(err.code) ? text + " (" + err.code + ")" : text;
}

const paymentId = qs("paymentId");
const code = qs("code");
const message = qs("message");

const title = document.querySelector("#done-title");
const prose = document.querySelector("#done-prose");
const note = document.querySelector("#done-result");

// 결과에 맞는 글만 보여 준다 - 「주문이 접수되었습니다」와 안내 글은 주문을 다 쓴 뒤에만 보인다
function showOnly(text, ok) {
  title.hidden = !ok;
  prose.hidden = !ok;
  note.textContent = text;
}

async function receive() {
  // 주소에 아무것도 없으면 아무것도 만들지 않는다
  if (!paymentId && !code) return;

  // 실패나 닫기 - 받은 message 를 그대로 보여 준다
  if (code) {
    showOnly((message || "") + "\n장바구니는 그대로입니다", false);
    return;
  }

  // 성공 - 로그인한 사람만 주문을 만든다
  showOnly("주문을 적는 중…", false);
  try {
    // 브라우저가 기억하는 로그인을 다 읽은 뒤에 묻는다
    await auth.authStateReady();
    const user = auth.currentUser;
    if (!user) { showOnly("로그인한 뒤에 다시 열어 주세요", false); return; }

    // 장바구니에 든 상품 (장바구니 화면처럼 없는 상품은 뺀다) - 장바구니를 비우기 전에 읽어 둔다
    const lines = Cart.read().filter(i => findProduct(i.id));
    // 「바로 주문」이 만드는 주문과 같은 모양
    const items = lines.map(i => {
      const p = findProduct(i.id);
      return { productId: p.id, name: p.name, price: p.price, quantity: i.qty };
    });
    const totalPrice = Cart.total();

    // 주문 문서 한 장 - 문서 ID 는 paymentId, 필드는 여섯 개
    await setDoc(doc(db, "orders", paymentId), {
      userId: user.uid,
      items,
      totalPrice,
      status: "paid",
      // 주문 시각 - 서버 시계로 적는다
      createdAt: serverTimestamp(),
      paymentId
    });

    Cart.clear();
    // 머리글의 장바구니 숫자도 비운 대로 적는다
    document.querySelectorAll(".cart-count").forEach(el => { el.textContent = Cart.count(); });
    showOnly("결제 ID: " + paymentId, true);

    // ▼ 「결제를 마쳤다」(purchase) - 결제가 성공하고 주문 문서를 다 쓴 순간
    // 통로가 이미 있으면 그대로 쓰고, 없을 때만 새로 만든다
    window.dataLayer = window.dataLayer || [];
    // 앞에서 넣은 상품 값이 섞이지 않게 먼저 비운다
    dataLayer.push({ ecommerce: null });
    // 통로 끝에 한 덩어리를 넣는다 - 넣는 순간이 태그 관리자가 듣는 순간
    dataLayer.push({
      // 무슨 일이 일어났나 - 계획서 이름 글자 그대로
      event: "purchase",
      // 같이 보내는 상품 값 묶음
      ecommerce: {
        // 주문 번호 - 결제 ID 그대로
        transaction_id: paymentId,
        // 어느 나라 돈인가
        currency: "KRW",
        // 금액 - 주문한 상품 합계 (상품 가격 × 수량의 합, 배송비 없음)
        value: totalPrice,
        // 주문한 상품마다 상자 하나씩 목록에 넣는다
        items: items.map(i => ({ item_id: i.productId, item_name: i.name, price: i.price, quantity: i.quantity }))
      }
    });
  } catch (err) {
    // 오류 글은 줄이지 않고 화면에 그대로 보여 준다
    console.error(err);
    showOnly("주문을 적지 못했습니다.\n" + errorText(err), false);
  }
}

receive();
