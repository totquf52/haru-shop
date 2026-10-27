/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

const { setGlobalOptions } = require("firebase-functions");
const { onRequest, onCall, HttpsError } = require("firebase-functions/https");
const logger = require("firebase-functions/logger");
const { defineSecret } = require("firebase-functions/params");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

initializeApp();

// 포트원 V2 API 시크릿 - 에뮬레이터에서는 functions/.secret.local 에서 읽는다
const portoneApiSecret = defineSecret("PORTONE_API_SECRET");
// Gemini API 키 - Secret Manager 의 GEMINI_API_KEY 에서 읽는다
const geminiApiKey = defineSecret("GEMINI_API_KEY");

// For cost control, you can set the maximum number of containers that can be
// running at the same time. This helps mitigate the impact of unexpected
// traffic spikes by instead downgrading performance. This limit is a
// per-function limit. You can override the limit for each function using the
// `maxInstances` option in the function's options, e.g.
// `onRequest({ maxInstances: 5 }, (req, res) => { ... })`.
// NOTE: setGlobalOptions does not apply to functions using the v1 API. V1
// functions should each use functions.runWith({ maxInstances: 10 }) instead.
// In the v1 API, each function can only serve one request per container, so
// this will be the maximum concurrent request count.
setGlobalOptions({ maxInstances: 10 });

// Create and deploy your first functions
// https://firebase.google.com/docs/functions/get-started

// exports.helloWorld = onRequest((request, response) => {
//   logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });

// 포트원 웹훅을 받아 type 과 data.paymentId 를 한 줄로 찍고 200 으로 답한다.
// 받은 결제 ID 로 포트원에 결제를 다시 조회해 금액을 확인한다. 어느 경우든 200 으로 답한다.
exports.portoneWebhook = onRequest(
  { secrets: [portoneApiSecret] },
  async (request, response) => {
    const type = request.body?.type;
    const paymentId = request.body?.data?.paymentId;
    logger.info(`portoneWebhook type=${type} paymentId=${paymentId}`);

    try {
      await verifyPayment(paymentId);
    } catch (err) {
      logger.error(
        `portoneWebhook 확인 중 오류: ${paymentId} ${err?.message || err}`,
      );
    }
    response.status(200).send("ok");
  },
);

// 포트원 V2 API 로 결제를 조회하고, products 문서 가격으로 계산한 기준 금액과 비교한다
async function verifyPayment(paymentId) {
  if (!paymentId) {
    logger.info("결제 ID 없음 - 조회하지 않음");
    return;
  }

  const res = await fetch(
    `https://api.portone.io/payments/${encodeURIComponent(paymentId)}`,
    {
      headers: { Authorization: `PortOne ${portoneApiSecret.value()}` },
    },
  );
  const text = await res.text();
  if (!res.ok) {
    logger.info(`결제 조회 실패: ${res.status} ${text}`);
    return;
  }

  const payment = JSON.parse(text);
  const paidAmount = payment.amount?.total;
  logger.info(`결제 상태: ${payment.status}`);
  logger.info(`결제 금액: ${paidAmount}`);
  logger.info(
    `customData: ${typeof payment.customData === "string" ? payment.customData : JSON.stringify(payment.customData)}`,
  );

  // 운영 Firestore 를 읽지 않도록 에뮬레이터 Firestore 가 켜져 있을 때만 가격을 읽는다
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    logger.info("Firestore 에뮬레이터가 꺼져 있어 기준 금액을 계산하지 않음");
    return;
  }

  // customData 가 글자 한 줄로 오면 풀어서 읽는다
  const customData =
    typeof payment.customData === "string"
      ? JSON.parse(payment.customData)
      : payment.customData;
  const items = customData?.items || [];

  const db = getFirestore();
  let expected = 0;
  for (const item of items) {
    const snap = await db.collection("products").doc(String(item.id)).get();
    if (!snap.exists)
      throw new Error(`상품 문서가 없습니다 (products/${item.id})`);
    expected += Number(snap.get("price")) * Number(item.qty);
  }

  if (payment.status === "PAID" && paidAmount === expected) {
    logger.info(
      `검증 통과: ${paymentId} 기준 금액 ${expected} 결제 금액 ${paidAmount}`,
    );
    await createOrder(db, {
      paymentId,
      userId: customData?.userId ?? payment.customer?.id ?? "",
      items,
      totalPrice: expected,
      paidAmount,
      paidAt: payment.paidAt ?? "",
    });
  } else {
    logger.info(
      `금액 불일치: ${paymentId} 기준 금액 ${expected} 결제 금액 ${paidAmount}`,
    );
  }
}

