/* =====================================================
   학교 설문조사 (Discord 스타일)
   ===================================================== */

/* 1. SUPABASE */
const SUPABASE_URL = "https://yvpjbqsjsszderhhdnwv.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_ivsAYNav68Zpd3e1uYBpLw_OEtIuhkO";
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const COLS = "id,title,description,grades,questions,deadline,is_open,by_teacher,author_label,created_at";
const TYPES = [
  { v: "short",  l: "단답형" },
  { v: "long",   l: "장문형" },
  { v: "single", l: "객관식 (하나 선택)" },
  { v: "multi",  l: "체크박스 (여러 개 선택)" },
  { v: "scale",  l: "5점 척도" }
];
const COLORS = ["#5865f2", "#3ba55d", "#faa61a", "#eb459e", "#ed4245", "#00a8fc", "#9b59b6", "#1abc9c"];

/* 2. STATE */
const state = {
  surveys: [], counts: {}, myDone: new Set(),
  profile: null, user: null, isTeacher: false,
  tab: "all", grade: "all", search: "",
  pending: null, answering: null,
  resSurvey: null, resRows: [], resTab: "summary",
  qrUrl: ""
};
let builderQs = [];
let toastTimer;

/* 3. HELPERS */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c]));
}
function uid() { return "q" + Math.random().toString(36).slice(2, 8); }
function newToken() {
  return (crypto.randomUUID ? crypto.randomUUID() : uid() + uid() + uid() + uid());
}
function todayStr() { return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }); }
function colorOf(str) {
  let h = 0;
  for (const c of String(str)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length];
}
function discordTime(iso) {
  const d = new Date(iso);
  const t = d.toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Seoul" });
  const ds = d.toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
  const y = new Date(Date.now() - 86400000).toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
  if (ds === todayStr()) return "오늘 " + t;
  if (ds === y) return "어제 " + t;
  return ds + " " + t;
}
function isClosed(s) {
  return !s.is_open || (s.deadline && s.deadline < todayStr());
}
function ddayText(deadline) {
  if (!deadline) return "마감일 없음";
  const diff = Math.round((Date.parse(deadline) - Date.parse(todayStr())) / 86400000);
  const tag = diff > 0 ? `D-${diff}` : diff === 0 ? "D-Day" : "마감";
  return `${deadline} (${tag})`;
}
function getToken(s) { return localStorage.getItem("ss_owner_" + s.id) || ""; }
function isOwner(s) { return !!getToken(s); }
function canManage(s) { return state.isTeacher || isOwner(s); }
function profileLabel(p) { return `${p.grade}학년 ${p.classNo}반 ${p.studentNo}번 ${p.name}`; }
function fmtAns(v) { return Array.isArray(v) ? v.join(" / ") : (v ?? ""); }

function showToast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
}
function openModal(id) {
  $("#" + id).classList.remove("hidden");
  document.body.style.overflow = "hidden";
}
function closeModal(id) {
  $("#" + id).classList.add("hidden");
  if (!$$(".modal:not(.hidden)").length) document.body.style.overflow = "";
}
function showErr(id, msg) { const e = $("#" + id); e.textContent = msg; e.classList.remove("hidden"); }
function hideErr(id) { $("#" + id).classList.add("hidden"); }
function modalLocked(id) {
  return id === "onboardModal" && !state.profile && !state.isTeacher;
}

/* 4. START */
document.addEventListener("DOMContentLoaded", async () => {
  bindUI();
  loadProfile();
  renderUser();
  const { data } = await sb.auth.getSession();
  await applySession(data.session);
  sb.auth.onAuthStateChange((_e, session) => setTimeout(() => applySession(session), 0));
  if (!state.profile && !state.isTeacher) openOnboarding();
  await loadAll();
  handleDeepLink();
});

/* 5. 로그인 상태 (교사) */
async function applySession(session) {
  state.user = session ? session.user : null;
  state.isTeacher = false;
  if (state.user) {
    const { data } = await sb.rpc("ss_is_teacher");
    state.isTeacher = data === true;
    if (!state.isTeacher) {
      await sb.auth.signOut();
      state.user = null;
    }
  }
  document.body.classList.toggle("is-teacher", state.isTeacher);
  $("#btnTeacher").textContent = state.isTeacher ? "교사 로그아웃" : "교사 로그인";
  renderUser();
  renderSurveys();
}

