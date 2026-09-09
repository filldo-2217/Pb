/* =====================================================
   SCHOOL SURVEY
   Supabase + JavaScript
===================================================== */


/* =====================================================
   1. SUPABASE 설정
===================================================== */

const SUPABASE_URL = "https://yvpjbqsjsszderhhdnwv.supabase.co/rest/v1/";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2cGpicXNqc3N6ZGVyaGhkbnd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg5NTExNzMsImV4cCI6MjEwNDUyNzE3M30.bpmCyGOPcaP1WSDRxxwgf6bYoL8VB4e839G_Rei9neoy";


const supabaseClient = supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
);


/* =====================================================
   2. 전역 변수
===================================================== */

let surveys = [];

let currentGrade = "all";

let currentSearch = "";

let currentQrUrl = "";


/* =====================================================
   3. HTML 요소
===================================================== */

const surveyList =
    document.getElementById("surveyList");

const surveyCount =
    document.getElementById("surveyCount");

const emptyState =
    document.getElementById("emptyState");

const searchInput =
    document.getElementById("searchInput");

const filterButtons =
    document.querySelectorAll(".filter-btn");

const addModal =
    document.getElementById("addModal");

const openAddSurvey =
    document.getElementById("openAddSurvey");

const closeAddSurvey =
    document.getElementById("closeAddSurvey");

const surveyForm =
    document.getElementById("surveyForm");

const formError =
    document.getElementById("formError");

const submitSurvey =
    document.getElementById("submitSurvey");

const qrModal =
    document.getElementById("qrModal");

const closeQr =
    document.getElementById("closeQr");

const downloadQr =
    document.getElementById("downloadQr");

const qrTitle =
    document.getElementById("qrTitle");

const qrCodeContainer =
    document.getElementById("qrcode");

const toast =
    document.getElementById("toast");


/* =====================================================
   4. 페이지 시작
===================================================== */

document.addEventListener(
    "DOMContentLoaded",
    () => {

        loadSurveys();

    }
);


/* =====================================================
   5. DB에서 설문 불러오기
===================================================== */

async function loadSurveys() {

    surveyList.innerHTML = `
        <div class="empty-state">
            <p>설문을 불러오는 중입니다...</p>
        </div>
    `;


    const {
        data,
        error
    } = await supabaseClient
        .from("surveys")
        .select("*")
        .order("created_at", {
            ascending: false
        });


    if (error) {

        console.error(error);

        surveyList.innerHTML = "";

        showError(
            "설문을 불러오지 못했습니다. Supabase 설정을 확인해주세요."
        );

        return;
    }


    surveys = data || [];

    renderSurveys();
}


/* =====================================================
   6. 설문 표시
===================================================== */

function renderSurveys() {

    let filteredSurveys =
        surveys.filter(survey => {

            const matchesGrade =
                currentGrade === "all" ||
                survey.grades.includes(
                    Number(currentGrade)
                );


            const searchText =
                currentSearch
                    .toLowerCase()
                    .trim();


            const matchesSearch =
                !searchText ||
                survey.title
                    .toLowerCase()
                    .includes(searchText) ||
                (survey.description || "")
                    .toLowerCase()
                    .includes(searchText);


            return matchesGrade && matchesSearch;

        });


    surveyCount.textContent =
        filteredSurveys.length;


    surveyList.innerHTML = "";


    if (filteredSurveys.length === 0) {

        emptyState.classList.remove("hidden");

        return;

    }


    emptyState.classList.add("hidden");


    filteredSurveys.forEach(
        survey => {

            surveyList.appendChild(
                createSurveyCard(survey)
            );

        }
    );
}


/* =====================================================
   7. 설문 카드 생성
===================================================== */

