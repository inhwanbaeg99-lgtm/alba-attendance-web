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
// 순서 = 근무표에서 같은 시각에 시작할 때 왼쪽 칸에 들어가는 순서
const INITIAL_SCHEDULE = [
  ["배예빈", { 1: "07:00~12:00", 2: "07:00~12:00", 3: "07:00~15:00", 4: "07:00~12:00", 6: "10:00~15:00" }],
  ["김예린", { 2: "12:00~18:00", 3: "12:00~18:00", 5: "07:00~12:00" }],
  ["백인환", { 1: "12:00~18:00", 3: "15:00~22:30", 4: "15:00~23:00", 5: "12:00~18:00" }],
  ["손민영", { 4: "12:00~18:00" }],
  ["최수빈", { 2: "18:00~22:30", 6: "10:00~18:00", 0: "10:00~15:00" }],
  ["최광효", { 5: "18:00~23:00", 6: "18:00~23:00", 0: "16:00~22:30" }],
  ["이시헌", { 1: "18:00~22:30", 5: "18:00~23:00", 6: "15:00~23:00", 0: "15:00~22:30" }],
  ["정현욱", { 1: "18:00~22:30", 2: "18:00~22:30", 4: "18:00~23:00" }],
  ["백인서", { 3: "18:00~22:30" }],
];

// 근무표에서 쓰는 사람별 색 (사진의 근무표 색)
const INITIAL_COLORS = {
  배예빈: "#fff2cc",
  백인환: "#7030a0",
  이시헌: "#c6e0b4",
  정현욱: "#2e75b6",
  김예린: "#d0cece",
  최수빈: "#ffff00",
  백인서: "#ffe699",
  손민영: "#bdd7ee",
  최광효: "#8ea9db",
  매니저: "#ffffff",
};

// 사람이 늘어나면 이 순서대로 아직 안 쓴 색을 준다 (앞 9개는 기존 근무표 색)
const PALETTE = [
  "#fff2cc", "#d0cece", "#7030a0", "#bdd7ee", "#ffff00", "#8ea9db", "#c6e0b4", "#2e75b6", "#ffe699",
  "#f8cbad", "#a9d08e", "#ff99cc", "#9bc2e6", "#ffc000", "#b4a7d6", "#c00000", "#00b0f0", "#ffd966",
  "#548235", "#f4b183", "#d9d2e9", "#70ad47", "#ff7c80", "#dbdbdb",
];

// 직원마다 겹치지 않는 색을 자동으로 정한다. 이미 정해진 색은 유지.
function ensureColors(data = store) {
  const used = new Set();
  for (const e of data.employees) {
    if (isManager(e)) {
      e.color = "#ffffff";
      continue;
    }
    if (!e.color || used.has(e.color) || e.color === "#ffffff") {
      e.color = PALETTE.find((c) => !used.has(c)) ?? `hsl(${(used.size * 47) % 360} 70% 75%)`;
    }
    used.add(e.color);
  }
}

// 매니저는 근무표에만 나오고 출근·급여에서는 빠진다
const MANAGER_SCHEDULE = { 1: "10:00~18:00", 2: "10:00~18:00", 5: "10:00~17:00", 6: "08:00~16:00", 0: "08:00~16:00" };
const INITIAL_SCHEDULE_META = { period: "10. 5 ~ 11. 8", notes: { 1: "24", 2: "23", 3: "26", 4: "27", 5: "27", 6: "34", 0: "32" } };

const toWeekly = (days) => Object.fromEntries(Object.entries(days).map(([wd, range]) => [wd, parseRange(range)]));
const isManager = (e) => e.role === "manager";

function managerEmployee() {
  return { id: uid(), name: "매니저", phone: null, hourlyWage: 0, active: true, role: "manager", color: INITIAL_COLORS["매니저"], weekly: toWeekly(MANAGER_SCHEDULE) };
}

