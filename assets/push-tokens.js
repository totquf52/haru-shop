const VAPID_KEY = "BD2N3B1L7iWIW3maByW8Kup5kJb8LFxgOA0IlKJYJ7Gr9bWpSqKIHd0SW9u46o-QmJykgfnkKTOZsjP9FKp6ZnQ";
const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

// 실패하면 오류 이름만 기록하고, 토큰은 화면이나 Console에 노출하지 않는다.
export async function savePushToken({ skipRecent = false } = {}) {
  try {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    const { getApp } = await import("https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js");
    const { getAuth } = await import("https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js");
    const app = getApp();
    const auth = getAuth(app);
    await auth.authStateReady();
    const user = auth.currentUser;
    if (!user || Notification.permission !== "granted") return;

    const { getMessaging, getToken, isSupported } = await import("https://www.gstatic.com/firebasejs/12.19.0/firebase-messaging.js");
    if (!(await isSupported())) return;
    // app.js가 등록한 루트 워커가 활성화되면 그 등록을 그대로 넘긴다.
    const registration = await navigator.serviceWorker.ready;
    if (new URL(registration.active.scriptURL).pathname !== "/firebase-messaging-sw.js") {
      throw new Error("UnexpectedServiceWorker");
    }
    if (auth.currentUser?.uid !== user.uid || Notification.permission !== "granted") return;
    const token = await getToken(getMessaging(app), {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration
    });
    if (!token) throw new Error("EmptyPushToken");
    if (auth.currentUser?.uid !== user.uid || Notification.permission !== "granted") return;

    const { getFirestore, doc, getDocFromServer, setDoc, serverTimestamp } = await import("https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js");
    const ref = doc(getFirestore(app), "pushTokens", user.uid);
    if (skipRecent) {
      const snapshot = await getDocFromServer(ref);
      const data = snapshot.data();
      const updatedAt = data?.updatedAt?.toMillis?.();
      const age = Date.now() - updatedAt;
      if (data?.token === token && Number.isFinite(updatedAt) && age >= 0 && age < THIRTY_DAYS) return;
    }
    if (auth.currentUser?.uid !== user.uid || Notification.permission !== "granted") return;
    await setDoc(ref, { token, updatedAt: serverTimestamp() }, { merge: true });
  } catch (err) {
    console.error(err?.name || "Error");
  }
}
