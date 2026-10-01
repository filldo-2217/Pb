"use strict";

/* =====================================================
   1. SUPABASE
===================================================== */
const SUPABASE_URL = "https://yvpjbqsjsszderhhdnwv.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_ivsAYNav68Zpd3e1uYBpLw_OEtIuhkO";

const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* =====================================================
   2. 유틸
===================================================== */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const esc = v => String(v ?? "").replace(/[&<>"']/g, c => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
));

const pad = n => String(n).padStart(2, "0");

function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
const isClosed = deadline => !!deadline && deadline < todayStr();

function fmtTime(iso) {
    return new Date(iso).toLocaleString("ko-KR", {
        month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit"
    });
}

function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, c =>
        (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16));
}

let toastTimer;
function showToast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
}

function showErr(id, msg) {
    const el = $(id);
    el.textContent = msg;
    el.classList.remove("hidden");
}
const hideErr = id => $(id).classList.add("hidden");

const openModal = id => $(id).classList.remove("hidden");
const closeModal = id => $(id).classList.add("hidden");

document.addEventListener("click", e => {
    const c = e.target.closest("[data-close]");
    if (c) c.closest(".modal").classList.add("hidden");
});
document.addEventListener("keydown", e => {
    if (e.key === "Escape") $$(".modal").forEach(m => m.classList.add("hidden"));
});

/* =====================================================
   3. 상태
===================================================== */
const TYPES = {
    short: "단답형",
    long: "장문형",
    single: "객관식 (하나 선택)",
    multi: "체크박스 (여러 개)",
    scale: "5점 척도"
};
const isChoice = t => t === "single" || t === "multi";

const VIEWS = {
    all:   { title: "전체-설문", topic: "현재 올라온 모든 설문" },
    "1":   { title: "1학년", topic: "1학년 대상 설문" },
    "2":   { title: "2학년", topic: "2학년 대상 설문" },
    "3":   { title: "3학년", topic: "3학년 대상 설문" },
    mine:  { title: "내가-만든-설문", topic: "이 기기에서 등록한 설문 · 결과도 여기서 확인해요" },
    guide: { title: "이용-안내", topic: "처음이라면 읽어보세요" }
};

const state = {
    forms: [],
    counts: {},
    view: "all",
    search: "",
    profile: loadProfile()
};

const ownerKey = id => `form_owner_${id}`;
const answeredKey = id => `form_answered_${id}`;
const getToken = id => localStorage.getItem(ownerKey(id));

function loadProfile() {
    try { return JSON.parse(localStorage.getItem("gh_profile")); }
    catch { return null; }
}

/* =====================================================
   4. 시작
===================================================== */
document.addEventListener("DOMContentLoaded", async () => {
    renderUserPanel();
    $("#cDeadline").min = todayStr();
    resetBuilder();
    await loadForms();
    if (!state.profile) openProfile();
});

/* =====================================================
   5. 데이터 불러오기
===================================================== */
async function loadForms() {
    $("#feed").innerHTML = `<div class="empty"><p>설문을 불러오는 중입니다...</p></div>`;

    const [formsRes, countRes] = await Promise.all([
        db.from("forms")
            .select("id,title,description,grades,deadline,questions,created_at")
            .order("created_at", { ascending: false }),
        db.rpc("form_counts")
    ]);

    if (formsRes.error) {
        console.error(formsRes.error);
        $("#feed").innerHTML = `
            <div class="empty">
                <h3>불러오지 못했습니다</h3>
                <p>${esc(formsRes.error.message)}<br>Supabase에서 supabase.sql을 실행했는지 확인해주세요.</p>
            </div>`;
        return;
    }

    state.forms = formsRes.data || [];
    state.counts = {};
    (countRes.data || []).forEach(r => { state.counts[r.fid] = Number(r.cnt); });

    renderFeed();
    renderBadges();
}

/* =====================================================
   6. 사이드바 / 채널
===================================================== */
$$(".channel").forEach(btn =>
    btn.addEventListener("click", () => setView(btn.dataset.view))
);