function initialData() {
  const employees = INITIAL_SCHEDULE.map(([name, days]) => ({
    id: uid(),
    name,
    phone: null,
    hourlyWage: DEFAULT_WAGE,
    active: true,
    color: INITIAL_COLORS[name],
    weekly: toWeekly(days),
  }));
  employees.push(managerEmployee());
  const data = { employees, records: [], shifts: {}, filledFrom: FILL_FROM, scheduleMeta: structuredClone(INITIAL_SCHEDULE_META) };
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
      if (isManager(e)) continue;
      const shift = e.weekly[weekdayOf(date)];
      if (!shift || has.has(`${e.id}|${date}`)) continue;
      const clockIn = kstIso(date, shift.start);
      data.records.push({ id: uid(), employeeId: e.id, date, clockIn, clockOut: endIso(date, shift.start, shift.end), createdAt: clockIn, auto: true });
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
    .filter((e) => e.active && !isManager(e) && (e.weekly[wd] || extra[e.id]))
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
    manual: true,
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
// 근무표용 색·매니저·제목/비고가 없으면 한 번 넣는다
if (!store.scheduleMeta) {
  for (const e of store.employees) e.color = e.color ?? INITIAL_COLORS[e.name] ?? "#ffffff";
  if (!store.employees.some(isManager)) store.employees.push(managerEmployee());
  store.scheduleMeta = structuredClone(INITIAL_SCHEDULE_META);
}
// 예전 데이터: 오늘 이전 기록은 근무표로 자동 채운 것으로 표시
if (!store.autoMarked) {
  const today = todayDateString();
  for (const r of store.records) if (r.date < today && !r.manual) r.auto = true;
  store.autoMarked = true;
}
// 직원 순서를 근무표 배치 순서로 한 번 맞춘다 (목록에 없는 사람은 뒤로)
if (!store.orderSet) {
  const rank = (e) => {
    const i = INITIAL_SCHEDULE.findIndex(([name]) => name === e.name);
    return isManager(e) ? 1000 : i < 0 ? 500 : i;
  };
  store.employees.sort((a, b) => rank(a) - rank(b));
  store.orderSet = true;
}
ensureColors();
save();

// ---------- 근무표 변경 → 근무 기록 연동 ----------
// 근무표 제목의 기간 시작일(예: "10. 5 ~ 11. 8" → 2026-10-05)부터 오늘까지의 기록을 새 근무 시간에 맞춘다.
// - 날짜별로 따로 수정한 날(store.shifts)은 건드리지 않는다
// - 자동으로 채운 지난 기록: 시간 변경 / 근무 추가 시 생성 / 근무 삭제 시 제거
// - 직접 출근한 기록: 시간만 맞추고 지우지는 않는다
function scheduleStart() {
  const m = (store.scheduleMeta?.period ?? "").match(/(\d{1,2})\s*\.\s*(\d{1,2})/);
  const today = todayDateString();
  if (!m) return today;
  return `${today.slice(0, 4)}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}

function syncWeekday(emp, wd) {
  if (isManager(emp)) return;
  const today = todayDateString();
  for (let date = scheduleStart(); date <= today; date = addDays(date, 1)) {
    if (String(weekdayOf(date)) !== String(wd) || store.shifts[date]?.[emp.id]) continue;
    const shift = emp.weekly[wd];
    const rec = recordFor(emp.id, date);
    if (shift) {
      const clockIn = kstIso(date, shift.start);
      const clockOut = endIso(date, shift.start, shift.end);
      if (rec) Object.assign(rec, { clockIn, clockOut });
      else if (date < today) store.records.push({ id: uid(), employeeId: emp.id, date, clockIn, clockOut, createdAt: clockIn, auto: true });
    } else if (rec?.auto) {
      store.records = store.records.filter((r) => r !== rec);
    }
  }
}

// 요일 근무 시간 변경 (근무표·직원 관리 공용). range 가 없으면 그 요일은 쉬는 날.
function setWeekly(emp, wd, range) {
  if (range) emp.weekly[wd] = range;
  else delete emp.weekly[wd];
  syncWeekday(emp, wd);
  save();
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
  error: "",
  payroll: { month: "", employeeId: "" }, // 근무 기록 화면: "2026-10"
  payslipId: null, // 급여명세서 창을 연 직원
  slotEdit: null, // 근무표에서 편집 중인 칸 { wd, empId, start }
  schedWork: null, // 근무표 편집 초안 (저장 전)
  allowDraft: null, // 명세서 창에서 수정 중인 수당 (저장 전)
  helpOpen: {}, // ? 설명 펼침 상태
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
      <input id="pin-input" class="pin-input" type="password" inputmode="numeric" maxlength="${PIN_LENGTH}" autocomplete="off" aria-label="관리자 번호" />
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

function renderAdminShell(active, content, { center = false, wide = false } = {}) {
  const link = (href, label, key) => `<a href="${href}" class="${active === key ? "active" : ""}">${label}</a>`;
  return `
    <nav class="admin-top" aria-label="관리자 메뉴">
      ${link("#/admin/employees", "직원 관리", "employees")}
      ${link("#/admin/schedule", "근무표", "schedule")}
      ${link("#/admin/records", "근무 기록", "records")}
      <button type="button" data-action="logout">로그아웃</button>
    </nav>
    <main class="admin-main${center ? " centered" : ""}${wide ? " wide" : ""}">${content}</main>`;
}

// ? 버튼을 누르면 펼쳐지는 설명 (다른 화면에 갔다 오면 다시 접힘)
function helpToggle(key, html) {
  const open = state.helpOpen[key];
  return `
    <div class="help">
      <button type="button" class="help-btn${open ? " on" : ""}" data-action="toggle-help" data-key="${key}" aria-expanded="${open}" aria-label="설명 ${open ? "접기" : "보기"}">?</button>
      ${open ? `<p class="help-text">${html}</p>` : ""}
    </div>`;
}

// 010-1234-5678 형태로
function formatPhone(text) {
  const d = String(text ?? "").replace(/\D/g, "").slice(0, 11);
  if (d.startsWith("02")) return [d.slice(0, 2), d.slice(2, d.length > 9 ? 6 : 5), d.slice(d.length > 9 ? 6 : 5)].filter(Boolean).join("-");
  if (d.length <= 3) return d;
  if (d.length <= 7) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, d.length - 4)}-${d.slice(-4)}`;
}

const formatMoney = (text) => {
  const d = String(text ?? "").replace(/\D/g, "");
  return d ? Number(d).toLocaleString() : "";
};
const parseMoney = (text) => Number(String(text).replace(/\D/g, "")) || 0;

function renderEmployees() {
  // 표는 월요일부터
  const order = [1, 2, 3, 4, 5, 6, 0];
  const rows = store.employees
    .map(
      (e) => `
      <tr>
        <td class="name"><span class="name-cell"><span class="swatch" style="background:${e.color || "#ffffff"}" title="근무표 색 (자동)"></span>${esc(e.name)}</span><div class="muted small">${esc(e.phone ? formatPhone(e.phone) : "")}</div></td>
        ${order
          .map(
            (wd) =>
              `<td class="day-cell"><input class="field range" type="text" placeholder="-" value="${formatRange(e.weekly[wd])}" data-weekly="${wd}" data-id="${e.id}" aria-label="${esc(e.name)} ${WEEKDAYS[wd]}요일 근무 시간" /></td>`,
          )
          .join("")}
        <td><input class="field money" style="width:88px;padding:4px 8px" type="text" inputmode="numeric" value="${formatMoney(e.hourlyWage)}" data-wage="${e.id}" aria-label="${esc(e.name)} 시급" /></td>
        <td><button type="button" class="status${e.active ? " on" : ""}" data-action="toggle-active" data-id="${e.id}">${e.active ? "재직중" : "비활성"}</button></td>
        <td><button type="button" class="status${isManager(e) ? " on" : ""}" data-action="toggle-role" data-id="${e.id}" title="매니저는 근무표에만 나오고 출근·급여 계산에서 빠져요">${isManager(e) ? "매니저" : "알바"}</button></td>
        <td><button type="button" class="danger" data-action="remove-employee" data-id="${e.id}">삭제</button></td>
      </tr>`,
    )
    .join("");

  return renderAdminShell(
    "employees",
    `
    <form class="toolbar" id="add-employee" style="margin-bottom:32px">
      <div><label for="f-name">이름</label><input id="f-name" class="field" style="width:112px" required /></div>
      <div><label for="f-phone">전화번호 (선택)</label><input id="f-phone" class="field phone" style="width:144px" type="text" inputmode="numeric" placeholder="010-0000-0000" /></div>
      <div><label for="f-wage">시급(원)</label><input id="f-wage" class="field money" style="width:112px" type="text" inputmode="numeric" value="${formatMoney(DEFAULT_WAGE)}" required /></div>
      <button type="submit" class="pill">추가</button>
    </form>
    <p class="hint">요일 칸에 <b>7-12</b>, <b>18-2230</b> 처럼 입력하면 근무 시간이 저장돼요. 비우면 쉬는 날이에요. 이름 앞 색은 근무표 색이에요(자동으로 겹치지 않게 정해져요). 근무표에서 같은 시각에 시작하면 위에 있는 사람이 왼쪽 칸에 들어가요.</p>
    <div class="table-wrap">
      <table class="schedule">
        <thead><tr><th>이름</th>${order.map((wd) => `<th class="${wd === 0 ? "rest" : ""}">${WEEKDAYS[wd]}</th>`).join("")}<th>시급</th><th>상태</th><th>구분</th><th>관리</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="12" class="empty">등록된 직원이 없습니다.</td></tr>`}</tbody>
      </table>
    </div>`,
    { center: true },
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

// 직원별·월별 추가 수당 (교육수당, 특근수당 등). 기본은 교육수당 한 줄.
function allowancesFor(ym, empId) {
  return store.allowances?.[ym]?.[empId] ?? [{ name: "교육수당", amount: 0 }];
}

function setAllowances(ym, empId, list) {
  store.allowances = store.allowances ?? {};
  store.allowances[ym] = { ...store.allowances[ym], [empId]: list };
}

function payrollRow(emp, ym, recs, allowanceOverride) {
  const mine = recs.filter((r) => r.employeeId === emp.id);
  const hours = mine.reduce((sum, r) => sum + hoursBetween(r.clockIn, r.clockOut), 0);
  const base = Math.round(hours * emp.hourlyWage);
  const weekly = weeklyAllowance(emp, ym);
  const allowances = allowanceOverride ?? allowancesFor(ym, emp.id);
  const extra = allowances.reduce((sum, a) => sum + (Number(a.amount) || 0), 0);
  const gross = base + weekly.total + extra;
  const tax = taxes(gross);
  return { emp, days: mine.length, hours, base, weekly, allowances, extra, gross, ...tax, net: gross - tax.income - tax.local };
}

function payrollFor(ym, employeeId) {
  const recs = monthRecords(ym, employeeId);
  const ids = new Set(recs.map((r) => r.employeeId));
  const rows = store.employees.filter((e) => ids.has(e.id)).map((emp) => payrollRow(emp, ym, recs));
  const sum = (k) => rows.reduce((acc, r) => acc + r[k], 0);
  const total = {
    days: sum("days"),
    hours: sum("hours"),
    base: sum("base"),
    weekly: rows.reduce((acc, r) => acc + r.weekly.total, 0),
    extra: sum("extra"),
    gross: sum("gross"),
    income: sum("income"),
    local: sum("local"),
    net: sum("net"),
  };
  return { recs, rows, total };
}

const won = (n) => `${n.toLocaleString()}원`;
const num = (n) => (n ? n.toLocaleString() : "-");
const hrs = (n) => `${Number(n.toFixed(2))}시간`;
const hour1 = (n) => (n ? n.toFixed(1) : "");
const shortDate = (d) => `${Number(d.slice(5, 7))}/${Number(d.slice(8))} (${WEEKDAYS[weekdayOf(d)]})`;

function shiftMonth(ym, delta) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthDays(ym) {
  const [y, m] = ym.split("-").map(Number);
  const n = new Date(y, m, 0).getDate();
  return Array.from({ length: n }, (_, i) => `${ym}-${String(i + 1).padStart(2, "0")}`);
}

// 월별 근무표: 한 사람이 한 줄, 1일~말일 칸에 그날 근무시간
function timesheet(ym, employeeId) {
  const days = monthDays(ym);
  const recs = monthRecords(ym, employeeId);
  const ids = new Set(recs.map((r) => r.employeeId));
  const people = store.employees.filter((e) => ids.has(e.id));
  const rows = people.map((emp) => {
    const cells = days.map((d) => {
      const rec = recs.find((r) => r.employeeId === emp.id && r.date === d);
      return rec ? hoursBetween(rec.clockIn, rec.clockOut) : 0;
    });
    return { emp, cells, total: cells.reduce((a, b) => a + b, 0) };
  });
  return { days, rows };
}

function renderTimesheet(ym, employeeId) {
  const { days, rows } = timesheet(ym, employeeId);
  if (!rows.length) return `<div class="table-wrap ts-wrap"><p class="empty">이 달의 근무 기록이 없습니다.</p></div>`;
  const wkClass = (d) => {
    const wd = weekdayOf(d);
    return wd === 0 || wd === 6 ? " weekend" : "";
  };
  return `
    <div class="table-wrap ts-wrap">
      <table class="timesheet">
        <thead>
          <tr>
            <th rowspan="2" class="ts-no">No.</th>
            <th rowspan="2" class="ts-name">성명</th>
            ${days.map((d) => `<th class="ts-day${wkClass(d)}">${WEEKDAYS[weekdayOf(d)]}</th>`).join("")}
            <th rowspan="2" class="ts-total">시간</th>
          </tr>
          <tr>${days.map((d) => `<th class="ts-day${wkClass(d)}">${Number(d.slice(8))}</th>`).join("")}</tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (r, i) => `
            <tr>
              <td class="ts-no">${i + 1}</td>
              <td class="ts-name">${esc(r.emp.name)}</td>
              ${r.cells.map((h, j) => `<td class="ts-day${wkClass(days[j])}">${hour1(h)}</td>`).join("")}
              <td class="ts-total">${r.total.toFixed(1)}</td>
            </tr>`,
            )
            .join("")}
        </tbody>
      </table>
    </div>`;
}

// ---------- 급여명세서 ----------

const STORE_NAME = "메가MGC커피 춘천온의파크점";

// "기본급" → "기   본   급" 처럼 칸 너비에 맞춰 글자를 벌린다 (PDF 변환에서도 유지되도록 글자마다 span)
const spread = (label) => `<span class="spread">${[...label.replace(/\s/g, "")].map((c) => `<span>${esc(c)}</span>`).join("")}</span>`;

function renderPayslip(r, ym) {
  const month = Number(ym.slice(5, 7));
  const pay = [
    ["기본급", r.base],
    ["주휴수당", r.weekly.total],
    ...r.allowances.map((a) => [a.name, Number(a.amount) || 0]),
  ];
  while (pay.length < 5) pay.push(["", null]);
  const deduct = [
    ["소득세", r.income],
    ["지방소득세", r.local],
  ];
  const rows = pay
    .map((p, i) => {
      const d = deduct[i] ?? ["", null];
      const cell = (label, value) =>
        `<td class="ps-label${label.length > 5 ? " tight" : ""}">${label ? spread(label) : ""}</td><td class="ps-amount">${value === null ? "" : num(value)}</td>`;
      return `<tr>${cell(p[0], p[1])}${cell(d[0], d[1])}</tr>`;
    })
    .join("");
  const deductTotal = r.income + r.local;

  return `
    <div class="payslip">
      <h1 class="ps-title">아르바이트 급여명세서</h1>
      <table class="ps-table">
        <tr><td class="ps-head ps-label">${spread("성명")}</td><td class="ps-center ps-spaced">${esc(r.emp.name)}</td><td class="ps-head ps-label">${spread("지급월")}</td><td class="ps-center">${month}월</td></tr>
        <tr><td class="ps-head ps-label">${spread("시급")}</td><td class="ps-amount">${num(r.emp.hourlyWage)}</td><td class="ps-head ps-label">${spread("총근무시간")}</td><td class="ps-amount">${Number(r.hours.toFixed(2))}</td></tr>
      </table>
      <table class="ps-table ps-body">
        <tr><td colspan="2" class="ps-head ps-center ps-spaced">지급</td><td colspan="2" class="ps-head ps-center ps-spaced">공제</td></tr>
        ${rows}
        <tr><td class="ps-label">${spread("①소계")}</td><td class="ps-amount">${num(r.gross)}</td><td class="ps-label">${spread("②소계")}</td><td class="ps-amount">${num(deductTotal)}</td></tr>
        <tr><td colspan="2" class="ps-center ps-strong">지 급 금 액(①-②)</td><td colspan="2" class="ps-amount ps-strong">${num(r.net)}</td></tr>
      </table>
      <p class="ps-thanks">이번 한달도 수고많으셨습니다. 감사합니다.</p>
      <p class="ps-store">${STORE_NAME}</p>
    </div>`;
}

function renderPayslipModal() {
  const empId = state.payslipId;
  if (!empId) return "";
  const { month } = state.payroll;
  const emp = employeeById(empId);
  // 명세서 창에서는 저장 전까지 수정 중인 수당(state.allowDraft)으로 미리 계산
  const r = payrollRow(emp, month, monthRecords(month, empId), state.allowDraft);
  const list = r.allowances;
  return `
    <div class="ps-backdrop" data-action="close-payslip">
      <div class="ps-dialog" data-stop>
        <div class="ps-side">
          <p class="staff-title">${esc(emp.name)} · ${Number(month.slice(5, 7))}월 명세서</p>
          <p class="sub">수당을 입력하면 지급액과 세금이 다시 계산돼요. 저장한 뒤 근무 기록의 <b>명세서 PDF</b>로 한꺼번에 받을 수 있어요.</p>
          <div class="ps-allow">
            ${list
              .map(
                (a, i) => `
              <div class="ps-allow-row">
                <input class="field" value="${esc(a.name)}" placeholder="수당 이름" data-allow="name" data-index="${i}" aria-label="수당 이름" />
                <input class="field ps-allow-amount money" type="text" inputmode="numeric" value="${a.amount ? Number(a.amount).toLocaleString() : ""}" placeholder="0" data-allow="amount" data-index="${i}" aria-label="${esc(a.name || "수당")} 금액" />
                <button type="button" class="danger" data-action="remove-allowance" data-index="${i}" aria-label="삭제">삭제</button>
              </div>`,
              )
              .join("")}
            <button type="button" class="add-btn" data-action="add-allowance">+ 수당 추가</button>
          </div>
          <div class="action-row">
            <button type="button" class="btn-ghost" data-action="close-payslip">닫기</button>
            <button type="button" class="btn-primary" data-action="save-payslip">저장</button>
          </div>
        </div>
        <div class="ps-preview">${renderPayslip(r, month)}</div>
      </div>
    </div>`;
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
        <td class="num">${won(r.base)}</td>
        <td class="num" title="${esc(r.weekly.weeks.map((w) => `${shortDate(w.mon)}~${shortDate(w.sun)} ${hrs(w.hours)} ${w.reason || `→ ${won(w.amount)}`}`).join("\n"))}">${won(r.weekly.total)}</td>
        <td class="num">${won(r.extra)}</td>
        <td class="num strong">${won(r.gross)}</td>
        <td class="num">${won(r.income)}</td>
        <td class="num">${won(r.local)}</td>
        <td class="num strong">${won(r.net)}</td>
        <td><button type="button" class="link-btn" data-action="open-payslip" data-id="${r.emp.id}">명세서</button></td>
      </tr>`,
    )
    .join("");

  return renderAdminShell(
    "records",
    `
    <div class="toolbar records-bar">
      <div class="month-nav">
        <button type="button" class="round-btn" data-action="payroll-prev" aria-label="이전 달">${ICON_PREV}</button>
        <h2>${y}년 ${m}월</h2>
        <button type="button" class="round-btn" data-action="payroll-next" aria-label="다음 달">${ICON_NEXT}</button>
      </div>
      <div>
        <label for="r-emp">직원</label>
        <select id="r-emp" class="field" data-payroll="employeeId">
          <option value="">전체</option>
          ${store.employees.filter((e) => !isManager(e)).map((e) => `<option value="${e.id}"${e.id === employeeId ? " selected" : ""}>${esc(e.name)}</option>`).join("")}
        </select>
      </div>
      <div>
        <label for="r-tax">세금</label>
        <select id="r-tax" class="field" data-setting="tax">
          <option value="3.3"${taxOn ? " selected" : ""}>3.3% 공제 (사업소득)</option>
          <option value="none"${taxOn ? "" : " selected"}>공제 안 함</option>
        </select>
      </div>
    </div>

    <div class="section-head">
      <h3>근무 상세</h3>
      <button type="button" class="pill plain-dark" data-action="export-xlsx"${recs.length ? "" : " disabled"}>엑셀 다운로드</button>
    </div>
    ${renderTimesheet(month, employeeId)}

    <div class="section-head">
      <h3>급여 정산</h3>
      <button type="button" class="pill" data-action="payslip-pdf-all"${rows.length ? "" : " disabled"}>명세서 PDF${rows.length > 1 ? " (전체)" : ""}</button>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>이름</th><th class="num">근무일</th><th class="num">근무시간</th><th class="num">기본급</th><th class="num">주휴수당</th><th class="num">수당</th><th class="num">지급총액</th><th class="num">소득세</th><th class="num">지방소득세</th><th class="num">실지급액</th><th></th></tr></thead>
        <tbody>
          ${summary || `<tr><td colspan="11" class="empty">이 달의 근무 기록이 없습니다.</td></tr>`}
          ${
            rows.length > 1
              ? `<tr class="total-row"><td>합계</td><td class="num">${total.days}일</td><td class="num">${hrs(total.hours)}</td><td class="num">${won(total.base)}</td><td class="num">${won(total.weekly)}</td><td class="num">${won(total.extra)}</td><td class="num">${won(total.gross)}</td><td class="num">${won(total.income)}</td><td class="num">${won(total.local)}</td><td class="num">${won(total.net)}</td><td></td></tr>`
              : ""
          }
        </tbody>
      </table>
    </div>
    ${helpToggle(
      "records",
      `주휴수당: 월~일 한 주에 15시간 이상 일하고 근무표상 근무일에 모두 출근하면 (주 근무시간 ÷ 40) × 8시간 × 시급. 그 주가 끝나는 일요일이 속한 달에 포함되고, 아직 끝나지 않은 주는 빠져요. 금액에 마우스를 올리면 주별 내역이 보여요.<br />
      수당(교육수당·특근수당 등)은 이름 옆 <b>명세서</b>를 눌러 입력해요.<br />
      ${taxOn ? "세금: 소득세 3% + 지방소득세(소득세의 10%), 10원 미만 절사. 소득세가 1,000원 미만이면 공제하지 않아요." : "세금을 공제하지 않고 계산했어요."}`,
    )}
    ${renderPayslipModal()}`,
  );
}

