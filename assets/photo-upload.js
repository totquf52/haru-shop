/* --- 상품 사진 올리기 (photo-upload.html) ---
   로그인한 사람이 상품 하나와 사진 파일 하나를 골라 Cloud Storage 에 올린다.
   올리는 경로는 products/상품 문서 ID/main.jpg. 다 올라간 뒤에 그 경로 글자를 상품 문서의 imagePath 에 적는다.
   문서에는 경로만 적는다 (다운로드 URL 은 적지 않는다). 사진은 고른 파일 그대로 올린다. */
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getFirestore, collection, doc, getDocs, updateDoc } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { getStorage, ref, uploadBytesResumable } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-storage.js";

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
// 로그인한 사람이 있는지 읽는다 (로그인 상태를 지켜보는 일은 auth.js 가 한다)
const auth = getAuth(app);
// 버킷은 설정의 storageBucket 값 그대로
const storage = getStorage(app);

const checking = document.querySelector("#photo-checking");
const loginLine = document.querySelector("#photo-login");
const form = document.querySelector("#photo-form");
const select = document.querySelector("#photo-product");
const fileInput = document.querySelector("#photo-file");
const submit = document.querySelector("#photo-submit");
const note = document.querySelector("#photo-result");

// 오류 글을 줄이지 않고 그대로 적는다 (오류 코드가 글에 없으면 뒤에 붙인다)
function errorText(err) {
  const text = String(err);
  return err && err.code && !text.includes(err.code) ? text + " (" + err.code + ")" : text;
}

/* --- 고를 상품 목록 ---
   products 문서를 전부 읽는다 - 숨긴 상품(isVisible 이 false)도 고를 수 있다 */
async function loadProducts() {
  try {
    const snap = await getDocs(collection(db, "products"));
    select.replaceChildren();

    const first = document.createElement("option");
    first.value = "";
    first.textContent = "상품을 고르세요";
    select.appendChild(first);

    snap.docs.forEach(d => {
      const data = d.data();
      const opt = document.createElement("option");
      opt.value = d.id;
      // 문서 ID 가 보이게 적는다
      opt.textContent = d.id + " · " + (data.name || "") + (data.isVisible === false ? " (숨긴 상품)" : "");
      select.appendChild(opt);
    });
  } catch (err) {
    console.error(err);
    note.textContent = "상품을 불러오지 못했습니다.\n" + errorText(err);
  }
}

/* --- 올리기 ---
   가리키고(ref), 올리고(uploadBytesResumable), 끝나면 문서에 경로를 적는다(updateDoc) */
function upload(id, file) {
  // 맨 앞에 / 를 붙이지 않는다. 예: products/p1/main.jpg
  const path = "products/" + id + "/main.jpg";
  const fileRef = ref(storage, path);

  submit.disabled = true;
  note.textContent = "올리는 중 … 0%";

  // 고른 파일 그대로 올린다
  const uploadTask = uploadBytesResumable(fileRef, file);
  uploadTask.on("state_changed",
    snapshot => {
      // 진행률 - 올라간 만큼 ÷ 전체
      const percent = snapshot.totalBytes ? Math.round(snapshot.bytesTransferred / snapshot.totalBytes * 100) : 0;
      note.textContent = "올리는 중 … " + percent + "%";
    },
    err => {
      console.error(err);
      note.textContent = "사진을 올리지 못했습니다.\n" + errorText(err);
      submit.disabled = false;
    },
    async () => {
      try {
        // 다 올라간 뒤에 - 다른 필드는 그대로 두고 imagePath 만 더한다
        await updateDoc(doc(db, "products", id), { imagePath: path });
        note.textContent = "끝났습니다. " + path + " 에 올리고 " + id + " 문서의 imagePath 에 저장했습니다.";
      } catch (err) {
        console.error(err);
        note.textContent = "사진은 " + path + " 에 올라갔지만 " + id + " 문서의 imagePath 를 저장하지 못했습니다.\n" + errorText(err);
      }
      submit.disabled = false;
    }
  );
}

form.addEventListener("submit", e => {
  e.preventDefault();
  const id = select.value;
  const file = fileInput.files[0];
  if (!id) { note.textContent = "상품을 골라 주세요."; return; }
  if (!file) { note.textContent = "사진 파일을 골라 주세요."; return; }
  // 올리기 직전에도 로그인했는지 한 번 더 본다
  if (!auth.currentUser) { note.textContent = "로그인이 필요합니다"; return; }
  upload(id, file);
});

/* --- 로그인한 사람만 쓴다 --- */
// 브라우저가 기억하는 로그인을 다 읽은 뒤에 묻는다
await auth.authStateReady();
checking.hidden = true;
if (auth.currentUser) {
  form.hidden = false;
  await loadProducts();
} else {
  // 로그인하지 않았으면 로그인하라는 한 줄만 보여 준다
  loginLine.hidden = false;
}
