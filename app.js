// 알바 출퇴근 관리 — 정적 웹 버전 (GitHub Pages)
// 서버가 없으므로 데이터는 이 브라우저의 localStorage에 저장된다.

const TIME_ZONE = "Asia/Seoul";
const ADMIN_PIN = "1234";
const STORE_KEY = "alba-attendance:v1";
const ADMIN_KEY = "alba-attendance:admin";
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const MAX_VISIBLE = 3;
const PIN_LENGTH = 4;

// 2026년 대한민국 법정공휴일 (대체공휴일 포함)
const HOLIDAYS = {
  "2026-01-01": "신정",
  "2026-02-16": "설날 연휴",
  "2026-02-17": "설날",
  "2026-02-18": "설날 연휴",
  "2026-03-01": "삼일절",
  "2026-03-02": "대체공휴일",
  "2026-05-01": "노동절",
  "2026-05-05": "어린이날",
  "2026-05-24": "부처님오신날",
  "2026-05-25": "대체공휴일",
  "2026-06-06": "현충일",
  "2026-07-17": "제헌절",
  "2026-08-15": "광복절",
  "2026-08-17": "대체공휴일",
  "2026-09-24": "추석 연휴",
  "2026-09-25": "추석",
  "2026-09-26": "추석 연휴",
  "2026-10-03": "개천절",
  "2026-10-05": "대체공휴일",
  "2026-10-09": "한글날",
  "2026-12-25": "크리스마스",
};

// ---------- 날짜 ----------

function dateStringFor(d) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function todayDateString() {
  return dateStringFor(new Date());
}

function formatTime(iso) {
  if (!iso) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function hoursBetween(start, end) {
  if (!start || !end) return 0;
  return Math.max(0, (new Date(end) - new Date(start)) / 3_600_000);
}

function formatDateHeading(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: TIME_ZONE,
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date(Date.UTC(y, m - 1, d, 3)));
}

// 해당 날짜(KST)의 hh:mm 시각을 ISO 문자열로
function kstIso(dateStr, hh, mm) {
  return new Date(`${dateStr}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00+09:00`).toISOString();
}

function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

// ---------- 저장소 ----------

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function sampleData() {
  const employees = [
    { id: uid(), name: "김민수", phone: "01012345678", hourlyWage: 10030, active: true },
    { id: uid(), name: "이서연", phone: null, hourlyWage: 10030, active: true },
    { id: uid(), name: "박지훈", phone: null, hourlyWage: 10500, active: true },
  ];
  const today = todayDateString();
  const records = [];
  const shifts = [
    [0, 9, 0, 15, 0],
    [1, 15, 0, 21, 30],
    [2, 10, 0, 16, 0],
  ];
  for (let back = 1; back <= 12; back++) {
    const date = addDays(today, -back);
    shifts.forEach(([idx, ih, im, oh, om], i) => {
      if ((back + i) % 3 === 0) return; // 쉬는 날
      records.push({
        id: uid(),
        employeeId: employees[idx].id,
        date,
        clockIn: kstIso(date, ih, im),
        clockOut: kstIso(date, oh, om),
        createdAt: kstIso(date, ih, im),
      });
    });
  }
  // 오늘 근무중인 직원 한 명
  const startedAt = new Date(Date.now() - 2 * 3_600_000).toISOString();
  records.push({ id: uid(), employeeId: employees[0].id, date: today, clockIn: startedAt, clockOut: null, createdAt: startedAt });
  return { employees, records };
}

function loadStore() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return sampleData();
}

let store = loadStore();

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch {}
}

save();

function employeeById(id) {
  return store.employees.find((e) => e.id === id);
}

function recordsOn(date) {
  return store.records
    .filter((r) => r.date === date && employeeById(r.employeeId))
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
}

function clockIn(employeeId) {
  const emp = employeeById(employeeId);
  if (!emp || !emp.active) return "직원을 찾을 수 없습니다.";
  const date = todayDateString();
  if (store.records.some((r) => r.employeeId === employeeId && r.date === date && r.clockIn)) {
    return "이미 출근 처리되었습니다.";
  }
  const now = new Date().toISOString();
  store.records.push({ id: uid(), employeeId, date, clockIn: now, clockOut: null, createdAt: now });
  save();
  return null;
}

