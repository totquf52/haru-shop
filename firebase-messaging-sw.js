/* --- 웹 푸시 알림을 받는 서비스 워커 ---
   assets/app.js 가 이 파일을 이 가게의 서비스 워커로 등록한다.
   가게 화면과 같은 Firebase 버전(12.19.0)의 서비스 워커용 묶음을 불러온다. */
importScripts("https://www.gstatic.com/firebasejs/12.19.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.19.0/firebase-messaging-compat.js");

// index.html 과 같은 Firebase 설정
firebase.initializeApp({
  apiKey: "AIzaSyC9IOJWMP2AL0JvLg_Ipq_EV0h2ChQrRAg",
  authDomain: "haru-shop-80c06.firebaseapp.com",
  projectId: "haru-shop-80c06",
  storageBucket: "haru-shop-80c06.firebasestorage.app",
  messagingSenderId: "205447160425",
  appId: "1:205447160425:web:3b845512888e3c30e7b8f8"
});

// 알림을 받을 준비만 해 둔다 (허락 묻기 · 토큰 받기는 아직 하지 않는다)
const messaging = firebase.messaging();
