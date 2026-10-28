/* --- 관리 화면 매출 탭 (admin.html) ---
   입구가 「관리자: staff · admin」 일 때만 admin.js 가 showSales(true) 로 연다.
   - 집계 문서 dailyStats 만 읽는다 (orders 는 읽지 않는다)
   - 어제(한국 날짜)부터 거꾸로 7일, 날짜마다 dailyStats/YYYYMMDD 한 장씩 - 7번 읽는다
   - 막대 높이 = totalSales · 문서가 없는 날은 막대를 비우고 「집계 없음」
   - 차트 위 한 줄 = 「[가장 최근 문서 날짜]까지의 매출입니다 - 매일 00:05에 전날을 셉니다」 + 마지막으로 센 시각(countedAt)
   - 차트 아래 표 = 날짜 · 건수 · 매출 · 센 시각 (canceledCount 가 있으면 표에만)
   차트는 Chart.js 를 판 번호를 고정한 CDN 주소로 admin.html 에서 불러온다 (window.Chart).
   읽다가 실패하면 오류 글을 줄이지 않고 브라우저 콘솔에 그대로 남기고, 화면에는 한 줄만. */
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

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
const db = getFirestore(app);

// 몇 날을 그리나
const DAYS = 7;

const headline = document.querySelector("#sales-headline");
const note = document.querySelector("#sales-result");
const canvas = document.querySelector("#sales-chart");
const missingLine = document.querySelector("#sales-missing");
const rows = document.querySelector("#sales-rows");

let chart = null;

function say(text, isError) {
  note.style.color = isError ? "#c0392b" : "";
  note.textContent = text;
}

// 한국 날짜로 n일 전의 YYYYMMDD
function seoulDay(daysAgo) {
  const d = new Date(Date.now() - daysAgo * 86400000);
  return d.toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }).replaceAll("-", "");
}

// 20261027 → 10/27
function short(id) {
  return Number(id.slice(4, 6)) + "/" + Number(id.slice(6, 8));
}

function when(ts) {
  return ts && ts.toDate ? ts.toDate().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : "";
}

function won(n) {
  return typeof n === "number" ? n.toLocaleString("ko-KR") + "원" : "";
}

function cell(text) {
  const td = document.createElement("td");
  td.textContent = text;
  return td;
}

async function loadSales() {
  say("읽는 중…");
  // 어제부터 거꾸로 7일 - 오래된 날이 왼쪽에 오게 뒤집는다
  const ids = Array.from({ length: DAYS }, (_, i) => seoulDay(i + 1)).reverse();
  let days;
  try {
    // 날짜마다 문서 한 장씩
    days = await Promise.all(ids.map(async id => {
      const snap = await getDoc(doc(db, "dailyStats", id));
      return { id, data: snap.exists() ? snap.data() : null };
    }));
  } catch (err) {
    console.error(err);
    say("매출을 읽지 못했습니다 - 자세한 오류는 브라우저 콘솔에 있습니다.", true);
    return;
  }
  say("");

  // 차트 위 한 줄 - 가장 최근 문서 기준
  const latest = [...days].reverse().find(d => d.data);
  headline.textContent = latest
    ? short(latest.id) + "까지의 매출입니다 - 매일 00:05에 전날을 셉니다 (마지막으로 센 시각 " + when(latest.data.countedAt) + ")"
    : "최근 7일에 집계 문서가 없습니다 - 매일 00:05에 전날을 셉니다";

  // 막대 - 문서가 없는 날은 null 로 두어 막대를 그리지 않는다
  const labels = days.map(d => d.data ? short(d.id) : [short(d.id), "집계 없음"]);
  const values = days.map(d => d.data ? Number(d.data.totalSales ?? 0) : null);
  if (chart) chart.destroy();
  chart = new window.Chart(canvas, {
    type: "bar",
    data: { labels, datasets: [{ label: "매출(원)", data: values, backgroundColor: "#8a5a2b" }] },
    options: {
      animation: false,
      // 높이는 감싼 칸(240px)을 따른다
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true } }
    }
  });
  const missing = days.filter(d => !d.data).map(d => short(d.id));
  missingLine.textContent = missing.length ? "집계 없음 : " + missing.join(", ") : "";

  // 최근 7일 합계 - 이미 읽은 일곱 장의 값만 더한다 (새로 읽지 않는다 · 문서 없는 날은 빼고)
  const counted = days.filter(d => d.data);
  const salesSum = counted.reduce((sum, d) => sum + Number(d.data.totalSales ?? 0), 0);
  const orderSum = counted.reduce((sum, d) => sum + Number(d.data.orderCount ?? 0), 0);
  document.querySelector("#sales-sum").textContent =
    "최근 7일 합계 " + salesSum.toLocaleString("ko-KR") + "원 - 주문 " + orderSum + "건 " +
    (missing.length ? "(집계 없는 날 " + missing.length + "일은 빼고 더함)" : "(집계 없는 날 없음)");

  // 표
  rows.replaceChildren();
  const hasCanceled = days.some(d => d.data && d.data.canceledCount !== undefined);
  document.querySelector("#sales-canceled-head").hidden = !hasCanceled;
  days.forEach(d => {
    const tr = document.createElement("tr");
    if (d.data) {
      tr.append(cell(short(d.id)), cell(String(d.data.orderCount ?? "")), cell(won(d.data.totalSales)), cell(when(d.data.countedAt)));
      if (hasCanceled) tr.append(cell(String(d.data.canceledCount ?? "")));
    } else {
      const td = cell("집계 없음");
      td.colSpan = hasCanceled ? 4 : 3;
      tr.append(cell(short(d.id)), td);
    }
    rows.append(tr);
  });
}

// admin.js 가 부른다 - 입구가 관리자이면 true
export async function showSales(show) {
  if (!show) {
    rows.replaceChildren();
    if (chart) { chart.destroy(); chart = null; }
    return;
  }
  await loadSales();
}