function setView(view) {
    state.view = view;
    $$(".channel").forEach(b => b.classList.toggle("active", b.dataset.view === view));
    $("#channelTitle").textContent = VIEWS[view].title;
    $("#channelTopic").textContent = VIEWS[view].topic;
    closeNav();
    renderFeed();
    $("#feed").scrollTop = 0;
}

function renderBadges() {
    const open = state.forms.filter(f => !isClosed(f.deadline));
    const set = (k, n) => { const el = $(`[data-badge="${k}"]`); if (el) el.textContent = n > 0 ? n : ""; };
    set("all", open.length);
    [1, 2, 3].forEach(g => set(String(g), open.filter(f => f.grades.includes(g)).length));
    set("mine", state.forms.filter(f => getToken(f.id)).length);
}

function openNav() { $("#navWrap").classList.add("open"); $("#navOverlay").classList.add("show"); }
function closeNav() { $("#navWrap").classList.remove("open"); $("#navOverlay").classList.remove("show"); }
$("#menuBtn").addEventListener("click", openNav);
$("#navOverlay").addEventListener("click", closeNav);

$("#searchInput").addEventListener("input", e => {
    state.search = e.target.value;
    renderFeed();
});

/* =====================================================
   7. 피드 렌더링
===================================================== */
function renderFeed() {
    const feed = $("#feed");

    if (state.view === "guide") {
        feed.innerHTML = guideHTML();
        return;
    }

    const q = state.search.trim().toLowerCase();

    const list = state.forms.filter(f => {
        if (state.view === "mine" && !getToken(f.id)) return false;
        if (["1", "2", "3"].includes(state.view) && !f.grades.includes(Number(state.view))) return false;
        if (q && !(`${f.title} ${f.description}`).toLowerCase().includes(q)) return false;
        return true;
    });

    if (!list.length) {
        feed.innerHTML = `
            <div class="empty">
                <h3>설문이 없습니다</h3>
                <p>다른 채널을 선택하거나 직접 설문을 만들어보세요.</p>
            </div>`;
        return;
    }

    feed.innerHTML = list.map(cardHTML).join("");
}

function cardHTML(f) {
    const closed = isClosed(f.deadline);
    const mine = !!getToken(f.id);
    const done = !!localStorage.getItem(answeredKey(f.id));
    const grades = [...f.grades].sort((a, b) => a - b).map(g => `${g}학년`).join(" · ");
    const n = state.counts[f.id] || 0;

    const btnText = done ? "참여 완료" : closed ? "마감됨" : "참여하기";

    return `
    <article class="msg">
        <div class="avatar">설</div>
        <div class="msg-body">
            <div class="msg-head">
                <span class="author">설문봇</span>
                <span class="tag">BOT</span>
                <time>${esc(fmtTime(f.created_at))}</time>
                ${mine ? `<span class="mine-tag">내가 등록함</span>` : ""}
            </div>

            <div class="embed ${closed ? "closed" : ""}">
                <div class="embed-status">${closed ? "● 마감됨" : "● 진행 중"}</div>
                <h3 class="embed-title">${esc(f.title)}</h3>
                <p class="embed-desc">${esc(f.description)}</p>

                <div class="embed-fields">
                    <div><b>대상</b><span>${esc(grades)}</span></div>
                    <div><b>마감일</b><span>${esc(f.deadline)}</span></div>
                    <div><b>질문</b><span>${f.questions.length}개</span></div>
                    <div><b>참여</b><span>${n}명</span></div>
                </div>

                <div class="embed-actions">
                    <button class="btn btn-primary" data-action="answer" data-id="${f.id}"
                        ${closed || done ? "disabled" : ""}>${btnText}</button>
                    ${mine ? `
                        <button class="btn btn-secondary" data-action="results" data-id="${f.id}">결과 보기</button>
                        <button class="btn btn-danger" data-action="delete" data-id="${f.id}">삭제</button>
                    ` : ""}
                </div>
            </div>
        </div>
    </article>`;
}

