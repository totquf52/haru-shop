/* ===========================================================
   하루살림 — 동의 배너
   네 신호를 모두 denied 로 시작하고, 손님이 고른 값을 브라우저에 기억합니다.
   이 파일은 태그 관리자 코드보다 먼저 불러야 합니다.
   =========================================================== */

(function () {
  // 고른 값을 브라우저에 적어 둘 이름
  var KEY = "haru_consent";
  // 다루는 네 가지 신호
  var SIGNALS = ["ad_storage", "analytics_storage", "ad_user_data", "ad_personalization"];

  // 네 신호를 한 가지 상태로 묶어 준다
  function signals(state) {
    var out = {};
    for (var i = 0; i < SIGNALS.length; i++) out[SIGNALS[i]] = state;
    return out;
  }

  // 통로가 이미 있으면 그대로 쓰고, 없을 때만 새로 만든다
  window.dataLayer = window.dataLayer || [];
  function gtag() { dataLayer.push(arguments); }

  // 기본값 - 태그 관리자가 실행되기 전에 네 신호를 모두 denied 로 둔다
  gtag("consent", "default", signals("denied"));

  // 앞서 고른 값 읽기 (브라우저가 막아 두었으면 고른 적 없는 것으로 본다)
  function readChoice() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }
  // 고른 값 적어 두기
  function saveChoice(value) {
    try { localStorage.setItem(KEY, value); } catch (e) {}
  }

  // 앞 화면에서 수락을 골랐다면 이 화면에서도 granted 로 올린다
  if (readChoice() === "granted") {
    gtag("consent", "update", signals("granted"));
  }

  // 화면 아래에 띄우는 작은 배너
  function showBanner() {
    if (document.querySelector("#haru-consent-banner")) return;

    var bar = document.createElement("div");
    bar.id = "haru-consent-banner";
    bar.style.cssText = "position:fixed;left:0;right:0;bottom:0;z-index:9999;" +
      "display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:center;" +
      "padding:12px 16px;background:#222;color:#fff;font-size:14px;line-height:1.5;";

    var text = document.createElement("span");
    text.textContent = "이 가게는 방문 기록을 재는 데 쿠키를 쓸 수 있습니다.";
    text.style.cssText = "margin-right:8px;";

    var deny = document.createElement("button");
    deny.type = "button";
    deny.textContent = "거부";
    deny.style.cssText = "padding:6px 14px;border:1px solid #fff;border-radius:4px;" +
      "background:transparent;color:#fff;cursor:pointer;font-size:14px;";

    var allow = document.createElement("button");
    allow.type = "button";
    allow.textContent = "수락";
    allow.style.cssText = "padding:6px 14px;border:1px solid #fff;border-radius:4px;" +
      "background:#fff;color:#222;cursor:pointer;font-size:14px;";

    // 거부 - denied 그대로 두고 고른 값만 적어 둔다
    deny.addEventListener("click", function () {
      saveChoice("denied");
      bar.remove();
    });

    // 수락 - 이 화면에서 네 신호를 granted 로 올린다
    allow.addEventListener("click", function () {
      saveChoice("granted");
      gtag("consent", "update", signals("granted"));
      bar.remove();
    });

    bar.appendChild(text);
    bar.appendChild(deny);
    bar.appendChild(allow);
    document.body.appendChild(bar);
  }

  // 화면 맨 아래에 두는 「동의 다시 고르기」 링크
  function addResetLink() {
    if (document.querySelector("#haru-consent-reset")) return;

    var box = document.createElement("div");
    box.style.cssText = "padding:12px 16px;text-align:center;font-size:13px;";

    var link = document.createElement("a");
    link.id = "haru-consent-reset";
    link.href = "#";
    link.textContent = "동의 다시 고르기";

    link.addEventListener("click", function (e) {
      e.preventDefault();
      saveChoice("");
      showBanner();
    });

    box.appendChild(link);
    document.body.appendChild(box);
  }

  document.addEventListener("DOMContentLoaded", function () {
    // 아직 고른 적이 없을 때만 배너를 띄운다
    if (!readChoice()) showBanner();
    addResetLink();
  });
})();
