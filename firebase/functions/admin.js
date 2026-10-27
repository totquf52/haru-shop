// 1. 쓰는 묶음 불러오기
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp, getApps } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");

// 2. 서버용 라이브러리 준비 - 이미 준비돼 있으면 건너뛴다
if (getApps().length === 0) {
  initializeApp();
}

// 3. 주인 이메일 - 이 한 줄만 내 구글 계정 주소로 바꾼다
const OWNER_EMAIL = "rkdldk37@gmail.com";

// 4. 관리 화면이 부르면, 주인 계정에만 커스텀 클레임 role: "admin" 을 다는 함수
exports.grantOwnerRole = onCall({ region: "us-central1" }, async (request) => {
  // 4-1. 누가 불렀나 - 로그인 토큰의 이메일과 확인 여부를 본다
  const token = request.auth ? request.auth.token : null;
  const email = token && token.email ? token.email.toLowerCase() : "";
  if (email !== OWNER_EMAIL.toLowerCase() || token.email_verified !== true) {
    throw new HttpsError(
      "permission-denied",
      "주인 계정만 명찰을 달 수 있습니다",
    );
  }

  // 4-2. 그 계정에 커스텀 클레임을 단다 - 있던 클레임은 덮어쓴다
  await getAuth().setCustomUserClaims(request.auth.uid, { role: "admin" });
  return { role: "admin" };
});