function clockOut(employeeId) {
  const date = todayDateString();
  const rec = store.records.find((r) => r.employeeId === employeeId && r.date === date);
  if (!rec?.clockIn) return "출근 기록이 없습니다.";
  if (rec.clockOut) return "이미 퇴근 처리되었습니다.";
  rec.clockOut = new Date().toISOString();
  save();
  return null;
}

function isAdmin() {
  try {
    return sessionStorage.getItem(ADMIN_KEY) === "1";
  } catch {
    return false;
  }
}

function setAdmin(on) {
  try {
    if (on) sessionStorage.setItem(ADMIN_KEY, "1");
    else sessionStorage.removeItem(ADMIN_KEY);
  } catch {}
}

// ---------- 유틸 ----------

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

const app = document.getElementById("app");
const isDesktop = () => window.matchMedia("(min-width: 768px)").matches;

// ---------- 상태 ----------

const state = {
  year: 0,
  month: 0,
  selectedDate: null,
  unlockOpen: false,
  pin: "",
  sheet: null, // { type: "picker" | "detail", date, recordId }
  error: "",
  records: { from: "", to: "", employeeId: "" },
};

{
  const t = todayDateString();
  state.year = Number(t.slice(0, 4));
  state.month = Number(t.slice(5, 7));
  state.records.from = addDays(t, -6);
  state.records.to = t;
}

// ---------- 화면: 홈 ----------

function renderUnlock() {
  if (!state.unlockOpen) {
    return `<div class="unlock"><button type="button" class="unlock-title" data-action="open-unlock">MGC · 춘천온의파크점</button></div>`;
  }
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "submit"];
  const backspace = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.2 5H20a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9.2a2 2 0 0 1-1.5-.7L2.8 13.3a2 2 0 0 1 0-2.6l4.9-5A2 2 0 0 1 9.2 5Z"/><path d="m11.5 9 6 6m0-6-6 6"/></svg>`;
  return `
    <div class="unlock" id="unlock">
      <input id="pin-input" class="pin-input" type="password" inputmode="none" readonly aria-label="관리자 번호" value="${esc(state.pin)}" />
      <div class="keypad">
        ${keys
          .map((k) => {
            const label = k === "clear" ? backspace : k === "submit" ? "→" : k;
            const aria = k === "clear" ? ' aria-label="관리자 번호 지우기"' : k === "submit" ? ' aria-label="관리자 로그인"' : "";
            return `<button type="button" data-key="${k}"${aria}>${label}</button>`;
          })
          .join("")}
      </div>
    </div>`;
}

function renderCalendar() {
  const { year, month, selectedDate } = state;
  const today = todayDateString();
  const startWeekday = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();

  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }

  const body = cells
    .map((date, i) => {
      if (!date) return `<div class="empty-cell"></div>`;
      const entries = recordsOn(date);
      const holiday = HOLIDAYS[date];
      const isRest = i % 7 === 0 || Boolean(holiday);
      const numClass = date === today ? "today" : isRest ? "rest" : "";
      const chips = [
        holiday ? `<span class="chip holiday">${esc(holiday)}</span>` : "",
        ...entries.slice(0, MAX_VISIBLE).map((r) => {
          const working = r.clockIn && !r.clockOut;
          return `<span class="chip${working ? " working" : ""}">${esc(employeeById(r.employeeId).name)}</span>`;
        }),
        entries.length > MAX_VISIBLE ? `<span class="chip more">+${entries.length - MAX_VISIBLE}명 더보기</span>` : "",
      ].join("");
      return `
        <button type="button" class="cell${date === selectedDate ? " selected" : ""}" data-date="${date}">
          <span class="day-num ${numClass}">${Number(date.slice(-2))}</span>
          <span class="dot${entries.length ? " on" : ""}"></span>
          <div class="entries">${chips}</div>
        </button>`;
    })
    .join("");

  return `
    <div class="cal-head">
      <button type="button" class="round-btn" data-action="prev-month" aria-label="이전 달">‹</button>
      <p class="cal-title">${year}년 ${month}월</p>
      <button type="button" class="round-btn" data-action="next-month" aria-label="다음 달">›</button>
    </div>
    <div class="grid">
      ${WEEKDAYS.map((w) => `<div class="weekday">${w}</div>`).join("")}
      ${body}
    </div>`;
}

