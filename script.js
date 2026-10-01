/* =====================================================
   SCHOOL SURVEY (Discord style)
===================================================== */

/* ---------- 1. SUPABASE ---------- */
const SUPABASE_URL = "https://yvpjbqsjsszderhhdnwv.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_ivsAYNav68Zpd3e1uYBpLw_OEtIuhkO";
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ---------- 2. STATE ---------- */
let surveys = [];
let counts = {};
let user = null;
let isAdmin = false;
let currentGrade = "all";
let currentSearch = "";
let onlyActive = false;
let currentSurvey = null;
let currentResponses = [];
let resultTab = "summary";
let builderQs = [];

const TYPES = {
    short: "단답형",
    long: "장문형",
    single: "객관식 (하나 선택)",
    multi: "체크박스 (여러 개 선택)",
    scale: "5점 척도"
};
const isChoice = q => q.type === "single" || q.type === "multi";

/* ---------- 3. HELPERS ---------- */
const $ = id => document.getElementById(id);

function esc(v) {
    return String(v ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

let toastTimer;
function showToast(msg) {
    const t = $("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
}

function openModal(id) {
    $(id).classList.remove("hidden");
    document.body.style.overflow = "hidden";
}
function closeModal(id) {
    $(id).classList.add("hidden");
    if (!document.querySelector(".modal:not(.hidden)")) {
        document.body.style.overflow = "";
    }
}
document.addEventListener("click", e => {
    const c = e.target.closest("[data-close]");
    if (c) {
        const m = c.closest(".modal");
        if (m) closeModal(m.id);
    }
});
document.addEventListener("keydown", e => {
    if (e.key === "Escape") {
        const open = [...document.querySelectorAll(".modal:not(.hidden)")].pop();
        if (open) closeModal(open.id);
    }
});

function showErr(id, msg) {
    const el = $(id);
    el.textContent = msg;
    el.classList.remove("hidden");
}
function hideErr(id) { $(id).classList.add("hidden"); }

function todayStr(offsetDays = 0) {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return d.getFullYear() + "-" +
        String(d.getMonth() + 1).padStart(2, "0") + "-" +
        String(d.getDate()).padStart(2, "0");
}
function isClosed(s) {
    if (s.status === "closed") return true;
    return new Date() > new Date(s.deadline + "T23:59:59");
}
function ddayText(deadline) {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    const d = Math.round((new Date(deadline + "T00:00:00") - t) / 86400000);
    if (d < 0) return "";
    if (d === 0) return "오늘 마감";
    return "D-" + d;
}
function formatDateTime(iso) {
    return new Date(iso).toLocaleString("ko-KR", {
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit"
    });
}
function surveyUrl(s) {
    return location.origin + location.pathname + "?s=" + s.id;
}

/* ---------- 4. AUTH (교사) ---------- */
async function refreshAuth() {
    const { data } = await sb.auth.getSession();
    user = data?.session?.user || null;
    isAdmin = false;
    if (user) {
        const { data: ok } = await sb.rpc("is_admin");
        isAdmin = ok === true;
    }
    updateAuthUI();
}

function updateAuthUI() {
    $("authBtn").textContent = user ? "로그아웃" : "교사 로그인";
    $("adminBadge").classList.toggle("hidden", !isAdmin);
    $("openBuilder").classList.toggle("hidden", !isAdmin);
}

$("authBtn").addEventListener("click", async () => {
    if (user) {
        await sb.auth.signOut();
        await refreshAuth();
        await loadSurveys();
        showToast("로그아웃 되었습니다");
    } else {
        hideErr("authError");
        openModal("authModal");
    }
});

$("authForm").addEventListener("submit", async e => {
    e.preventDefault();
    hideErr("authError");
    const btn = $("authSubmit");
    btn.disabled = true;
    btn.textContent = "로그인 중...";

    const { error } = await sb.auth.signInWithPassword({
        email: $("authEmail").value.trim(),
        password: $("authPw").value
    });

    if (error) {
        showErr("authError", "로그인 실패: 이메일 또는 비밀번호를 확인해주세요.");
    } else {
        await refreshAuth();
        if (!isAdmin) {
            await sb.auth.signOut();
            await refreshAuth();
            showErr("authError", "교사 권한이 없는 계정입니다.");
        } else {
            $("authForm").reset();
            closeModal("authModal");
            await loadSurveys();
            showToast("교사 모드로 로그인했습니다");
        }
    }
    btn.disabled = false;
    btn.textContent = "로그인";
});

/* ---------- 5. LOAD ---------- */
async function loadSurveys() {
    $("surveyList").innerHTML =
        `<div class="empty-state"><p>설문을 불러오는 중입니다...</p></div>`;

    const { data, error } = await sb
        .from("school_surveys")
        .select("*")
        .order("created_at", { ascending: false });

    if (error) {
        console.error(error);
        $("surveyList").innerHTML = `
            <div class="empty-state">
                <h3>불러오지 못했습니다</h3>
                <p>${esc(error.message)}</p>
            </div>`;
        return;
    }

    surveys = data || [];
    counts = {};

    if (isAdmin) {
        const { data: c } = await sb.rpc("survey_response_counts");
        (c || []).forEach(r => { counts[r.survey_id] = Number(r.cnt); });
    }
    renderSurveys();
}

/* ---------- 6. RENDER ---------- */
function renderSurveys() {
    const q = currentSearch.toLowerCase().trim();

    const list = surveys
        .filter(s => {
            const gradeOk = currentGrade === "all" ||
                (Array.isArray(s.grades) && s.grades.includes(Number(currentGrade)));
            const searchOk = !q ||
                (s.title || "").toLowerCase().includes(q) ||
                (s.description || "").toLowerCase().includes(q);
            const activeOk = !onlyActive || !isClosed(s);
            return gradeOk && searchOk && activeOk;
        })
        .sort((a, b) => Number(isClosed(a)) - Number(isClosed(b)));

    $("surveyCount").textContent = list.length;
    $("surveyList").innerHTML = "";

    if (list.length === 0) {
        $("emptyState").classList.remove("hidden");
        return;
    }
    $("emptyState").classList.add("hidden");
    list.forEach(s => $("surveyList").appendChild(createCard(s)));
}

function createCard(s) {
    const closed = isClosed(s);
    const grades = (s.grades || []).slice().sort((a, b) => a - b).map(g => g + "학년").join(" · ");
    const dday = closed ? "" : ddayText(s.deadline);
    const qCount = Array.isArray(s.questions) ? s.questions.length : 0;

    const adminBtns = isAdmin ? `
        <button class="btn btn-success btn-sm" data-action="results" data-id="${s.id}">결과 보기</button>
        <button class="btn btn-secondary btn-sm" data-action="duplicate" data-id="${s.id}">복제</button>
        <button class="btn btn-danger btn-sm" data-action="delete" data-id="${s.id}">삭제</button>
    ` : "";

    const el = document.createElement("article");
    el.className = "msg";
    el.innerHTML = `
        <div class="avatar">설</div>
        <div class="msg-body">
            <div class="msg-head">
                <span class="msg-author">설문봇</span>
                <span class="tag-bot">BOT</span>
                <span class="msg-time">${formatDateTime(s.created_at)}</span>
            </div>
            <div class="embed" style="--accent:${closed ? "#f23f42" : "#23a559"}">
                <div class="embed-meta">
                    <span class="chip">${esc(grades)}</span>
                    <span class="${closed ? "st-closed" : "st-active"}">● ${closed ? "마감" : "진행 중"}</span>
                    ${dday ? `<span class="dday">${dday}</span>` : ""}
                </div>
                <h2 class="embed-title">${esc(s.title)}</h2>
                <p class="embed-desc">${esc(s.description)}</p>
                <div class="embed-fields">
                    <div><b>마감일</b>${esc(s.deadline)}</div>
                    <div><b>문항</b>${qCount}개</div>
                    ${isAdmin ? `<div><b>응답</b>${counts[s.id] || 0}명</div>` : ""}
                </div>
                <div class="embed-actions">
                    <button class="btn btn-primary btn-sm" data-action="participate" data-id="${s.id}" ${closed ? "disabled" : ""}>
                        ${closed ? "마감됨" : "참여하기"}
                    </button>
                    <button class="btn btn-secondary btn-sm" data-action="qr" data-id="${s.id}">QR</button>
                    ${adminBtns}
                </div>
            </div>
        </div>
    `;
    return el;
}

$("surveyList").addEventListener("click", e => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const s = surveys.find(x => x.id === btn.dataset.id);
    if (!s) return;
    switch (btn.dataset.action) {
        case "participate": openFill(s); break;
        case "qr": openQr(s); break;
        case "results": openResults(s); break;
        case "duplicate": openBuilder(s); break;
        case "delete": deleteSurvey(s); break;
    }
});

/* ---------- 7. SEARCH / FILTER ---------- */
$("searchInput").addEventListener("input", e => {
    currentSearch = e.target.value;
    renderSurveys();
});

document.querySelectorAll("#gradeFilter .pill[data-grade]").forEach(btn => {
    btn.addEventListener("click", () => {
        document.querySelectorAll("#gradeFilter .pill[data-grade]")
            .forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        currentGrade = btn.dataset.grade;
        renderSurveys();
    });
});

$("activeOnly").addEventListener("click", e => {
    onlyActive = !onlyActive;
    e.currentTarget.classList.toggle("active", onlyActive);
    renderSurveys();
});

/* ---------- 8. 설문 참여 (학생) ---------- */
function loadProfile() {
    try { return JSON.parse(localStorage.getItem("student_profile")) || {}; }
    catch { return {}; }
}

function renderQuestion(q, i) {
    const name = "q_" + q.id;
    let input = "";

    if (q.type === "short") {
        input = `<input class="text-input" type="text" maxlength="200" placeholder="답변 입력">`;
    } else if (q.type === "long") {
        input = `<textarea class="text-input" maxlength="1000" placeholder="답변 입력"></textarea>`;
    } else if (q.type === "single") {
        input = `<div class="choice-list">${q.options.map(o => `
            <label class="choice"><input type="radio" name="${name}" value="${esc(o)}"><span>${esc(o)}</span></label>
        `).join("")}</div>`;
    } else if (q.type === "multi") {
        input = `<div class="choice-list">${q.options.map(o => `
            <label class="choice"><input type="checkbox" name="${name}" value="${esc(o)}"><span>${esc(o)}</span></label>
        `).join("")}</div>`;
    } else if (q.type === "scale") {
        input = `<div class="scale">
            <span class="muted small">매우 아니다</span>
            ${[1, 2, 3, 4, 5].map(n => `
                <label class="scale-item"><input type="radio" name="${name}" value="${n}"><span>${n}</span></label>
            `).join("")}
            <span class="muted small">매우 그렇다</span>
        </div>`;
    }

    return `
        <section class="q-card" data-qid="${esc(q.id)}">
            <h3>${i + 1}. ${esc(q.title)}${q.required ? '<em class="req">*</em>' : ""}</h3>
            ${input}
        </section>`;
}

function openFill(s) {
    if (isClosed(s)) {
        showToast("마감된 설문입니다");
        return;
    }
    currentSurvey = s;
    const p = loadProfile();
    const gradeOpts = (s.grades || []).slice().sort((a, b) => a - b).map(g =>
        `<option value="${g}" ${Number(p.grade) === g ? "selected" : ""}>${g}학년</option>`
    ).join("");

    $("fillTitle").textContent = s.title;
    $("fillBody").innerHTML = `
        <p class="muted" style="margin-bottom:14px;white-space:pre-wrap">${esc(s.description)}</p>
        <form id="fillForm" novalidate>
            <section class="q-card">
                <h3>참여자 정보 <em class="req">*</em></h3>
                <p class="muted small">선생님만 확인할 수 있어요. 정확하게 입력해주세요.</p>
                <div class="id-grid">
                    <div><label for="idGrade">학년</label><select id="idGrade">${gradeOpts}</select></div>
                    <div><label for="idClass">반</label><input id="idClass" type="number" min="1" max="20" inputmode="numeric" value="${esc(p.cls || "")}"></div>
                    <div><label for="idNo">번호</label><input id="idNo" type="number" min="1" max="50" inputmode="numeric" value="${esc(p.no || "")}"></div>
                    <div><label for="idName">이름</label><input id="idName" type="text" maxlength="20" value="${esc(p.name || "")}"></div>
                </div>
            </section>
            ${(s.questions || []).map(renderQuestion).join("")}
            <div id="fillError" class="form-error hidden"></div>
            <button type="submit" id="fillSubmit" class="btn btn-primary btn-block">제출하기</button>
        </form>
    `;
    openModal("fillModal");
}

function collectAnswers(form, s) {
    const answers = {};
    const missing = [];
    s.questions.forEach(q => {
        const sec = form.querySelector(`[data-qid="${q.id}"]`);
        let v;
        if (q.type === "short" || q.type === "long") {
            v = sec.querySelector("input,textarea").value.trim();
        } else if (q.type === "multi") {
            v = [...sec.querySelectorAll("input:checked")].map(i => i.value);
        } else {
            const c = sec.querySelector("input:checked");
            v = c ? c.value : "";
        }
        const empty = Array.isArray(v) ? v.length === 0 : v === "";
        if (q.required && empty) {
            missing.push(q.title);
            sec.classList.add("invalid");
        } else {
            sec.classList.remove("invalid");
        }
        answers[q.id] = v;
    });
    return { answers, missing };
}

$("fillBody").addEventListener("submit", async e => {
    e.preventDefault();
    const s = currentSurvey;
    const form = e.target;
    hideErr("fillError");

    const grade = Number($("idGrade").value);
    const cls = parseInt($("idClass").value, 10);
    const no = parseInt($("idNo").value, 10);
    const name = $("idName").value.trim();

    if (!(cls >= 1 && cls <= 20)) return showErr("fillError", "반을 1~20 사이로 입력해주세요.");
    if (!(no >= 1 && no <= 50)) return showErr("fillError", "번호를 1~50 사이로 입력해주세요.");
    if (!name) return showErr("fillError", "이름을 입력해주세요.");

    const { answers, missing } = collectAnswers(form, s);
    if (missing.length) {
        return showErr("fillError", `필수 질문에 답해주세요 (${missing.length}개 남음)`);
    }

    const btn = $("fillSubmit");
    btn.disabled = true;
    btn.textContent = "제출하는 중...";

    const { error } = await sb.from("survey_responses").insert({
        survey_id: s.id,
        grade: grade,
        class_no: cls,
        student_no: no,
        name: name,
        answers: answers
    });

    if (error) {
        console.error(error);
        let msg = "제출 실패: " + error.message;
        if (error.code === "23505") {
            msg = `${grade}학년 ${cls}반 ${no}번은 이미 제출했어요. 수정이 필요하면 선생님께 말씀드리세요.`;
        } else if (error.code === "42501") {
            msg = "마감되었거나 참여할 수 없는 설문입니다.";
        }
        showErr("fillError", msg);
        btn.disabled = false;
        btn.textContent = "제출하기";
        return;
    }

    localStorage.setItem("student_profile", JSON.stringify({ grade, cls, no, name }));

    $("fillBody").innerHTML = `
        <div class="success-box">
            <div class="success-icon">✓</div>
            <h3>제출 완료!</h3>
            <p class="muted">${grade}학년 ${cls}반 ${no}번 ${esc(name)} 님, 참여해주셔서 감사합니다.</p>
            <button class="btn btn-primary btn-block" data-close>닫기</button>
        </div>`;
});

/* ---------- 9. 설문 만들기 (교사) ---------- */
function newQ(type = "short") {
    return {
        id: "q" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
        type,
        title: "",
        required: true,
        options: (type === "single" || type === "multi") ? ["옵션 1", "옵션 2"] : []
    };
}

function renderBuilderQs() {
    $("qList").innerHTML = builderQs.map((q, i) => {
        const typeOpts = Object.entries(TYPES).map(([k, v]) =>
            `<option value="${k}" ${q.type === k ? "selected" : ""}>${v}</option>`).join("");

        let extra = "";
        if (isChoice(q)) {
            extra = `<div class="opt-list">
                ${q.options.map((o, oi) => `
                    <div class="opt-row">
                        <span class="opt-mark">${q.type === "single" ? "○" : "☐"}</span>
                        <input type="text" class="q-opt" data-oi="${oi}" value="${esc(o)}" maxlength="100">
                        <button type="button" class="icon-btn" data-act="rmopt" data-oi="${oi}" aria-label="옵션 삭제">×</button>
                    </div>`).join("")}
                <button type="button" class="link-btn" data-act="addopt">+ 옵션 추가</button>
            </div>`;
        } else if (q.type === "scale") {
            extra = `<p class="muted small" style="margin-bottom:8px">1점(매우 아니다) ~ 5점(매우 그렇다)</p>`;
        }

        return `
            <div class="q-edit" data-i="${i}">
                <div class="q-edit-top">
                    <input type="text" class="q-title" placeholder="질문 ${i + 1}" value="${esc(q.title)}" maxlength="200">
                    <select class="q-type">${typeOpts}</select>
                </div>
                ${extra}
                <div class="q-edit-foot">
                    <label class="switch-label"><input type="checkbox" class="q-req" ${q.required ? "checked" : ""}> 필수</label>
                    <span class="spacer"></span>
                    <button type="button" class="icon-btn" data-act="up" aria-label="위로">↑</button>
                    <button type="button" class="icon-btn" data-act="down" aria-label="아래로">↓</button>
                    <button type="button" class="icon-btn" data-act="remove" aria-label="질문 삭제">🗑</button>
                </div>
            </div>`;
    }).join("");
}

function openBuilder(template = null) {
    $("builderForm").reset();
    hideErr("builderError");

    if (template) {
        $("bTitle").value = template.title + " (복사)";
        $("bDesc").value = template.description || "";
        document.querySelectorAll('input[name="bgrade"]').forEach(c => {
            c.checked = (template.grades || []).includes(Number(c.value));
        });
        builderQs = (template.questions || []).map(q => ({
            ...q,
            id: newQ().id + Math.random().toString(36).slice(2, 4),
            options: [...(q.options || [])]
        }));
    } else {
        builderQs = [newQ("single")];
    }
    if (builderQs.length === 0) builderQs = [newQ("short")];

    $("bDeadline").value = todayStr(7);
    renderBuilderQs();
    openModal("builderModal");
}

$("openBuilder").addEventListener("click", () => openBuilder());

$("builderForm").addEventListener("click", e => {
    const add = e.target.closest("[data-addtype]");
    if (add) {
        if (builderQs.length >= 30) return showToast("질문은 최대 30개까지 가능합니다");
        builderQs.push(newQ(add.dataset.addtype));
        renderBuilderQs();
        const items = $("qList").querySelectorAll(".q-edit");
        items[items.length - 1]?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
});

$("qList").addEventListener("input", e => {
    const box = e.target.closest(".q-edit");
    if (!box) return;
    const q = builderQs[Number(box.dataset.i)];
    if (e.target.classList.contains("q-title")) q.title = e.target.value;
    else if (e.target.classList.contains("q-opt")) q.options[Number(e.target.dataset.oi)] = e.target.value;
});

$("qList").addEventListener("change", e => {
    const box = e.target.closest(".q-edit");
    if (!box) return;
    const q = builderQs[Number(box.dataset.i)];
    if (e.target.classList.contains("q-type")) {
        q.type = e.target.value;
        if (isChoice(q) && q.options.length < 2) q.options = ["옵션 1", "옵션 2"];
        renderBuilderQs();
    } else if (e.target.classList.contains("q-req")) {
        q.required = e.target.checked;
    }
});

$("qList").addEventListener("click", e => {
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    const box = btn.closest(".q-edit");
    const i = Number(box.dataset.i);
    const q = builderQs[i];

    switch (btn.dataset.act) {
        case "up":
            if (i > 0) [builderQs[i - 1], builderQs[i]] = [builderQs[i], builderQs[i - 1]];
            break;
        case "down":
            if (i < builderQs.length - 1) [builderQs[i + 1], builderQs[i]] = [builderQs[i], builderQs[i + 1]];
            break;
        case "remove":
            if (builderQs.length > 1) builderQs.splice(i, 1);
            else showToast("질문은 최소 1개 필요합니다");
            break;
        case "addopt":
            if (q.options.length < 20) q.options.push("옵션 " + (q.options.length + 1));
            break;
        case "rmopt":
            if (q.options.length > 2) q.options.splice(Number(btn.dataset.oi), 1);
            else showToast("옵션은 최소 2개 필요합니다");
            break;
    }
    renderBuilderQs();
});

$("builderForm").addEventListener("submit", async e => {
    e.preventDefault();
    hideErr("builderError");

    const title = $("bTitle").value.trim();
    const description = $("bDesc").value.trim();
    const grades = [...document.querySelectorAll('input[name="bgrade"]:checked')].map(c => Number(c.value));
    const deadline = $("bDeadline").value;

    if (!title) return showErr("builderError", "설문 제목을 입력해주세요.");
    if (grades.length === 0) return showErr("builderError", "대상 학년을 선택해주세요.");
    if (!deadline) return showErr("builderError", "마감일을 선택해주세요.");
    if (deadline < todayStr()) return showErr("builderError", "마감일은 오늘 이후여야 합니다.");
    if (builderQs.length === 0) return showErr("builderError", "질문을 1개 이상 추가해주세요.");

    const questions = [];
    for (let i = 0; i < builderQs.length; i++) {
        const q = builderQs[i];
        const t = q.title.trim();
        if (!t) return showErr("builderError", `${i + 1}번 질문의 제목을 입력해주세요.`);
        const item = { id: q.id, type: q.type, title: t, required: !!q.required, options: [] };
        if (isChoice(q)) {
            const opts = [...new Set(q.options.map(o => o.trim()).filter(Boolean))];
            if (opts.length < 2) return showErr("builderError", `${i + 1}번 질문은 서로 다른 옵션이 2개 이상 필요합니다.`);
            item.options = opts;
        }
        questions.push(item);
    }

    const btn = $("builderSubmit");
    btn.disabled = true;
    btn.textContent = "등록하는 중...";

    const { error } = await sb.from("school_surveys").insert({
        title, description, grades, deadline, questions, status: "active"
    });

    btn.disabled = false;
    btn.textContent = "설문 등록하기";

    if (error) {
        console.error(error);
        return showErr("builderError", "등록 실패: " + error.message);
    }
    closeModal("builderModal");
    await loadSurveys();
    showToast("설문이 등록되었습니다");
});

/* ---------- 10. 삭제 (교사) ---------- */
async function deleteSurvey(s) {
    if (!isAdmin) return;
    if (!confirm(`"${s.title}"\n\n설문과 모든 응답이 삭제됩니다.\n정말 삭제하시겠습니까? (복구 불가)`)) return;

    const { data, error } = await sb.from("school_surveys").delete().eq("id", s.id).select();
    if (error || !data || data.length === 0) {
        console.error(error);
        return showToast("삭제 실패: 권한을 확인해주세요");
    }
    surveys = surveys.filter(x => x.id !== s.id);
    renderSurveys();
    showToast("설문이 삭제되었습니다");
}

/* ---------- 11. 결과 (교사) ---------- */
function sortedResponses() {
    return currentResponses.slice().sort((a, b) =>
        a.grade - b.grade || a.class_no - b.class_no || a.student_no - b.student_no);
}

async function openResults(s) {
    if (!isAdmin) return;
    currentSurvey = s;
    resultTab = "summary";
    $("resultTitle").textContent = s.title;
    $("resultBody").innerHTML = `<p class="muted">불러오는 중...</p>`;
    openModal("resultModal");
    await fetchResponses();
    renderResults();
}

async function fetchResponses() {
    const { data, error } = await sb
        .from("survey_responses")
        .select("*")
        .eq("survey_id", currentSurvey.id)
        .order("created_at", { ascending: true })
        .limit(5000);
    if (error) {
        console.error(error);
        showToast("응답을 불러오지 못했습니다");
        currentResponses = [];
    } else {
        currentResponses = data || [];
    }
}

function renderResults() {
    const s = currentSurvey;
    const closed = isClosed(s);
    const tabs = [["summary", "요약"], ["list", "응답자"], ["tools", "미제출 확인"]];

    let content = "";
    if (resultTab === "summary") content = summaryHTML();
    else if (resultTab === "list") content = listHTML();
    else content = toolsHTML();

    $("resultBody").innerHTML = `
        <div class="result-top">
            <span class="total">총 ${currentResponses.length}명 응답</span>
            <button class="btn btn-secondary btn-sm" data-act="refresh">새로고침</button>
            <button class="btn btn-secondary btn-sm" data-act="csv">CSV 저장</button>
            <button class="btn ${s.status === "closed" ? "btn-success" : "btn-danger"} btn-sm" data-act="toggle">
                ${s.status === "closed" ? "다시 열기" : "지금 마감"}
            </button>
        </div>
        ${closed && s.status !== "closed" ? `<p class="muted small" style="margin-bottom:10px">마감일이 지나 자동으로 마감된 설문입니다.</p>` : ""}
        <div class="tabs">
            ${tabs.map(([k, v]) => `<button class="tab ${resultTab === k ? "active" : ""}" data-tab="${k}">${v}</button>`).join("")}
        </div>
        ${content}
    `;
}

function summaryHTML() {
    const s = currentSurvey;
    const rs = currentResponses;
    if (!rs.length) return `<div class="empty-state small"><p>아직 응답이 없습니다</p></div>`;

    const byClass = {};
    rs.forEach(r => {
        const k = r.grade + "-" + r.class_no;
        byClass[k] = (byClass[k] || 0) + 1;
    });
    const chips = Object.keys(byClass)
        .sort((a, b) => {
            const [ag, ac] = a.split("-").map(Number);
            const [bg, bc] = b.split("-").map(Number);
            return ag - bg || ac - bc;
        })
        .map(k => {
            const [g, c] = k.split("-");
            return `<span class="chip">${g}학년 ${c}반 · ${byClass[k]}명</span>`;
        }).join("");

    const qs = (s.questions || []).map((q, i) => `
        <section class="q-card">
            <h3>${i + 1}. ${esc(q.title)}</h3>
            ${questionSummary(q)}
        </section>`).join("");

    return `<div class="chips">${chips}</div>${qs}`;
}

function barRow(label, n, total) {
    const p = total ? Math.round(n / total * 100) : 0;
    return `
        <div class="bar-row">
            <div class="bar-label"><span>${esc(label)}</span><span>${n}명 · ${p}%</span></div>
            <div class="bar"><i style="width:${p}%"></i></div>
        </div>`;
}

function questionSummary(q) {
    const rs = currentResponses;
    const total = rs.length;

    if (isChoice(q)) {
        const cnt = {};
        q.options.forEach(o => { cnt[o] = 0; });
        rs.forEach(r => {
            const v = r.answers?.[q.id];
            (Array.isArray(v) ? v : [v]).forEach(x => {
                if (x !== "" && x != null) cnt[x] = (cnt[x] || 0) + 1;
            });
        });
        return Object.entries(cnt).map(([o, n]) => barRow(o, n, total)).join("");
    }

    if (q.type === "scale") {
        const nums = rs.map(r => Number(r.answers?.[q.id])).filter(n => n >= 1 && n <= 5);
        const avg = nums.length ? (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2) : "-";
        const dist = [1, 2, 3, 4, 5].map(n => barRow(n + "점", nums.filter(x => x === n).length, nums.length)).join("");
        return `<div class="avg">${avg} <small>/ 5점 (${nums.length}명 응답)</small></div>${dist}`;
    }

    const items = rs
        .filter(r => (r.answers?.[q.id] || "") !== "")
        .map(r => `<li><b>${esc(r.name)}</b>${esc(r.answers[q.id])}</li>`).join("");
    return items ? `<ul class="text-answers">${items}</ul>` : `<p class="muted small">응답 없음</p>`;
}

function listHTML() {
    const s = currentSurvey;
    const rs = sortedResponses();
    if (!rs.length) return `<div class="empty-state small"><p>아직 응답이 없습니다</p></div>`;

    return rs.map(r => {
        const body = (s.questions || []).map((q, i) => {
            const v = r.answers?.[q.id];
            const text = Array.isArray(v) ? v.join(", ") : (v ?? "");
            return `<div class="resp-q"><b>${i + 1}. ${esc(q.title)}</b>${text === "" ? '<span class="muted">(응답 없음)</span>' : esc(text)}</div>`;
        }).join("");
        return `
            <details class="resp">
                <summary>${r.grade}학년 ${r.class_no}반 ${r.student_no}번 ${esc(r.name)}<span>${formatDateTime(r.created_at)}</span></summary>
                <div class="resp-body">
                    ${body}
                    <button class="btn btn-danger btn-sm" data-act="delresp" data-id="${r.id}">이 응답 삭제</button>
                </div>
            </details>`;
    }).join("");
}

function toolsHTML() {
    const gradeOpts = (currentSurvey.grades || []).slice().sort((a, b) => a - b)
        .map(g => `<option value="${g}">${g}학년</option>`).join("");
    return `
        <div class="q-card">
            <h3>반별 미제출 번호 확인</h3>
            <p class="muted small" style="margin-bottom:10px">학년/반/전체 인원을 입력하면 아직 제출하지 않은 번호를 알려줘요.</p>
            <div class="tool-row">
                <div><label>학년</label><select id="mGrade">${gradeOpts}</select></div>
                <div><label>반</label><input id="mClass" type="number" min="1" max="20" inputmode="numeric"></div>
                <div><label>전체 인원</label><input id="mTotal" type="number" min="1" max="50" inputmode="numeric"></div>
                <button class="btn btn-primary btn-sm" data-act="missing">확인</button>
            </div>
            <div id="missingOut"></div>
        </div>`;
}

function checkMissing() {
    const g = Number($("mGrade").value);
    const c = parseInt($("mClass").value, 10);
    const t = parseInt($("mTotal").value, 10);
    const out = $("missingOut");
    if (!(c >= 1) || !(t >= 1)) {
        out.innerHTML = `<p class="muted small">반과 전체 인원을 입력해주세요.</p>`;
        return;
    }
    const done = new Set(currentResponses.filter(r => r.grade === g && r.class_no === c).map(r => r.student_no));
    const miss = [];
    for (let n = 1; n <= t; n++) if (!done.has(n)) miss.push(n);
    out.innerHTML = miss.length
        ? `<p class="small">${g}학년 ${c}반 · 제출 ${done.size}명 / 미제출 <b>${miss.length}명</b></p>
           <div class="missing-nums">${miss.map(n => `<span>${n}번</span>`).join("")}</div>`
        : `<p class="small" style="color:#3ba55d">🎉 ${g}학년 ${c}반 전원 제출 완료!</p>`;
}

function downloadCsv() {
    const s = currentSurvey;
    const safe = v => {
        let t = String(v ?? "");
        if (/^[=+\-@]/.test(t)) t = "'" + t;   // 엑셀 수식 주입 방지
        return '"' + t.replace(/"/g, '""') + '"';
    };
    const head = ["학년", "반", "번호", "이름", "제출시각", ...(s.questions || []).map(q => q.title)];
    const rows = sortedResponses().map(r => [
        r.grade, r.class_no, r.student_no, r.name, formatDateTime(r.created_at),
        ...(s.questions || []).map(q => {
            const v = r.answers?.[q.id];
            return Array.isArray(v) ? v.join(", ") : (v ?? "");
        })
    ]);
    const csv = [head, ...rows].map(row => row.map(safe).join(",")).join("\r\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${s.title}_결과.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

$("resultBody").addEventListener("click", async e => {
    const tab = e.target.closest("[data-tab]");
    if (tab) {
        resultTab = tab.dataset.tab;
        renderResults();
        return;
    }
    const btn = e.target.closest("[data-act]");
    if (!btn) return;

    switch (btn.dataset.act) {
        case "refresh":
            await fetchResponses();
            renderResults();
            showToast("새로고침 완료");
            break;

        case "csv":
            if (!currentResponses.length) return showToast("저장할 응답이 없습니다");
            downloadCsv();
            break;

        case "toggle": {
            const next = currentSurvey.status === "closed" ? "active" : "closed";
            const { data, error } = await sb.from("school_surveys")
                .update({ status: next }).eq("id", currentSurvey.id).select();
            if (error || !data || !data.length) return showToast("변경 실패: 권한을 확인해주세요");
            currentSurvey.status = next;
            renderResults();
            renderSurveys();
            showToast(next === "closed" ? "설문을 마감했습니다" : "설문을 다시 열었습니다");
            break;
        }

        case "delresp": {
            if (!confirm("이 응답을 삭제할까요?")) return;
            const { data, error } = await sb.from("survey_responses")
                .delete().eq("id", btn.dataset.id).select();
            if (error || !data || !data.length) return showToast("삭제 실패");
            currentResponses = currentResponses.filter(r => r.id !== btn.dataset.id);
            counts[currentSurvey.id] = currentResponses.length;
            renderResults();
            renderSurveys();
            showToast("응답을 삭제했습니다");
            break;
        }

        case "missing":
            checkMissing();
            break;
    }
});

/* ---------- 12. QR ---------- */
function openQr(s) {
    const url = surveyUrl(s);
    $("qrTitle").textContent = s.title;
    $("qrLink").value = url;
    $("qrcode").innerHTML = "";
    new QRCode($("qrcode"), {
        text: url,
        width: 204,
        height: 204,
        correctLevel: QRCode.CorrectLevel.M
    });
    openModal("qrModal");
}

$("copyLink").addEventListener("click", async () => {
    const input = $("qrLink");
    try {
        await navigator.clipboard.writeText(input.value);
    } catch {
        input.select();
        document.execCommand("copy");
    }
    showToast("링크를 복사했습니다");
});

$("downloadQr").addEventListener("click", () => {
    const canvas = $("qrcode").querySelector("canvas");
    if (!canvas) return showToast("QR 코드를 준비하는 중입니다");
    const a = document.createElement("a");
    a.download = "school-survey-qr.png";
    a.href = canvas.toDataURL("image/png");
    a.click();
});

/* ---------- 13. START ---------- */
document.addEventListener("DOMContentLoaded", async () => {
    await refreshAuth();
    await loadSurveys();

    // ?s=설문ID 로 들어오면 바로 설문 열기 (QR / 공유 링크)
    const sid = new URLSearchParams(location.search).get("s");
    if (sid) {
        const s = surveys.find(x => x.id === sid);
        if (!s) showToast("설문을 찾을 수 없습니다");
        else if (isClosed(s)) showToast("마감된 설문입니다");
        else openFill(s);
    }
});

/* ---------- 14. PWA ---------- */
if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("./sw.js")
            .then(() => console.log("Service Worker 등록 완료"))
            .catch(err => console.error("Service Worker 등록 실패:", err));
    });
}