function guideHTML() {
    const steps = [
        ["내 정보 입력", "처음 접속하면 학년·반·번호를 입력해요. 왼쪽 아래 내 이름을 눌러 언제든 고칠 수 있어요."],
        ["설문 참여", "채널에서 설문을 고르고 '참여하기'를 눌러 사이트 안에서 바로 답변해요. 한 설문에 같은 번호로는 한 번만 참여할 수 있어요."],
        ["설문 만들기", "'+ 설문 만들기'로 누구나 설문을 올릴 수 있어요. 장난이 아닌 진짜로 사용할 설문만 올려주세요."],
        ["결과 확인", "내가 만든 설문은 '결과 보기'에서 통계와 학년·반·번호별 응답을 보고 CSV로 저장할 수 있어요."]
    ];
    return `
    <article class="msg">
        <div class="avatar green">안</div>
        <div class="msg-body">
            <div class="msg-head"><span class="author">안내봇</span><span class="tag">BOT</span></div>
            <div class="embed">
                <h3 class="embed-title" style="color:var(--text-strong)">학교 설문조사 이용 안내</h3>
                ${steps.map((s, i) => `
                    <p class="embed-desc"><b style="color:var(--text-strong)">${i + 1}. ${esc(s[0])}</b><br>${esc(s[1])}</p>
                `).join("")}
            </div>
        </div>
    </article>`;
}

/* 카드 버튼 (이벤트 위임) */
$("#feed").addEventListener("click", e => {
    const btn = e.target.closest("[data-action]");
    if (!btn || btn.disabled) return;
    const id = btn.dataset.id;
    if (btn.dataset.action === "answer") openAnswer(id);
    if (btn.dataset.action === "results") openResults(id);
    if (btn.dataset.action === "delete") deleteForm(id);
});

/* =====================================================
   8. 내 정보 (학년 / 반 / 번호)
===================================================== */
function identityFields(prefix, prof) {
    const g = prof?.grade ?? "", c = prof?.classNo ?? "", n = prof?.studentNo ?? "";
    return `
    <div class="identity">
        <label class="field"><span>학년</span>
            <select id="${prefix}Grade">
                <option value="">선택</option>
                ${[1, 2, 3].map(x => `<option value="${x}" ${x == g ? "selected" : ""}>${x}학년</option>`).join("")}
            </select>
        </label>
        <label class="field"><span>반</span>
            <input id="${prefix}Class" type="number" min="1" max="30" inputmode="numeric" placeholder="예: 3" value="${esc(c)}">
        </label>
        <label class="field"><span>번호</span>
            <input id="${prefix}No" type="number" min="1" max="50" inputmode="numeric" placeholder="예: 12" value="${esc(n)}">
        </label>
    </div>`;
}

function readIdentity(prefix) {
    const grade = Number($(`#${prefix}Grade`).value);
    const classNo = Number($(`#${prefix}Class`).value);
    const studentNo = Number($(`#${prefix}No`).value);

    const ok = [1, 2, 3].includes(grade)
        && Number.isInteger(classNo) && classNo >= 1 && classNo <= 30
        && Number.isInteger(studentNo) && studentNo >= 1 && studentNo <= 50;

    return ok ? { grade, classNo, studentNo } : null;
}

function saveProfile(p) {
    state.profile = p;
    localStorage.setItem("gh_profile", JSON.stringify(p));
    renderUserPanel();
}

function renderUserPanel() {
    const p = state.profile;
    if (p) {
        $("#userAvatar").textContent = p.classNo;
        $("#userName").textContent = `${p.grade}학년 ${p.classNo}반 ${p.studentNo}번`;
        $("#userSub").textContent = "클릭해서 수정";
    } else {
        $("#userAvatar").textContent = "?";
        $("#userName").textContent = "신원 미설정";
        $("#userSub").textContent = "클릭해서 입력하기";
    }
}

function openProfile() {
    $("#profileFields").innerHTML = identityFields("pf", state.profile);
    hideErr("#profileError");
    openModal("#profileModal");
}

$("#userPanel").addEventListener("click", openProfile);

$("#profileForm").addEventListener("submit", e => {
    e.preventDefault();
    const id = readIdentity("pf");
    if (!id) {
        showErr("#profileError", "학년(1~3), 반(1~30), 번호(1~50)를 정확히 입력해주세요.");
        return;
    }
    saveProfile(id);
    closeModal("#profileModal");
    showToast("내 정보가 저장되었습니다.");
});

