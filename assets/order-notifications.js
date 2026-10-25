// 주문 저장이 성공한 뒤에만 호출한다.
export function showOrderNotifications(anchor, orderId) {
  document.querySelector("#order-notifications")?.remove();
  const panel = document.createElement("section");
  panel.id = "order-notifications";
  panel.setAttribute("aria-live", "polite");
  panel.style.cssText = "margin:16px 0;padding:18px;border:1px solid var(--line);border-radius:12px;background:var(--card)";
  anchor.after(panel);
  const key = "order-notifications-later:" + orderId;
  let dismissed = false;
  try { dismissed = sessionStorage.getItem(key) === "1"; } catch (_) {}

  function render(permission) {
    panel.replaceChildren();
    panel.hidden = false;
    if (permission === "granted" || permission === "denied") {
      panel.textContent = permission === "granted"
        ? "알림을 받고 있어요"
        : "브라우저 주소창 왼쪽 아이콘 → 알림에서 켤 수 있어요";
      return;
    }
    if (dismissed) { panel.hidden = true; return; }
    const title = document.createElement("h3");
    title.textContent = "배송이 출발하면 알려 드릴까요?";
    title.style.cssText = "margin:0 0 12px;font-size:16px";
    const allow = document.createElement("button");
    allow.type = "button";
    allow.className = "btn";
    allow.textContent = "알림 받기";
    const later = document.createElement("button");
    later.type = "button";
    later.className = "btn ghost";
    later.style.marginLeft = "8px";
    later.textContent = "나중에";
    allow.addEventListener("click", async () => {
      // 클릭 처리 안에서 다른 비동기 작업보다 먼저 요청한다.
      try {
        const request = Notification.requestPermission();
        allow.disabled = true;
        const result = await request;
        console.log("알림 권한 결과: " + result);
        render(result);
        if (result === "granted") {
          import("./push-tokens.js")
            .then(({ savePushToken }) => savePushToken())
            .catch(err => console.error(err?.name || "Error"));
        }
      } catch (err) {
        allow.disabled = false;
        console.error("알림 권한 요청 실패", err);
      }
    });
    later.addEventListener("click", () => {
      dismissed = true;
      try { sessionStorage.setItem(key, "1"); } catch (_) {}
      panel.hidden = true;
    });
    panel.append(title, allow, later);
  }
  if (!("Notification" in window)) {
    panel.textContent = "이 브라우저는 알림을 지원하지 않아요";
    return;
  }
  render(Notification.permission);
}
