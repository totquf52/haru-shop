/* --- 상품 (Firestore) ---
   상품 목록과 상품 상세의 이름 · 가격 · 한 줄 소개 · 재고를 Firestore 의 products 컬렉션에서 읽어 온다.
   문서 ID 는 shop.js 의 id(p1~p6)와 같다. 긴 설명(detail)과 그림(emoji)은 shop.js 것을 그대로 쓴다.
   화면을 그리는 일은 app.js 의 paintList · paintDetail 이 한다.
   상품 상세의 「바로 주문」도 이 파일이 한다 - 재고 확인 · 재고 차감 · 주문 문서 쓰기를 한 트랜잭션으로 묶는다. */
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getFirestore, collection, doc, getDocs, getDoc, writeBatch, runTransaction, serverTimestamp, query, where, orderBy, limit, startAfter } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { getStorage, ref, getDownloadURL } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-storage.js";

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
// 「바로 주문」을 누른 사람이 누구인지 읽는다 (로그인 상태를 지켜보는 일은 auth.js 가 한다)
const auth = getAuth(app);
// 상품 사진이 있는 버킷 - 설정의 storageBucket 값 그대로
const storage = getStorage(app);

// 「상품 올리기」가 올리는 다섯 장 - 재고와 보이기 값 (이름 · 가격 · 한 줄 소개는 shop.js 에서 읽는다)
const SEED = [
  { id: "p2", stock: 30, isVisible: true },
  { id: "p3", stock: 8, isVisible: true },
  { id: "p4", stock: 0, isVisible: true },
  { id: "p5", stock: 5, isVisible: false },
  { id: "p6", stock: 40, isVisible: true }
];

// Firestore 문서 한 장에 shop.js 의 그림과 긴 설명을 붙인다
function toProduct(snap) {
  const d = snap.data();
  const local = findProduct(snap.id) || {};
  return {
    id: snap.id,
    name: d.name,
    price: Number(d.price),
    summary: d.summary,
    stock: Number(d.stock),
    // 상품 사진이 있는 Storage 경로 (예: products/p1/main.jpg). 사진이 없는 상품은 빈 글자
    imagePath: d.imagePath || "",
    emoji: local.emoji || "",
    detail: local.detail || []
  };
}

// 오류 글을 줄이지 않고 그대로 적는다 (오류 코드가 글에 없으면 뒤에 붙인다)
function errorText(err) {
  const text = String(err);
  return err && err.code && !text.includes(err.code) ? text + " (" + err.code + ")" : text;
}

function showReads(n) {
  const line = document.querySelector("#read-count");
  if (line) line.textContent = "이번 화면에서 읽은 문서 " + n + "장";
}

function showError(box, err) {
  const p = document.createElement("p");
  p.className = "empty";
  p.style.cssText = "white-space:pre-wrap;overflow-wrap:anywhere";
  p.textContent = "상품을 불러오지 못했습니다.\n" + errorText(err);
  box.replaceChildren(p);
}

/* --- 상품 사진 ---
   방금 그린 카드 가운데 imagePath 가 있는 상품만, 그 경로로 다운로드 URL 을 받아 그림 글자 자리에 사진을 넣는다.
   imagePath 가 없거나 사진을 받지 못하면 그림 글자 그대로 둔다.
   Storage 에 묻는 일이라 Firestore 읽은 문서 수(reads)에는 더하지 않는다. */
function showPhotos(items) {
  const box = document.querySelector("#product-list");
  if (!box) return;

  // 방금 그린 카드는 목록 맨 뒤의 items.length 장
  const cards = items.length ? Array.from(box.querySelectorAll("a.card")).slice(-items.length) : [];
  items.forEach((p, i) => {
    if (!p.imagePath) return;
    const thumb = cards[i] && cards[i].querySelector(".thumb");
    if (!thumb) return;

    getDownloadURL(ref(storage, p.imagePath)).then(url => {
      const img = document.createElement("img");
      img.alt = p.name;
      img.style.cssText = "display:block;width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:8px";
      // 사진을 다 받은 뒤에 그림 글자와 바꾼다 (못 받으면 그림 글자가 남는다)
      img.addEventListener("load", () => thumb.replaceChildren(img));
      img.src = url;
    }).catch(err => {
      // 오류 글은 줄이지 않고 콘솔에 그대로 찍는다
      console.error(err);
    });
  });
}

/* --- 상품 목록 ---
   more 가 참이면 「더 보기」 - 지금 보이는 마지막 상품 다음부터 셋을 더 가져와 아래에 이어 붙인다 */