/* =====================================================
   9. 설문 만들기
===================================================== */
let builder = [];

const defaultQuestion = () => ({ type: "short", title: "", required: true, options: "" });

function resetBuilder() {
    builder = [defaultQuestion()];
    renderBuilder();
}

function renderBuilder() {
    $("#qList").innerHTML = builder.map((q, i) => `
        <div class="q-block" data-i="${i}">
            <div class="q-top">
                <span class="q-num">${i + 1}</span>
                <input class="q-title" type="text" maxlength="200" placeholder="질문을 입력하세요" value="${esc(q.title)}">
                <select class="q-type">
                    ${Object.entries(TYPES).map(([k, v]) =>
                        `<option value="${k}" ${k === q.type ? "selected" : ""}>${v}</option>`).join("")}
                </select>
            </div>
            <textarea class="q-options ${isChoice(q.type) ? "" : "hidden"}" rows="3"
                placeholder="선택지를 한 줄에 하나씩 입력하세요">${esc(q.options)}</textarea>
            <div class="q-bottom">
                <label class="check"><input type="checkbox" class="q-req" ${q.required ? "checked" : ""}> 필수 응답</label>
                <button type="button" class="link-danger q-del" ${builder.length <= 1 ? "disabled" : ""}>삭제</button>
            </div>
        </div>
    `).join("");
}

function syncBuilder() {
    builder = $$("#qList .q-block").map(el => ({
        type: $(".q-type", el).value,
        title: $(".q-title", el).value,
        required: $(".q-req", el).checked,
        options: $(".q-options", el).value
    }));
}

$("#qList").addEventListener("change", e => {
    if (e.target.classList.contains("q-type")) {
        syncBuilder();
        renderBuilder();
    }
});

$("#qList").addEventListener("click", e => {
    const del = e.target.closest(".q-del");
    if (!del) return;
    syncBuilder();
    const i = Number(del.closest(".q-block").dataset.i);
    builder.splice(i, 1);
    renderBuilder();
});

$("#addQ").addEventListener("click", () => {
    syncBuilder();
    if (builder.length >= 30) { showToast("질문은 최대 30개까지 추가할 수 있어요."); return; }
    builder.push(defaultQuestion());
    renderBuilder();
    const blocks = $$("#qList .q-block");
    blocks[blocks.length - 1].scrollIntoView({ behavior: "smooth", block: "center" });
});

function openCreate() {
    hideErr("#createError");
    openModal("#createModal");
}
$("#openCreate").addEventListener("click", openCreate);
$("#railAdd").addEventListener("click", () => { closeNav(); openCreate(); });

$("#createForm").addEventListener("submit", async e => {
    e.preventDefault();
    hideErr("#createError");
    syncBuilder();

    const title = $("#cTitle").value.trim();
    const description = $("#cDesc").value.trim();
    const grades = $$('input[name="cGrade"]:checked').map(i => Number(i.value));
    const deadline = $("#cDeadline").value;

    if (!title) return showErr("#createError", "설문 제목을 입력해주세요.");
    if (!description) return showErr("#createError", "설명을 입력해주세요.");
    if (!grades.length) return showErr("#createError", "대상 학년을 선택해주세요.");
    if (!deadline) return showErr("#createError", "마감일을 선택해주세요.");
    if (deadline < todayStr()) return showErr("#createError", "마감일은 오늘 이후여야 해요.");

    const questions = [];
    for (let i = 0; i < builder.length; i++) {
        const q = builder[i];
        const qt = q.title.trim();
        if (!qt) return showErr("#createError", `${i + 1}번 질문을 입력해주세요.`);

        const item = { id: `q${i + 1}`, type: q.type, title: qt, required: q.required };

        if (isChoice(q.type)) {
            const opts = [...new Set(q.options.split("\n").map(s => s.trim()).filter(Boolean))];
            if (opts.length < 2) return showErr("#createError", `${i + 1}번 질문의 선택지를 2개 이상 입력해주세요.`);
            if (opts.length > 20) return showErr("#createError", `${i + 1}번 질문의 선택지는 최대 20개예요.`);
            item.options = opts;
        }
        questions.push(item);
    }

    const token = uuid();
    const btn = $("#createSubmit");
    btn.disabled = true;
    btn.textContent = "등록하는 중...";

    const { data, error } = await db.from("forms")
        .insert({ title, description, grades, deadline, questions, creator_token: token })
        .select("id")
        .single();

    btn.disabled = false;
    btn.textContent = "설문 등록하기";

    if (error) {
        console.error(error);
        return showErr("#createError", "등록 실패: " + error.message);
    }

    localStorage.setItem(ownerKey(data.id), token);

    $("#createForm").reset();
    resetBuilder();
    closeModal("#createModal");
    await loadForms();
    showToast("설문이 등록되었습니다.");
});