// ---------- 외부 라이브러리 (필요할 때만 불러옴) ----------

const LIBS = {
  xlsx: { src: "https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.bundle.js", ready: () => window.XLSX },
  html2canvas: { src: "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js", ready: () => window.html2canvas },
  jspdf: { src: "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js", ready: () => window.jspdf?.jsPDF },
};

function loadLib(name) {
  const lib = LIBS[name];
  if (lib.ready()) return Promise.resolve(lib.ready());
  return new Promise((resolve, reject) => {
    const el = document.createElement("script");
    el.src = lib.src;
    el.onload = () => resolve(lib.ready());
    el.onerror = () => reject(new Error("파일 만드는 도구를 불러오지 못했어요. 인터넷 연결을 확인해주세요."));
    document.head.appendChild(el);
  });
}

async function withBusy(button, text, task) {
  const label = button.textContent;
  button.disabled = true;
  button.textContent = text;
  try {
    await task();
  } catch (err) {
    window.alert(err.message);
  } finally {
    button.disabled = false;
    button.textContent = label;
  }
}

// ---------- 엑셀 ----------

function exportXlsx(button) {
  return withBusy(button, "만드는 중…", async () => {
    const XLSX = await loadLib("xlsx");
    const { month, employeeId } = state.payroll;
    const { recs, rows, total } = payrollFor(month, employeeId);
    const round2 = (n) => Math.round(n * 100) / 100;

    const thin = { style: "thin", color: { rgb: "000000" } };
    const border = { top: thin, bottom: thin, left: thin, right: thin };
    const center = { horizontal: "center", vertical: "center" };
    const style = (extra = {}) => ({ border, alignment: center, font: { name: "맑은 고딕", sz: 10 }, ...extra });
    const blue = { fill: { patternType: "solid", fgColor: { rgb: "DCE9F7" } } };

    // 근무표 시트: 사진처럼 No. / 성명 / 요일·날짜 / 시간
    const ts = timesheet(month, employeeId);
    const isWeekend = (d) => [0, 6].includes(weekdayOf(d));
    const head1 = ["No.", "성명", ...ts.days.map((d) => WEEKDAYS[weekdayOf(d)]), "시간"];
    const head2 = ["", "", ...ts.days.map((d) => Number(d.slice(8))), ""];
    const body = ts.rows.map((r, i) => [i + 1, r.emp.name, ...r.cells.map((h) => (h ? round2(h) : "")), round2(r.total)]);
    const wsTs = XLSX.utils.aoa_to_sheet([head1, head2, ...body]);
    const lastCol = head1.length - 1;
    for (let R = 0; R < body.length + 2; R++) {
      for (let C = 0; C <= lastCol; C++) {
        const ref = XLSX.utils.encode_cell({ r: R, c: C });
        wsTs[ref] = wsTs[ref] ?? { t: "s", v: "" };
        const day = C >= 2 && C < lastCol ? ts.days[C - 2] : null;
        const s = style(day && isWeekend(day) ? blue : {});
        if (R < 2) s.font = { ...s.font, bold: true };
        if (R >= 2 && day && typeof wsTs[ref].v === "number") wsTs[ref].z = "0.0";
        if (R >= 2 && C === lastCol) {
          wsTs[ref].z = "0.0";
          s.font = { ...s.font, bold: true };
        }
        wsTs[ref].s = s;
      }
    }
    wsTs["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 1, c: 0 } },
      { s: { r: 0, c: 1 }, e: { r: 1, c: 1 } },
      { s: { r: 0, c: lastCol }, e: { r: 1, c: lastCol } },
    ];
    wsTs["!cols"] = [{ wch: 5 }, { wch: 9 }, ...ts.days.map(() => ({ wch: 4.5 })), { wch: 7 }];
    wsTs["!rows"] = [{ hpt: 22 }, { hpt: 22 }, ...body.map(() => ({ hpt: 22 }))];

    const summary = [
      ["이름", "근무일", "근무시간", "시급", "기본급", "주휴수당", "수당", "지급총액", "소득세", "지방소득세", "실지급액"],
      ...rows.map((r) => [r.emp.name, r.days, round2(r.hours), r.emp.hourlyWage, r.base, r.weekly.total, r.extra, r.gross, r.income, r.local, r.net]),
    ];
    if (rows.length > 1) summary.push(["합계", total.days, round2(total.hours), "", total.base, total.weekly, total.extra, total.gross, total.income, total.local, total.net]);

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

    const plain = (aoa, widths, moneyFrom) => {
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws["!cols"] = widths.map((wch) => ({ wch }));
      const range = XLSX.utils.decode_range(ws["!ref"]);
      for (let R = 0; R <= range.e.r; R++) {
        for (let C = 0; C <= range.e.c; C++) {
          const ref = XLSX.utils.encode_cell({ r: R, c: C });
          if (!ws[ref]) continue;
          ws[ref].s = { border, font: { name: "맑은 고딕", sz: 10, bold: R === 0 }, ...(R === 0 ? blue : {}) };
          if (R > 0 && moneyFrom !== undefined && C >= moneyFrom && typeof ws[ref].v === "number") ws[ref].z = "#,##0";
        }
      }
      return ws;
    };

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wsTs, "근무 상세");
    XLSX.utils.book_append_sheet(wb, plain(summary, [10, 8, 10, 9, 12, 12, 10, 12, 10, 11, 12], 3), "급여 정산");
    XLSX.utils.book_append_sheet(wb, plain(detail, [12, 6, 10, 8, 8, 10, 9, 11], 6), "출퇴근 목록");
    XLSX.utils.book_append_sheet(wb, plain(weekly, [10, 12, 12, 10, 10, 11, 16], 5), "주휴수당 내역");
    const who = employeeId ? `_${employeeById(employeeId).name}` : "";
    XLSX.writeFile(wb, `근무기록_${month}${who}.xlsx`);
  });
}

