/* --- 로그인 상태 ---
   로그인했는지 묻는 코드(onAuthStateChanged)는 이 파일 한 곳에만 둔다.
   모든 화면이 <script type="module" src="assets/auth.js"> 로 불러 쓴다.
   이메일은 화면에만 적고 dataLayer 에도 콘솔에도 넣지 않는다. */
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

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

// 로그아웃하는 중에는 「로그인 화면으로 돌려보내기」가 끼어들지 않게 한다
let leaving = false;

// 로그아웃하면 첫 화면으로 간다
async function logout() {
  leaving = true;
  try {
    await signOut(auth);
    location.href = "index.html";
  } catch (err) {
    leaving = false;
  }
}

/* --- 머리글 --- */
function paintHeader(user) {
  const nav = document.querySelector("nav.site");
  if (!nav) return;

  let box = nav.querySelector(".auth-box");
  if (!box) {
    box = document.createElement("span");
    box.className = "auth-box";
    nav.appendChild(box);
  }
  box.textContent = "";

  if (!user) {
    const login = document.createElement("a");
    login.href = "login.html";
    login.textContent = "로그인";
    box.appendChild(login);
    return;
  }

  const email = document.createElement("span");
  email.className = "auth-email";
  email.setAttribute("data-clarity-mask", "true");
  email.textContent = user.email;

  const mypage = document.createElement("a");
  mypage.href = "mypage.html";
  mypage.textContent = "마이페이지";

  const out = document.createElement("button");
  out.type = "button";
  out.className = "auth-logout";
  out.textContent = "로그아웃";
  out.addEventListener("click", logout);

  box.append(email, mypage, out);
}

/* --- 로그인해야 보이는 화면 (<body data-require-login>) --- */
function guardPage(user) {
  if (!document.body.hasAttribute("data-require-login")) return;

  if (!user) {
    if (leaving) return;
    // 원래 가려던 화면 이름을 달아서 로그인 화면으로 보낸다
    const here = location.pathname.split("/").pop() || "index.html";
    location.replace("login.html?next=" + encodeURIComponent(here));
    return;
  }

  // 확인이 끝난 뒤에야 내용을 채우고 보여 준다
  document.querySelectorAll("[data-auth-email]").forEach(el => { el.textContent = user.email; });
  document.querySelectorAll("[data-auth-logout]").forEach(el => { el.addEventListener("click", logout); });
  document.querySelectorAll("[data-auth-show]").forEach(el => { el.hidden = false; });
}

onAuthStateChanged(auth, user => {
  paintHeader(user);
  guardPage(user);
});