function renderDayPanel(date, { closable }) {
  const records = recordsOn(date);
  const isToday = date === todayDateString();
  const rows = records
    .map((r) => {
      const working = r.clockIn && !r.clockOut;
      return `
        <button type="button" class="row" data-action="detail" data-id="${r.id}">
          <div>
            <p class="row-name">${esc(employeeById(r.employeeId).name)}</p>
            <p class="sub">${formatTime(r.clockIn)} ~ ${formatTime(r.clockOut)}</p>
          </div>
          <span class="badge${working ? " working" : ""}">${working ? "근무중" : "퇴근"}</span>
        </button>`;
    })
    .join("");

  return `
    <div class="panel">
      <div class="panel-head">
        <div>
          <p class="panel-title">${formatDateHeading(date)}</p>
          <p class="sub">${records.length}명 근무</p>
        </div>
        ${closable ? `<button type="button" class="close-btn" data-action="close-panel" aria-label="닫기">×</button>` : ""}
      </div>
      <div class="list">
        ${rows || `<div class="empty">근무 기록이 없습니다.</div>`}
      </div>
      ${isToday ? `<button type="button" class="btn-primary mt" data-action="open-picker">+ 출근 추가</button>` : ""}
    </div>`;
}

function renderSheet() {
  const s = state.sheet;
  if (!s) return "";
  const err = state.error ? `<p class="error">${esc(state.error)}</p>` : "";

  if (s.type === "picker") {
    const date = todayDateString();
    const clockedIn = new Set(store.records.filter((r) => r.date === date && r.clockIn).map((r) => r.employeeId));
    const available = store.employees.filter((e) => e.active && !clockedIn.has(e.id));
    return `
      <div class="sheet-backdrop" data-action="close-sheet">
        <div class="sheet" data-stop>
          <p class="sheet-title">출근할 직원 선택</p>
          ${err}
          <div class="pick">
            ${available.map((e) => `<button type="button" data-action="clock-in" data-id="${e.id}">${esc(e.name)}</button>`).join("")}
            ${available.length ? "" : `<p class="empty" style="padding:16px 0">출근 가능한 직원이 없습니다.</p>`}
          </div>
        </div>
      </div>`;
  }

  const r = store.records.find((x) => x.id === s.recordId);
  if (!r) return "";
  const isToday = r.date === todayDateString();
  return `
    <div class="sheet-backdrop" data-action="close-sheet">
      <div class="sheet" data-stop>
        <p class="sheet-title" style="margin-bottom:16px">${esc(employeeById(r.employeeId).name)}</p>
        <div class="detail">
          <div><span>출근</span><span>${formatTime(r.clockIn)}</span></div>
          <div><span>퇴근</span><span>${formatTime(r.clockOut)}</span></div>
          ${r.clockOut ? `<div class="total"><span>근무 시간</span><span>${hoursBetween(r.clockIn, r.clockOut).toFixed(1)}시간</span></div>` : ""}
        </div>
        ${err}
        ${
          isToday && !r.clockOut
            ? `<button type="button" class="btn-primary" style="padding:12px 0" data-action="clock-out" data-id="${r.employeeId}">퇴근하기</button>`
            : `<button type="button" class="btn-secondary" data-action="close-sheet">닫기</button>`
        }
      </div>
    </div>`;
}

function demoNote() {
  return `<p class="demo-note">데모 버전 · 데이터는 이 기기의 브라우저에만 저장됩니다 · <button type="button" data-action="reset-data">샘플 데이터로 초기화</button></p>`;
}

function renderHome() {
  const sel = state.selectedDate;
  return `
    <div class="home">
      <div class="home-inner">
        ${renderUnlock()}
        <div class="card">
          <div class="cal-wrap">${renderCalendar()}</div>
          ${sel ? `<div class="side">${renderDayPanel(sel, { closable: true })}</div>` : ""}
        </div>
      </div>
    </div>
    ${demoNote()}
    ${renderSheet()}`;
}

