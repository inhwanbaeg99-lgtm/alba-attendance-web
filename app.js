// 알바 출퇴근 관리 — 정적 웹 버전 (GitHub Pages)
// 서버가 없으므로 데이터는 이 브라우저의 localStorage에 저장된다.

const TIME_ZONE = "Asia/Seoul";
const ADMIN_PIN = "1234";
const STORE_KEY = "alba-attendance:v5";
const DEFAULT_WAGE = 10320; // 2026년 최저시급
const ADMIN_KEY = "alba-attendance:admin";
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const MAX_VISIBLE = 5;
const PIN_LENGTH = 4;
const PANEL_ANIM_MS = 320;

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
    hour12: false,
  }).format(new Date(iso));
}

function hoursBetween(start, end) {
  if (!start || !end) return 0;
  return Math.max(0, (new Date(end) - new Date(start)) / 3_600_000);
}

function weekdayOf(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

// 해당 날짜(KST)의 "HH:MM" 시각을 ISO 문자열로
function kstIso(dateStr, hhmm) {
  return new Date(`${dateStr}T${hhmm}:00+09:00`).toISOString();
}

// 근무 종료 시각 (종료가 시작보다 이르면 자정을 넘긴 것으로 본다)
function endIso(date, start, end) {
  return kstIso(end > start ? date : addDays(date, 1), end);
}

function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

// ---------- 저장소 ----------

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// 요일별 근무표 (0=일 … 6=토). 같은 사람도 요일마다 시간이 다를 수 있다.
const INITIAL_SCHEDULE = [
  ["배예빈", { 1: "07:00~12:00", 2: "07:00~12:00", 3: "07:00~15:00", 4: "07:00~12:00", 6: "10:00~15:00" }],
  ["백인환", { 1: "12:00~18:00", 3: "15:00~22:30", 4: "15:00~23:00", 5: "12:00~18:00" }],
  ["이시헌", { 1: "18:00~22:30", 5: "18:00~23:00", 6: "15:00~23:00", 0: "15:00~22:30" }],
  ["정현욱", { 1: "18:00~22:30", 2: "18:00~22:30", 4: "18:00~23:00" }],
  ["김예린", { 2: "12:00~18:00", 3: "12:00~18:00", 5: "07:00~12:00" }],
  ["최수빈", { 2: "18:00~22:30", 6: "10:00~18:00", 0: "10:00~15:00" }],
  ["백인서", { 3: "18:00~22:30" }],
  ["손민영", { 4: "12:00~18:00" }],
  ["최광효", { 5: "18:00~23:00", 6: "18:00~23:00", 0: "16:00~22:30" }],
];

function initialData() {
  const employees = INITIAL_SCHEDULE.map(([name, days]) => ({
    id: uid(),
    name,
    phone: null,
    hourlyWage: DEFAULT_WAGE,
    active: true,
    weekly: Object.fromEntries(Object.entries(days).map(([wd, range]) => [wd, parseRange(range)])),
  }));
  // 이번 달 1일부터 어제까지는 근무표대로 출근한 것으로 채워 둔다
  const records = [];
  const today = todayDateString();
  for (let date = `${today.slice(0, 7)}-01`; date < today; date = addDays(date, 1)) {
    for (const e of employees) {
      const shift = e.weekly[weekdayOf(date)];
      if (!shift) continue;
      const clockIn = kstIso(date, shift.start);
      records.push({ id: uid(), employeeId: e.id, date, clockIn, clockOut: endIso(date, shift.start, shift.end), createdAt: clockIn });
    }
  }
  return { employees, records, shifts: {} };
}

function loadStore() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return { shifts: {}, ...JSON.parse(raw) };
  } catch {}
  return initialData();
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
    .sort((a, b) => (a.clockIn < b.clockIn ? -1 : 1));
}

function recordFor(employeeId, date) {
  return store.records.find((r) => r.employeeId === employeeId && r.date === date);
}

