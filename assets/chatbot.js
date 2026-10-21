/* --- 가게 챗봇 (index.html) ---
   오른쪽 아래 동그란 버튼을 누르면 작은 대화 창이 열린다.
   질문을 보내면 서버 함수 askShopBot (us-central1) 을 불러 답을 창에 적는다.
   질문 하나에 답 하나 - 앞 대화는 서버에 보내지 않는다.
   Gemini 키는 이 파일에 두지 않는다 - 서버 함수가 Secret Manager 에서 읽는다. */
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

// 화면이 이미 연결해 두었으면 그것을 쓰고, 없을 때만 새로 연결한다
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
// 누가 로그인했는지 읽는다 (로그인 상태를 지켜보는 일은 auth.js 가 한다)
const auth = getAuth(app);
const askShopBot = httpsCallable(getFunctions(app, "us-central1"), "askShopBot");

const LOGIN_FIRST = "로그인한 뒤에 물어볼 수 있어요";

/* --- 버튼과 대화 창 --- */
const style = document.createElement("style");
style.textContent = `
#bot-toggle{position:fixed;right:20px;bottom:20px;z-index:900;width:56px;height:56px;border-radius:50%;
  border:0;background:var(--accent);color:var(--accent-ink);font-size:24px;cursor:pointer;
  box-shadow:0 4px 14px rgba(0,0,0,.18)}
#bot-panel{position:fixed;right:20px;bottom:88px;z-index:900;width:320px;max-width:calc(100vw - 40px);
  background:var(--card);border:1px solid var(--line);border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.14);
  display:flex;flex-direction:column;overflow:hidden}
#bot-panel[hidden]{display:none}
#bot-panel .bot-head{padding:12px 14px;border-bottom:1px solid var(--line);font-weight:700;font-size:14px}
#bot-log{height:260px;overflow-y:auto;padding:12px 14px;font-size:14px;display:flex;flex-direction:column;gap:8px}
#bot-log p{margin:0;padding:8px 10px;border-radius:8px;white-space:pre-wrap;overflow-wrap:anywhere;max-width:85%}
#bot-log .me{align-self:flex-end;background:var(--accent);color:var(--accent-ink)}
#bot-log .bot{align-self:flex-start;background:var(--bg);color:var(--ink)}
#bot-form{display:flex;gap:6px;padding:10px;border-top:1px solid var(--line)}
#bot-input{flex:1;min-width:0;padding:8px 10px;border:1px solid var(--line);border-radius:8px;font:inherit;font-size:14px}
#bot-form button{border:0;border-radius:8px;padding:0 12px;background:var(--accent);color:var(--accent-ink);font:inherit;font-size:14px;cursor:pointer}
`;
document.head.appendChild(style);

const toggle = document.createElement("button");
toggle.type = "button";
toggle.id = "bot-toggle";
toggle.setAttribute("aria-label", "챗봇에게 묻기");
toggle.setAttribute("aria-expanded", "false");
toggle.textContent = "💬";

const panel = document.createElement("div");
panel.id = "bot-panel";
panel.hidden = true;
panel.innerHTML = `
  <div class="bot-head">하루살림에 물어보기</div>
  <div id="bot-log" role="log" aria-live="polite"></div>
  <form id="bot-form">
    <input id="bot-input" type="text" autocomplete="off" placeholder="상품 이름이나 가격을 물어보세요" aria-label="질문">
    <button type="submit">보내기</button>
  </form>`;

document.body.append(panel, toggle);

const log = panel.querySelector("#bot-log");
const form = panel.querySelector("#bot-form");
const input = panel.querySelector("#bot-input");
const send = form.querySelector("button");

// 대화 창에 말풍선 한 개
function bubble(text, who) {
  const p = document.createElement("p");
  p.className = who;
  p.textContent = text;
  log.appendChild(p);
  log.scrollTop = log.scrollHeight;
  return p;
}

toggle.addEventListener("click", () => {
  panel.hidden = !panel.hidden;
  toggle.setAttribute("aria-expanded", String(!panel.hidden));
  if (!panel.hidden) input.focus();
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const question = input.value.trim();
  if (!question) return;

  bubble(question, "me");
  input.value = "";

  await auth.authStateReady();
  if (!auth.currentUser) {
    bubble(LOGIN_FIRST, "bot");
    return;
  }

  send.disabled = true;
  const wait = bubble("답을 찾는 중…", "bot");
  try {
    const res = await askShopBot({ question });
    wait.textContent = res.data.answer;
  } catch (err) {
    // 서버가 로그인 안 됨으로 거절하면 같은 안내를, 그 밖의 오류는 받은 글을 그대로 보여 준다
    wait.textContent = err && err.code === "functions/unauthenticated" ? LOGIN_FIRST : String(err);
  }
  send.disabled = false;
  input.focus();
});
