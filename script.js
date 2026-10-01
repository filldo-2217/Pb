/* ===== 1. SUPABASE ===== */
const SUPABASE_URL = "https://yvpjbqsjsszderhhdnwv.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_ivsAYNav68Zpd3e1uYBpLw_OEtIuhkO";
const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ===== 2. STATE ===== */
const $ = id => document.getElementById(id);
let surveys = [], counts = {}, doneSet = new Set();
let grade = "all", search = "";
let student = JSON.parse(localStorage.getItem("student") || "null");
let teacherCode = sessionStorage.getItem("teacher_code") || "";
let builderQs = [];
const QTYPES = { short: "단답형", long: "장문형", single: "객관식(1개)", multi: "체크박스(여러 개)", scale: "5점 척도" };

/* ===== 3. UTIL ===== */
function esc(v) {
  return String(v ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
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
function closeModal() { $("modal").classList.add("hidden"); document.body.style.overflow = ""; }
function todayStr() { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); }
function isClosed(dl) { return !!dl && dl < todayStr(); }
function dday(dl) {
  if (!dl) return "";
  const diff = Math.round((new Date(dl + "T00:00:00") - new Date(todayStr() + "T00:00:00")) / 86400000);
  if (diff < 0) return "마감";
  return diff === 0 ? "D-Day" : "D-" + diff;
}
const studentLabel = s => `${s.grade}학년 ${s.cls}반 ${s.num}번 ${s.name}`;
const showErr = (id, m) => { $(id).textContent = m; $(id).classList.remove("hidden"); };

/* ===== 4. START ===== */
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

/* ===== 5. 첫 접속 안내 (학년/반/번호/이름) ===== */
function openOnboarding(first) {
  const s = student || { grade: "", cls: "", num: "", name: "" };
  openModal(`
    <h2>${first ? "👋 환영합니다!" : "내 정보 수정"}</h2>
    <p class="muted" style="margin-bottom:16px">설문에 참여하려면 학년·반·번호·이름이 필요해요.<br>선생님이 누가 응답했는지 확인할 수 있습니다.</p>
    <div id="obErr" class="error hidden"></div>
    <div class="row">
      <div class="field"><label>학년</label>
        <select id="obGrade"><option value="">선택</option>
        ${[1,2,3].map(g => `<option value="${g}" ${s.grade==g?"selected":""}>${g}학년</option>`).join("")}</select></div>
      <div class="field"><label>반</label><input id="obClass" type="number" min="1" max="20" placeholder="예: 3" value="${esc(s.cls)}"></div>
      <div class="field"><label>번호</label><input id="obNum" type="number" min="1" max="50" placeholder="예: 15" value="${esc(s.num)}"></div>
    </div>
    <div class="field"><label>이름</label><input id="obName" maxlength="20" placeholder="실명을 입력하세요" value="${esc(s.name)}"></div>
    <div class="modal-foot">
      ${first ? "" : `<button class="btn ghost" onclick="closeModal()">취소</button>`}
      <button class="btn primary" id="obSave">${first ? "시작하기" : "저장"}</button>
    </div>`);
  $("obSave").onclick = async () => {
    const g = +$("obGrade").value, c = +$("obClass").value, n = +$("obNum").value, name = $("obName").value.trim();
    if (!g || !c || !n || !name) return showErr("obErr", "모든 항목을 입력해주세요.");
    student = { grade: g, cls: c, num: n, name };
    localStorage.setItem("student", JSON.stringify(student));
    closeModal(); updateTopbar(); toast("정보가 저장되었습니다");
    await loadAll();
  };
}
$("profileBtn").onclick = () => openOnboarding(false);

/* ===== 6. 교사 로그인 (마스터 코드) ===== */
$("teacherBtn").onclick = () => {
  if (teacherCode) {
    teacherCode = ""; sessionStorage.removeItem("teacher_code");
    updateTopbar(); renderSurveys(); toast("교사 모드를 종료했습니다"); return;
  }
  openModal(`
    <h2>🔑 교사 로그인</h2>
    <p class="muted" style="margin-bottom:16px">마스터 코드를 입력하세요.</p>
    <div id="tErr" class="error hidden"></div>
    <div class="field"><input id="tCode" type="password" placeholder="마스터 코드" autocomplete="off"></div>
    <div class="modal-foot"><button class="btn ghost" onclick="closeModal()">취소</button><button class="btn primary" id="tLogin">로그인</button></div>`);
  const go = async () => {
    const code = $("tCode").value;
    const { data, error } = await db.rpc("is_teacher", { p_code: code });
    if (error || !data) return showErr("tErr", "코드가 올바르지 않습니다.");
    teacherCode = code; sessionStorage.setItem("teacher_code", code);
    closeModal(); updateTopbar(); renderSurveys(); toast("교사 모드로 로그인했습니다");
  };
  $("tLogin").onclick = go;
  $("tCode").onkeydown = e => { if (e.key === "Enter") go(); };
  $("tCode").focus();
};

/* ===== 7. LOAD ===== */
async function loadAll() {
  $("surveyList").innerHTML = `<div class="empty">불러오는 중...</div>`;
  const { data, error } = await db.from("surveys")
    .select("id,title,description,grades,deadline,status,questions,created_at")
    .order("created_at", { ascending: true });
  if (error) { $("surveyList").innerHTML = `<div class="empty">불러오지 못했습니다: ${esc(error.message)}</div>`; return; }
  surveys = data || [];
  const c = await db.rpc("response_counts");
  counts = {}; (c.data || []).forEach(r => counts[r.survey_id] = Number(r.cnt));
  doneSet = new Set();
  if (student) {
    const m = await db.rpc("my_responses", { p_grade: student.grade, p_class: student.cls, p_number: student.num });
    (m.data || []).forEach(r => doneSet.add(r.survey_id));
  }
  renderSurveys();
  $("feed").scrollTop = $("feed").scrollHeight;
}

/* ===== 8. 피드 렌더 (디스코드 메시지 + 임베드) ===== */
function renderSurveys() {
  const q = search.toLowerCase().trim();
  const list = surveys.filter(s => {
    const g = grade === "all" || (Array.isArray(s.grades) && s.grades.includes(+grade));
    const t = !q || (s.title || "").toLowerCase().includes(q) || (s.description || "").toLowerCase().includes(q);
    return g && t;
  });
  $("surveyCount").textContent = list.length;
  $("emptyState").classList.toggle("hidden", list.length > 0);
  $("surveyList").innerHTML = list.map(s => {
    const id = String(s.id), closed = isClosed(s.deadline), done = doneSet.has(id);
    const mine = !!localStorage.getItem("survey_owner_" + id);
    const gs = Array.isArray(s.grades) ? [...s.grades].sort().map(g => g + "학년").join("·") : "전체";
    const qn = (s.questions || []).length;
    const time = s.created_at ? new Date(s.created_at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
    let action;
    if (done) action = `<button class="btn" disabled>✅ 참여 완료</button>`;
    else if (closed) action = `<button class="btn" disabled>마감됨</button>`;
    else action = `<button class="btn primary" data-act="join" data-id="${esc(id)}">참여하기</button>`;
    return `
    <div class="msg">
      <div class="avatar">GH</div>
      <div class="msg-body">
        <div class="msg-head"><span class="msg-name">설문봇</span><span class="bot-tag">BOT</span><span class="msg-time">${esc(time)}</span></div>
        <div class="msg-text">📢 새 설문이 올라왔어요!${mine ? " (내가 등록함)" : ""}</div>
        <div class="embed ${closed ? "closed" : done ? "done" : ""}">
          <div class="badges">
            <span class="badge ${closed ? "red" : "ok"}">${closed ? "마감" : "진행 중"}</span>
            ${!closed && s.deadline ? `<span class="badge warn">${dday(s.deadline)}</span>` : ""}
          </div>
          <h3>${esc(s.title)}</h3>
          <p class="desc">${esc(s.description || "")}</p>
          <div class="fields">
            <div class="field-item"><b>대상</b><span>${esc(gs)}</span></div>
            <div class="field-item"><b>마감일</b><span>${esc(s.deadline || "-")}</span></div>
            <div class="field-item"><b>문항</b><span>${qn}개</span></div>
            <div class="field-item"><b>참여</b><span>${counts[id] || 0}명</span></div>
          </div>
          <div class="btns">
            ${action}
            ${teacherCode ? `<button class="btn green" data-act="results" data-id="${esc(id)}">📊 결과</button>
              <button class="btn danger" data-act="tdel" data-id="${esc(id)}">삭제</button>` : ""}
            ${!teacherCode && mine ? `<button class="btn danger" data-act="mdel" data-id="${esc(id)}">삭제</button>` : ""}
          </div>
        </div>
      </div>
    </div>`;
  }).join("");
}
$("surveyList").addEventListener("click", e => {
  const b = e.target.closest("button[data-act]"); if (!b) return;
  const s = surveys.find(x => String(x.id) === b.dataset.id); if (!s) return;
  const a = b.dataset.act;
  if (a === "join") openSurvey(s);
  else if (a === "results") openResults(s);
  else if (a === "tdel") deleteSurvey(s, true);
  else if (a === "mdel") deleteSurvey(s, false);
});
$("searchInput").oninput = e => { search = e.target.value; renderSurveys(); };
document.querySelectorAll(".filter-btn").forEach(b => b.onclick = () => {
  document.querySelectorAll(".filter-btn").forEach(x => x.classList.remove("active"));
  b.classList.add("active"); grade = b.dataset.grade; renderSurveys();
});
$("modalBackdrop").onclick = closeModal;

/* ===== 9. DELETE ===== */
async function deleteSurvey(s, asTeacher) {
  if (!confirm(`"${s.title}"\n\n정말 삭제하시겠습니까? (응답도 함께 삭제되며 복구 불가)`)) return;
  const res = asTeacher
    ? await db.rpc("admin_delete_survey", { p_code: teacherCode, p_id: String(s.id) })
    : await db.rpc("delete_my_survey", { p_id: s.id, p_token: localStorage.getItem("survey_owner_" + s.id) });
  if (res.error || !res.data) return toast("삭제 실패: " + (res.error?.message || "권한 없음"));
  localStorage.removeItem("survey_owner_" + s.id);
  toast("삭제되었습니다"); await loadAll();
}

/* ===== 10. 설문 만들기 ===== */
const newQ = () => ({ type: "short", text: "", options: "", required: true });
$("openAdd").onclick = () => {
  builderQs = [newQ()];
  openModal(`
    <h2>새 설문 만들기</h2>
    <p class="muted" style="margin-bottom:14px">장난 설문 금지! 실제로 사용할 설문만 올려주세요.</p>
    <div id="bErr" class="error hidden"></div>
    <div class="field"><label>설문 제목</label><input id="bTitle" maxlength="100" placeholder="예: 2학기 학교생활 만족도 조사"></div>
    <div class="field"><label>설명</label><textarea id="bDesc" maxlength="300" placeholder="간단한 설명"></textarea></div>
    <div class="field"><label>대상 학년</label>
      <div class="checks">${[1,2,3].map(g => `<label><input type="checkbox" name="bg" value="${g}">${g}학년</label>`).join("")}</div></div>
    <div class="field"><label>마감일</label><input id="bDeadline" type="date" min="${todayStr()}"></div>
    <div class="field"><label>문항</label><div id="qList"></div>
      <button class="btn ghost" id="addQ" type="button">＋ 문항 추가</button></div>
    <div class="modal-foot"><button class="btn ghost" onclick="closeModal()">취소</button><button class="btn primary" id="bSubmit">등록하기</button></div>`, false);
  renderBuilder();
  $("addQ").onclick = () => { builderQs.push(newQ()); renderBuilder(); };
  $("bSubmit").onclick = submitSurvey;
};
function renderBuilder() {
  $("qList").innerHTML = builderQs.map((q, i) => `
    <div class="q-edit">
      <div class="row">
        <input data-i="${i}" data-k="text" placeholder="질문 ${i + 1}" value="${esc(q.text)}">
        <select data-i="${i}" data-k="type" style="max-width:170px">
          ${Object.entries(QTYPES).map(([k, v]) => `<option value="${k}" ${q.type === k ? "selected" : ""}>${v}</option>`).join("")}
        </select>
      </div>
      ${["single","multi"].includes(q.type) ? `<textarea data-i="${i}" data-k="options" placeholder="보기를 한 줄에 하나씩 입력">${esc(q.options)}</textarea>` : ""}
      <div class="row" style="align-items:center;margin-top:6px">
        <label class="small"><input type="checkbox" data-i="${i}" data-k="required" ${q.required ? "checked" : ""}> 필수</label>
        <button class="btn danger" type="button" data-del="${i}" style="flex:0 0 auto">삭제</button>
      </div>
    </div>`).join("");
}
document.addEventListener("input", e => {
  const t = e.target; if (!t.dataset || t.dataset.k === undefined || !t.closest("#qList")) return;
  const q = builderQs[+t.dataset.i]; if (!q) return;
  q[t.dataset.k] = t.type === "checkbox" ? t.checked : t.value;
  if (t.dataset.k === "type") renderBuilder();
});
document.addEventListener("click", e => {
  const d = e.target.closest("[data-del]");
  if (d && d.closest("#qList")) {
    if (builderQs.length <= 1) return toast("문항은 최소 1개 필요합니다");
    builderQs.splice(+d.dataset.del, 1); renderBuilder();
  }
});
async function submitSurvey() {
  const err = m => showErr("bErr", m);
  const title = $("bTitle").value.trim(), desc = $("bDesc").value.trim();
  const grades = [...document.querySelectorAll('input[name="bg"]:checked')].map(i => +i.value);
  const deadline = $("bDeadline").value;
  if (!title) return err("제목을 입력해주세요.");
  if (!desc) return err("설명을 입력해주세요.");
  if (!grades.length) return err("대상 학년을 선택해주세요.");
  if (!deadline) return err("마감일을 선택해주세요.");
  const questions = [];
  for (const [i, q] of builderQs.entries()) {
    if (!q.text.trim()) return err(`${i + 1}번 질문을 입력해주세요.`);
    const o = { type: q.type, text: q.text.trim(), required: !!q.required };
    if (["single","multi"].includes(q.type)) {
      o.options = q.options.split("\n").map(x => x.trim()).filter(Boolean);
      if (o.options.length < 2) return err(`${i + 1}번 질문은 보기가 2개 이상 필요합니다.`);
    }
    questions.push(o);
  }
  const token = crypto.randomUUID();
  $("bSubmit").disabled = true;
  const { data, error } = await db.from("surveys").insert({
    title, description: desc, grades, deadline, status: "active", survey_url: "", questions, creator_token: token
  }).select("id").single();
  if (error) { $("bSubmit").disabled = false; return err("등록 실패: " + error.message); }
  localStorage.setItem("survey_owner_" + data.id, token);
  closeModal(); toast("설문이 등록되었습니다"); await loadAll();
}

/* ===== 11. 설문 응답 ===== */
function openSurvey(s) {
  if (!student) return openOnboarding(true);
  const qs = s.questions || [];
  if (!qs.length) return toast("문항이 없는 설문입니다");
  openModal(`
    <h2>${esc(s.title)}</h2>
    <p class="muted">${esc(s.description || "")}</p>
    <p class="muted" style="margin:8px 0 16px">응답자: <b>${esc(studentLabel(student))}</b></p>
    <div id="sErr" class="error hidden"></div>
    <form id="sForm">
    ${qs.map((q, i) => `
      <div class="q-block">
        <div class="q-title">${i + 1}. ${esc(q.text)} ${q.required ? '<span class="req">*</span>' : ""}</div>
        ${q.type === "short" ? `<input name="q${i}" maxlength="200">` : ""}
        ${q.type === "long" ? `<textarea name="q${i}" maxlength="1000"></textarea>` : ""}
        ${q.type === "single" ? q.options.map(o => `<label class="opt"><input type="radio" name="q${i}" value="${esc(o)}">${esc(o)}</label>`).join("") : ""}
        ${q.type === "multi" ? q.options.map(o => `<label class="opt"><input type="checkbox" name="q${i}" value="${esc(o)}">${esc(o)}</label>`).join("") : ""}
        ${q.type === "scale" ? `<div class="scale">${[1,2,3,4,5].map(n => `<label><input type="radio" name="q${i}" value="${n}">${n}</label>`).join("")}</div>
          <div class="muted" style="display:flex;justify-content:space-between"><span>매우 아니다</span><span>매우 그렇다</span></div>` : ""}
      </div>`).join("")}
    </form>
    <div class="modal-foot"><button class="btn ghost" onclick="closeModal()">취소</button><button class="btn primary" id="sSubmit">제출하기</button></div>`);
  $("sSubmit").onclick = async () => {
    const f = $("sForm"), answers = [];
    for (const [i, q] of qs.entries()) {
      let a;
      if (q.type === "multi") a = [...f.querySelectorAll(`[name="q${i}"]:checked`)].map(x => x.value);
      else if (q.type === "single" || q.type === "scale") a = f.querySelector(`[name="q${i}"]:checked`)?.value || "";
      else a = f.querySelector(`[name="q${i}"]`).value.trim();
      const empty = Array.isArray(a) ? !a.length : !a;
      if (q.required && empty) return showErr("sErr", `${i + 1}번 문항은 필수입니다.`);
      answers.push({ q: q.text, type: q.type, a });
    }
    $("sSubmit").disabled = true;
    const { error } = await db.rpc("submit_response", {
      p_survey_id: String(s.id), p_grade: student.grade, p_class: student.cls,
      p_number: student.num, p_name: student.name, p_answers: answers
    });
    if (error) { $("sSubmit").disabled = false; return showErr("sErr", error.message); }
    closeModal(); toast("제출 완료! 감사합니다 🎉"); await loadAll();
  };
}

/* ===== 12. 결과 (교사) ===== */
async function openResults(s) {
  const { data, error } = await db.rpc("get_responses", { p_code: teacherCode, p_survey_id: String(s.id) });
  if (error) return toast("불러오기 실패: " + error.message);
  const rs = data || [], qs = s.questions || [];
  const ansText = a => Array.isArray(a) ? a.join(", ") : (a ?? "");
  const summary = qs.map((q, i) => {
    let body = "";
    if (["single","multi","scale"].includes(q.type)) {
      const opts = q.type === "scale" ? ["1","2","3","4","5"] : q.options;
      const cnt = Object.fromEntries(opts.map(o => [o, 0]));
      rs.forEach(r => { const a = r.answers[i]?.a; (Array.isArray(a) ? a : [a]).forEach(x => { if (x in cnt) cnt[x]++; }); });
      const max = Math.max(1, ...Object.values(cnt));
      body = opts.map(o => `<div class="bar-row">${esc(o)} — ${cnt[o]}명<div class="bar"><i style="width:${cnt[o] / max * 100}%"></i></div></div>`).join("");
      if (q.type === "scale") {
        const v = rs.map(r => +r.answers[i]?.a).filter(Boolean);
        if (v.length) body += `<div class="muted">평균 ${(v.reduce((a, b) => a + b, 0) / v.length).toFixed(2)}점</div>`;
      }
    } else {
      body = rs.map(r => r.answers[i]?.a ? `<div class="text-ans">${esc(r.answers[i].a)}</div>` : "").join("") || `<div class="muted">응답 없음</div>`;
    }
    return `<div class="q-block"><div class="q-title">${i + 1}. ${esc(q.text)}</div>${body}</div>`;
  }).join("");
  const table = `<div class="table-wrap"><table><thead><tr>
    <th>학년</th><th>반</th><th>번호</th><th>이름</th>${qs.map((q, i) => `<th>Q${i + 1}</th>`).join("")}<th>제출시각</th><th></th></tr></thead>
    <tbody>${rs.map(r => `<tr><td>${r.s_grade}</td><td>${r.s_class}</td><td>${r.s_number}</td><td>${esc(r.s_name)}</td>
      ${qs.map((q, i) => `<td class="wrap">${esc(ansText(r.answers[i]?.a))}</td>`).join("")}
      <td>${new Date(r.created_at).toLocaleString("ko-KR")}</td>
      <td><button class="btn danger" data-rdel="${r.id}">삭제</button></td></tr>`).join("")}</tbody></table></div>`;
  openModal(`
    <h2>📊 ${esc(s.title)}</h2>
    <p class="muted">총 ${rs.length}명 참여</p>
    <div class="tabs">
      <button class="btn primary" id="tabSum">통계</button>
      <button class="btn" id="tabTbl">응답자별</button>
      <button class="btn green" id="csvBtn">CSV 다운로드</button>
    </div>
    <div id="vSum">${rs.length ? summary : `<div class="empty">아직 응답이 없습니다</div>`}</div>
    <div id="vTbl" class="hidden">${table}</div>
    <div class="modal-foot"><button class="btn ghost" onclick="closeModal()">닫기</button></div>`, true);
  $("tabSum").onclick = () => { $("vSum").classList.remove("hidden"); $("vTbl").classList.add("hidden"); };
  $("tabTbl").onclick = () => { $("vTbl").classList.remove("hidden"); $("vSum").classList.add("hidden"); };
  $("csvBtn").onclick = () => {
    const cell = v => `"${String(v ?? "").replaceAll('"', '""')}"`;
    const rows = [["학년","반","번호","이름", ...qs.map(q => q.text), "제출시각"]];
    rs.forEach(r => rows.push([r.s_grade, r.s_class, r.s_number, r.s_name, ...qs.map((q, i) => ansText(r.answers[i]?.a)), new Date(r.created_at).toLocaleString("ko-KR")]));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["\uFEFF" + rows.map(r => r.map(cell).join(",")).join("\n")], { type: "text/csv;charset=utf-8" }));
    a.download = `${s.title}_결과.csv`; a.click();
  };
  $("vTbl").onclick = async e => {
    const b = e.target.closest("[data-rdel]"); if (!b) return;
    if (!confirm("이 응답을 삭제할까요?")) return;
    const r = await db.rpc("admin_delete_response", { p_code: teacherCode, p_id: +b.dataset.rdel });
    if (r.error || !r.data) return toast("삭제 실패");
    toast("응답이 삭제되었습니다"); await loadAll(); openResults(s);
  };
}

/* ===== 13. SERVICE WORKER ===== */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(e => console.error("SW 실패:", e));
  });
}