// ---------- PDF (급여명세서) ----------

async function payslipPdf(button, empIds) {
  return withBusy(button, "PDF 만드는 중…", async () => {
    const [html2canvas, jsPDF] = await Promise.all([loadLib("html2canvas"), loadLib("jspdf")]);
    await document.fonts.ready;
    const { month } = state.payroll;
    const recs = monthRecords(month);

    // A4 비율 종이를 화면 밖에 그려서 한 장씩 이미지로 찍는다
    const stage = document.createElement("div");
    stage.className = "ps-stage";
    document.body.appendChild(stage);
    try {
      const pdf = new jsPDF({ unit: "mm", format: "a4" });
      for (const [i, id] of empIds.entries()) {
        const r = payrollRow(employeeById(id), month, recs);
        stage.innerHTML = renderPayslip(r, month);
        const canvas = await html2canvas(stage.firstElementChild, { scale: 2, backgroundColor: "#ffffff" });
        if (i > 0) pdf.addPage();
        pdf.addImage(canvas.toDataURL("image/jpeg", 0.95), "JPEG", 0, 0, 210, 297);
      }
      const who = empIds.length === 1 ? `_${employeeById(empIds[0]).name}` : "_전체";
      pdf.save(`급여명세서_${month}${who}.pdf`);
    } finally {
      stage.remove();
    }
  });
}