// 지금 보이는 마지막 상품의 문서 (다음 셋을 어디서부터 가져올지 Firestore 에 알려 준다)
let lastDoc = null;
// 이 화면을 그리려고 지금까지 읽은 문서 수
let reads = 0;

async function loadList(more) {
  const box = document.querySelector("#product-list");
  if (!box) return;

  const moreBox = document.querySelector("#more-box");
  const moreNote = document.querySelector("#more-result");
  if (moreNote) moreNote.textContent = "";
  // 처음부터 다시 그릴 때는 자리와 숫자를 비운다
  if (!more) { lastDoc = null; reads = 0; }

  try {
    // 숨기지 않은 상품만 · 가격이 싼 것부터 · 셋만 - 거르고 줄 세우고 자르는 일을 Firestore 쿼리가 한다
    // 받은 문서 수가 곧 읽은 문서 수
    const snap = await getDocs(query(
      collection(db, "products"),
      where("isVisible", "==", true),
      orderBy("price"),
      // 더 보기일 때만 - 지금 보이는 마지막 상품 다음부터
      ...(lastDoc ? [startAfter(lastDoc)] : []),
      limit(3)
    ));
    const items = snap.docs.map(toProduct);
    paintList(items, more);
    // 사진은 기다리지 않는다 - 주소를 받는 대로 카드에 넣는다
    showPhotos(items);
    reads += snap.size;
    showReads(reads);
    if (snap.size) lastDoc = snap.docs[snap.size - 1];
    // 셋을 다 채우지 못했으면 더 가져올 것이 없다
    if (moreBox) moreBox.hidden = snap.size < 3;
  } catch (err) {
    // 오류 글은 줄이지 않고 콘솔에 그대로 찍고, 화면에는 한 줄만 보여 준다
    console.error(err);
    if (more) {
      // 이미 보이는 목록은 그대로 두고 단추 아래에 적는다
      if (moreNote) moreNote.textContent = "목록을 불러오지 못했습니다";
      return;
    }
    const p = document.createElement("p");
    p.className = "empty";
    p.textContent = "목록을 불러오지 못했습니다";
    box.replaceChildren(p);
    if (moreBox) moreBox.hidden = true;
    showReads(0);
  }
}

/* --- 상세 화면 사진 ---
   imagePath 가 있으면 목록과 같은 방법으로 다운로드 URL 을 받아 그림 글자 칸에 사진을 넣는다.
   칸 크기는 그림 글자 칸 그대로 두고 사진이 그 칸을 채운다 (object-fit: cover).
   imagePath 가 없거나 사진을 받지 못하면 그림 글자 그대로 둔다.
   Storage 에 묻는 일이라 Firestore 읽은 문서 수(reads)에는 더하지 않는다. */
function showDetailPhoto(box, p) {
  if (!p.imagePath) return;
  const thumb = box.querySelector(".thumb");
  if (!thumb) return;

  getDownloadURL(ref(storage, p.imagePath)).then(url => {
    const img = document.createElement("img");
    img.alt = p.name;
    img.style.cssText = "display:block;width:100%;height:100%;object-fit:cover";
    // 사진을 다 받은 뒤에 그림 글자와 바꾼다 (못 받으면 그림 글자가 남는다)
    img.addEventListener("load", () => {
      // 그림 글자 칸의 지금 높이를 그대로 지킨다
      const h = thumb.offsetHeight;
      thumb.style.height = h + "px";
      thumb.style.padding = "0";
      thumb.style.overflow = "hidden";
      thumb.replaceChildren(img);
    });
    img.src = url;
  }).catch(err => {
    // 오류 글은 줄이지 않고 콘솔에 그대로 찍는다
    console.error(err);
  });
}

/* --- 상품 상세 --- */
async function loadDetail() {
  const box = document.querySelector("#product-detail");
  if (!box) return;

  const id = qs("id");
  if (!id) { paintDetail(null); showReads(0); return; }

  try {
    // 주소의 id 와 같은 문서 한 장만 읽는다
    const snap = await getDoc(doc(db, "products", id));
    const item = snap.exists() ? toProduct(snap) : null;
    paintDetail(item);
    // 사진은 기다리지 않는다 - 주소를 받는 대로 그림 글자 자리에 넣는다
    if (item) showDetailPhoto(box, item);
    if (snap.exists()) addOrderButton(box, id);
    showReads(snap.exists() ? 1 : 0);
  } catch (err) {
    showError(box, err);
    showReads(0);
  }
}

/* --- 바로 주문 ---
   「장바구니에 담기」 옆에 단추를 하나 붙인다. 장바구니 · 결제 화면을 거치지 않는다.
   dataLayer 에는 아무것도 보내지 않는다. */