// 그날의 근무 시간: 날짜별로 수정한 시간(store.shifts)이 있으면 그것, 없으면 직원 기본 시간
function shiftFor(emp, date) {
  return store.shifts[date]?.[emp.id] ?? emp.weekly[weekdayOf(date)] ?? { start: "09:00", end: "18:00" };
}

function setShift(empId, date, start, end) {
  store.shifts[date] = { ...store.shifts[date], [empId]: { start, end } };
}

// 근무 요일에 해당하는 직원 + 그날만 추가로 등록된 직원
function scheduledOn(date) {
  const wd = weekdayOf(date);
  const extra = store.shifts[date] ?? {};
  return store.employees
    .filter((e) => e.active && (e.weekly[wd] || extra[e.id]))
    .sort((a, b) => (shiftFor(a, date).start < shiftFor(b, date).start ? -1 : 1));
}

// 퇴근은 따로 누르지 않으므로, 퇴근 시각은 그날 근무 종료 시간으로 본다 (자정을 넘기면 다음 날)
function scheduledEnd(emp, date) {
  const { start, end } = shiftFor(emp, date);
  return endIso(date, start, end);
}

function clockIn(employeeId) {
  const emp = employeeById(employeeId);
  if (!emp || !emp.active) return "직원을 찾을 수 없습니다.";
  const date = todayDateString();
  if (recordFor(employeeId, date)?.clockIn) return "이미 출근 처리되었습니다.";
  const now = new Date().toISOString();
  const end = scheduledEnd(emp, date);
  store.records.push({ id: uid(), employeeId, date, clockIn: now, clockOut: end > now ? end : now, createdAt: now });
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

// ---------- 아이콘 ----------

const svg = (size, d, stroke = 2.25) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICON_PREV = svg(22, '<path d="m15 18-6-6 6-6"/>');
const ICON_NEXT = svg(22, '<path d="m9 18 6-6-6-6"/>');
const ICON_CLOSE = svg(18, '<path d="M18 6 6 18M6 6l12 12"/>', 2.5);

// ---------- 시간 입력 ----------
// 시계/드롭다운 없이 키보드로 입력: "0930", "930", "9" 모두 "09:30"/"09:00" 으로 맞춘다.

function normalizeTime(text) {
  const digits = String(text).replace(/\D/g, "");
  if (!digits) return null;
  let hh, mm;
  if (digits.length <= 2) [hh, mm] = [digits, "00"];
  else if (digits.length === 3) [hh, mm] = [digits.slice(0, 1), digits.slice(1)];
  else [hh, mm] = [digits.slice(0, 2), digits.slice(2, 4)];
  if (Number(hh) > 23 || Number(mm) > 59) return null;
  return `${hh.padStart(2, "0")}:${mm}`;
}

// "7-12", "07:00~12:00", "18-2230" 같은 근무 시간 범위. 틀리면 null.
function parseRange(text) {
  const parts = String(text).split(/[~\-–]/);
  if (parts.length !== 2) return null;
  const start = normalizeTime(parts[0]);
  const end = normalizeTime(parts[1]);
  return start && end ? { start, end } : null;
}

const formatRange = (r) => (r ? `${r.start}~${r.end}` : "");

// 비워 두면 placeholder(기존 시간)를 그대로 쓴다. 형식이 틀리면 null.
function readTime(id) {
  const el = document.getElementById(id);
  if (!el.value.trim()) return el.placeholder;
  return normalizeTime(el.value);
}

function timeInput(id, placeholder, label, extra = "") {
  return `<input id="${id}" class="field time" type="text" inputmode="numeric" maxlength="5" autocomplete="off" placeholder="${placeholder}" aria-label="${label}"${extra} />`;
}

// ---------- 상태 ----------

const state = {
  year: 0,
  month: 0,
  selectedDate: null,
  animateOpen: false,
  expandedId: null, // 이름을 눌러 출근/수정 버튼이 펼쳐진 직원
  editingId: null, // 근무 시간을 수정 중인 직원
  editingWhere: null, // "staff"(근무자 목록) 또는 "box"(날짜 박스)
  adding: false, // + 로 일정에 없던 인원 등록 중
  justAddedId: null, // 방금 출근한 기록 (날짜 박스에서 한 번만 애니메이션)
  unlockOpen: false,
  pin: "",
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
  while (cells.length % 7) cells.push(null);

  const body = cells
    .map((date, i) => {
      if (!date) return `<div class="empty-cell"></div>`;
      const entries = recordsOn(date);
      const holiday = HOLIDAYS[date];
      const isRest = i % 7 === 0 || Boolean(holiday);
      const numClass = date === today ? "today" : isRest ? "rest" : "";
      const chips = [
        ...entries.slice(0, MAX_VISIBLE).map((r) => `<span class="chip">${esc(employeeById(r.employeeId).name)}</span>`),
        entries.length > MAX_VISIBLE ? `<span class="chip more">+${entries.length - MAX_VISIBLE}명</span>` : "",
      ].join("");
      return `
        <button type="button" class="cell${date === selectedDate ? " selected" : ""}" data-date="${date}">
          <span class="cell-top">
            <span class="day-num ${numClass}">${Number(date.slice(-2))}</span>
            ${holiday ? `<span class="chip holiday">${esc(holiday)}</span>` : ""}
          </span>
          <span class="dot${entries.length ? " on" : ""}"></span>
          <div class="entries">${chips}</div>
        </button>`;
    })
    .join("");

  return `
    <div class="cal-head">
      <button type="button" class="round-btn" data-action="prev-month" aria-label="이전 달">${ICON_PREV}</button>
      <p class="cal-title">${year}년 ${month}월</p>
      <button type="button" class="round-btn" data-action="next-month" aria-label="다음 달">${ICON_NEXT}</button>
    </div>
    <div class="grid">
      ${WEEKDAYS.map((w, i) => `<div class="weekday${i === 0 ? " rest" : ""}">${w}</div>`).join("")}
      ${body}
    </div>`;
}

// 날짜 박스: 그날 출근한 사람들
function renderDateBox(date, { closable }) {
  const [, m, d] = date.split("-").map(Number);
  const wd = weekdayOf(date);
  const holiday = HOLIDAYS[date];
  const isRest = wd === 0 || Boolean(holiday);
  const records = recordsOn(date);

  const rows = records
    .map(
      (r) => `
        <li class="in-item${r.id === state.justAddedId ? " new" : ""}">
          <div class="in-row">
            <span class="in-name">${esc(employeeById(r.employeeId).name)}</span>
            <span class="in-time">${formatTime(r.clockIn)} ~ ${formatTime(r.clockOut)}</span>
          </div>
        </li>`,
    )
    .join("");

  return `
    <section class="date-box" aria-label="${m}월 ${d}일 출근 기록">
      <div class="date-box-head">
        <div>
          <p class="date-box-month">${m}월</p>
          <p class="date-box-day${isRest ? " rest" : ""}">${d}</p>
          <p class="date-box-wd${isRest ? " rest" : ""}">${WEEKDAYS[wd]}요일${holiday ? ` · ${esc(holiday)}` : ""}</p>
        </div>
        ${closable ? `<button type="button" class="close-btn" data-action="close-panel" aria-label="닫기">${ICON_CLOSE}</button>` : ""}
      </div>
      <p class="box-label">출근 ${records.length}명</p>
      <ul class="in-list">
        ${rows || `<li class="in-empty">아직 출근한 사람이 없어요</li>`}
      </ul>
    </section>`;
}

function renderStaffItem(emp, date) {
  const today = todayDateString();
  const isToday = date === today;
  const editable = date >= today;
  const rec = recordFor(emp.id, date);
  const done = Boolean(rec?.clockIn);
  const { start, end } = shiftFor(emp, date);
  const expanded = editable && state.expandedId === emp.id;

  let action = "";
  if (expanded && state.editingWhere === "staff" && state.editingId === emp.id) {
    action = renderTimeEditor(emp.id, start, end);
  } else if (expanded) {
    action = `
      <div class="action-row">
        ${isToday && !done ? `<button type="button" class="btn-primary" data-action="clock-in" data-id="${emp.id}">출근</button>` : ""}
        <button type="button" class="btn-ghost" data-action="edit-shift" data-id="${emp.id}">수정</button>
      </div>`;
  }
  if (expanded && state.error && state.editingWhere !== "staff") action += `<p class="error">${esc(state.error)}</p>`;

  return `
    <li class="staff-item${expanded ? " expanded" : ""}">
      <button type="button" class="staff-name-btn" data-action="toggle-staff" data-id="${emp.id}"${editable ? "" : " disabled"}>
        <span class="staff-name">${esc(emp.name)}</span>
        ${done ? `<span class="badge done">출근 완료</span>` : ""}
        <span class="staff-time">${start} ~ ${end}</span>
      </button>
      ${action ? `<div class="staff-action">${action}</div>` : ""}
    </li>`;
}

// 시간 수정 칸 (근무자 목록·날짜 박스 공용). 비워 두면 기존 시간 유지.
function renderTimeEditor(empId, start, end) {
  return `
    <div class="edit-row">
      ${timeInput("edit-start", start, "시작 시간")}
      <span>~</span>
      ${timeInput("edit-end", end, "종료 시간")}
    </div>
    <div class="action-row">
      <button type="button" class="btn-primary" data-action="save-shift" data-id="${empId}">저장</button>
      <button type="button" class="btn-ghost" data-action="cancel-edit">취소</button>
    </div>
    ${state.error ? `<p class="error">${esc(state.error)}</p>` : ""}`;
}

function renderAddExtra() {
  if (!state.adding) {
    return `<button type="button" class="add-btn" data-action="open-add" aria-label="근무자 추가">+</button>`;
  }
  return `
    <form class="add-form" id="add-extra">
      <input id="extra-name" class="field" placeholder="이름" required autocomplete="off" />
      <div class="edit-row">
        ${timeInput("extra-start", "09:00", "시작 시간")}
        <span>~</span>
        ${timeInput("extra-end", "18:00", "종료 시간")}
      </div>
      <div class="action-row">
        <button type="submit" class="btn-primary">등록</button>
        <button type="button" class="btn-ghost" data-action="cancel-add">취소</button>
      </div>
    </form>`;
}

// 근무자 목록: 그날 근무 예정인 직원과 시간
function renderStaff(date) {
  const today = todayDateString();
  const isToday = date === today;
  const scheduled = scheduledOn(date);
  const sub = isToday ? "본인 이름을 눌러 출근하세요" : date > today ? "이름을 눌러 시간을 수정할 수 있어요" : "지난 날짜예요";

  return `
    <section class="staff" aria-label="근무자">
      <p class="staff-title">${isToday ? "오늘 근무자" : "근무 예정"}</p>
      <p class="sub">${sub}</p>
      <ul class="staff-list">
        ${scheduled.map((e) => renderStaffItem(e, date)).join("") || `<li class="in-empty">근무 예정인 직원이 없어요</li>`}
      </ul>
      ${date >= today ? renderAddExtra() : ""}
    </section>`;
}

function renderDayArea(date, { closable }) {
  return `<div class="day-area-inner">${renderDateBox(date, { closable })}${renderStaff(date)}</div>`;
}

function demoNote() {
  return `<p class="demo-note">데이터는 이 기기의 브라우저에만 저장됩니다 · <button type="button" data-action="reset-data">처음 상태로 초기화</button></p>`;
}

function renderHome() {
  const sel = state.selectedDate;
  const open = sel && !state.animateOpen;
  return `
    <div class="home">
      <div class="home-inner">
        ${renderUnlock()}
        <div class="card${open ? " open" : ""}" id="card">
          <div class="cal-wrap">${renderCalendar()}</div>
          <div class="day-area">${sel ? renderDayArea(sel, { closable: true }) : ""}</div>
        </div>
      </div>
    </div>
    ${demoNote()}`;
}

function renderDayPage(date) {
  return `
    <div class="day-page">
      <div class="day-page-inner">
        <button type="button" class="round-btn back-btn" data-action="go-home" aria-label="달력으로 돌아가기">${ICON_PREV}</button>
        ${renderDayArea(date, { closable: false })}
      </div>
    </div>`;
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
  // 표는 월요일부터
  const order = [1, 2, 3, 4, 5, 6, 0];
  const rows = store.employees
    .map(
      (e) => `
      <tr>
        <td class="name">${esc(e.name)}<div class="muted small">${esc(e.phone || "")}</div></td>
        ${order
          .map(
            (wd) =>
              `<td class="day-cell"><input class="field range" type="text" placeholder="-" value="${formatRange(e.weekly[wd])}" data-weekly="${wd}" data-id="${e.id}" aria-label="${esc(e.name)} ${WEEKDAYS[wd]}요일 근무 시간" /></td>`,
          )
          .join("")}
        <td><input class="field" style="width:88px;padding:4px 8px" type="number" value="${e.hourlyWage}" data-wage="${e.id}" aria-label="${esc(e.name)} 시급" /></td>
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
      <div><label for="f-wage">시급(원)</label><input id="f-wage" class="field" style="width:112px" type="number" value="${DEFAULT_WAGE}" required /></div>
      <button type="submit" class="pill">추가</button>
    </form>
    <p class="hint">요일 칸에 <b>7-12</b>, <b>18-2230</b> 처럼 입력하면 근무 시간이 저장돼요. 비우면 쉬는 날이에요.</p>
    <div class="table-wrap">
      <table class="schedule">
        <thead><tr><th>이름</th>${order.map((wd) => `<th class="${wd === 0 ? "rest" : ""}">${WEEKDAYS[wd]}</th>`).join("")}<th>시급</th><th>상태</th><th>관리</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="11" class="empty">등록된 직원이 없습니다.</td></tr>`}</tbody>
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

  // 처음 날짜를 눌렀을 때 달력이 줄어드는 애니메이션
  if (state.animateOpen) {
    state.animateOpen = false;
    const card = document.getElementById("card");
    if (card) {
      card.getBoundingClientRect();
      requestAnimationFrame(() => card.classList.add("open"));
    }
  }

  if (state.unlockOpen) document.getElementById("pin-input")?.focus();
}

function navigate(hash) {
  state.error = "";
  if (location.hash === hash) render();
  else location.hash = hash;
}

window.addEventListener("hashchange", () => {
  resetDayUi();
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

function activeDate() {
  const r = route();
  return r.name === "day" ? r.date : state.selectedDate;
}

function resetDayUi() {
  state.error = "";
  state.expandedId = null;
  state.editingId = null;
  state.editingWhere = null;
  state.adding = false;
}

function selectDate(date) {
  resetDayUi();
  if (!isDesktop()) {
    navigate(`#/day/${date}`);
    return;
  }
  state.animateOpen = !state.selectedDate;
  state.selectedDate = date;
  render();
}

function closePanel() {
  const card = document.getElementById("card");
  card?.classList.remove("open");
  setTimeout(() => {
    state.selectedDate = null;
    state.expandedId = null;
    render();
  }, PANEL_ANIM_MS);
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
    selectDate(cell.dataset.date);
    return;
  }

  const el = e.target.closest("[data-action]");
  if (!el) {
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
      closePanel();
      return;
    case "go-home":
      navigate("#/");
      return;
    case "toggle-staff":
      state.error = "";
      state.editingId = null;
      state.expandedId = state.expandedId === id ? null : id;
      break;
    case "edit-shift":
      state.error = "";
      state.editingId = id;
      state.editingWhere = "staff";
      break;
    case "cancel-edit":
      state.error = "";
      state.editingId = null;
      state.editingWhere = null;
      break;
    case "save-shift": {
      const start = readTime("edit-start");
      const end = readTime("edit-end");
      if (!start || !end) {
        state.error = "시간은 09:00 처럼 숫자로 입력해주세요.";
        break;
      }
      const date = activeDate();
      const emp = employeeById(id);
      setShift(id, date, start, end);
      // 이미 출근했다면 기록 시간도 함께 고친다
      const rec = recordFor(id, date);
      if (rec) {
        rec.clockIn = kstIso(date, start);
        rec.clockOut = scheduledEnd(emp, date);
      }
      save();
      state.error = "";
      state.editingId = null;
      state.editingWhere = null;
      break;
    }
    case "open-add":
      state.adding = true;
      state.expandedId = null;
      break;
    case "cancel-add":
      state.adding = false;
      break;
    case "clock-in":
      state.error = clockIn(id) || "";
      if (!state.error) {
        state.expandedId = null;
        state.justAddedId = recordFor(id, todayDateString()).id;
        render();
        state.justAddedId = null;
        return;
      }
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
      if (!window.confirm("출근 기록과 수정한 내용을 모두 지우고 처음 근무표로 되돌릴까요?")) return;
      store = initialData();
      save();
      state.selectedDate = null;
      state.expandedId = null;
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
  if (e.target.id === "add-extra") {
    e.preventDefault();
    addExtra();
    return;
  }
  if (e.target.id !== "add-employee") return;
  e.preventDefault();
  const name = document.getElementById("f-name").value.trim();
  const phone = document.getElementById("f-phone").value.trim();
  const wage = Number(document.getElementById("f-wage").value);
  if (!name) return;
  store.employees.push({
    id: uid(),
    name,
    phone: phone || null,
    hourlyWage: Number.isFinite(wage) ? wage : DEFAULT_WAGE,
    active: true,
    weekly: {},
  });
  save();
  render();
});

app.addEventListener("change", (e) => {
  const t = e.target;
  if (t.dataset.wage) {
    const wage = Number(t.value);
    if (Number.isFinite(wage)) {
      employeeById(t.dataset.wage).hourlyWage = wage;
      save();
    }
    return;
  }
  if (t.dataset.weekly) {
    const emp = employeeById(t.dataset.id);
    const wd = t.dataset.weekly;
    if (!t.value.trim()) {
      delete emp.weekly[wd];
      save();
    } else {
      const range = parseRange(t.value);
      if (range) {
        emp.weekly[wd] = range;
        save();
      } else {
        t.classList.add("invalid");
        setTimeout(() => t.classList.remove("invalid"), 1200);
      }
    }
    t.value = formatRange(emp.weekly[wd]);
    return;
  }
  const filter = t.dataset.filter;
  if (filter) {
    state.records[filter] = t.value;
    render();
  }
});

// + 로 일정에 없던 인원을 그날 근무자로 등록. 처음 보는 이름이면 직원으로도 추가된다.
function addExtra() {
  const name = document.getElementById("extra-name").value.trim();
  const start = readTime("extra-start");
  const end = readTime("extra-end");
  if (!name) return;
  if (!start || !end) {
    alertField("extra-start");
    return;
  }
  let emp = store.employees.find((x) => x.active && x.name === name);
  if (!emp) {
    emp = { id: uid(), name, phone: null, hourlyWage: DEFAULT_WAGE, active: true, weekly: {} };
    store.employees.push(emp);
  }
  setShift(emp.id, activeDate(), start, end);
  save();
  state.adding = false;
  state.expandedId = emp.id; // 바로 출근할 수 있게 펼쳐 둔다
  render();
}

function alertField(id) {
  const el = document.getElementById(id);
  el.classList.add("invalid");
  el.focus();
}

// 숫자만 남기고 두 자리 뒤에 ":" 를 자동으로 넣는다
app.addEventListener("input", (e) => {
  const t = e.target;
  if (!t.classList.contains("time")) return;
  t.classList.remove("invalid");
  const digits = t.value.replace(/\D/g, "").slice(0, 4);
  t.value = digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits;
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

// 화면이 넓어지면 모바일 날짜 페이지를 홈 패널로, 좁아지면 그 반대로 전환
window.matchMedia("(min-width: 768px)").addEventListener("change", (mq) => {
  const r = route();
  if (mq.matches && r.name === "day") {
    state.selectedDate = r.date;
    navigate("#/");
  } else if (!mq.matches && r.name === "home" && state.selectedDate) {
    const date = state.selectedDate;
    state.selectedDate = null;
    navigate(`#/day/${date}`);
  }
});

render();