/* 6. 내 정보 */
function loadProfile() {
  try { state.profile = JSON.parse(localStorage.getItem("ss_profile")); }
  catch { state.profile = null; }
}
function renderUser() {
  const p = state.profile;
  let main, sub, seed;
  if (state.isTeacher) {
    main = "선생님"; sub = state.user?.email || "교사 모드"; seed = "teacher";
  } else if (p) {
    main = p.name; sub = `${p.grade}학년 ${p.classNo}반 ${p.studentNo}번`; seed = p.name;
  } else {
    main = "정보 설정하기"; sub = "학년·반·번호·이름"; seed = "none";
  }
  $("#btnProfile").innerHTML =
    `<span class="avatar sm" style="background:${colorOf(seed)}">${esc(main[0])}</span>` +
    `<span class="uc-text"><b>${esc(main)}</b><small>${esc(sub)}</small></span>`;
}
function openOnboarding() {
  $("#obStep1").classList.remove("hidden");
  $("#profileForm").classList.add("hidden");
  openModal("onboardModal");
}
function openProfile() {
  const p = state.profile;
  $("#obStep1").classList.add("hidden");
  $("#profileForm").classList.remove("hidden");
  $("#profileTitle").textContent = p ? "내 정보 수정" : "내 정보 설정";
  $("#profileCancel").classList.toggle("hidden", !p);
  hideErr("profileError");
  $$('input[name="pGrade"]').forEach(r => r.checked = p && String(p.grade) === r.value);
  $("#pClass").value = p ? p.classNo : "";
  $("#pNo").value = p ? p.studentNo : "";
  $("#pName").value = p ? p.name : "";
  openModal("onboardModal");
}
async function saveProfile(e) {
  e.preventDefault();
  hideErr("profileError");
  const g = $('input[name="pGrade"]:checked');
  const classNo = parseInt($("#pClass").value, 10);
  const studentNo = parseInt($("#pNo").value, 10);
  const name = $("#pName").value.trim();
  if (!g) return showErr("profileError", "학년을 선택해주세요.");
  if (!(classNo >= 1 && classNo <= 30)) return showErr("profileError", "반은 1~30 사이로 입력해주세요.");
  if (!(studentNo >= 1 && studentNo <= 60)) return showErr("profileError", "번호는 1~60 사이로 입력해주세요.");
  if (!name) return showErr("profileError", "이름을 입력해주세요.");

  state.profile = { grade: Number(g.value), classNo, studentNo, name };
  localStorage.setItem("ss_profile", JSON.stringify(state.profile));
  renderUser();
  closeModal("onboardModal");
  await loadMyDone();
  renderSurveys();
  showToast(`${name}님, 환영해요!`);
  if (state.pending) {
    const s = state.pending;
    state.pending = null;
    openAnswer(s);
  }
}

/* 7. 불러오기 */
async function loadMyDone() {
  state.myDone = new Set();
  const p = state.profile;
  if (!p) return;
  const { data } = await sb.rpc("my_response_ids", {
    p_grade: p.grade, p_class: p.classNo, p_no: p.studentNo
  });
  (data || []).forEach(id => state.myDone.add(id));
}
async function loadAll() {
  $("#surveyList").innerHTML = '<div class="loading">설문을 불러오는 중…</div>';
  const [sv, ct] = await Promise.all([
    sb.from("ss_surveys").select(COLS).order("created_at", { ascending: false }),
    sb.rpc("survey_counts"),
    loadMyDone()
  ]);
  if (sv.error) {
    $("#surveyList").innerHTML = "";
    $("#emptyState").classList.remove("hidden");
    $("#emptyState").innerHTML =
      `<div class="empty-icon">!</div><h3>불러오지 못했습니다</h3><p>${esc(sv.error.message)}</p>`;
    return;
  }
  state.surveys = sv.data || [];
  state.counts = {};
  (ct.data || []).forEach(r => state.counts[r.sid] = Number(r.cnt));
  renderSurveys();
}

