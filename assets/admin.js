/* --- 관리 화면 (admin.html) ---
   입구: 로그인 토큰의 커스텀 클레임 role 이 staff · admin 이면 「관리자: (role)」.
   Firestore users 문서의 role 은 보지 않는다. */
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
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

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
// 함수가 있는 지역 - us-central1
const functions = getFunctions(app, "us-central1");

const statusLine = document.querySelector("#gate-status");
const loginLine = document.querySelector("#gate-login");
const claimBox = document.querySelector("#gate-claim");
const errorLine = document.querySelector("#gate-error");
const claimBtn = document.querySelector("#btn-claim");
const recheckBtn = document.querySelector("#btn-recheck");
const whoBox = document.querySelector("#gate-who");
const whoLine = document.querySelector("#gate-email");
const timeLine = document.querySelector("#gate-time");

// 오류 글을 줄이지 않고 그대로 적는다 (오류 코드가 글에 없으면 뒤에 붙인다)
function errorText(err) {
  const text = String(err);
  return err && err.code && !text.includes(err.code) ? text + " (" + err.code + ")" : text;
}

/* --- 입구 판단 ---
   force 가 참이면 로그인 토큰을 지금 새로 받는다 (getIdToken(true)) */
async function checkGate(force) {
  await auth.authStateReady();
  const user = auth.currentUser;
  loginLine.hidden = true;
  claimBox.hidden = true;
  whoBox.hidden = true;

  if (!user) {
    statusLine.textContent = "로그인이 필요합니다";
    loginLine.hidden = false;
    return null;
  }

  if (force) await user.getIdToken(true);
  const result = await user.getIdTokenResult();
  const role = result.claims.role;

  if (role === "staff" || role === "admin") {
    statusLine.textContent = "관리자: " + role;
    // 누구로 들어왔는지 · 지금 토큰을 받은 시각 (서울 시각)
    whoLine.textContent = "로그인 : " + (user.email || "");
    timeLine.textContent = "토큰을 받은 시각 : " + new Date(result.issuedAtTime).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
    whoBox.hidden = false;
    return role;
  }
  statusLine.textContent = "권한이 없습니다";
  claimBox.hidden = false;
  return null;
}

// 「주인 명찰 받기」 - 함수 grantOwnerRole 을 부르고, 성공하면 토큰을 새로 받아 다시 판단한다
claimBtn.addEventListener("click", async () => {
  claimBtn.disabled = true;
  errorLine.textContent = "";
  try {
    await httpsCallable(functions, "grantOwnerRole")();
    await checkGate(true);
  } catch (err) {
    console.error(err);
    errorLine.textContent = errorText(err);
  }
  claimBtn.disabled = false;
});

// 「다시 확인」 - 토큰을 새로 받아 다시 판단한다
recheckBtn.addEventListener("click", async () => {
  errorLine.textContent = "";
  await checkGate(true);
});

checkGate(false);
