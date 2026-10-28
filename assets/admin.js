/* --- 관리 화면 입구 (admin.html) ---
   가게 메뉴·머리글에는 넣지 않는다 - 주소를 직접 넣어서 연다.
   판단은 로그인 토큰의 커스텀 클레임 role 로만 한다 (Firestore users 문서는 보지 않는다).
   - role 이 staff · admin 이면 「관리자: (role)」
   - 그 밖이면 「권한이 없습니다」 와 「주인 명찰 받기」 (Callable 함수 grantOwnerRole, us-central1)
   - 「다시 확인」 은 토큰을 새로 받아 다시 판단한다
   실패하면 함수가 돌려준 오류 글을 줄이지 않고 그대로 적는다. */
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAuth, onAuthStateChanged, getIdTokenResult } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-functions.js";
// 상품 표 - 입구가 관리자일 때만 연다
import { showProducts } from "./admin-products.js";

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
const auth = getAuth(app);
// 서버 함수 grantOwnerRole (us-central1)
const grantOwnerRole = httpsCallable(getFunctions(app, "us-central1"), "grantOwnerRole");

const checking = document.querySelector("#admin-checking");
const loginLine = document.querySelector("#admin-login");
const entry = document.querySelector("#admin-entry");
const okBox = document.querySelector("#admin-ok-box");
const okLine = document.querySelector("#admin-ok");
const emailLine = document.querySelector("#admin-email");
const issuedLine = document.querySelector("#admin-issued");
const denied = document.querySelector("#admin-denied");
const result = document.querySelector("#admin-result");
const grantBtn = document.querySelector("#btn-grant");
const recheckBtn = document.querySelector("#btn-recheck");

// 들어올 수 있는 role
const ADMIN_ROLES = ["staff", "admin"];

// 오류 글을 줄이지 않고 그대로 적는다 (오류 코드가 글에 없으면 뒤에 붙인다)
function errorText(err) {
  const text = String(err);
  return err && err.code && !text.includes(err.code) ? text + " (" + err.code + ")" : text;
}

// 결과 칸에 글 한 줄
function say(text, isError) {
  result.style.color = isError ? "#c0392b" : "";
  result.textContent = text;
}

// 로그인 토큰을 읽어 role 로 판단한다. refresh 가 true 면 토큰을 서버에서 새로 받는다.
async function judge(user, refresh) {
  checking.hidden = true;
  if (!user) {
    loginLine.hidden = false;
    entry.hidden = true;
    showProducts(false);
    return;
  }
  loginLine.hidden = true;
  entry.hidden = false;

  const token = await getIdTokenResult(user, refresh);
  const role = token.claims.role;
  const allowed = ADMIN_ROLES.includes(role);
  okLine.textContent = allowed ? "관리자: " + role : "";
  // 로그인한 이메일과 이 토큰을 받은 시각(issuedAtTime)을 서울 시각으로
  emailLine.textContent = allowed ? user.email || "" : "";
  issuedLine.textContent = allowed
    ? new Date(token.issuedAtTime).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })
    : "";
  okBox.hidden = !allowed;
  denied.hidden = allowed;
  await showProducts(allowed);
}

// 버튼을 누르는 동안 막아 두고, 성공이든 실패든 끝나면 다시 연다
function wire(btn, run) {
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    say("요청하는 중…");
    try {
      await run();
      say("");
    } catch (err) {
      say(errorText(err), true);
    }
    btn.disabled = false;
  });
}

// 「주인 명찰 받기」 - 함수가 성공하면 다시 로그인하지 않고 토큰만 새로 받아 다시 판단한다
wire(grantBtn, async () => {
  await grantOwnerRole();
  await judge(auth.currentUser, true);
});

// 「다시 확인」 - 토큰을 새로 받아 다시 판단한다
wire(recheckBtn, () => judge(auth.currentUser, true));

onAuthStateChanged(auth, user => {
  judge(user, false).catch(err => say(errorText(err), true));
});