/* 8. 목록 렌더링 */
function filteredSurveys() {
  const q = state.search.trim().toLowerCase();
  return state.surveys.filter(s => {
    if (state.grade !== "all" && !s.grades.includes(Number(state.grade))) return false;
    if (q && !(s.title + " " + s.description).toLowerCase().includes(q)) return false;
    const closed = isClosed(s);
    switch (state.tab) {
      case "open":   return !closed;
      case "closed": return closed;
      case "done":   return state.myDone.has(s.id);
      case "mine":   return isOwner(s);
      default:       return true;
    }
  });
}
function renderSurveys() {
  const list = filteredSurveys();
  $("#surveyCount").textContent = list.length;
  $("#surveyList").innerHTML = list.map(cardHTML).join("");
  const empty = $("#emptyState");
  if (!list.length && state.surveys.length >= 0) {
    empty.innerHTML = '<div class="empty-icon">∅</div><h3>설문이 없습니다</h3><p>다른 검색어나 필터를 선택해보세요</p>';
    empty.classList.remove("hidden");
  } else empty.classList.add("hidden");
  renderStats();
}
function renderStats() {
  const box = $("#teacherStats");
  if (!state.isTeacher) return box.classList.add("hidden");
  const total = state.surveys.length;
  const open = state.surveys.filter(s => !isClosed(s)).length;
  const resp = Object.values(state.counts).reduce((a, b) => a + b, 0);
  box.innerHTML =
    `<div class="stat"><b>${total}</b><span>전체 설문</span></div>` +
    `<div class="stat"><b>${open}</b><span>진행 중</span></div>` +
    `<div class="stat"><b>${resp}</b><span>총 응답 수</span></div>`;
  box.classList.remove("hidden");
}
function cardHTML(s) {
  const closed = isClosed(s);
  const done = state.myDone.has(s.id);
  const eligible = !state.profile || s.grades.includes(state.profile.grade);
  const grades = [...s.grades].sort((a, b) => a - b).map(g => g + "학년").join(" · ");
  const color = colorOf(s.author_label + (s.by_teacher ? "t" : ""));
  const cnt = state.counts[s.id] || 0;

  let pBtn;
  if (closed)          pBtn = '<button class="btn primary" disabled>마감됨</button>';
  else if (done)       pBtn = '<button class="btn success" disabled>참여 완료 ✓</button>';
  else if (!eligible)  pBtn = '<button class="btn primary" disabled>대상 학년 아님</button>';
  else                 pBtn = `<button class="btn primary" data-action="participate" data-id="${s.id}">참여하기</button>`;

  const manage = canManage(s) ? `
      <button class="btn ghost" data-action="results" data-id="${s.id}">결과 보기</button>
      <button class="btn ghost" data-action="toggle" data-id="${s.id}">${s.is_open ? "마감하기" : "다시 열기"}</button>
      <button class="btn danger" data-action="delete" data-id="${s.id}">삭제</button>` : "";

  return `
  <article class="msg">
    <div class="avatar" style="background:${color}">${esc(s.by_teacher ? "교" : s.author_label[0] || "?")}</div>
    <div class="msg-body">
      <div class="msg-head">
        <span class="author">${esc(s.author_label)}</span>
        ${s.by_teacher ? '<span class="tag teacher">교사</span>' : ""}
        ${isOwner(s) ? '<span class="tag">내 설문</span>' : ""}
        <span class="time">${esc(discordTime(s.created_at))}</span>
      </div>
      <div class="embed" style="--bar:${closed ? "#da373c" : "#23a559"}">
        <div class="embed-title">${esc(s.title)}</div>
        ${s.description ? `<div class="embed-desc">${esc(s.description)}</div>` : ""}
        <div class="fields">
          <div class="field"><span>대상</span><b>${esc(grades)}</b></div>
          <div class="field"><span>상태</span><b class="${closed ? "closed" : "open"}">${closed ? "마감" : "진행 중"}</b></div>
          <div class="field"><span>마감</span><b>${esc(ddayText(s.deadline))}</b></div>
          <div class="field"><span>응답 / 질문</span><b>${cnt}명 · ${s.questions.length}문항</b></div>
        </div>
        <div class="actions">
          ${pBtn}
          <button class="btn ghost" data-action="share" data-id="${s.id}">QR · 링크</button>
          ${manage}
        </div>
      </div>
    </div>
  </article>`;
}

const actions = {
  participate: s => openAnswer(s),
  results: s => openResults(s),
  share: s => openQr(s),
  toggle: s => toggleOpen(s),
  delete: s => deleteSurvey(s)
};

