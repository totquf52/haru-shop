/* --- 상품 (Firestore) ---
   상품 목록과 상품 상세의 이름 · 가격 · 한 줄 소개 · 재고를 Firestore 의 products 컬렉션에서 읽어 온다.
   문서 ID 는 shop.js 의 id(p1~p6)와 같다. 긴 설명(detail)과 그림(emoji)은 shop.js 것을 그대로 쓴다.
   화면을 그리는 일은 app.js 의 paintList · paintDetail 이 한다. */
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getFirestore, collection, doc, getDocs, getDoc, writeBatch, serverTimestamp, query, where, orderBy, limit, startAfter } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

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

/* --- 상품 목록 ---
   more 가 참이면 「더 보기」 - 지금 보이는 마지막 상품 다음부터 둘을 더 가져와 아래에 이어 붙인다 */
// 지금 보이는 마지막 상품의 문서 (다음 둘을 어디서부터 가져올지 Firestore 에 알려 준다)
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
    // 숨기지 않은 상품만 · 가격이 싼 것부터 · 둘만 - 거르고 줄 세우고 자르는 일을 Firestore 쿼리가 한다
    // 받은 문서 수가 곧 읽은 문서 수
    const snap = await getDocs(query(
      collection(db, "products"),
      where("isVisible", "==", true),
      orderBy("price"),
      // 더 보기일 때만 - 지금 보이는 마지막 상품 다음부터
      ...(lastDoc ? [startAfter(lastDoc)] : []),
      limit(2)
    ));
    paintList(snap.docs.map(toProduct), more);
    reads += snap.size;
    showReads(reads);
    if (snap.size) lastDoc = snap.docs[snap.size - 1];
    // 둘을 다 채우지 못했으면 더 가져올 것이 없다
    if (moreBox) moreBox.hidden = snap.size < 2;
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

/* --- 상품 상세 --- */
async function loadDetail() {
  const box = document.querySelector("#product-detail");
  if (!box) return;

  const id = qs("id");
  if (!id) { paintDetail(null); showReads(0); return; }

  try {
    // 주소의 id 와 같은 문서 한 장만 읽는다
    const snap = await getDoc(doc(db, "products", id));
    paintDetail(snap.exists() ? toProduct(snap) : null);
    showReads(snap.exists() ? 1 : 0);
  } catch (err) {
    showError(box, err);
    showReads(0);
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