/* =====================================================
   10. 설문 참여
===================================================== */
let currentForm = null;

function openAnswer(id) {
    const f = state.forms.find(x => x.id === id);
    if (!f || isClosed(f.deadline)) return;
    currentForm = f;

    $("#answerTitle").textContent = f.title;
    $("#answerDesc").textContent = f.description;

    $("#answerBody").innerHTML = `
        <form id="answerForm" novalidate>
            <div class="identity-box">
                <h4>참여자 정보</h4>
                ${identityFields("ans", state.profile)}
                <p class="muted">대상 학년: ${[...f.grades].sort().join(", ")}학년 · 같은 번호로는 한 번만 참여할 수 있어요.</p>
            </div>

            ${f.questions.map(questionHTML).join("")}

            <div class="form-error hidden" id="answerError"></div>
            <button type="submit" class="btn btn-primary wide" id="answerSubmit">제출하기</button>
        </form>`;

    $("#answerForm").addEventListener("submit", submitAnswer);
    openModal("#answerModal");
    $("#answerBody").scrollTop = 0;
}

function questionHTML(q) {
    const req = q.required ? `<span class="req">*</span>` : "";
    let input = "";

    if (q.type === "short") {
        input = `<input type="text" name="${q.id}" maxlength="200" autocomplete="off">`;
    } else if (q.type === "long") {
        input = `<textarea name="${q.id}" maxlength="1000"></textarea>`;
    } else if (q.type === "single") {
        input = q.options.map(o => `
            <label class="opt"><input type="radio" name="${q.id}" value="${esc(o)}"><span>${esc(o)}</span></label>`).join("");
    } else if (q.type === "multi") {
        input = q.options.map(o => `
            <label class="opt"><input type="checkbox" name="${q.id}" value="${esc(o)}"><span>${esc(o)}</span></label>`).join("");
    } else if (q.type === "scale") {
        input = `
            <div class="scale">
                ${[1, 2, 3, 4, 5].map(n => `
                    <label><input type="radio" name="${q.id}" value="${n}"><span>${n}</span></label>`).join("")}
            </div>
            <div class="scale-guide"><span>전혀 아니다</span><span>매우 그렇다</span></div>`;
    }

    return `<div class="q-ask"><h4>${esc(q.title)}${req}</h4>${input}</div>`;
}

function collectAnswer(form, q) {
    const name = q.id;
    if (q.type === "short" || q.type === "long") {
        return form.querySelector(`[name="${name}"]`).value.trim();
    }
    if (q.type === "single") {
        const r = form.querySelector(`input[name="${name}"]:checked`);
        return r ? r.value : "";
    }
    if (q.type === "scale") {
        const r = form.querySelector(`input[name="${name}"]:checked`);
        return r ? Number(r.value) : "";
    }
    if (q.type === "multi") {
        return [...form.querySelectorAll(`input[name="${name}"]:checked`)].map(i => i.value);
    }
    return "";
}