/* 9. 설문 만들기 */
function newQ(type) {
  return { id: uid(), type, text: "", required: false, optText: "" };
}
const hasOptions = t => t === "single" || t === "multi";

function openBuilder() {
  $("#builderForm").reset();
  hideErr("builderError");
  builderQs = [newQ("single")];
  renderBuilder();
  openModal("builderModal");
}
function renderBuilder() {
  $("#qList").innerHTML = builderQs.map((q, i) => `
    <div class="q-card" data-i="${i}">
      <div class="q-top">
        <span class="q-num">${i + 1}</span>
        <select data-f="type">
          ${TYPES.map(t => `<option value="${t.v}" ${t.v === q.type ? "selected" : ""}>${t.l}</option>`).join("")}
        </select>
        <div class="q-tools">
          <button type="button" data-q="up" title="위로">↑</button>
          <button type="button" data-q="down" title="아래로">↓</button>
          <button type="button" data-q="del" title="삭제">✕</button>
        </div>
      </div>
      <input type="text" data-f="text" maxlength="200" placeholder="질문을 입력하세요" value="${esc(q.text)}">
      ${hasOptions(q.type)
        ? `<textarea data-f="optText" placeholder="선택지를 한 줄에 하나씩 입력하세요&#10;예)&#10;매우 만족&#10;보통&#10;불만족">${esc(q.optText)}</textarea>` : ""}
      ${q.type === "scale" ? '<p class="muted">1점(전혀 아니다) ~ 5점(매우 그렇다)</p>' : ""}
      <label class="sw"><input type="checkbox" data-f="required" ${q.required ? "checked" : ""}> 필수 질문</label>
    </div>`).join("");
}
function bindBuilder() {
  const list = $("#qList");
  list.addEventListener("input", e => {
    const card = e.target.closest(".q-card");
    const f = e.target.dataset.f;
    if (!card || !f) return;
    const q = builderQs[Number(card.dataset.i)];
    if (f === "required") q.required = e.target.checked;
    else if (f === "type") { q.type = e.target.value; renderBuilder(); }
    else q[f] = e.target.value;
  });
  list.addEventListener("click", e => {
    const btn = e.target.closest("[data-q]");
    if (!btn) return;
    const i = Number(btn.closest(".q-card").dataset.i);
    const a = btn.dataset.q;
    if (a === "del") { if (builderQs.length > 1) builderQs.splice(i, 1); else return showToast("질문은 최소 1개 필요해요"); }
    if (a === "up" && i > 0) [builderQs[i - 1], builderQs[i]] = [builderQs[i], builderQs[i - 1]];
    if (a === "down" && i < builderQs.length - 1) [builderQs[i + 1], builderQs[i]] = [builderQs[i], builderQs[i + 1]];
    renderBuilder();
  });
  $$("[data-addq]").forEach(b => b.addEventListener("click", () => {
    if (builderQs.length >= 30) return showToast("질문은 최대 30개까지예요");
    builderQs.push(newQ(b.dataset.addq));
    renderBuilder();
    $("#qList").lastElementChild?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }));
  $("#builderForm").addEventListener("submit", submitBuilder);
}
async function submitBuilder(e) {
  e.preventDefault();
  hideErr("builderError");
  const title = $("#bTitle").value.trim();
  const desc = $("#bDesc").value.trim();
  const grades = $$('input[name="bGrade"]:checked').map(i => Number(i.value));
  const deadline = $("#bDeadline").value || null;

  if (!title) return showErr("builderError", "설문 제목을 입력해주세요.");
  if (!grades.length) return showErr("builderError", "대상 학년을 선택해주세요.");
  if (deadline && deadline < todayStr()) return showErr("builderError", "마감일은 오늘 이후로 선택해주세요.");

  const questions = [];
  for (let i = 0; i < builderQs.length; i++) {
    const q = builderQs[i];
    const text = q.text.trim();
    if (!text) return showErr("builderError", `${i + 1}번 질문 내용을 입력해주세요.`);
    const out = { id: q.id, type: q.type, text, required: q.required };
    if (hasOptions(q.type)) {
      const opts = [...new Set(q.optText.split("\n").map(s => s.trim()).filter(Boolean))];
      if (opts.length < 2) return showErr("builderError", `${i + 1}번 질문은 선택지가 2개 이상 필요해요.`);
      if (opts.length > 20) return showErr("builderError", `${i + 1}번 질문의 선택지는 최대 20개예요.`);
      out.options = opts;
    }
    questions.push(out);
  }

  const token = newToken();
  const author = state.isTeacher ? "선생님"
    : state.profile ? `${state.profile.grade}학년 ${state.profile.classNo}반 ${state.profile.name}` : "학생";

  const btn = $("#builderSubmit");
  btn.disabled = true; btn.textContent = "등록하는 중…";
  const { data, error } = await sb.rpc("create_survey", {
    p_title: title, p_description: desc, p_grades: grades, p_questions: questions,
    p_deadline: deadline, p_token: token, p_author: author
  });
  btn.disabled = false; btn.textContent = "설문 등록하기";
  if (error) return showErr("builderError", "등록 실패: " + error.message);

  localStorage.setItem("ss_owner_" + data, token);
  closeModal("builderModal");
  await loadAll();
  showToast("설문이 등록되었습니다!");
}