function renderDayPage(date) {
  return `
    <div class="day-page">
      <div class="day-page-inner">
        <button type="button" class="round-btn" data-action="go-home" aria-label="달력으로 돌아가기">‹</button>
        <div class="box">${renderDayPanel(date, { closable: false })}</div>
      </div>
    </div>
    ${renderSheet()}`;
}

// ---------- 화면: 관리자 ----------

function renderAdminShell(active, content) {
  const link = (href, label, key) => `<a href="${href}" class="${active === key ? "active" : ""}">${label}</a>`;
  return `
    <header class="admin-header">
      <div class="admin-header-inner">
        <a href="#/" class="admin-brand">알바 관리자</a>
        <nav class="admin-nav">
          ${link("#/", "출퇴근 화면", "home")}
          ${link("#/admin/employees", "직원 관리", "employees")}
          ${link("#/admin/records", "근무 기록", "records")}
          <button type="button" data-action="logout">로그아웃</button>
        </nav>
      </div>
    </header>
    <main class="admin-main">${content}</main>`;
}

function renderEmployees() {
  const rows = store.employees
    .map(
      (e) => `
      <tr>
        <td class="name">${esc(e.name)}</td>
        <td class="muted">${esc(e.phone || "-")}</td>
        <td><input class="field" style="width:96px;padding:4px 8px" type="number" value="${e.hourlyWage}" data-wage="${e.id}" /></td>
        <td><button type="button" class="status${e.active ? " on" : ""}" data-action="toggle-active" data-id="${e.id}">${e.active ? "재직중" : "비활성"}</button></td>
        <td><button type="button" class="danger" data-action="remove-employee" data-id="${e.id}">삭제</button></td>
      </tr>`,
    )
    .join("");

  return renderAdminShell(
    "employees",
    `
    <h2>직원 관리</h2>
    <form class="toolbar" id="add-employee" style="margin-bottom:32px">
      <div><label for="f-name">이름</label><input id="f-name" class="field" style="width:112px" required /></div>
      <div><label for="f-phone">전화번호 (선택)</label><input id="f-phone" class="field" style="width:144px" placeholder="01012345678" /></div>
      <div><label for="f-wage">시급(원)</label><input id="f-wage" class="field" style="width:112px" type="number" value="10030" required /></div>
      <button type="submit" class="pill">추가</button>
    </form>
    <div class="table-wrap">
      <table>
        <thead><tr><th>이름</th><th>전화번호</th><th>시급</th><th>상태</th><th>관리</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="5" class="empty">등록된 직원이 없습니다.</td></tr>`}</tbody>
      </table>
    </div>`,
  );
}

function queryRecords() {
  const { from, to, employeeId } = state.records;
  return store.records
    .filter((r) => employeeById(r.employeeId))
    .filter((r) => (!employeeId || r.employeeId === employeeId) && (!from || r.date >= from) && (!to || r.date <= to))
    .sort((a, b) => (a.date === b.date ? (a.createdAt < b.createdAt ? -1 : 1) : a.date < b.date ? 1 : -1))
    .map((r) => {
      const emp = employeeById(r.employeeId);
      const hours = hoursBetween(r.clockIn, r.clockOut);
      return { ...r, employeeName: emp.name, hours, pay: Math.round(hours * emp.hourlyWage) };
    });
}

function renderRecords() {
  const { from, to, employeeId } = state.records;
  const records = queryRecords();
  const totalHours = records.reduce((s, r) => s + r.hours, 0);
  const totalPay = records.reduce((s, r) => s + r.pay, 0);

  const rows = records
    .map(
      (r) => `
      <tr>
        <td>${r.date}</td>
        <td class="name">${esc(r.employeeName)}</td>
        <td>${formatTime(r.clockIn)}</td>
        <td>${formatTime(r.clockOut)}</td>
        <td>${r.hours.toFixed(1)}시간</td>
        <td>${r.pay.toLocaleString()}원</td>
      </tr>`,
    )
    .join("");

  return renderAdminShell(
    "records",
    `
    <h2>근무 기록</h2>
    <div class="toolbar">
      <div><label for="r-from">시작일</label><input id="r-from" class="field" type="date" value="${from}" data-filter="from" /></div>
      <div><label for="r-to">종료일</label><input id="r-to" class="field" type="date" value="${to}" data-filter="to" /></div>
      <div>
        <label for="r-emp">직원</label>
        <select id="r-emp" class="field" data-filter="employeeId">
          <option value="">전체</option>
          ${store.employees.map((e) => `<option value="${e.id}"${e.id === employeeId ? " selected" : ""}>${esc(e.name)}</option>`).join("")}
        </select>
      </div>
      <button type="button" class="pill plain" data-action="export-csv"${records.length ? "" : " disabled"}>CSV 내보내기</button>
      <p class="totals">합계 <b>${totalHours.toFixed(1)}시간</b> · <b>${totalPay.toLocaleString()}원</b></p>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>날짜</th><th>이름</th><th>출근</th><th>퇴근</th><th>근무시간</th><th>급여</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="6" class="empty">조회된 기록이 없습니다.</td></tr>`}</tbody>
      </table>
    </div>`,
  );
}