async function submitAnswer(e) {
    e.preventDefault();
    const form = e.target;
    const f = currentForm;
    hideErr("#answerError");

    const identity = readIdentity("ans");
    if (!identity) return showErr("#answerError", "학년, 반, 번호를 정확히 입력해주세요.");
    if (!f.grades.includes(identity.grade)) {
        return showErr("#answerError", `이 설문은 ${[...f.grades].sort().join(", ")}학년 대상이에요.`);
    }

    const answers = {};
    for (let i = 0; i < f.questions.length; i++) {
        const q = f.questions[i];
        const v = collectAnswer(form, q);
        const empty = v === "" || (Array.isArray(v) && v.length === 0);
        if (q.required && empty) return showErr("#answerError", `${i + 1}번 질문은 필수예요.`);
        if (!empty) answers[q.id] = v;
    }

    const btn = $("#answerSubmit");
    btn.disabled = true;
    btn.textContent = "제출하는 중...";

    const { error } = await db.from("form_responses").insert({
        form_id: f.id,
        grade: identity.grade,
        class_no: identity.classNo,
        student_no: identity.studentNo,
        answers
    });

    btn.disabled = false;
    btn.textContent = "제출하기";

    if (error) {
        console.error(error);
        if (error.code === "23505") {
            localStorage.setItem(answeredKey(f.id), "1");
            return showErr("#answerError", `${identity.grade}학년 ${identity.classNo}반 ${identity.studentNo}번은 이미 참여했어요.`);
        }
        if (error.code === "42501") {
            return showErr("#answerError", "마감되었거나 참여할 수 없는 설문이에요.");
        }
        return showErr("#answerError", "제출 실패: " + error.message);
    }

    localStorage.setItem(answeredKey(f.id), "1");
    saveProfile(identity);
    closeModal("#answerModal");
    showToast("참여해주셔서 감사합니다!");
    await loadForms();
}

/* =====================================================
   11. 결과 보기 (만든 사람 전용)
===================================================== */
let currentResults = null;

async function openResults(id) {
    const f = state.forms.find(x => x.id === id);
    const token = getToken(id);
    if (!f || !token) return showToast("이 설문의 결과를 볼 권한이 없습니다.");

    $("#resultTitle").textContent = f.title;
    $("#resultSub").textContent = "";
    $("#resultBody").innerHTML = `<p class="muted">불러오는 중...</p>`;
    openModal("#resultModal");

    const { data, error } = await db.rpc("get_responses", { p_id: id, p_token: token });

    if (error) {
        console.error(error);
        $("#resultBody").innerHTML = `<p class="muted">불러오지 못했습니다: ${esc(error.message)}</p>`;
        return;
    }

    const rows = data || [];
    currentResults = { form: f, rows };
    $("#resultSub").textContent = `총 ${rows.length}명 참여`;

    const byGrade = [1, 2, 3].map(g => [g, rows.filter(r => r.grade === g).length])
        .filter(([g]) => f.grades.includes(g));

    $("#resultBody").innerHTML = `
        <div class="stat-row">
            <div class="stat"><b>${rows.length}</b><span>전체 참여</span></div>
            ${byGrade.map(([g, n]) => `<div class="stat"><b>${n}</b><span>${g}학년</span></div>`).join("")}
        </div>

        <div class="section-title">항목별 요약</div>
        ${f.questions.map((q, i) => summaryHTML(q, i, rows)).join("")}

        <div class="section-title">
            <span>개별 응답 (${rows.length})</span>
            <button class="btn btn-green" id="csvBtn">CSV 저장</button>
        </div>
        ${rows.length ? tableHTML(f, rows) : `<p class="muted">아직 응답이 없어요.</p>`}
    `;

    const csvBtn = $("#csvBtn");
    if (csvBtn) csvBtn.addEventListener("click", downloadCsv);
}

function fmtAnswer(v) {
    if (Array.isArray(v)) return v.join(", ");
    return v === undefined || v === null ? "" : String(v);
}

function barsHTML(entries, total) {
    return entries.map(([label, n]) => {
        const p = total ? Math.round(n / total * 100) : 0;
        return `
        <div class="bar-row">
            <div class="bar-label"><span>${esc(label)}</span><span>${n}명 · ${p}%</span></div>
            <div class="bar"><i style="width:${p}%"></i></div>
        </div>`;
    }).join("");
}