/* 10. 설문 응답 */
function openAnswer(s) {
  if (!state.profile) {
    state.pending = s;
    if ($("#onboardModal").classList.contains("hidden")) openProfile();
    return;
  }
  if (isClosed(s)) return showToast("마감된 설문입니다.");
  if (!s.grades.includes(state.profile.grade)) return showToast("대상 학년이 아닙니다.");
  state.answering = s;
  $("#aTitle").textContent = s.title;
  $("#aDesc").textContent = s.description || "";
  $("#aMeta").textContent = "SURVEY · " + ddayText(s.deadline);
  $("#aWho").textContent = profileLabel(state.profile);
  $("#aQuestions").innerHTML = s.questions.map(qHTML).join("");
  hideErr("answerError");
  openModal("answerModal");
}
function qHTML(q, i) {
  const req = q.required ? '<span class="req">*</span>' : "";
  let input = "";
  switch (q.type) {
    case "short":
      input = `<input type="text" maxlength="200" placeholder="답변 입력">`; break;
    case "long":
      input = `<textarea maxlength="1000" placeholder="답변 입력"></textarea>`; break;
    case "single":
      input = q.options.map(o => `<label class="opt"><input type="radio" name="${q.id}" value="${esc(o)}"><span>${esc(o)}</span></label>`).join(""); break;
    case "multi":
      input = q.options.map(o => `<label class="opt"><input type="checkbox" name="${q.id}" value="${esc(o)}"><span>${esc(o)}</span></label>`).join(""); break;
    case "scale":
      input = `<div class="scale">${[1, 2, 3, 4, 5].map(n =>
        `<label><input type="radio" name="${q.id}" value="${n}"><span>${n}</span></label>`).join("")}</div>
        <div class="scale-cap"><span>전혀 아니다</span><span>매우 그렇다</span></div>`; break;
  }
  return `<div class="a-q" data-qid="${q.id}">
    <label class="a-label">${i + 1}. ${esc(q.text)} ${req}</label>${input}</div>`;
}
function collectAnswers(s) {
  const ans = {};
  for (let i = 0; i < s.questions.length; i++) {
    const q = s.questions[i];
    const root = $(`.a-q[data-qid="${q.id}"]`);
    let v;
    if (q.type === "short" || q.type === "long") v = root.querySelector("input,textarea").value.trim();
    else if (q.type === "multi") v = $$("input:checked", root).map(x => x.value);
    else {
      const c = root.querySelector("input:checked");
      v = c ? (q.type === "scale" ? Number(c.value) : c.value) : "";
    }
    const empty = v === "" || (Array.isArray(v) && !v.length);
    if (q.required && empty) return { error: `${i + 1}번 질문은 필수입니다.` };
    ans[q.id] = v;
  }
  return { ans };
}
async function submitAnswer(e) {
  e.preventDefault();
  hideErr("answerError");
  const s = state.answering, p = state.profile;
  if (!s || !p) return;
  const r = collectAnswers(s);
  if (r.error) return showErr("answerError", r.error);

  const btn = $("#answerSubmit");
  btn.disabled = true; btn.textContent = "제출하는 중…";
  const { data, error } = await sb.rpc("submit_response", {
    p_survey_id: s.id, p_grade: p.grade, p_class: p.classNo,
    p_no: p.studentNo, p_name: p.name, p_answers: r.ans
  });
  btn.disabled = false; btn.textContent = "제출하기";

  if (error) return showErr("answerError", "제출 실패: " + error.message);
  const msg = {
    duplicate: "이미 이 번호로 응답했어요.",
    closed: "마감된 설문입니다.",
    grade: "대상 학년이 아닙니다.",
    not_found: "삭제되었거나 없는 설문입니다.",
    too_big: "답변이 너무 깁니다."
  };
  if (data !== "ok") {
    if (data === "duplicate") state.myDone.add(s.id);
    return showErr("answerError", msg[data] || "제출에 실패했습니다.");
  }
  state.myDone.add(s.id);
  state.counts[s.id] = (state.counts[s.id] || 0) + 1;
  closeModal("answerModal");
  renderSurveys();
  showToast("응답이 제출되었습니다. 감사합니다!");
}

