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
const XLSX_SRC = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
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
  const data = { employees, records: [], shifts: {}, filledFrom: FILL_FROM };
  fillSchedule(data, FILL_FROM, todayDateString());
  return data;
}

// 9월 첫 주(8/31 월요일)부터 어제까지는 근무표대로 출근한 것으로 채운다.
// 9/1 이 화요일이라, 그 주 주휴수당 계산을 위해 8/31 도 포함.
const FILL_FROM = "2026-08-31";

// from 이상 to 미만 날짜에, 근무표상 근무일인데 기록이 없으면 근무표 시간으로 기록을 넣는다
function fillSchedule(data, from, to) {
  const has = new Set(data.records.map((r) => `${r.employeeId}|${r.date}`));
  for (let date = from; date < to; date = addDays(date, 1)) {
    for (const e of data.employees) {
      const shift = e.weekly[weekdayOf(date)];
      if (!shift || has.has(`${e.id}|${date}`)) continue;
      const clockIn = kstIso(date, shift.start);
      data.records.push({ id: uid(), employeeId: e.id, date, clockIn, clockOut: endIso(date, shift.start, shift.end), createdAt: clockIn });
    }
  }
}

function loadStore() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return { shifts: {}, ...JSON.parse(raw) };
  } catch {}
  return initialData();
}

let store = loadStore();

// 예전 버전에서 '누른 시각'으로 저장된 출근 기록을 그날 근무 시간으로 한 번 바로잡는다
function fixPressedTimes() {
  if (store.timesFixed) return;
  for (const r of store.records) {
    const emp = employeeById(r.employeeId);
    if (!emp) continue;
    r.clockIn = kstIso(r.date, shiftFor(emp, r.date).start);
    r.clockOut = scheduledEnd(emp, r.date);
  }
  store.timesFixed = true;
}

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch {}
}

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

// 출근은 오늘 날짜에만 기록된다 (미래 날짜에는 출근 버튼이 나오지 않음)
function clockIn(employeeId) {
  const emp = employeeById(employeeId);
  if (!emp || !emp.active) return "직원을 찾을 수 없습니다.";
  const date = todayDateString();
  if (recordFor(employeeId, date)?.clockIn) return "이미 출근 처리되었습니다.";
  // 누른 시각이 아니라 그날 근무 시간대로 출퇴근을 기록한다
  const { start } = shiftFor(emp, date);
  store.records.push({
    id: uid(),
    employeeId,
    date,
    clockIn: kstIso(date, start),
    clockOut: scheduledEnd(emp, date),
    createdAt: new Date().toISOString(),
  });
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

fixPressedTimes();
// 이미 저장된 데이터에 9월(8/31~) 기록이 없으면 한 번 채운다
if (!store.filledFrom || store.filledFrom > FILL_FROM) {
  const firstExisting = store.records.reduce((min, r) => (r.date < min ? r.date : min), todayDateString());
  fillSchedule(store, FILL_FROM, firstExisting);
  store.filledFrom = FILL_FROM;
}
save();

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
  error: "",
  payroll: { month: "", employeeId: "" }, // 근무 기록 화면: "2026-10"
};

{
  const t = todayDateString();
  state.year = Number(t.slice(0, 4));
  state.month = Number(t.slice(5, 7));
  state.payroll.month = t.slice(0, 7);
}

// ---------- 화면: 홈 ----------

