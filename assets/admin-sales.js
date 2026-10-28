/* --- 관리 화면 매출 탭 (admin.html) ---
   입구가 「관리자: staff · admin」 일 때만 admin.js 가 showSales(true) 로 연다.
   - 집계 문서 dailyStats 만 읽는다 (orders 는 읽지 않는다 · 오늘 숫자를 주문에서 세지 않는다)
   - 어제(한국 날짜)부터 거꾸로 7일, 날짜마다 문서 한 장 (문서 이름 = 20261028 처럼 여덟 자리)
   - 막대 차트 하나 = 가로 날짜 7개(오래된 날이 왼쪽) · 높이 totalSales
     문서가 없는 날은 막대를 비우고 날짜 아래에 「집계 없음」
   - 표 = 날짜 · 건수 · 매출 · 센 시각 (canceledCount 가 있으면 표에만 「취소」 칸)
   차트 도구 Chart.js 는 admin.html 이 판 번호를 고정한 주소로 불러 둔다 (window.Chart).
   실패하면 오류 글을 줄이지 않고 브라우저 콘솔에 그대로 남긴다. 화면에는 한 줄만. */
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

// 읽는 날 수
const DAYS = 7;
const MISSING = "집계 없음";

const headline = document.querySelector("#sales-headline");
const counted = document.querySelector("#sales-counted");
const note = document.querySelector("#sales-result");
const canvas = document.querySelector("#sales-chart");
const sum = document.querySelector("#sales-sum");
const rows = document.querySelector("#sales-rows");
const canceledHead = document.querySelector("#sales-canceled-head");

let chart = null;

function say(text, isError) {
  note.style.color = isError ? "#c0392b" : "";
  note.textContent = text;
}

// Timestamp 를 서울 시각 글자로
function when(ts) {
  return ts && ts.toDate ? ts.toDate().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : "";
}

function won(n) {
  return typeof n === "number" ? n.toLocaleString("ko-KR") + "원" : String(n ?? "");
}

// 어제(한국 날짜)부터 거꾸로 7일 - 오래된 날이 앞
function lastDays() {
  const days = [];
  for (let i = DAYS; i >= 1; i--) {
    // 한국 시각 = UTC + 9시간 · UTC 로 읽으면 한국 날짜가 나온다
    const d = new Date(Date.now() + 9 * 3600 * 1000 - i * 24 * 3600 * 1000);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    days.push({ id: "" + y + m + day, label: y + "-" + m + "-" + day, short: m + "/" + day });
  }
  return days;
}

function cell(text) {
  const td = document.createElement("td");
  td.textContent = text;
  return td;
}

function paintTable(days) {
  const showCanceled = days.some(d => d.data && d.data.canceledCount !== undefined);
  canceledHead.hidden = !showCanceled;
  rows.replaceChildren(...days.map(d => {
    const tr = document.createElement("tr");
    if (d.data) {
      tr.append(cell(d.label), cell(String(d.data.orderCount ?? "")), cell(won(d.data.totalSales)), cell(when(d.data.countedAt)));
      if (showCanceled) tr.append(cell(String(d.data.canceledCount ?? "")));
    } else {
      tr.append(cell(d.label), cell(MISSING), cell(""), cell(""));
      if (showCanceled) tr.append(cell(""));
    }
    return tr;
  }));
}

function paintChart(days) {
  if (chart) chart.destroy();
  chart = new Chart(canvas, {
    type: "bar",
    data: {
      // 문서가 없는 날은 날짜 아래 줄에 「집계 없음」
      labels: days.map(d => d.data ? d.short : [d.short, MISSING]),
      // 문서가 없는 날은 null - 0 으로 그리지 않고 비워 둔다
      datasets: [{ label: "매출", data: days.map(d => d.data ? d.data.totalSales ?? null : null), backgroundColor: "#4a7c59" }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: c => won(c.parsed.y) } }
      },
      scales: { y: { beginAtZero: true, ticks: { callback: v => won(v) } } }
    }
  });
}

function paintHeadline(days) {
  const latest = [...days].reverse().find(d => d.data);
  if (!latest) {
    headline.textContent = "최근 7일 동안 집계된 문서가 없습니다";
    counted.textContent = "";
    return;
  }
  headline.textContent = latest.label + "까지의 매출입니다 - 매일 00:05에 전날을 셉니다";
  counted.textContent = "마지막으로 센 시각 : " + when(latest.data.countedAt);
}

// 차트 아래 한 줄 - 이미 읽어 둔 일곱 장만 더한다 (문서가 없는 날은 빼고 빠진 날 수를 괄호에)
function paintSum(days) {
  const have = days.filter(d => d.data);
  const sales = have.reduce((n, d) => n + (Number(d.data.totalSales) || 0), 0);
  const count = have.reduce((n, d) => n + (Number(d.data.orderCount) || 0), 0);
  const missing = days.length - have.length;
  sum.textContent = "최근 7일 합계 " + sales.toLocaleString("ko-KR") + "원 - 주문 " + count.toLocaleString("ko-KR") + "건 "
    + (missing ? "(집계 없는 날 " + missing + "일은 빼고 더함)" : "(집계 없는 날 없음)");
}

async function loadSales() {
  say("읽는 중…");
  const days = lastDays();
  try {
    // 날짜마다 dailyStats 문서 한 장씩만
    const snaps = await Promise.all(days.map(d => getDoc(doc(db, "dailyStats", d.id))));
    snaps.forEach((s, i) => { days[i].data = s.exists() ? s.data() : null; });
  } catch (err) {
    console.error(err);
    say("매출을 읽지 못했습니다 - 자세한 오류는 브라우저 콘솔에 있습니다.", true);
    return;
  }
  say("");
  paintHeadline(days);
  paintChart(days);
  paintSum(days);
  paintTable(days);
}

// admin.js 가 부른다 - 입구가 관리자이면 true
export async function showSales(show) {
  if (!show) {
    if (chart) chart.destroy();
    chart = null;
    rows.replaceChildren();
    headline.textContent = "";
    counted.textContent = "";
    sum.textContent = "";
    return;
  }
  await loadSales();
}