// 검증 통과한 결제를 orders/{결제 ID} 주문 한 장으로 남긴다. 이미 있으면 건드리지 않는다.
async function createOrder(
  db,
  { paymentId, userId, items, totalPrice, paidAmount, paidAt },
) {
  try {
    // create() 는 문서가 이미 있으면 실패한다 - 새로 만들지도 덮어쓰지도 않는다
    await db
      .collection("orders")
      .doc(paymentId)
      .create({
        paymentId,
        userId,
        items: items.map((i) => ({ id: String(i.id), qty: Number(i.qty) })),
        totalPrice,
        paidAmount,
        status: "paid",
        createdAt: FieldValue.serverTimestamp(),
        // 포트원에서 다시 조회한 결제의 결제 완료 시각 (받은 글자 그대로). 없으면 빈 글자
        paidAt,
      });
    logger.info(`주문 생성: ${paymentId}`);
  } catch (err) {
    // 6 = ALREADY_EXISTS
    if (err?.code === 6) {
      logger.info(`이미 있는 주문 - 건너뜀: ${paymentId}`);
      return;
    }
    throw err;
  }
}
// 실습 188 도전 - shopPing : 깨어 있는지 + 상품 개수
exports.shopPing = onRequest({ region: "us-central1" }, async (req, res) => {
  const now = new Date().toISOString();
  const snap = await require("firebase-admin")
    .firestore()
    .collection("products")
    .get();
  res.send(
    "하루상점 함수가 깨어 있습니다 · " + now + " · 상품 " + snap.size + "개",
  );
});

// calcOrderTotal : productId 와 quantity 만 받아 products/{productId} 의 price 로 금액을 계산한다.
// 손님이 price 를 같이 보내도 읽지 않는다.
exports.calcOrderTotal = onCall({ region: "us-central1" }, async (request) => {
  // 1. 로그인했나
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "로그인이 필요합니다");
  }

  const productId = request.data?.productId;
  const quantity = request.data?.quantity;

  // 2. 수량이 1 이상의 정수인가
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new HttpsError(
      "invalid-argument",
      "quantity 는 1 이상 정수여야 합니다",
    );
  }
  if (typeof productId !== "string" || productId === "") {
    throw new HttpsError("invalid-argument", "productId 는 글자여야 합니다");
  }

  // 3. 가격은 Firestore 상품 문서에서 읽는다
  const snap = await getFirestore().collection("products").doc(productId).get();
  if (!snap.exists) {
    throw new HttpsError(
      "not-found",
      `상품 문서가 없습니다 (products/${productId})`,
    );
  }

  const totalPrice = Number(snap.get("price")) * quantity;
  return { totalPrice };
});

// askShopBot : 손님 질문 하나를 받아 Gemini 답 하나를 돌려준다. 앞 대화는 기억하지 않는다.
// 근거는 Firestore products 의 상품 이름 · 가격뿐이다.
const SHOP_BOT_UNKNOWN = "그건 제가 아직 모르는 내용이에요";

exports.askShopBot = onCall(
  { region: "us-central1", secrets: [geminiApiKey] },
  async (request) => {
    // 로그인했나
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "로그인이 필요합니다");
    }

    const question = request.data?.question;
    if (typeof question !== "string" || question.trim() === "") {
      throw new HttpsError(
        "invalid-argument",
        "question 은 빈 글자가 아니어야 합니다",
      );
    }

    // 상품 이름 · 가격만 읽어 근거로 쓴다
    const snap = await getFirestore().collection("products").get();
    const productLines = snap.docs
      .map((d) => `- ${d.get("name")} : ${d.get("price")}원`)
      .join("\n");

    const instruction = [
      "너는 살림살이 가게 「하루살림」의 안내 챗봇이다.",
      "아래 상품 목록(상품 이름 · 가격)만 근거로 한국어로 짧게 답한다.",
      `목록에 없는 내용을 묻거나 목록만으로 답할 수 없으면 다른 말 없이 「${SHOP_BOT_UNKNOWN}」라고만 답한다.`,
      "목록에 없는 상품 · 가격 · 재고 · 배송 · 할인 등은 지어내지 않는다.",
      "",
      "상품 목록",
      productLines || "(상품 없음)",
    ].join("\n");

    const res = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": geminiApiKey.value(),
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: instruction }] },
          contents: [{ role: "user", parts: [{ text: question }] }],
        }),
      },
    );
    const text = await res.text();
    if (!res.ok) {
      logger.error(`askShopBot Gemini 오류: ${res.status} ${text}`);
      throw new HttpsError("internal", "답을 만들지 못했어요");
    }

    const body = JSON.parse(text);
    const answer = (body.candidates?.[0]?.content?.parts || [])
      .map((p) => p.text || "")
      .join("")
      .trim();
    return { answer: answer || SHOP_BOT_UNKNOWN };
  },
);

Object.assign(exports, require("./automation"));
Object.assign(exports, require("./admin"));