function createSurveyCard(survey) {

    const card =
        document.createElement("article");

    card.className = "survey-card";


    const closed =
        isClosed(survey.deadline);


    const grades =
        survey.grades
            .sort((a, b) => a - b)
            .map(g => `${g}학년`)
            .join(" · ");


    const statusText =
        closed
            ? "마감"
            : "진행 중";


    const statusClass =
        closed
            ? "status-closed"
            : "status-active";


    const deadline =
        formatDate(survey.deadline);


    card.innerHTML = `

        <div class="survey-info">

            <div class="survey-meta">

                <span class="grade-badge">
                    ${escapeHTML(grades)}
                </span>

                <span class="${statusClass}">
                    ${statusText}
                </span>

            </div>


            <h2 class="survey-title">
                ${escapeHTML(survey.title)}
            </h2>


            <p class="survey-description">
                ${escapeHTML(survey.description || "")}
            </p>


            <p class="survey-deadline">
                마감일 · ${deadline}
            </p>

        </div>


        <div class="survey-actions">

            <button
                class="btn-qr"
                data-action="qr"
            >
                QR
            </button>


            <button
                class="btn-participate ${closed ? "disabled" : ""}"
                data-action="participate"
                ${closed ? "disabled" : ""}
            >
                ${closed ? "마감됨" : "참여하기"}
            </button>

        </div>

    `;


    const qrButton =
        card.querySelector(
            '[data-action="qr"]'
        );


    const participateButton =
        card.querySelector(
            '[data-action="participate"]'
        );


    qrButton.addEventListener(
        "click",
        () => {

            openQrModal(
                survey.title,
                survey.survey_url
            );

        }
    );


    participateButton.addEventListener(
        "click",
        () => {

            if (!closed) {

                window.open(
                    survey.survey_url,
                    "_blank",
                    "noopener,noreferrer"
                );

            }

        }
    );


    return card;
}


/* =====================================================
   8. 검색
===================================================== */

searchInput.addEventListener(
    "input",
    event => {

        currentSearch =
            event.target.value;

        renderSurveys();

    }
);


/* =====================================================
   9. 학년 필터
===================================================== */

filterButtons.forEach(
    button => {

        button.addEventListener(
            "click",
            () => {

                filterButtons.forEach(
                    btn =>
                        btn.classList.remove(
                            "active"
                        )
                );


                button.classList.add("active");


                currentGrade =
                    button.dataset.grade;


                renderSurveys();

            }
        );

    }
);


/* =====================================================
   10. 설문 추가 모달
===================================================== */

openAddSurvey.addEventListener(
    "click",
    () => {

        addModal.classList.remove(
            "hidden"
        );

        document.body.style.overflow =
            "hidden";

    }
);


closeAddSurvey.addEventListener(
    "click",
    closeAddModal
);


document.querySelector(
    "#addModal .modal-backdrop"
).addEventListener(
    "click",
    closeAddModal
);


function closeAddModal() {

    addModal.classList.add(
        "hidden"
    );

    document.body.style.overflow =
        "";

    formError.classList.add(
        "hidden"
    );

}


/* =====================================================
   11. 설문 등록
===================================================== */

surveyForm.addEventListener(
    "submit",
    async event => {

        event.preventDefault();


        formError.classList.add(
            "hidden"
        );


        /* 제목 */

        const title =
            document
                .getElementById("surveyTitle")
                .value
                .trim();


        /* 설명 */

        const description =
            document
                .getElementById("surveyDescription")
                .value
                .trim();


        /* 학년 */

        const gradeInputs =
            document.querySelectorAll(
                'input[name="grade"]:checked'
            );


        const grades =
            Array.from(
                gradeInputs
            ).map(
                input =>
                    Number(input.value)
            );


        /* 마감일 */

        const deadline =
            document
                .getElementById("surveyDeadline")
                .value;


        /* URL */

        const surveyUrl =
            document
                .getElementById("surveyUrl")
                .value
                .trim();


        /* 유효성 검사 */

        if (!title) {

            showFormError(
                "설문 제목을 입력해주세요."
            );

            return;

        }


        if (!description) {

            showFormError(
                "설명 내용을 입력해주세요."
            );

            return;

        }


        if (grades.length === 0) {

            showFormError(
                "대상 학년을 하나 이상 선택해주세요."
            );

            return;

        }


        if (!deadline) {

            showFormError(
                "마감일을 선택해주세요."
            );

            return;

        }


        if (!isValidUrl(surveyUrl)) {

            showFormError(
                "올바른 설문 링크를 입력해주세요."
            );

            return;

        }


        /* 버튼 상태 */

        submitSurvey.disabled = true;

        submitSurvey.textContent =
            "등록하는 중...";


        /* DB 저장 */

        const {
            data,
            error
        } = await supabaseClient
            .from("surveys")
            .insert([
                {
                    title: title,

                    description: description,

                    grades: grades,

                    deadline: deadline,

                    status: "active",

                    survey_url: surveyUrl
                }
            ])
            .select()
            .single();


        /* 오류 */

        if (error) {

            console.error(error);

            showFormError(
                `등록 실패: ${error.message}`
            );

            submitSurvey.disabled = false;

            submitSurvey.textContent =
                "설문 등록하기";

            return;

        }


        /* 성공 */

        surveys.unshift(data);


        renderSurveys();


        surveyForm.reset();


        closeAddModal();


        submitSurvey.disabled = false;

        submitSurvey.textContent =
            "설문 등록하기";


        showToast(
            "설문이 등록되었습니다."
        );

    }
);