function renderUnlock() {
  if (!state.unlockOpen) {
    return `<div class="unlock"><button type="button" class="unlock-title" data-action="open-unlock">MGC · 춘천온의파크점</button></div>`;
  }
  return `
    <div class="unlock" id="unlock">
      <input id="pin-input" class="pin-input" type="password" inputmode="numeric" maxlength="${PIN_LENGTH}" autocomplete="off" placeholder="관리자 번호" aria-label="관리자 번호" />
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
        <button type="button" class="btn-ghost" data-action="edit-shift" data-id="${emp.id}">수정</button>
        ${isToday && !done ? `<button type="button" class="btn-primary" data-action="clock-in" data-id="${emp.id}">출근</button>` : ""}
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
      <button type="button" class="btn-ghost" data-action="cancel-edit">취소</button>
      <button type="button" class="btn-primary" data-action="save-shift" data-id="${empId}">저장</button>
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
        <button type="button" class="btn-ghost" data-action="cancel-add">취소</button>
        <button type="submit" class="btn-primary">등록</button>
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
    <main class="admin-main">${content}</main>
    <nav class="admin-bottom" aria-label="관리자 메뉴">
      ${link("#/admin/employees", "직원 관리", "employees")}
      ${link("#/admin/records", "근무 기록", "records")}
      <button type="button" data-action="logout">로그아웃</button>
    </nav>`;
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

// ---------- 급여 계산 ----------
// 주휴수당: 월~일 한 주에 15시간 이상 일하고 근무표상 근무일에 모두 출근했으면
//   (그 주 근무시간 ÷ 40) × 8시간 × 시급  (40시간 이상이면 8시간분)
//   주가 끝나는 일요일이 속한 달에 넣고, 아직 끝나지 않은 주는 계산하지 않는다.
// 세금(3.3%): 소득세 3% + 지방소득세(소득세의 10%), 10원 미만 절사, 소득세 1,000원 미만이면 걷지 않음(소액부징수).

function monthRecords(ym, employeeId) {
  return store.records
    .filter((r) => r.date.startsWith(ym) && employeeById(r.employeeId) && (!employeeId || r.employeeId === employeeId))
    .sort((a, b) => (a.date === b.date ? (a.clockIn < b.clockIn ? -1 : 1) : a.date < b.date ? -1 : 1));
}

function isScheduled(emp, date) {
  return Boolean(emp.weekly[weekdayOf(date)] || store.shifts[date]?.[emp.id]);
}

function weeklyAllowance(emp, ym) {
  const today = todayDateString();
  const [y, m] = ym.split("-").map(Number);
  const last = `${ym}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
  const weeks = [];
  // 이 달에 속한 일요일마다 그 주(월~일)를 본다
  for (let d = `${ym}-01`; d <= last; d = addDays(d, 1)) {
    if (weekdayOf(d) !== 0) continue;
    const sun = d;
    const mon = addDays(sun, -6);
    const days = Array.from({ length: 7 }, (_, i) => addDays(mon, i));
    const recs = store.records.filter((r) => r.employeeId === emp.id && r.date >= mon && r.date <= sun);
    const hours = recs.reduce((sum, r) => sum + hoursBetween(r.clockIn, r.clockOut), 0);
    if (!recs.length) continue;
    let reason = "";
    if (sun >= today) reason = "주가 아직 안 끝남";
    else if (hours < 15) reason = "주 15시간 미만";
    else if (days.some((x) => isScheduled(emp, x) && !recordFor(emp.id, x))) reason = "결근 있음";
    const allowHours = reason ? 0 : Math.min(hours, 40) / 5;
    weeks.push({ mon, sun, hours, reason, allowHours, amount: Math.round(allowHours * emp.hourlyWage) });
  }
  return { weeks, total: weeks.reduce((sum, w) => sum + w.amount, 0) };
}

const floor10 = (n) => Math.floor(n / 10) * 10;

function taxes(gross) {
  if (store.settings?.tax === "none") return { income: 0, local: 0 };
  let income = floor10(gross * 0.03);
  if (income < 1000) income = 0;
  return { income, local: floor10(income * 0.1) };
}

function payrollFor(ym, employeeId) {
  const recs = monthRecords(ym, employeeId);
  const ids = [...new Set(recs.map((r) => r.employeeId))];
  const rows = store.employees
    .filter((e) => ids.includes(e.id))
    .map((emp) => {
      const mine = recs.filter((r) => r.employeeId === emp.id);
      const hours = mine.reduce((sum, r) => sum + hoursBetween(r.clockIn, r.clockOut), 0);
      const base = Math.round(hours * emp.hourlyWage);
      const weekly = weeklyAllowance(emp, ym);
      const gross = base + weekly.total;
      const tax = taxes(gross);
      return { emp, days: mine.length, hours, base, weekly, gross, ...tax, net: gross - tax.income - tax.local };
    });
  const sum = (k) => rows.reduce((acc, r) => acc + r[k], 0);
  const total = {
    days: sum("days"),
    hours: sum("hours"),
    base: sum("base"),
    weekly: rows.reduce((acc, r) => acc + r.weekly.total, 0),
    gross: sum("gross"),
    income: sum("income"),
    local: sum("local"),
    net: sum("net"),
  };
  return { recs, rows, total };
}

const won = (n) => `${n.toLocaleString()}원`;
const hrs = (n) => `${Number(n.toFixed(2))}시간`;
const shortDate = (d) => `${Number(d.slice(5, 7))}/${Number(d.slice(8))} (${WEEKDAYS[weekdayOf(d)]})`;

function shiftMonth(ym, delta) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function renderRecords() {
  const { month, employeeId } = state.payroll;
  const [y, m] = month.split("-").map(Number);
  const { recs, rows, total } = payrollFor(month, employeeId);
  const taxOn = store.settings?.tax !== "none";

  const summary = rows
    .map(
      (r) => `
      <tr>
        <td class="name">${esc(r.emp.name)}</td>
        <td class="num">${r.days}일</td>
        <td class="num">${hrs(r.hours)}</td>
        <td class="num">${won(r.emp.hourlyWage)}</td>
        <td class="num">${won(r.base)}</td>
        <td class="num" title="${esc(r.weekly.weeks.map((w) => `${shortDate(w.mon)}~${shortDate(w.sun)} ${hrs(w.hours)} ${w.reason || `→ ${won(w.amount)}`}`).join("\n"))}">${won(r.weekly.total)}</td>
        <td class="num strong">${won(r.gross)}</td>
        <td class="num">${won(r.income)}</td>
        <td class="num">${won(r.local)}</td>
        <td class="num strong">${won(r.net)}</td>
      </tr>`,
    )
    .join("");

  const detail = recs
    .map((r) => {
      const emp = employeeById(r.employeeId);
      const h = hoursBetween(r.clockIn, r.clockOut);
      return `
      <tr>
        <td>${shortDate(r.date)}</td>
        <td class="name">${esc(emp.name)}</td>
        <td>${formatTime(r.clockIn)} ~ ${formatTime(r.clockOut)}</td>
        <td class="num">${hrs(h)}</td>
        <td class="num">${won(Math.round(h * emp.hourlyWage))}</td>
      </tr>`;
    })
    .join("");

  return renderAdminShell(
    "records",
    `
    <div class="month-nav">
      <button type="button" class="round-btn" data-action="payroll-prev" aria-label="이전 달">${ICON_PREV}</button>
      <h2>${y}년 ${m}월 근무 기록</h2>
      <button type="button" class="round-btn" data-action="payroll-next" aria-label="다음 달">${ICON_NEXT}</button>
    </div>
    <div class="toolbar">
      <div>
        <label for="r-emp">직원</label>
        <select id="r-emp" class="field" data-payroll="employeeId">
          <option value="">전체</option>
          ${store.employees.map((e) => `<option value="${e.id}"${e.id === employeeId ? " selected" : ""}>${esc(e.name)}</option>`).join("")}
        </select>
      </div>
      <div>
        <label for="r-tax">세금</label>
        <select id="r-tax" class="field" data-setting="tax">
          <option value="3.3"${taxOn ? " selected" : ""}>3.3% 공제 (사업소득)</option>
          <option value="none"${taxOn ? "" : " selected"}>공제 안 함</option>
        </select>
      </div>
      <button type="button" class="pill" data-action="export-xlsx"${recs.length ? "" : " disabled"}>엑셀 다운로드</button>
    </div>

    <h3>급여 정산</h3>
    <div class="table-wrap">
      <table>
        <thead><tr><th>이름</th><th class="num">근무일</th><th class="num">근무시간</th><th class="num">시급</th><th class="num">기본급</th><th class="num">주휴수당</th><th class="num">지급총액</th><th class="num">소득세</th><th class="num">지방소득세</th><th class="num">실지급액</th></tr></thead>
        <tbody>
          ${summary || `<tr><td colspan="10" class="empty">이 달의 근무 기록이 없습니다.</td></tr>`}
          ${
            rows.length > 1
              ? `<tr class="total-row"><td>합계</td><td class="num">${total.days}일</td><td class="num">${hrs(total.hours)}</td><td></td><td class="num">${won(total.base)}</td><td class="num">${won(total.weekly)}</td><td class="num">${won(total.gross)}</td><td class="num">${won(total.income)}</td><td class="num">${won(total.local)}</td><td class="num">${won(total.net)}</td></tr>`
              : ""
          }
        </tbody>
      </table>
    </div>
    <p class="hint small-hint">
      주휴수당: 월~일 한 주에 15시간 이상 일하고 근무표상 근무일에 모두 출근하면 (주 근무시간 ÷ 40) × 8시간 × 시급. 그 주가 끝나는 일요일이 속한 달에 포함되고, 아직 끝나지 않은 주는 빠져요. 금액에 마우스를 올리면 주별 내역이 보여요.<br />
      ${taxOn ? "세금: 소득세 3% + 지방소득세(소득세의 10%), 10원 미만 절사. 소득세가 1,000원 미만이면 공제하지 않아요." : "세금을 공제하지 않고 계산했어요."}
    </p>

    <h3>근무 상세</h3>
    <div class="table-wrap">
      <table>
        <thead><tr><th>날짜</th><th>이름</th><th>시간</th><th class="num">근무시간</th><th class="num">금액</th></tr></thead>
        <tbody>${detail || `<tr><td colspan="5" class="empty">이 달의 근무 기록이 없습니다.</td></tr>`}</tbody>
      </table>
    </div>`,
  );
}

// ---------- 엑셀 ----------

function loadXlsx() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  return new Promise((resolve, reject) => {
    const el = document.createElement("script");
    el.src = XLSX_SRC;
    el.onload = () => resolve(window.XLSX);
    el.onerror = () => reject(new Error("엑셀 라이브러리를 불러오지 못했어요. 인터넷 연결을 확인해주세요."));
    document.head.appendChild(el);
  });
}

async function exportXlsx(button) {
  const { month, employeeId } = state.payroll;
  const { recs, rows, total } = payrollFor(month, employeeId);
  const label = button.textContent;
  button.disabled = true;
  button.textContent = "만드는 중…";
  try {
    const XLSX = await loadXlsx();
    const round2 = (n) => Math.round(n * 100) / 100;

    const summary = [
      ["이름", "근무일", "근무시간", "시급", "기본급", "주휴수당", "지급총액", "소득세", "지방소득세", "실지급액"],
      ...rows.map((r) => [r.emp.name, r.days, round2(r.hours), r.emp.hourlyWage, r.base, r.weekly.total, r.gross, r.income, r.local, r.net]),
    ];
    if (rows.length > 1) summary.push(["합계", total.days, round2(total.hours), "", total.base, total.weekly, total.gross, total.income, total.local, total.net]);

    const detail = [
      ["날짜", "요일", "이름", "출근", "퇴근", "근무시간", "시급", "금액"],
      ...recs.map((r) => {
        const emp = employeeById(r.employeeId);
        const h = hoursBetween(r.clockIn, r.clockOut);
        return [r.date, WEEKDAYS[weekdayOf(r.date)], emp.name, formatTime(r.clockIn), formatTime(r.clockOut), round2(h), emp.hourlyWage, Math.round(h * emp.hourlyWage)];
      }),
    ];

    const weekly = [["이름", "주 시작(월)", "주 끝(일)", "근무시간", "주휴시간", "주휴수당", "비고"]];
    for (const r of rows) {
      for (const w of r.weekly.weeks) weekly.push([r.emp.name, w.mon, w.sun, round2(w.hours), round2(w.allowHours), w.amount, w.reason || ""]);
    }

    const sheet = (aoa, widths) => {
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws["!cols"] = widths.map((wch) => ({ wch }));
      return ws;
    };
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet(summary, [10, 8, 10, 9, 12, 12, 12, 10, 11, 12]), "급여 정산");
    XLSX.utils.book_append_sheet(wb, sheet(detail, [12, 6, 10, 8, 8, 10, 9, 11]), "근무 상세");
    XLSX.utils.book_append_sheet(wb, sheet(weekly, [10, 12, 12, 10, 10, 11, 16]), "주휴수당 내역");
    const who = employeeId ? `_${employeeById(employeeId).name}` : "";
    XLSX.writeFile(wb, `근무기록_${month}${who}.xlsx`);
  } catch (err) {
    window.alert(err.message);
  } finally {
    button.disabled = false;
    button.textContent = label;
  }
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
  render();
});

// ---------- PIN ----------

function submitPin(value) {
  if (value === ADMIN_PIN) {
    setAdmin(true);
    state.unlockOpen = false;
    navigate("#/admin/employees");
    return;
  }
  render();
  const input = document.getElementById("pin-input");
  input?.classList.add("shake");
  setTimeout(() => input?.classList.remove("shake"), 900);
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
  // PIN 입력칸 바깥을 누르면 닫기
  const closedUnlock = state.unlockOpen && !e.target.closest("#unlock");
  if (closedUnlock) state.unlockOpen = false;

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
    case "export-xlsx":
      exportXlsx(el);
      return;
    case "payroll-prev":
    case "payroll-next":
      state.payroll.month = shiftMonth(state.payroll.month, action === "payroll-prev" ? -1 : 1);
      break;
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
  if (e.target.id !== "pin-input") return;
  if (e.key === "Enter") submitPin(e.target.value);
  else if (e.key === "Escape") {
    state.unlockOpen = false;
    render();
  }
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
  if (t.dataset.payroll) {
    state.payroll[t.dataset.payroll] = t.value;
    render();
    return;
  }
  if (t.dataset.setting) {
    store.settings = { ...store.settings, [t.dataset.setting]: t.value };
    save();
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
  if (t.id === "pin-input") {
    t.value = t.value.replace(/\D/g, "").slice(0, PIN_LENGTH);
    if (t.value.length === PIN_LENGTH) submitPin(t.value);
    return;
  }
  if (!t.classList.contains("time")) return;
  t.classList.remove("invalid");
  const digits = t.value.replace(/\D/g, "").slice(0, 4);
  t.value = digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits;
});

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
