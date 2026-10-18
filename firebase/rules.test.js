// 하루상점 Firestore 보안 규칙 테스트

// 1. 쓸 도구 불러오기
import { readFileSync } from "node:fs";
import { test, before, beforeEach, after } from "node:test";
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";

// 2. 어느 규칙 판으로 돌릴지 고르는 한 줄
const RULES = "firestore.rules";

let testEnv;

// 3. 테스트 환경 만들기 - 데모 프로젝트에 규칙 파일을 읽힌다
before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "demo-haru-shop",
    firestore: { rules: readFileSync(RULES, "utf8") },
  });
});

// 4. 테스트마다 가게를 비우고 문서 두 장을 넣어 둔다 - 규칙을 끈 채로
beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "products/p1"), { name: "연습 상품", price: 12000, stock: 10 });
    await setDoc(doc(db, "orders/o1"), { userId: "cust02", totalPrice: 12000, status: "paid" });
  });
});

// 5. 다 끝나면 테스트 환경 정리
after(async () => {
  await testEnv.cleanup();
});

// 6. 테스트
test("로그인 안 한 사람이 상품을 읽는다", async () => {
  const guest = testEnv.unauthenticatedContext();
  await assertSucceeds(getDoc(doc(guest.firestore(), "products/p1")));
});