/* 11. 결과 */
async function openResults(s) {
  state.resSurvey = s;
  state.resTab = "summary";
  state.resRows = [];
  $$("[data-rtab]").forEach(b => b.classList.toggle("active", b.dataset.rtab === "summary"));
  $("#resTitle").textContent = s.title;
  $("#resBody").innerHTML = '<div class="loading">불러오는 중…</div>';
  openModal("resultModal");
  const { data, error } = await sb.rpc("get_survey_responses", {
    p_survey_id: s.id, p_token: getToken(s)
  });
  if (error) { $("#resBody").innerHTML = `<p class="muted">${esc(error.message)}</p>`; return; }
  state.resRows = data || [];
  renderResults();
}
function renderResults() {
  const s = state.resSurvey, rows = state.resRows;
  const byClass = {};
  rows.forEach(r => {
    const k = `${r.grade}학년 ${r.class_no}반`;
    byClass[k] = (byClass[k] || 0) + 1;
  });
  const pills = Object.entries(byClass).map(([k, v]) =>
    `<span class="pill">${esc(k)} <b>${v}</b></span>`).join("") || '<span class="muted">아직 응답이 없어요</span>';
  const body = state.resTab === "summary"
    ? s.questions.map((q, i) => summaryHTML(q, i, rows)).join("")
    : (rows.length ? rows.map(r => rowHTML(r, s)).join("") : '<p class="muted">응답이 없습니다.</p>');
  $("#resBody").innerHTML =
    `<div class="res-top"><div class="big"><b>${rows.length}</b>명 응답</div><div class="pills">${pills}</div></div>` + body;
}
function summaryHTML(q, i, rows) {
  const answers = rows
    .map(r => ({ r, v: r.answers ? r.answers[q.id] : undefined }))
    .filter(x => x.v !== undefined && x.v !== "" && !(Array.isArray(x.v) && !x.v.length));
  let inner = "";
  if (["single", "multi", "scale"].includes(q.type)) {
    const opts = q.type === "scale" ? ["1", "2", "3", "4", "5"] : q.options;
    const cnt = new Map(opts.map(o => [o, 0]));
    answers.forEach(({ v }) => [].concat(v).forEach(x => {
      const k = String(x);
      if (cnt.has(k)) cnt.set(k, cnt.get(k) + 1);
    }));
    const total = answers.length || 1;
    inner = opts.map(o => {
      const c = cnt.get(o), pct = Math.round(c / total * 100);
      return `<div class="bar-row"><span class="bar-label" title="${esc(o)}">${esc(o)}${q.type === "scale" ? "점" : ""}</span>
        <div class="bar"><i style="width:${pct}%"></i></div><span class="bar-num">${c}명 (${pct}%)</span></div>`;
    }).join("");
    if (q.type === "scale" && answers.length) {
      const avg = answers.reduce((a, { v }) => a + Number(v), 0) / answers.length;
      inner += `<div class="avg">평균 ${avg.toFixed(2)}점</div>`;
    }
  } else {
    inner = answers.length
      ? `<ul class="text-list">${answers.slice(0, 100).map(({ r, v }) =>
          `<li>${esc(v)}<small>${esc(`${r.grade}학년 ${r.class_no}반 ${r.student_no}번 ${r.student_name}`)}</small></li>`).join("")}</ul>`
      : '<p class="muted">응답 없음</p>';
  }
  return `<section class="sum-q"><h4>${i + 1}. ${esc(q.text)}<small>${answers.length}명 응답</small></h4>${inner}</section>`;
}
function rowHTML(r, s) {
  const label = `${r.grade}학년 ${r.class_no}반 ${r.student_no}번 ${r.student_name}`;
  return `<details class="resp"><summary>
      <span><b>${esc(label)}</b><small>${esc(discordTime(r.created_at))}</small></span>
      <button type="button" class="mini danger" data-del="${r.id}">삭제</button></summary>
    ${s.questions.map((q, i) => `<div class="resp-a"><span>${i + 1}. ${esc(q.text)}</span>
      <p>${esc(fmtAns(r.answers ? r.answers[q.id] : "")) || "<i>무응답</i>"}</p></div>`).join("")}
  </details>`;
}
async function deleteResponse(id) {
  if (!confirm("이 응답을 삭제할까요?\n(해당 학생은 다시 응답할 수 있게 됩니다)")) return;
  const s = state.resSurvey;
  const { data, error } = await sb.rpc("delete_response", { p_response_id: id, p_token: getToken(s) });
  if (error || !data) return showToast("삭제하지 못했습니다.");
  state.resRows = state.resRows.filter(r => r.id !== id);
  state.counts[s.id] = Math.max(0, (state.counts[s.id] || 1) - 1);
  renderResults();
  renderSurveys();
  showToast("응답을 삭제했습니다.");
}
function downloadCSV() {
  const s = state.resSurvey, rows = state.resRows;
  if (!s) return;
  const cell = c => {
    let t = String(c ?? "");
    if (/^[=+\-@]/.test(t)) t = "'" + t;
    return '"' + t.replace(/"/g, '""') + '"';
  };
  const lines = [
    ["학년", "반", "번호", "이름", "제출시각", ...s.questions.map(q => q.text)],
    ...rows.map(r => [
      r.grade, r.class_no, r.student_no, r.student_name,
      new Date(r.created_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }),
      ...s.questions.map(q => fmtAns(r.answers ? r.answers[q.id] : ""))
    ])
  ];
  const csv = "\uFEFF" + lines.map(l => l.map(cell).join(",")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = `${s.title.replace(/[\\/:*?"<>|]/g, "_")}_결과.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* 12. 마감 / 삭제 */
async function toggleOpen(s) {
  const { data, error } = await sb.rpc("set_survey_open", {
    p_id: s.id, p_token: getToken(s), p_open: !s.is_open
  });
  if (error || !data) return showToast("변경 권한이 없습니다.");
  s.is_open = !s.is_open;
  renderSurveys();
  showToast(s.is_open ? "설문을 다시 열었습니다." : "설문을 마감했습니다.");
}
async function deleteSurvey(s) {
  if (!confirm(`"${s.title}"\n\n정말 삭제할까요?\n응답도 모두 사라지며 복구할 수 없습니다.`)) return;
  const { data, error } = await sb.rpc("delete_survey", { p_id: s.id, p_token: getToken(s) });
  if (error || !data) return showToast("삭제 권한이 없습니다.");
  localStorage.removeItem("ss_owner_" + s.id);
  state.surveys = state.surveys.filter(x => x.id !== s.id);
  renderSurveys();
  showToast("설문이 삭제되었습니다.");
}

/* 13. QR / 공유 링크 */
function openQr(s) {
  state.qrUrl = `${location.origin}${location.pathname}?s=${s.id}`;
  $("#qrTitle").textContent = s.title;
  const box = $("#qrcode");
  box.innerHTML = "";
  new QRCode(box, { text: state.qrUrl, width: 220, height: 220, correctLevel: QRCode.CorrectLevel.M });
  openModal("qrModal");
}
function handleDeepLink() {
  const id = new URLSearchParams(location.search).get("s");
  if (!id) return;
  history.replaceState(null, "", location.pathname);
  const s = state.surveys.find(x => x.id === id);
  if (!s) return showToast("삭제되었거나 없는 설문입니다.");
  openAnswer(s);
}

/* 14. 교사 로그인 */
async function submitLogin(e) {
  e.preventDefault();
  hideErr("loginError");
  const btn = $("#loginSubmit");
  btn.disabled = true; btn.textContent = "로그인 중…";
  const { data, error } = await sb.auth.signInWithPassword({
    email: $("#loginEmail").value.trim(),
    password: $("#loginPw").value
  });
  if (error) {
    btn.disabled = false; btn.textContent = "로그인";
    return showErr("loginError", "이메일 또는 비밀번호가 올바르지 않습니다.");
  }
  await applySession(data.session);
  btn.disabled = false; btn.textContent = "로그인";
  if (!state.isTeacher) return showErr("loginError", "교사 계정으로 등록되지 않은 계정입니다.");
  $("#loginForm").reset();
  closeModal("loginModal");
  closeModal("onboardModal");
  showToast("교사 모드로 로그인했습니다.");
}
async function teacherButton() {
  if (state.isTeacher) {
    await sb.auth.signOut();
    showToast("로그아웃했습니다.");
    if (!state.profile) openOnboarding();
  } else {
    hideErr("loginError");
    openModal("loginModal");
  }
}

/* 15. 이벤트 연결 */
function bindUI() {
  $$(".modal").forEach(m => {
    $$("[data-close]", m).forEach(el => el.addEventListener("click", () => {
      if (modalLocked(m.id)) return;
      closeModal(m.id);
    }));
  });
  document.addEventListener("keydown", e => {
    if (e.key !== "Escape") return;
    const open = $$(".modal:not(.hidden)").pop();
    if (open && !modalLocked(open.id)) closeModal(open.id);
  });

  $("#searchInput").addEventListener("input", e => { state.search = e.target.value; renderSurveys(); });
  $("#tabChips").addEventListener("click", e => {
    const b = e.target.closest(".chip"); if (!b) return;
    $$("#tabChips .chip").forEach(x => x.classList.remove("active"));
    b.classList.add("active"); state.tab = b.dataset.tab; renderSurveys();
  });
  $("#gradeChips").addEventListener("click", e => {
    const b = e.target.closest(".chip"); if (!b) return;
    $$("#gradeChips .chip").forEach(x => x.classList.remove("active"));
    b.classList.add("active"); state.grade = b.dataset.grade; renderSurveys();
  });

  $("#surveyList").addEventListener("click", e => {
    const btn = e.target.closest("[data-action]"); if (!btn) return;
    const s = state.surveys.find(x => x.id === btn.dataset.id);
    if (s) actions[btn.dataset.action](s);
  });

  $("#btnNew").addEventListener("click", openBuilder);
  $("#btnProfile").addEventListener("click", () => { if (!state.isTeacher || state.profile) openProfile(); else openProfile(); });
  $("#btnTeacher").addEventListener("click", teacherButton);

  $("#obNext").addEventListener("click", openProfile);
  $("#obTeacher").addEventListener("click", () => { closeModal("onboardModal"); openModal("loginModal"); });
  $("#profileForm").addEventListener("submit", saveProfile);
  $("#profileCancel").addEventListener("click", () => closeModal("onboardModal"));
  $("#loginForm").addEventListener("submit", submitLogin);

  bindBuilder();

  $("#answerForm").addEventListener("submit", submitAnswer);
  $("#aChange").addEventListener("click", () => { closeModal("answerModal"); state.pending = state.answering; openProfile(); });

  $$("[data-rtab]").forEach(b => b.addEventListener("click", () => {
    state.resTab = b.dataset.rtab;
    $$("[data-rtab]").forEach(x => x.classList.toggle("active", x === b));
    renderResults();
  }));
  $("#resBody").addEventListener("click", e => {
    const d = e.target.closest("[data-del]");
    if (d) { e.preventDefault(); deleteResponse(d.dataset.del); }
  });
  $("#btnCsv").addEventListener("click", downloadCSV);

  $("#copyLink").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(state.qrUrl); showToast("링크를 복사했습니다."); }
    catch { prompt("링크를 복사하세요", state.qrUrl); }
  });
  $("#downloadQr").addEventListener("click", () => {
    const canvas = $("#qrcode canvas");
    if (!canvas) return showToast("QR 코드를 준비하는 중입니다.");
    const a = document.createElement("a");
    a.download = "school-survey-qr.png";
    a.href = canvas.toDataURL("image/png");
    a.click();
  });
}

/* 16. 서비스워커 */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(err => console.error("SW 등록 실패:", err));
  });
}
