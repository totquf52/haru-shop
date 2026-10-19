/* ===========================================================
   하루살림 — 화면을 그리고 장바구니를 다루는 코드
   이 파일은 고치지 않아도 됩니다. (상품은 shop.js 에 있습니다)
   =========================================================== */

const won = n => n.toLocaleString("ko-KR") + "원";
const findProduct = id => PRODUCTS.find(p => p.id === id);
const qs = key => new URLSearchParams(location.search).get(key);
// Firestore 에서 읽어 온 글자를 화면에 넣기 전에 태그로 읽히지 않게 바꾼다
const esc = t => String(t ?? "").replace(/[&<>"']/g, c => "&#" + c.charCodeAt(0) + ";");
// 재고 한 줄 - 0이면 「품절」
const stockText = n => n > 0 ? "재고 " + n + "개" : "품절";

/* --- 장바구니는 브라우저에 저장합니다 --- */
const Cart = {
  read() {
    try { return JSON.parse(localStorage.getItem("haru_cart") || "[]"); }
    catch (e) { return []; }
  },
  write(items) {
    localStorage.setItem("haru_cart", JSON.stringify(items));
  },
  add(id) {
    const items = Cart.read();
    const hit = items.find(i => i.id === id);
    if (hit) hit.qty += 1;
    else items.push({ id, qty: 1 });
    Cart.write(items);

    // ▼ 여기에 「장바구니에 담았다」를 알리는 코드가 들어갑니다 (뒤 수업에서)
    // 담은 상품의 이름과 가격을 상품 목록에서 찾아 온다
    const p = findProduct(id);
    // 통로가 이미 있으면 그대로 쓰고, 없을 때만 새로 만든다
    window.dataLayer = window.dataLayer || [];
    // 앞에서 넣은 상품 값이 섞이지 않게 먼저 비운다
    dataLayer.push({ ecommerce: null });
    // 통로 끝에 한 덩어리를 넣는다 - 넣는 순간이 태그 관리자가 듣는 순간
    dataLayer.push({
      // 무슨 일이 일어났나 - 계획서 이름 글자 그대로
      event: "add_to_cart",
      // 같이 보내는 상품 값 묶음
      ecommerce: {
        // 어느 나라 돈인가
        currency: "KRW",
        // 금액 - 한 번 누르면 한 개라 그 상품 가격 하나
        value: p.price,
        // 담은 상품 상자 하나를 목록에 넣는다
        items: [{ item_id: p.id, item_name: p.name, price: p.price, quantity: 1 }]
      }
    });

  },
  remove(id) {
    Cart.write(Cart.read().filter(i => i.id !== id));
  },
  clear() {
    localStorage.removeItem("haru_cart");
  },
  count() {
    return Cart.read().reduce((sum, i) => sum + i.qty, 0);
  },
  total() {
    return Cart.read().reduce((sum, i) => {
      const p = findProduct(i.id);
      return sum + (p ? p.price * i.qty : 0);
    }, 0);
  }
};

/* --- 머리글과 꼬리글 --- */
function paintChrome() {
  // 화면마다 제목이 달라야 검색에서 구분됩니다.
  // 그래서 제목을 통째로 바꾸지 않고 가게 이름만 갈아 끼웁니다.
  document.title = document.title.replaceAll("하루살림", SHOP.name);

  const brand = document.querySelector(".brand");
  if (brand) brand.textContent = SHOP.name;

  const badge = document.querySelector(".cart-count");
  if (badge) badge.textContent = Cart.count();

  const foot = document.querySelector("footer.site .wrap");
  if (foot) foot.textContent = SHOP.name + " · " + SHOP.tagline;
}

/* --- 첫 화면 머리 --- */
function paintHero() {
  const title = document.querySelector("#hero-title");
  if (!title) return;

  title.textContent = SHOP.name;
  document.querySelector("#hero-tagline").textContent = SHOP.tagline;
}

/* --- 상품 목록 ---
   items 는 assets/products.js 가 Firestore 에서 읽어 와 넘겨준다
   (이름 · 가격 · 한 줄 소개 · 재고는 Firestore, 그림은 shop.js)
   append 가 참이면 이미 그린 카드 아래에 이어 붙인다 (「더 보기」) */
function paintList(items, append) {
  const box = document.querySelector("#product-list");
  if (!box) return;

  const cards = items.map(p => `
    <a class="card" href="product.html?id=${encodeURIComponent(p.id)}">
      <div class="thumb">${p.emoji}</div>
      <h3>${esc(p.name)}</h3>
      <p class="sum">${esc(p.summary)}</p>
      <div class="price">${won(p.price)}</div>
      <div class="stock">${stockText(p.stock)}</div>
    </a>`).join("");

  if (append) box.insertAdjacentHTML("beforeend", cards);
  else box.innerHTML = cards;
}

/* --- 상품 상세 ---
   p 는 assets/products.js 가 Firestore 에서 읽어 와 넘겨준다. 문서가 없으면 null
   (이름 · 가격 · 한 줄 소개 · 재고는 Firestore, 그림과 긴 설명은 shop.js) */
function paintDetail(p) {
  const box = document.querySelector("#product-detail");
  if (!box) return;

  if (!p) { box.innerHTML = '<p class="empty">그런 상품이 없습니다.</p>'; return; }

  document.title = p.name + " — " + SHOP.name;
  box.innerHTML = `
    <div class="thumb">${p.emoji}</div>
    <div>
      <h1>${esc(p.name)}</h1>
      <p class="sum">${esc(p.summary)}</p>
      <p class="stock">${stockText(p.stock)}</p>
      <div class="price">${won(p.price)}</div>
      <div class="body prose">${p.detail.map(t => `<p>${t}</p>`).join("")}</div>
      <button class="btn" id="add-to-cart">장바구니에 담기</button>
    </div>`;

  // ▼ 「상품을 보았다」(view_item) - 상품 상세 화면이 열린 순간
  // 통로가 이미 있으면 그대로 쓰고, 없을 때만 새로 만든다
  window.dataLayer = window.dataLayer || [];
  // 앞에서 넣은 상품 값이 섞이지 않게 먼저 비운다
  dataLayer.push({ ecommerce: null });
  // 통로 끝에 한 덩어리를 넣는다 - 넣는 순간이 태그 관리자가 듣는 순간
  dataLayer.push({
    // 무슨 일이 일어났나 - 계획서 이름 글자 그대로
    event: "view_item",
    // 같이 보내는 상품 값 묶음
    ecommerce: {
      // 어느 나라 돈인가
      currency: "KRW",
      // 금액 - 보고 있는 상품 하나의 가격
      value: p.price,
      // 보고 있는 상품 상자 하나를 목록에 넣는다
      items: [{ item_id: p.id, item_name: p.name, price: p.price, quantity: 1 }]
    }
  });

  document.querySelector("#add-to-cart").addEventListener("click", () => {
    Cart.add(p.id);
    location.href = "cart.html";
  });
}

/* --- 장바구니 --- */
function paintCart() {
  const box = document.querySelector("#cart-box");
  if (!box) return;

  const items = Cart.read();
  if (items.length === 0) {
    box.innerHTML = '<p class="empty">장바구니가 비어 있습니다.</p>';
    return;
  }

  box.innerHTML = `
    <table class="cart">
      <tr><th>상품</th><th>수량</th><th>금액</th><th></th></tr>
      ${items.map(i => {
        const p = findProduct(i.id);
        if (!p) return "";
        return `<tr>
          <td>${p.emoji} ${p.name}</td>
          <td>${i.qty}</td>
          <td>${won(p.price * i.qty)}</td>
          <td><button class="btn ghost drop" data-id="${p.id}">빼기</button></td>
        </tr>`;
      }).join("")}
    </table>
    <div class="total">합계 ${won(Cart.total())}</div>
    <a class="btn" href="checkout.html">결제하기</a>`;

  box.querySelectorAll(".drop").forEach(b => {
    b.addEventListener("click", () => { Cart.remove(b.dataset.id); location.reload(); });
  });
}

/* --- 결제 --- */
function paintCheckout() {
  const form = document.querySelector("#pay-form");
  if (!form) return;

  // ▼ 여기에 「결제를 시작했다」를 알리는 코드가 들어갑니다 (뒤 수업에서)
  // ▼ 「결제를 시작했다」(begin_checkout) - 결제 화면이 열린 순간
  // 결제 화면이 열린 순간의 장바구니 합계 (상품 가격 × 수량의 합, 배송비 없음)
  const checkoutTotal = Cart.total();
  // 통로가 이미 있으면 그대로 쓰고, 없을 때만 새로 만든다
  window.dataLayer = window.dataLayer || [];
  // 앞에서 넣은 상품 값이 섞이지 않게 먼저 비운다
  dataLayer.push({ ecommerce: null });
  // 통로 끝에 한 덩어리를 넣는다 - 넣는 순간이 태그 관리자가 듣는 순간
  dataLayer.push({
    // 무슨 일이 일어났나 - 계획서 이름 글자 그대로
    event: "begin_checkout",
    // 무료배송인가 - 합계가 5만 원 이상이면 yes, 아니면 no (ecommerce 밖)
    free_shipping: checkoutTotal >= 50000 ? "yes" : "no",
    // 같이 보내는 상품 값 묶음
    ecommerce: {
      // 어느 나라 돈인가
      currency: "KRW",
      // 금액 - 장바구니 상품 합계
      value: checkoutTotal,
      // 장바구니에 담긴 상품마다 상자 하나씩 목록에 넣는다 (장바구니 화면처럼 없는 상품은 뺀다)
      items: Cart.read().filter(i => findProduct(i.id)).map(i => {
        const p = findProduct(i.id);
        return { item_id: p.id, item_name: p.name, price: p.price, quantity: i.qty };
      })
    }
  });

  const sum = document.querySelector("#pay-total");
  if (sum) sum.textContent = won(Cart.total());

  form.addEventListener("submit", e => {
    e.preventDefault();

    // ▼ 여기에 「결제를 마쳤다」를 알리는 코드가 들어갑니다 (뒤 수업에서)
    // ▼ 「결제를 마쳤다」(purchase) - 「결제하기」를 눌러 주문 완료로 넘어가는 순간
    // 장바구니를 비우는 줄보다 앞이라 주문한 상품 값을 아직 읽을 수 있다
    // 주문 번호 - 누른 순간의 시각(1000분의 1초)과 무작위 글자를 이어 붙인다
    const transactionId = "HARU-" + Date.now() + "-" + Math.random().toString(36).slice(2, 10);
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
        // 주문 번호
        transaction_id: transactionId,
        // 어느 나라 돈인가
        currency: "KRW",
        // 금액 - 주문한 상품 합계 (상품 가격 × 수량의 합, 배송비 없음)
        value: Cart.total(),
        // 주문한 상품마다 상자 하나씩 목록에 넣는다 (장바구니 화면처럼 없는 상품은 뺀다)
        items: Cart.read().filter(i => findProduct(i.id)).map(i => {
          const p = findProduct(i.id);
          return { item_id: p.id, item_name: p.name, price: p.price, quantity: i.qty };
        })
      }
    });

    // ▼ 포트원 결제창(테스트) 열기 - 주문 문서·장바구니 비우기·주문 완료 화면 이동은 아직 하지 않는다
    // 결제 번호 - 주문 번호와 같은 방식 (누른 순간의 시각과 무작위 글자)
    const paymentId = "HARU-" + Date.now() + "-" + Math.random().toString(36).slice(2, 10);
    // 주문 이름 - 첫 상품 이름 뒤에 「외 N건」 (N 은 나머지 상품 종류 수, 없는 상품은 뺀다)
    const lines = Cart.read().filter(i => findProduct(i.id));
    const firstName = lines.length ? findProduct(lines[0].id).name : "";
    const orderName = lines.length > 1 ? `${firstName} 외 ${lines.length - 1}건` : firstName;

    // 결과를 보여 줄 자리 - 결제하기 아래에 한 번만 만든다
    let out = document.querySelector("#pay-result");
    if (!out) {
      out = document.createElement("pre");
      out.id = "pay-result";
      out.style.whiteSpace = "pre-wrap";
      form.after(out);
    }
    out.textContent = "paymentId: " + paymentId;
    // 받은 글자를 꾸미지 않고 그대로 붙인다
    const show = text => { out.textContent = "paymentId: " + paymentId + "\n" + text; };

    if (!window.PortOne) { show("포트원 SDK 없음"); return; }
    PortOne.requestPayment({
      storeId: "store-521e00f8-15df-4d1e-a374-0482a38b5539",
      channelKey: "channel-key-13abf625-6edb-448b-becf-fab158441ce5",
      paymentId: paymentId,
      orderName: orderName,
      totalAmount: Cart.total(),
      currency: "CURRENCY_KRW",
      payMethod: "CARD"
    })
      .then(res => show(JSON.stringify(res)))
      .catch(err => show(String(err)));
  });
}

/* --- 가게 소개·배송 안내 글 --- */
function paintProse() {
  const about = document.querySelector("#about-body");
  if (about) about.innerHTML = SHOP.about.map(t => `<p>${t}</p>`).join("");

  const ship = document.querySelector("#shipping-body");
  if (ship) ship.innerHTML = SHOP.shipping.map(t => `<p>${t}</p>`).join("");
}

document.addEventListener("DOMContentLoaded", () => {
  paintChrome();
  paintHero();
  // 상품 목록과 상품 상세는 assets/products.js 가 Firestore 에서 읽은 뒤에 그린다
  paintCart();
  paintCheckout();
  paintProse();
});
