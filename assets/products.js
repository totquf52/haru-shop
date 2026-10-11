/* --- 상품을 Firestore 에서 읽어 온다 ---
   이름 · 가격 · 한 줄 소개 · 재고는 products 컬렉션에서 읽는다.
   긴 설명(detail)과 그림(emoji)은 지금처럼 shop.js 에서 읽는다. */
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { getFirestore, collection, doc, getDocs, getDoc, writeBatch, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

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

// 재고 한 줄 - 0이면 「품절」
const stockLine = n => (n > 0 ? "재고 " + n + "개" : "품절");
// 읽은 문서 수 한 줄
const readLine = n => "이번 화면에서 읽은 문서 " + n + "장";
// 그림은 shop.js 에서 찾는다
const emojiOf = id => { const p = findProduct(id); return p ? p.emoji : ""; };

/* --- 상품 목록 --- */
async function paintListFromFirestore() {
  const box = document.querySelector("#product-list");
  if (!box) return;

  const count = document.createElement("p");
  count.id = "read-count";
  count.className = "lead";
  count.style.margin = "28px 0 0";
  box.after(count);

  try {
    // products 의 문서를 여러 장 읽어 온다
    const snapshot = await getDocs(collection(db, "products"));
    box.innerHTML = snapshot.docs.map(d => {
      const p = d.data();
      return `
    <a class="card" href="product.html?id=${d.id}">
      <div class="thumb">${emojiOf(d.id)}</div>
      <h3>${p.name}</h3>
      <p class="sum">${p.summary}</p>
      <div class="price">${won(p.price)}</div>
      <div class="stock" style="color:var(--sub);font-size:13.5px;margin-top:4px">${stockLine(p.stock)}</div>
    </a>`;
    }).join("");
    count.textContent = readLine(snapshot.size);
  } catch (err) {
    console.error(err);
    box.innerHTML = '<p class="empty">' + String(err) + "</p>";
  }
}

/* --- 상품 상세 --- */
async function paintDetailFromFirestore() {
  const box = document.querySelector("#product-detail");
  const id = qs("id");
  if (!box || !findProduct(id)) return;

  try {
    // 문서 한 장을 읽어 온다
    const snap = await getDoc(doc(db, "products", id));
    if (!snap.exists()) return;
    const p = snap.data();

    document.title = p.name + " — " + SHOP.name;
    box.querySelector("h1").textContent = p.name;
    const price = box.querySelector(".price");
    price.textContent = won(p.price);
    price.style.margin = "0 0 6px";

    const summary = document.createElement("p");
    summary.className = "summary";
    summary.style.cssText = "color:var(--sub);margin:0 0 4px";
    summary.textContent = p.summary;

    const stock = document.createElement("p");
    stock.className = "stock";
    stock.style.cssText = "margin:0 0 22px;font-weight:600";
    stock.textContent = stockLine(p.stock);
    price.after(summary, stock);

    const count = document.createElement("p");
    count.id = "read-count";
    count.className = "lead";
    count.style.margin = "22px 0 0";
    count.textContent = readLine(1);
    box.querySelector("#add-to-cart").after(count);
  } catch (err) {
    console.error(err);
    const note = document.createElement("p");
    note.textContent = String(err);
    box.append(note);
  }
}

/* --- 「상품 올리기」 - 로그인한 사람에게만 보인다 ---
   shop.js 의 p2~p6 을 products 에 올린다. p1 은 건드리지 않는다. */
const SEED = {
  p2: { stock: 30, isVisible: true },
  p3: { stock: 8, isVisible: true },
  p4: { stock: 0, isVisible: true },
  p5: { stock: 5, isVisible: false },
  p6: { stock: 40, isVisible: true }
};

function paintSeedButton() {
  const box = document.querySelector("#product-list");
  if (!box) return;

  const wrap = document.createElement("div");
  wrap.id = "seed-box";
  wrap.hidden = true;
  wrap.style.margin = "0 0 20px";
  wrap.innerHTML = '<button class="btn ghost" type="button" id="seed-products">상품 올리기</button>'
    + '<p id="seed-result" role="status" style="margin:10px 0 0;font-size:14px"></p>';
  box.before(wrap);

  const btn = wrap.querySelector("#seed-products");
  const note = wrap.querySelector("#seed-result");

  btn.addEventListener("click", async () => {
    btn.disabled = true;
    note.textContent = "";
    try {
      // 쓰기 다섯 건을 한 묶음으로 보낸다 - 다 올라가거나 하나도 안 올라간다
      const batch = writeBatch(db);
      Object.keys(SEED).forEach(id => {
        const p = findProduct(id);
        batch.set(doc(db, "products", id), {
          name: p.name,
          price: p.price,
          summary: p.summary,
          stock: SEED[id].stock,
          isVisible: SEED[id].isVisible,
          createdAt: serverTimestamp()
        });
      });
      await batch.commit();
      note.textContent = "상품 5장(p2~p6)을 올렸습니다. 새로고침하면 목록에 보입니다.";
    } catch (err) {
      console.error(err);
      note.textContent = String(err);
    }
    btn.disabled = false;
  });

  onAuthStateChanged(auth, user => { wrap.hidden = !user; });
}

paintSeedButton();
paintListFromFirestore();
paintDetailFromFirestore();