function addOrderButton(box, id) {
  const cartBtn = box.querySelector("#add-to-cart");
  if (!cartBtn) return;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn ghost";
  btn.id = "order-now";
  btn.style.marginLeft = "8px";
  btn.textContent = "바로 주문";

  const note = document.createElement("p");
  note.id = "order-result";
  note.style.cssText = "margin:12px 0 0;white-space:pre-wrap;overflow-wrap:anywhere";

  cartBtn.after(btn, note);
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    await orderNow(box, id, note);
    btn.disabled = false;
  });
}

async function orderNow(box, id, note) {
  note.textContent = "주문하는 중…";
  try {
    // 브라우저가 기억하는 로그인을 다 읽은 뒤에 묻는다
    await auth.authStateReady();
    const user = auth.currentUser;
    if (!user) { note.textContent = "로그인이 필요합니다"; return; }

    const productRef = doc(db, "products", id);
    // 재고 확인 · 재고 차감 · 주문 문서 쓰기 - 둘 다 실행되거나 둘 다 실행되지 않는다
    // 돌려주는 값은 주문 뒤에 남은 재고. 재고가 모자라면 아무것도 쓰지 않고 null
    const left = await runTransaction(db, async tx => {
      const snap = await tx.get(productRef);
      if (!snap.exists()) throw new Error("상품 문서가 없습니다 (products/" + id + ")");

      const d = snap.data();
      if (!(typeof d.stock === "number" && d.stock >= 1)) return null;
      // 주문 문서의 price 는 숫자여야 한다 - 상품 문서 값이 숫자가 아니면 바꿔 적지 않고 멈춘다
      if (typeof d.price !== "number") throw new Error("상품 문서의 price 가 숫자가 아닙니다: " + JSON.stringify(d.price));

      const quantity = 1;
      tx.update(productRef, { stock: d.stock - 1 });
      // 주문 문서 한 장 - 자동 ID, 필드는 다섯 개
      tx.set(doc(collection(db, "orders")), {
        userId: user.uid,
        // 이름과 가격은 방금 트랜잭션 안에서 읽은 상품 문서 값
        items: [{ productId: id, name: d.name, price: d.price, quantity }],
        totalPrice: d.price * quantity,
        status: "paid",
        // 주문 시각 - 서버 시계로 적는다
        createdAt: serverTimestamp()
      });
      return d.stock - 1;
    });

    if (left === null) { note.textContent = "재고가 없습니다"; return; }
    note.textContent = "주문했습니다.";
    // 줄어든 재고를 화면에도 적는다
    const stockLine = box.querySelector(".stock");
    if (stockLine) stockLine.textContent = stockText(left);
  } catch (err) {
    // 오류 글은 줄이지 않고 화면에 그대로 보여 준다
    console.error(err);
    note.textContent = "주문하지 못했습니다.\n" + errorText(err);
  }
}

/* --- 상품 올리기 ---
   shop.js 의 p2~p6 을 한 묶음(batch)으로 올린다 - 다섯 장이 다 올라가거나 하나도 안 올라간다.
   p1 은 묶음에 넣지 않는다. */
async function seedProducts(btn, note) {
  btn.disabled = true;
  note.textContent = "올리는 중…";
  try {
    const batch = writeBatch(db);
    SEED.forEach(s => {
      const p = findProduct(s.id);
      batch.set(doc(db, "products", s.id), {
        name: p.name,
        price: p.price,
        summary: p.summary,
        stock: s.stock,
        isVisible: s.isVisible,
        // 올린 시각 - 서버 시계로 적는다
        createdAt: serverTimestamp()
      });
    });
    await batch.commit();
    note.textContent = "상품 " + SEED.length + "장을 올렸습니다 (" + SEED.map(s => s.id).join(" · ") + ").";
  } catch (err) {
    note.textContent = "올리지 못했습니다. 한 장도 올라가지 않았습니다.\n" + errorText(err);
    btn.disabled = false;
    return;
  }
  btn.disabled = false;
  // 올라간 상품이 보이게 목록을 다시 읽는다
  await loadList();
}

const seedBtn = document.querySelector("#btn-seed");
const seedNote = document.querySelector("#seed-result");
if (seedBtn && seedNote) seedBtn.addEventListener("click", () => seedProducts(seedBtn, seedNote));

const moreBtn = document.querySelector("#btn-more");
if (moreBtn) moreBtn.addEventListener("click", async () => {
  moreBtn.disabled = true;
  await loadList(true);
  moreBtn.disabled = false;
});

const loading = document.querySelector("#product-list, #product-detail");
if (loading) loading.innerHTML = '<p class="empty">상품을 불러오는 중…</p>';

loadList();
loadDetail();