// ---------- 라우팅 ----------

function route() {
  const hash = location.hash.replace(/^#/, "") || "/";
  const day = hash.match(/^\/day\/(\d{4}-\d{2}-\d{2})$/);
  if (day) return { name: "day", date: day[1] };
  if (hash.startsWith("/admin")) {
    if (!isAdmin()) return { name: "home" };
    return { name: hash === "/admin/records" ? "records" : "employees" };
  }
  return { name: "home" };
}

function render() {
  const r = route();
  if (r.name === "day") app.innerHTML = renderDayPage(r.date);
  else if (r.name === "employees") app.innerHTML = renderEmployees();
  else if (r.name === "records") app.innerHTML = renderRecords();
  else app.innerHTML = renderHome();

  if (state.unlockOpen) document.getElementById("pin-input")?.focus();
}

function navigate(hash) {
  state.sheet = null;
  state.error = "";
  if (location.hash === hash) render();
  else location.hash = hash;
}

window.addEventListener("hashchange", () => {
  state.sheet = null;
  state.error = "";
  state.unlockOpen = false;
  state.pin = "";
  render();
});

// ---------- PIN ----------

function submitPin() {
  if (state.pin === ADMIN_PIN) {
    setAdmin(true);
    state.unlockOpen = false;
    state.pin = "";
    navigate("#/admin/employees");
    return;
  }
  state.pin = "";
  render();
  const input = document.getElementById("pin-input");
  input?.classList.add("shake");
  setTimeout(() => input?.classList.remove("shake"), 900);
}

function enterKey(key) {
  if (key === "submit") return submitPin();
  if (key === "clear") state.pin = state.pin.slice(0, -1);
  else state.pin = (state.pin + key).slice(0, PIN_LENGTH);
  if (state.pin.length >= PIN_LENGTH) return submitPin();
  render();
}

// ---------- 이벤트 ----------

function currentDayDate() {
  const r = route();
  return r.name === "day" ? r.date : state.selectedDate;
}

app.addEventListener("click", (e) => {
  const keyBtn = e.target.closest("[data-key]");
  if (keyBtn) {
    enterKey(keyBtn.dataset.key);
    return;
  }

  // 키패드 바깥을 누르면 PIN 입력 닫기
  const closedUnlock = state.unlockOpen && !e.target.closest("#unlock");
  if (closedUnlock) {
    state.unlockOpen = false;
    state.pin = "";
  }

  const cell = e.target.closest("[data-date]");
  if (cell) {
    if (isDesktop()) {
      state.selectedDate = cell.dataset.date;
      render();
    } else {
      navigate(`#/day/${cell.dataset.date}`);
    }
    return;
  }

  const el = e.target.closest("[data-action]");
  // 시트 안쪽을 누른 경우 바깥(backdrop)의 닫기 동작은 무시
  const insideSheet = el?.classList.contains("sheet-backdrop") && e.target.closest("[data-stop]");
  if (!el || insideSheet) {
    if (closedUnlock) render();
    return;
  }
  const { action, id } = el.dataset;

  switch (action) {
    case "open-unlock":
      state.unlockOpen = true;
      state.pin = "";
      break;
    case "prev-month":
    case "next-month": {
      const m = state.month + (action === "prev-month" ? -1 : 1);
      state.year += m < 1 ? -1 : m > 12 ? 1 : 0;
      state.month = m < 1 ? 12 : m > 12 ? 1 : m;
      break;
    }
    case "close-panel":
      state.selectedDate = null;
      break;
    case "go-home":
      navigate("#/");
      return;
    case "detail":
      state.error = "";
      state.sheet = { type: "detail", recordId: id };
      break;
    case "open-picker":
      state.error = "";
      state.sheet = { type: "picker", date: currentDayDate() };
      break;
    case "close-sheet":
      state.sheet = null;
      break;
    case "clock-in":
      state.error = clockIn(id) || "";
      if (!state.error) state.sheet = null;
      break;
    case "clock-out":
      state.error = clockOut(id) || "";
      if (!state.error) state.sheet = null;
      break;
    case "logout":
      setAdmin(false);
      navigate("#/");
      return;
    case "toggle-active": {
      const emp = employeeById(id);
      emp.active = !emp.active;
      save();
      break;
    }
    case "remove-employee": {
      const emp = employeeById(id);
      if (!window.confirm(`${emp.name}님을 삭제하시겠습니까? 근무 기록도 함께 삭제됩니다.`)) return;
      store.employees = store.employees.filter((x) => x.id !== id);
      store.records = store.records.filter((x) => x.employeeId !== id);
      save();
      break;
    }
    case "export-csv":
      exportCsv();
      return;
    case "reset-data":
      if (!window.confirm("모든 데이터를 지우고 샘플 데이터로 되돌릴까요?")) return;
      store = sampleData();
      save();
      state.selectedDate = null;
      break;
    default:
      return;
  }
  render();
});

app.addEventListener("keydown", (e) => {
  if (!state.unlockOpen) return;
  if (/^[0-9]$/.test(e.key)) {
    e.preventDefault();
    enterKey(e.key);
  } else if (e.key === "Backspace") {
    e.preventDefault();
    enterKey("clear");
  } else if (e.key === "Enter") {
    submitPin();
  } else if (e.key === "Escape") {
    state.unlockOpen = false;
    state.pin = "";
    render();
  }
});

// 키패드 버튼이 입력창 포커스를 뺏지 않도록
app.addEventListener("pointerdown", (e) => {
  if (e.target.closest("[data-key]")) e.preventDefault();
});

app.addEventListener("submit", (e) => {
  if (e.target.id !== "add-employee") return;
  e.preventDefault();
  const name = document.getElementById("f-name").value.trim();
  const phone = document.getElementById("f-phone").value.trim();
  const wage = Number(document.getElementById("f-wage").value);
  if (!name) return;
  store.employees.push({ id: uid(), name, phone: phone || null, hourlyWage: Number.isFinite(wage) ? wage : 0, active: true });
  save();
  render();
});

app.addEventListener("change", (e) => {
  const wageId = e.target.dataset.wage;
  if (wageId) {
    const wage = Number(e.target.value);
    if (Number.isFinite(wage)) {
      employeeById(wageId).hourlyWage = wage;
      save();
    }
    return;
  }
  const filter = e.target.dataset.filter;
  if (filter) {
    state.records[filter] = e.target.value;
    render();
  }
});

function exportCsv() {
  const { from, to } = state.records;
  const header = ["날짜", "이름", "출근", "퇴근", "근무시간", "급여"];
  const rows = queryRecords().map((r) => [r.date, r.employeeName, formatTime(r.clockIn), formatTime(r.clockOut), r.hours.toFixed(2), String(r.pay)]);
  const csv = [header, ...rows].map((row) => row.join(",")).join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `attendance_${from}_${to}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// 화면 크기가 바뀌어 모바일 날짜 페이지가 데스크탑이 되면 홈 패널로 전환
window.matchMedia("(min-width: 768px)").addEventListener("change", (mq) => {
  const r = route();
  if (mq.matches && r.name === "day") {
    state.selectedDate = r.date;
    navigate("#/");
  }
});

render();