function summaryHTML(q, i, rows) {
    const answered = rows
        .map(r => ({ r, v: r.answers?.[q.id] }))
        .filter(({ v }) => v !== undefined && v !== "" && !(Array.isArray(v) && !v.length));

    let body = "";

    if (isChoice(q.type)) {
        const c = new Map(q.options.map(o => [o, 0]));
        answered.forEach(({ v }) => (Array.isArray(v) ? v : [v]).forEach(x => {
            if (c.has(x)) c.set(x, c.get(x) + 1);
        }));
        body = barsHTML([...c.entries()], answered.length);
    } else if (q.type === "scale") {
        const c = new Map([1, 2, 3, 4, 5].map(n => [String(n), 0]));
        let sum = 0;
        answered.forEach(({ v }) => { c.set(String(v), (c.get(String(v)) || 0) + 1); sum += Number(v); });
        const avg = answered.length ? (sum / answered.length).toFixed(2) : "-";
        body = `<p class="muted" style="margin:0 0 10px">평균 <b style="color:var(--text-strong)">${avg}</b> / 5</p>`
            + barsHTML([...c.entries()].map(([k, n]) => [`${k}점`, n]), answered.length);
    } else {
        body = answered.length
            ? `<div class="text-answers">${answered.slice(0, 100).map(({ r, v }) =>
                `<div><small>${r.grade}-${r.class_no}-${r.student_no}</small>${esc(v)}</div>`).join("")}</div>`
            : `<p class="muted">응답 없음</p>`;
    }

    return `
    <div class="result-q">
        <h4>${i + 1}. ${esc(q.title)} <span class="muted">(${answered.length}명 응답)</span></h4>
        ${body}
    </div>`;
}

function tableHTML(f, rows) {
    return `
    <div class="table-wrap">
        <table>
            <thead><tr>
                <th>학년</th><th>반</th><th>번호</th>
                ${f.questions.map(q => `<th title="${esc(q.title)}">${esc(q.title)}</th>`).join("")}
                <th>제출시간</th>
            </tr></thead>
            <tbody>
                ${rows.map(r => `<tr>
                    <td>${r.grade}</td><td>${r.class_no}</td><td>${r.student_no}</td>
                    ${f.questions.map(q => `<td title="${esc(fmtAnswer(r.answers?.[q.id]))}">${esc(fmtAnswer(r.answers?.[q.id]))}</td>`).join("")}
                    <td>${esc(fmtTime(r.created_at))}</td>
                </tr>`).join("")}
            </tbody>
        </table>
    </div>`;
}

function csvCell(v) {
    let s = String(v ?? "");
    if (/^[=+\-@]/.test(s)) s = "'" + s;           // 엑셀 수식 방지
    return `"${s.replace(/"/g, '""')}"`;
}

function downloadCsv() {
    if (!currentResults) return;
    const { form, rows } = currentResults;

    const header = ["학년", "반", "번호", ...form.questions.map(q => q.title), "제출시간"];
    const lines = [header.map(csvCell).join(",")];

    rows.forEach(r => {
        lines.push([
            r.grade, r.class_no, r.student_no,
            ...form.questions.map(q => fmtAnswer(r.answers?.[q.id])),
            new Date(r.created_at).toLocaleString("ko-KR")
        ].map(csvCell).join(","));
    });

    const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${form.title.slice(0, 30)}_결과.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
}

/* =====================================================
   12. 삭제
===================================================== */
async function deleteForm(id) {
    const f = state.forms.find(x => x.id === id);
    const token = getToken(id);
    if (!f || !token) return showToast("삭제 권한이 없습니다.");

    if (!confirm(`"${f.title}"\n\n정말 삭제하시겠습니까?\n응답 데이터도 모두 삭제되며 복구할 수 없습니다.`)) return;

    const { data, error } = await db.rpc("delete_form", { p_id: id, p_token: token });

    if (error) {
        console.error(error);
        return showToast("삭제 실패: " + error.message);
    }
    if (!data) return showToast("삭제 권한이 없습니다.");

    localStorage.removeItem(ownerKey(id));
    state.forms = state.forms.filter(x => x.id !== id);
    renderFeed();
    renderBadges();
    showToast("설문이 삭제되었습니다.");
}

/* =====================================================
   13. 서비스워커
===================================================== */
if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("./sw.js")
            .catch(err => console.error("Service Worker 등록 실패:", err));
    });
}