// ---------- 주간 근무표 (게시용) ----------
// 직원별 요일 근무 시간으로 자동 생성. 요일마다 시작 시간 순으로 비어 있는 칸에 배치한다.

const SCHEDULE_DAYS = [1, 2, 3, 4, 5, 6, 0]; // 월 ~ 일
const toMin = (hhmm) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
const fromMin = (min) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`;

// 배경색이 어두우면 글자를 흰색으로
function textOn(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b < 140 ? "#ffffff" : "#111111";
}

// 근무표 편집은 초안(state.schedWork)에 모아 두었다가 [저장]할 때 한꺼번에 반영한다.
// 초안 = { weekly: { 직원id: { 요일: {start,end} | null } }, meta: {period, notes} | null }
// [임시저장]은 초안만 보관(store.scheduleDraft)하고 직원 관리·달력·근무 기록에는 아직 반영하지 않는다.
function schedWork() {
  if (!state.schedWork) state.schedWork = structuredClone(store.scheduleDraft ?? { weekly: {}, meta: null });
  return state.schedWork;
}

function effWeekly(emp) {
  const w = { ...emp.weekly };
  for (const [wd, range] of Object.entries(schedWork().weekly[emp.id] ?? {})) {
    if (range) w[wd] = range;
    else delete w[wd];
  }
  return w;
}

const schedMeta = () => schedWork().meta ?? store.scheduleMeta ?? {};
const schedDirty = () => JSON.stringify(schedWork()) !== JSON.stringify(store.scheduleDraft ?? { weekly: {}, meta: null });
const hasDraft = () => Object.keys(schedWork().weekly).length > 0 || schedWork().meta !== null;

function draftWeekly(emp, wd, range) {
  const w = schedWork().weekly;
  w[emp.id] = { ...w[emp.id], [wd]: range };
}

function tempSaveSchedule() {
  store.scheduleDraft = structuredClone(schedWork());
  save();
}

function commitSchedule() {
  const work = schedWork();
  if (work.meta) store.scheduleMeta = work.meta; // 기간이 바뀌면 적용 시작일도 바뀌므로 먼저
  for (const [empId, days] of Object.entries(work.weekly)) {
    const emp = employeeById(empId);
    if (!emp) continue;
    for (const [wd, range] of Object.entries(days)) setWeekly(emp, wd, range);
  }
  delete store.scheduleDraft;
  state.schedWork = { weekly: {}, meta: null };
  save();
}

function scheduleLayout() {
  const order = new Map(store.employees.map((e, i) => [e.id, i]));
  const days = SCHEDULE_DAYS.map((wd) => {
    const people = store.employees
      .map((e) => ({ e, w: effWeekly(e)[wd] }))
      .filter(({ e, w }) => e.active && w)
      .map(({ e, w }) => ({ emp: e, start: toMin(w.start), end: toMin(w.end) }))
      .sort((a, b) => a.start - b.start || order.get(a.emp.id) - order.get(b.emp.id));
    const cols = [];
    for (const p of people) {
      const col = cols.find((c) => c[c.length - 1].end <= p.start);
      if (col) col.push(p);
      else cols.push([p]);
    }
    while (cols.length < 2) cols.push([]);
    return { wd, cols };
  });

  // 행 경계: 정시 + 누군가 시작/끝나는 시각
  const all = days.flatMap((d) => d.cols.flat());
  const first = Math.floor(Math.min(...all.map((p) => p.start), 7 * 60) / 60) * 60;
  const last = Math.max(...all.map((p) => p.end), 23 * 60);
  const marks = new Set();
  for (let t = first; t <= last; t += 60) marks.add(t);
  all.forEach((p) => marks.add(p.start).add(p.end));
  marks.add(last);
  const bounds = [...marks].filter((t) => t <= last).sort((a, b) => a - b);
  const rows = bounds.slice(0, -1).map((start, i) => ({ start, end: bounds[i + 1] }));
  return { days, rows };
}

function renderScheduleSheet() {
  const { days, rows } = scheduleLayout();
  const meta = schedMeta();
  const occupant = (col, row) => col.find((p) => p.start <= row.start && p.end >= row.end);
  // 같은 정시(예: 22:00~22:30, 22:30~23:00)에 속한 행들은 같은 사람이면 한 칸으로 합친다
  const hourOf = (row) => Math.floor(row.start / 60);

  const body = rows
    .map((row, i) => {
      const cells = days
        .map((d) =>
          d.cols
            .map((col) => {
              const who = occupant(col, row);
              const group = rows.filter((r) => hourOf(r) === hourOf(row));
              const gi = group.indexOf(row);
              const sameAll = Boolean(who) && group.length > 1 && group.every((r) => occupant(col, r) === who);
              if (sameAll && gi > 0) return "";
              const span = sameAll ? ` rowspan="${group.length}"` : "";
              const slot = `data-action="edit-slot" data-wd="${d.wd}" data-start="${row.start}"`;
              if (!who) return `<td class="sc-empty" ${slot}${span}></td>`;
              const bg = who.emp.color || "#ffffff";
              const ed = state.slotEdit;
              const editing = ed && String(ed.wd) === String(d.wd) && (ed.empId ?? ed.addEmpId) === who.emp.id;
              return `<td class="sc-name${editing ? " sc-editing" : ""}" ${slot} data-id="${who.emp.id}"${span} style="background:${bg};color:${textOn(bg)}">${esc(who.emp.name)}</td>`;
            })
            .join(""),
        )
        .join("");
      const time = `<td class="sc-time">${fromMin(row.start)}</td><td class="sc-time">${fromMin(row.end)}</td>`;
      return `<tr>${time}${cells}${time}</tr>`;
    })
    .join("");

  const head = days
    .map((d) => `<th colspan="${d.cols.length}" class="${d.wd === 0 || d.wd === 6 ? "sc-rest" : ""}">${WEEKDAYS[d.wd]}</th>`)
    .join("");
  const notes = days
    .map((d) => `<td colspan="${d.cols.length}" class="sc-note"><input value="${esc(meta.notes?.[d.wd] ?? "")}" data-note="${d.wd}" aria-label="${WEEKDAYS[d.wd]}요일 비고" /></td>`)
    .join("");

  return `
    <div class="sched-sheet" id="sched-sheet">
      <div class="sc-head">
        <h2 class="sc-title">[${STORE_NAME} 근무표](<input class="sc-period" value="${esc(meta.period ?? "")}" size="${Math.max(6, [...(meta.period ?? "")].length)}" data-meta="period" placeholder="10. 5 ~ 11. 8" aria-label="기간" />)</h2>
        <div class="sc-actions" data-html2canvas-ignore>
          <button type="button" class="pill plain-dark" data-action="schedule-temp"${schedDirty() ? "" : " disabled"}>임시저장</button>
          <button type="button" class="pill" data-action="schedule-save"${hasDraft() ? "" : " disabled"}>저장</button>
          <button type="button" class="pill plain-dark" data-action="schedule-pdf">PDF 저장</button>
        </div>
      </div>
      <table class="sched">
        <thead><tr><th colspan="2">시간</th>${head}<th colspan="2">시간</th></tr></thead>
        <tbody>
          ${body}
          <tr class="sc-foot"><td colspan="2">비 고</td>${notes}<td colspan="2">비 고</td></tr>
        </tbody>
      </table>
    </div>`;
}

function renderSchedStatus() {
  if (!hasDraft()) return "";
  return schedDirty()
    ? `<p class="sched-status warn">저장하지 않은 변경이 있어요. <b>저장</b>을 눌러야 직원 관리·달력·근무 기록에 반영돼요.</p>`
    : `<p class="sched-status">임시저장된 변경이 있어요. <b>저장</b>을 누르면 반영돼요.</p>`;
}

function renderSchedule() {
  return renderAdminShell(
    "schedule",
    `
    <div class="sched-layout">
      <div class="sched-main">
        <div class="sched-scroll" id="sched-scroll">${renderScheduleSheet()}</div>
        <div id="sched-status">${renderSchedStatus()}</div>
        ${helpToggle(
          "schedule",
          `이름 칸을 누르면 시간 수정·삭제, 빈 칸(사선)을 누르면 근무자 추가예요. 오른쪽에서 입력하면 표에 바로 보여요.<br />
          <b>저장</b>하면 직원 관리·달력·근무 기록에 반영되고, <b>임시저장</b>은 반영하지 않고 고친 내용만 보관해요.<br />
          지난 근무 기록은 제목 기간의 시작일(<b>${shortDate(scheduleStart())}</b>)부터 바뀌어요. 제목의 기간과 비고 칸도 눌러서 고칠 수 있어요.`,
        )}
      </div>
      <aside class="sched-panel">${renderSlotPanel()}</aside>
    </div>`,
    { center: true, wide: true },
  );
}

function renderSlotPanel() {
  const ed = state.slotEdit;
  if (!ed) {
    return `
      <p class="staff-title">근무 수정</p>
      <p class="sub">근무표에서 이름 칸이나 빈 칸(사선)을 누르면 여기서 시간을 입력할 수 있어요.</p>`;
  }
  const empId = ed.empId ?? ed.addEmpId;
  const emp = empId ? employeeById(empId) : null;
  const shift = emp ? effWeekly(emp)[ed.wd] : null;
  const start = shift?.start ?? fromMin(ed.start).padStart(5, "0");
  const end = shift?.end ?? fromMin(Math.min(ed.start + 6 * 60, 23 * 60)).padStart(5, "0");
  // 추가할 때 고를 수 있는 사람: 이 칸을 열 때 그 요일 근무가 없던 사람
  const before = (e) => ({ ...e.weekly, ...(ed.snapshot[e.id] ?? {}) })[ed.wd];
  const choices = store.employees.filter((e) => e.active && (!before(e) || e.id === ed.addEmpId));
  return `
    <form class="slot-form" id="slot-form">
      <p class="staff-title">${WEEKDAYS[ed.wd]}요일 · ${ed.empId ? esc(emp.name) : "근무자 추가"}</p>
      <p class="sub">입력하면 왼쪽 근무표에 바로 보여요. 근무표 <b>저장</b>을 눌러야 다른 화면에 반영돼요.</p>
      ${
        ed.empId
          ? ""
          : `<select id="slot-emp" class="field" aria-label="직원">
              <option value="">직원 선택</option>
              ${choices.map((e) => `<option value="${e.id}"${e.id === ed.addEmpId ? " selected" : ""}>${esc(e.name)}${isManager(e) ? " (매니저)" : ""}</option>`).join("")}
            </select>`
      }
      <div class="edit-row">
        ${timeInput("slot-start", start, "시작 시간")}
        <span>~</span>
        ${timeInput("slot-end", end, "종료 시간")}
      </div>
      ${state.error ? `<p class="error">${esc(state.error)}</p>` : ""}
      <div class="action-row">
        <button type="button" class="btn-ghost" data-action="cancel-slot">취소</button>
        <button type="submit" class="btn-primary">완료</button>
      </div>
      ${ed.empId ? `<button type="button" class="btn-ghost danger-ghost slot-remove" data-action="remove-slot">이 요일 근무 빼기</button>` : ""}
    </form>`;
}

const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

// 추가할 사람을 바꾸면 앞서 고른 사람의 초안은 칸을 열기 전으로 되돌린다
function restoreSnapshot(empId) {
  const w = schedWork().weekly;
  const snap = state.slotEdit.snapshot;
  if (hasOwn(snap, empId)) w[empId] = structuredClone(snap[empId]);
  else delete w[empId];
}

// 입력하는 대로 초안에 넣고 근무표만 다시 그린다 (입력칸 포커스 유지)
function liveSlot({ final = false } = {}) {
  const ed = state.slotEdit;
  if (!ed) return true;
  const empId = ed.empId ?? (document.getElementById("slot-emp")?.value || null);
  if (!ed.empId && empId !== ed.addEmpId) {
    if (ed.addEmpId) restoreSnapshot(ed.addEmpId);
    ed.addEmpId = empId;
    refreshSchedule();
  }
  if (!empId) return false;
  const read = (id) => {
    const el = document.getElementById(id);
    const digits = el.value.replace(/\D/g, "");
    if (!digits) return el.placeholder;
    if (!final && digits.length < 4) return null; // 입력 중간(예: "15")에는 기다린다
    return normalizeTime(el.value);
  };
  const start = read("slot-start");
  const end = read("slot-end");
  if (!start || !end || start === end) return false;
  draftWeekly(employeeById(empId), ed.wd, { start, end });
  refreshSchedule();
  return true;
}

function refreshSchedule() {
  const scroll = document.getElementById("sched-scroll");
  if (scroll) scroll.innerHTML = renderScheduleSheet();
  const status = document.getElementById("sched-status");
  if (status) status.innerHTML = renderSchedStatus();
}

function finishSlot() {
  if (!liveSlot({ final: true })) {
    const ed = state.slotEdit;
    state.error = ed.empId || ed.addEmpId ? "시간은 09:00 처럼 숫자로 입력해주세요." : "직원을 선택해주세요.";
    render();
    return;
  }
  state.slotEdit = null;
  state.error = "";
  render();
}

async function schedulePdf(button) {
  return withBusy(button, "PDF 만드는 중…", async () => {
    const [html2canvas, jsPDF] = await Promise.all([loadLib("html2canvas"), loadLib("jspdf")]);
    await document.fonts.ready;
    const sheet = document.getElementById("sched-sheet");
    sheet.classList.add("capturing");
    // PDF 변환기가 늘어나는 SVG 배경을 못 그려서, 칸 크기에 딱 맞는 사선을 칸마다 넣는다
    const empties = [...sheet.querySelectorAll(".sc-empty")];
    for (const td of empties) {
      const { width: w, height: h } = td.getBoundingClientRect();
      const svgLine = `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'><line x1='0' y1='${h}' x2='${w}' y2='0' stroke='#555' stroke-width='1'/></svg>`;
      td.style.backgroundImage = `url("data:image/svg+xml,${encodeURIComponent(svgLine)}")`;
      td.style.backgroundSize = `${w}px ${h}px`;
    }
    // 기간 입력칸은 글자로 바꿔서 찍는다 (입력칸 여백이 생기지 않게)
    const period = sheet.querySelector(".sc-period");
    const periodText = document.createElement("span");
    periodText.textContent = period.value;
    period.replaceWith(periodText);
    try {
      const canvas = await html2canvas(sheet, { scale: 2, backgroundColor: "#ffffff" });
      const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
      const margin = 8;
      const w = 297 - margin * 2;
      const h = Math.min(210 - margin * 2, (canvas.height / canvas.width) * w);
      const fitW = (canvas.width / canvas.height) * h;
      pdf.addImage(canvas.toDataURL("image/jpeg", 0.95), "JPEG", (297 - fitW) / 2, margin, fitW, h);
      pdf.save(`근무표_${(store.scheduleMeta?.period || todayDateString()).replace(/[\s.~]+/g, "_")}.pdf`);
    } finally {
      periodText.replaceWith(period);
      empties.forEach((td) => td.removeAttribute("style"));
      sheet.classList.remove("capturing");
    }
  });
}

