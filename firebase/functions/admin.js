// 1. 쓰는 묶음 불러오기
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const {
  onDocumentWrittenWithAuthContext,
} = require("firebase-functions/v2/firestore");
const { initializeApp, getApps } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

// 2. 서버용 라이브러리 준비 - 이미 준비돼 있으면 건너뛴다
if (getApps().length === 0) {
  initializeApp();
}

// 3. 주인 이메일 - 이 한 줄만 내 구글 계정 주소로 바꾼다
const OWNER_EMAIL = "rkdldk37@gmail.com";

// 4. 관리 화면이 부르면, 주인 계정에만 커스텀 클레임 role: "admin" 을 다는 함수 (그대로)
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

// 5. 상품 문서가 생기거나 바뀌거나 지워지면, 누가 무엇을 바꿨는지 adminLogs 에 한 줄 남기는 함수 - 새로 더한 것
exports.onProductWritten = onDocumentWrittenWithAuthContext(
  { document: "products/{productId}", region: "us-central1" },
  async (event) => {
    // 5-1. 바뀌기 전 문서와 바뀐 뒤 문서 - 없으면 null
    const before = event.data.before.exists ? event.data.before.data() : null;
    const after = event.data.after.exists ? event.data.after.data() : null;

    // 5-2. 바뀐 필드 이름 모으기
    const names = new Set([
      ...Object.keys(before || {}),
      ...Object.keys(after || {}),
    ]);
    const changedKeys = [...names].filter(
      (k) =>
        JSON.stringify((before || {})[k]) !== JSON.stringify((after || {})[k]),
    );

    // 5-3. 바뀐 것이 없거나, 재고만 바뀐 것(손님 주문)은 적지 않는다
    if (changedKeys.length === 0) return;
    if (changedKeys.length === 1 && changedKeys[0] === "stock") return;

    // 5-4. 활동 로그 한 줄 - 다른 컬렉션이라 이 함수를 다시 깨우지 않는다
    await getFirestore()
      .collection("adminLogs")
      .add({
        productId: event.params.productId,
        action: !before ? "create" : !after ? "delete" : "update",
        changedKeys: changedKeys,
        actorId: event.authId || null,
        authType: event.authType || null,
        at: FieldValue.serverTimestamp(),
      });
  },
);
