/* ========== 1. SUPABASE ========== */
const SUPABASE_URL = "https://yvpjbqsjsszderhhdnwv.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_ivsAYNav68Zpd3e1uYBpLw_OEtIuhkO";
const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ========== 2. STATE ========== */
const $ = id => document.getElementById(id);
let surveys = [], counts = {}, doneSet = new Set();
let grade = "all", search = "";
let student = JSON.parse(localStorage.getItem("student") || "null");
let teacherCode = sessionStorage.getItem("teacher_code") || "";
let builderQs = [];
const QTYPES = {
  short: "단답형", long: "장문형", single: "객관식(1개)",
  multi: "체크박스(여러 개)", scale: "5점 척도"
};

/* ========== 3. UTIL ========== */
function esc(v) {
  return String(v ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;")
    .replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
}
let toastTimer;
function toast(msg) {
  const t = $("toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 2500);
}
function openModal(html, wide) {
  $("modalBox").className = "modal-box" + (wide ? " wide" : "");
  $("modalBox").innerHTML = html;
  $("modal").classList.remove("hidden");
  document.body.style.overflow = "hidden";
}
function closeModal() {
  $("modal").classList.add("hidden");
  document.body.style.overflow = "";
}
function todayStr() {
  const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}
function isClosed(deadline) { return !!deadline && deadline < todayStr(); }
function dday(deadline) {
  if (!deadline) return "";
  const diff = Math.round((new Date(deadline + "T00:00:00") - new Date(todayStr() + "T00:00:00")) / 86400000);
  if (diff < 0) return "마감";
  return diff === 0 ? "D-Day" : "D-" + diff;
}
const studentLabel = s => `${s.grade}학년 ${s.cls}반 ${s.num}번 ${s.name}`;

/* ========== 4. START ========== */
document.addEventListener("DOMContentLoaded", async () => {
  updateTopbar();
  if (!student) openOnboarding(true);
  await loadAll();
});

function updateTopbar() {
  $("profileBtn").textContent = student ? "👤 " + studentLabel(student) : "👤 정보 입력";
  const on = !!teacherCode;
  $("teacherBtn").textContent = on ? "🛡️ 교사 모드 (로그아웃)" : "🔑 교사";
  $("teacherBtn").classList.toggle("on", on);
  $("teacherBanner").classList.toggle("hidden", !on);
}

/* ========== 5. ONBOARDING ========== */
function openOnboarding(first) {
  const s = student || { grade: "", cls: "", num: "", name: "" };
  openModal(`
    <h2>${first ? "👋 환영합니다!" : "내 정보 수정"}</h2>
    <p class="muted">설문에 참여하려면 학년·반·번호·이름이 필요해요. 선생님이 누가 응답했는지 확인할 수 있습니다.</p>
    <div id="obErr" class="error hidden" style="margin-top:14px"></div>
    <div class="row" style="margin-top:16px">
      <div class="field"><label>학년</label>
        <select id="obGrade"><option value="">선택</option>
          ${[1,2,3].map(g => `<option value="${g}" ${s.grade==g?"selected":""}>${g}학년</option>`).join("")}
        </select></div>
      <div class="field"><label>반</label>
        <input id="obClass" type="number" min="1" max="20" placeholder="예: 3" value="${esc(s.cls)}"></div>
      <div class="field"><label>번호</label>
        <input id="obNum" type="number" min="1" max="50" placeholder="예: 15" value="${esc(s.num)}"></div>
    </div>
    <div class="field"><label>이름</label>
      <input id="obName" maxlength="20" placeholder="실명을 입력하세요" value="${esc(s.name)}"></div>
    <div class="modal-foot">
      ${first ? "" : `<button class="btn ghost" onclick="closeModal()">취소</button>`}
      <button class="btn primary" id="obSave">시작하기</button>
    </div>`);
  $("obSave").onclick = async () => {
    const g = +$("obGrade").value, c = +$("obClass").value, n = +$("obNum").value;
    const name = $("obName").value.trim();
    if (!g || !c || !n || !name) {
      $("obErr").textContent = "모든 항목을 입력해주세요.";
      $("obErr").classList.remove("hidden"); return;
    }
    student = { grade: g, cls: c, num: n, name };
    localStorage.setItem("student", JSON.stringify(student));
    closeModal(); updateTopbar(); toast("정보가 저장되었습니다");
    await loadAll();
  };
}
$("profileBtn").onclick = () => openOnboarding(false);

/* ========== 6. TEACHER LOGIN ========== */
$("teacherBtn").onclick = () => {
  if (teacherCode) {
    teacherCode = ""; sessionStorage.removeItem("teacher_code");
    updateTopbar(); renderSurveys(); toast("교사 모드 종료"); return;
  }
  openModal(`
    <h2>🔑 교사 로그인</h2>
    <p class="muted">마스터 코드를 입력하세요.</p>
    <div id="tErr" class="error hidden" style="margin-top:12px"></div>
    <div class="field" style="margin-top:14px">
      <input id="tCode" type="password" placeholder="마스터 코드" autocomplete="off"></div>
    <div class="modal-foot">
      <button class="btn ghost" onclick="closeModal()">취소</button>
      <button class="btn primary" id="tLogin">로그인</button>
    </div>`);
  const go = async () => {
    const code = $("tCode").value;
    const { data, error } = await db.rpc("is_teacher", { p_code: code });
    if (error || !data) {
      $("tErr").textContent = "코드가 올바르지 않습니다.";
      $("tErr").classList.remove("hidden"); return;
    }
    teacherCode = code; sessionStorage.setItem("teacher_code", code);
    closeModal(); updateTopbar(); renderSurveys(); toast("교사 모드로 로그인했습니다");
  };
  $("tLogin").onclick = go;
  $("tCode").onkeydown = e => { if (e.key === "Enter") go(); };
  $("tCode").focus();
};

/* ========== 7. LOAD ========== */
async function loadAll() {
  $("surveyList").innerHTML = `<div class="empty">불러오는 중...</div>`;
  const { data, error } = await db.from("surveys")
    .select("id,title,description,grades,deadline,status,questions,created_at")
    