// ---------- 라우팅 ----------

function route() {
  const hash = location.hash.replace(/^#/, "") || "/";
  const day = hash.match(/^\/day\/(\d{4}-\d{2}-\d{2})$/);
  if (day) return { name: "day", date: day[1] };
  if (hash.startsWith("/admin")) {
    if (!isAdmin()) return { name: "home" };
    const page = { "/admin/records": "records", "/admin/schedule": "schedule" }[hash];
    return { name: page ?? "employees" };
  }
  return { name: "home" };
}

function render() {
  const r = route();
  if (r.name === "day") app.innerHTML = renderDayPage(r.date);
  else if (r.name === "employees") app.innerHTML = renderEmployees();
  else if (r.name === "records") app.innerHTML = renderRecords();
  else if (r.name === "schedule") app.innerHTML = renderSchedule();
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
  state.payslipId = null;
  state.allowDraft = null;
  state.slotEdit = null;
  state.helpOpen = {};
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
  // 명세서 창 안쪽 빈 곳을 누르면 바깥(닫기)으로 전달되지 않게
  const insideDialog = el?.classList.contains("ps-backdrop") && e.target.closest("[data-stop]") && !e.target.closest("[data-action]:not(.ps-backdrop)");
  if (!el || insideDialog) {
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
      state.payslipId = null;
      break;
    case "toggle-role": {
      const emp = employeeById(id);
      emp.role = isManager(emp) ? undefined : "manager";
      if (!isManager(emp)) emp.color = null;
      ensureColors();
      save();
      break;
    }
    case "schedule-pdf":
      schedulePdf(el);
      return;
    case "schedule-temp":
      if (state.slotEdit) liveSlot({ final: true });
      state.slotEdit = null;
      tempSaveSchedule();
      break;
    case "schedule-save":
      if (state.slotEdit) liveSlot({ final: true });
      if (!window.confirm("근무표를 저장하면 직원 관리·달력·근무 기록에 반영돼요. 저장할까요?")) return;
      state.slotEdit = null;
      commitSchedule();
      break;
    case "edit-slot":
      if (state.slotEdit) liveSlot({ final: true }); // 보던 칸은 입력한 대로 두고 넘어간다
      state.error = "";
      state.slotEdit = {
        wd: el.dataset.wd,
        empId: el.dataset.id ?? null,
        addEmpId: null,
        start: Number(el.dataset.start),
        snapshot: structuredClone(schedWork().weekly),
      };
      render();
      document.getElementById(state.slotEdit.empId ? "slot-start" : "slot-emp")?.focus();
      return;
    case "cancel-slot":
      state.schedWork.weekly = state.slotEdit.snapshot; // 이번에 입력한 것 되돌리기
      state.slotEdit = null;
      state.error = "";
      break;
    case "remove-slot":
      draftWeekly(employeeById(state.slotEdit.empId), state.slotEdit.wd, null);
      state.slotEdit = null;
      break;
    case "toggle-help":
      state.helpOpen[el.dataset.key] = !state.helpOpen[el.dataset.key];
      break;
    case "open-payslip":
      state.payslipId = id;
      state.allowDraft = structuredClone(allowancesFor(state.payroll.month, id));
      break;
    case "close-payslip":
      state.payslipId = null;
      state.allowDraft = null;
      break;
    case "save-payslip":
      setAllowances(state.payroll.month, state.payslipId, state.allowDraft.filter((a) => a.name || a.amount));
      save();
      state.payslipId = null;
      state.allowDraft = null;
      break;
    case "add-allowance":
      state.allowDraft.push({ name: "", amount: 0 });
      break;
    case "remove-allowance":
      state.allowDraft.splice(Number(el.dataset.index), 1);
      break;
    case "payslip-pdf-all":
      payslipPdf(el, payrollFor(state.payroll.month, state.payroll.employeeId).rows.map((r) => r.emp.id));
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
  if (e.target.id !== "pin-input") return;
  if (e.key === "Enter") submitPin(e.target.value);
  else if (e.key === "Escape") {
    state.unlockOpen = false;
    render();
  }
});

app.addEventListener("submit", (e) => {
  if (e.target.id === "slot-form") {
    e.preventDefault();
    finishSlot();
    return;
  }
  if (e.target.id === "add-extra") {
    e.preventDefault();
    addExtra();
    return;
  }
  if (e.target.id !== "add-employee") return;
  e.preventDefault();
  const name = document.getElementById("f-name").value.trim();
  const phone = formatPhone(document.getElementById("f-phone").value);
  const wage = parseMoney(document.getElementById("f-wage").value);
  if (!name) return;
  store.employees.push({
    id: uid(),
    name,
    phone: phone || null,
    hourlyWage: wage || DEFAULT_WAGE,
    active: true,
    weekly: {},
  });
  ensureColors();
  save();
  render();
});

app.addEventListener("change", (e) => {
  const t = e.target;
  if (t.dataset.wage) {
    const emp = employeeById(t.dataset.wage);
    const wage = parseMoney(t.value);
    if (wage) {
      emp.hourlyWage = wage;
      save();
    }
    t.value = formatMoney(emp.hourlyWage);
    return;
  }
  if (t.dataset.weekly) {
    const emp = employeeById(t.dataset.id);
    const wd = t.dataset.weekly;
    if (!t.value.trim()) {
      setWeekly(emp, wd, null);
    } else {
      const range = parseRange(t.value);
      if (range) {
        setWeekly(emp, wd, range);
      } else {
        t.classList.add("invalid");
        setTimeout(() => t.classList.remove("invalid"), 1200);
      }
    }
    t.value = formatRange(emp.weekly[wd]);
    return;
  }
  if (t.dataset.note !== undefined || t.dataset.meta) {
    const work = schedWork();
    const meta = (work.meta = structuredClone(work.meta ?? store.scheduleMeta ?? { notes: {} }));
    if (t.dataset.meta) meta[t.dataset.meta] = t.value.trim();
    else meta.notes = { ...meta.notes, [t.dataset.note]: t.value.trim() };
    render();
    return;
  }
  if (t.dataset.allow) {
    const item = state.allowDraft[Number(t.dataset.index)];
    item[t.dataset.allow] = t.dataset.allow === "amount" ? parseMoney(t.value) : t.value.trim();
    render();
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
    ensureColors();
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
  if (t.classList.contains("phone")) {
    t.value = formatPhone(t.value);
    return;
  }
  if (t.classList.contains("money")) {
    t.value = formatMoney(t.value);
    return;
  }
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

// 근무표 편집 패널: 입력하는 대로 왼쪽 표에 반영
app.addEventListener("input", (e) => {
  if (e.target.id === "slot-start" || e.target.id === "slot-end") liveSlot();
});
app.addEventListener("change", (e) => {
  if (e.target.id === "slot-emp") liveSlot();
});