/* =====================================================
   12. QR 코드
===================================================== */

function openQrModal(
    title,
    url
) {

    qrTitle.textContent =
        title;


    currentQrUrl =
        url;


    qrCodeContainer.innerHTML =
        "";


    new QRCode(
        qrCodeContainer,
        {
            text: url,

            width: 220,

            height: 220,

            correctLevel:
                QRCode.CorrectLevel.M
        }
    );


    qrModal.classList.remove(
        "hidden"
    );


    document.body.style.overflow =
        "hidden";
}


closeQr.addEventListener(
    "click",
    closeQrModal
);


document.querySelector(
    "#qrModal .modal-backdrop"
).addEventListener(
    "click",
    closeQrModal
);


function closeQrModal() {

    qrModal.classList.add(
        "hidden"
    );

    document.body.style.overflow =
        "";

}


/* =====================================================
   13. QR PNG 저장
===================================================== */

downloadQr.addEventListener(
    "click",
    () => {

        const canvas =
            qrCodeContainer.querySelector(
                "canvas"
            );


        if (!canvas) {

            showToast(
                "QR 코드를 준비하는 중입니다."
            );

            return;

        }


        const link =
            document.createElement("a");


        link.download =
            "school-survey-qr.png";


        link.href =
            canvas.toDataURL(
                "image/png"
            );


        link.click();

    }
);


/* =====================================================
   14. 날짜
===================================================== */

function formatDate(dateString) {

    if (!dateString) {
        return "-";
    }


    const date =
        new Date(
            dateString + "T00:00:00"
        );


    return (
        date.getFullYear()
        + "-"
        + String(
            date.getMonth() + 1
        ).padStart(2, "0")
        + "-"
        + String(
            date.getDate()
        ).padStart(2, "0")
    );
}


/* =====================================================
   15. 마감 확인
===================================================== */

function isClosed(deadline) {

    if (!deadline) {
        return false;
    }


    const today =
        new Date();


    today.setHours(
        0,
        0,
        0,
        0
    );


    const end =
        new Date(
            deadline + "T23:59:59"
        );


    return today > end;
}


/* =====================================================
   16. URL 검사
===================================================== */

function isValidUrl(value) {

    try {

        const url =
            new URL(value);


        return (
            url.protocol === "http:" ||
            url.protocol === "https:"
        );

    } catch {

        return false;

    }
}


/* =====================================================
   17. HTML 보안 처리
===================================================== */

function escapeHTML(value) {

    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}


/* =====================================================
   18. 에러
===================================================== */

function showFormError(message) {

    formError.textContent =
        message;

    formError.classList.remove(
        "hidden"
    );
}


function showError(message) {

    surveyList.innerHTML = `
        <div class="empty-state">
            <h3>불러오지 못했습니다.</h3>
            <p>${escapeHTML(message)}</p>
        </div>
    `;

}


/* =====================================================
   19. 토스트
===================================================== */

let toastTimer;


function showToast(message) {

    toast.textContent =
        message;


    toast.classList.add(
        "show"
    );


    clearTimeout(
        toastTimer
    );


    toastTimer =
        setTimeout(
            () => {

                toast.classList.remove(
                    "show"
                );

            },
            2500
        );
}
