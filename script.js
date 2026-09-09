/* =====================================================
   SCHOOL SURVEY
===================================================== */


/* =====================================================
   1. SUPABASE
===================================================== */

const SUPABASE_URL =
    "여기에_프로젝트_URL";

const SUPABASE_ANON_KEY =
    "여기에_PUBLISHABLE_KEY";


const supabaseClient =
    supabase.createClient(
        SUPABASE_URL,
        SUPABASE_ANON_KEY
    );


/* =====================================================
   2. VARIABLES
===================================================== */

let surveys = [];

let currentGrade = "all";

let currentSearch = "";

let currentQrUrl = "";


/* =====================================================
   3. ELEMENTS
===================================================== */

const surveyList =
    document.getElementById(
        "surveyList"
    );

const surveyCount =
    document.getElementById(
        "surveyCount"
    );

const emptyState =
    document.getElementById(
        "emptyState"
    );

const searchInput =
    document.getElementById(
        "searchInput"
    );

const filterButtons =
    document.querySelectorAll(
        ".filter-btn"
    );

const addModal =
    document.getElementById(
        "addModal"
    );

const openAddSurvey =
    document.getElementById(
        "openAddSurvey"
    );

const closeAddSurvey =
    document.getElementById(
        "closeAddSurvey"
    );

const surveyForm =
    document.getElementById(
        "surveyForm"
    );

const formError =
    document.getElementById(
        "formError"
    );

const submitSurvey =
    document.getElementById(
        "submitSurvey"
    );

const qrModal =
    document.getElementById(
        "qrModal"
    );

const closeQr =
    document.getElementById(
        "closeQr"
    );

const downloadQr =
    document.getElementById(
        "downloadQr"
    );

const qrTitle =
    document.getElementById(
        "qrTitle"
    );

const qrCodeContainer =
    document.getElementById(
        "qrcode"
    );

const toast =
    document.getElementById(
        "toast"
    );


/* =====================================================
   4. START
===================================================== */

document.addEventListener(
    "DOMContentLoaded",
    () => {
        loadSurveys();
    }
);


/* =====================================================
   5. LOAD SURVEYS
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
    } =
        await supabaseClient
            .from("surveys")
            .select(
                "id,title,description,grades,deadline,status,survey_url,created_at"
            )
            .order(
                "created_at",
                {
                    ascending: false
                }
            );


    if (error) {

        console.error(
            "Supabase 오류:",
            error
        );

        surveyList.innerHTML = "";

        showError(
            "설문을 불러오지 못했습니다: " +
            error.message
        );

        return;
    }


    surveys = data || [];

    renderSurveys();
}


/* =====================================================
   6. RENDER
===================================================== */

function renderSurveys() {

    let filteredSurveys =
        surveys.filter(
            survey => {

                const matchesGrade =
                    currentGrade === "all" ||
                    (
                        Array.isArray(
                            survey.grades
                        ) &&
                        survey.grades.includes(
                            Number(
                                currentGrade
                            )
                        )
                    );


                const searchText =
                    currentSearch
                        .toLowerCase()
                        .trim();


                const matchesSearch =
                    !searchText ||
                    (
                        survey.title &&
                        survey.title
                            .toLowerCase()
                            .includes(
                                searchText
                            )
                    ) ||
                    (
                        survey.description &&
                        survey.description
                            .toLowerCase()
                            .includes(
                                searchText
                            )
                    );


                return (
                    matchesGrade &&
                    matchesSearch
                );
            }
        );


    surveyCount.textContent =
        filteredSurveys.length;


    surveyList.innerHTML = "";


    if (
        filteredSurveys.length === 0
    ) {

        emptyState.classList.remove(
            "hidden"
        );

        return;
    }


    emptyState.classList.add(
        "hidden"
    );


    filteredSurveys.forEach(
        survey => {

            surveyList.appendChild(
                createSurveyCard(
                    survey
                )
            );

        }
    );
}


/* =====================================================
   7. CREATE CARD
===================================================== */

function createSurveyCard(
    survey
) {

    const card =
        document.createElement(
            "article"
        );


    card.className =
        "survey-card";


    const closed =
        isClosed(
            survey.deadline
        );


    const grades =
        Array.isArray(
            survey.grades
        )
            ? survey.grades
                .sort(
                    (a, b) => a - b
                )
                .map(
                    grade =>
                        `${grade}학년`
                )
                .join(" · ")
            : "전체";


    const statusText =
        closed
            ? "마감"
            : "진행 중";


    const statusClass =
        closed
            ? "status-closed"
            : "status-active";


    const deadline =
        formatDate(
            survey.deadline
        );


    /*
       이 브라우저에서
       해당 설문을 만든 적이 있는지 확인
    */

    const myToken =
        localStorage.getItem(
            `survey_owner_${survey.id}`
        );


    const deleteButton =
        myToken
            ? `
                <button
                    class="btn-delete"
                    data-action="delete"
                >
                    삭제
                </button>
            `
            : "";


    card.innerHTML = `

        <div class="survey-info">

            <div class="survey-meta">

                <span class="grade-badge">
                    ${escapeHTML(grades)}
                </span>

                <span class="${statusClass}">
                    ${statusText}
                </span>

                ${
                    myToken
                        ? `
                            <span class="my-survey">
                                내가 등록함
                            </span>
                        `
                        : ""
                }

            </div>


            <h2 class="survey-title">
                ${escapeHTML(
                    survey.title
                )}
            </h2>


            <p class="survey-description">
                ${escapeHTML(
                    survey.description || ""
                )}
            </p>


            <p class="survey-deadline">
                마감일 · ${deadline}
            </p>

        </div>


        <div class="survey-actions">

            ${deleteButton}

            <button
                class="btn-qr"
                data-action="qr"
            >
                QR
            </button>


            <button
                class="btn-participate ${
                    closed
                        ? "disabled"
                        : ""
                }"
                data-action="participate"
                ${
                    closed
                        ? "disabled"
                        : ""
                }
            >
                ${
                    closed
                        ? "마감됨"
                        : "참여하기"
                }
            </button>

        </div>

    `;


    /* QR */

    const qrButton =
        card.querySelector(
            '[data-action="qr"]'
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


    /* 참여 */

    const participateButton =
        card.querySelector(
            '[data-action="participate"]'
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


    /* 삭제 */

    const deleteBtn =
        card.querySelector(
            '[data-action="delete"]'
        );


    if (deleteBtn) {

        deleteBtn.addEventListener(
            "click",
            () => {

                deleteSurvey(
                    survey
                );

            }
        );

    }


    return card;
}


/* =====================================================
   8. SEARCH
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
   9. GRADE FILTER
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


                button.classList.add(
                    "active"
                );


                currentGrade =
                    button.dataset.grade;


                renderSurveys();

            }
        );

    }
);


/* =====================================================
   10. ADD MODAL
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


document
    .querySelector(
        "#addModal .modal-backdrop"
    )
    .addEventListener(
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
   11. ADD SURVEY
===================================================== */

surveyForm.addEventListener(
    "submit",
    async event => {

        event.preventDefault();


        formError.classList.add(
            "hidden"
        );


        const title =
            document
                .getElementById(
                    "surveyTitle"
                )
                .value
                .trim();


        const description =
            document
                .getElementById(
                    "surveyDescription"
                )
                .value
                .trim();


        const gradeInputs =
            document.querySelectorAll(
                'input[name="grade"]:checked'
            );


        const grades =
            Array.from(
                gradeInputs
            ).map(
                input =>
                    Number(
                        input.value
                    )
            );


        const deadline =
            document
                .getElementById(
                    "surveyDeadline"
                )
                .value;


        const surveyUrl =
            document
                .getElementById(
                    "surveyUrl"
                )
                .value
                .trim();


        /* 검사 */

        if (!title) {

            showFormError(
                "설문 제목을 입력해주세요."
            );

            return;
        }


        if (!description) {

            showFormError(
                "설명을 입력해주세요."
            );

            return;
        }


        if (grades.length === 0) {

            showFormError(
                "대상 학년을 선택해주세요."
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


        /* 만든 사람 전용 토큰 */

        const creatorToken =
            crypto.randomUUID();


        submitSurvey.disabled =
            true;

        submitSurvey.textContent =
            "등록하는 중...";


        /* DB 저장 */

        const {
            data,
            error
        } =
            await supabaseClient
                .from("surveys")
                .insert({
                    title:
                        title,

                    description:
                        description,

                    grades:
                        grades,

                    deadline:
                        deadline,

                    status:
                        "active",

                    survey_url:
                        surveyUrl,

                    creator_token:
                        creatorToken
                })
                .select(
                    "id,title,description,grades,deadline,status,survey_url,created_at"
                )
                .single();


        if (error) {

            console.error(
                "등록 실패:",
                error
            );


            showFormError(
                "등록 실패: " +
                error.message
            );


            submitSurvey.disabled =
                false;

            submitSurvey.textContent =
                "설문 등록하기";

            return;
        }


        /*
           이 브라우저에
           "내가 만든 설문"이라는 기록 저장
        */

        localStorage.setItem(
            `survey_owner_${data.id}`,
            creatorToken
        );


        /* 목록 갱신 */

        await loadSurveys();


        surveyForm.reset();


        closeAddModal();


        submitSurvey.disabled =
            false;

        submitSurvey.textContent =
            "설문 등록하기";


        showToast(
            "설문이 등록되었습니다."
        );

    }
);


/* =====================================================
   12. DELETE SURVEY
===================================================== */

async function deleteSurvey(
    survey
) {

    const token =
        localStorage.getItem(
            `survey_owner_${survey.id}`
        );


    if (!token) {

        showToast(
            "이 설문을 삭제할 권한이 없습니다."
        );

        return;
    }


    const confirmed =
        confirm(
            `"${survey.title}"\n\n정말 삭제하시겠습니까?\n삭제하면 다시 복구할 수 없습니다.`
        );


    if (!confirmed) {
        return;
    }


    const {
        data,
        error
    } =
        await supabaseClient
            .rpc(
                "delete_my_survey",
                {
                    p_id:
                        survey.id,

                    p_token:
                        token
                }
            );


    if (error) {

        console.error(
            "삭제 오류:",
            error
        );


        showToast(
            "삭제 실패: " +
            error.message
        );

        return;
    }


    if (!data) {

        showToast(
            "삭제 권한이 없습니다."
        );

        return;
    }


    /* 브라우저에서도 제거 */

    localStorage.removeItem(
        `survey_owner_${survey.id}`
    );


    /* 화면에서도 제거 */

    surveys =
        surveys.filter(
            item =>
                item.id !==
                survey.id
        );


    renderSurveys();


    showToast(
        "설문이 삭제되었습니다."
    );
}


/* =====================================================
   13. QR
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
            text:
                url,

            width:
                220,

            height:
                220,

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


document
    .querySelector(
        "#qrModal .modal-backdrop"
    )
    .addEventListener(
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
   14. QR DOWNLOAD
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
            document.createElement(
                "a"
            );


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
   15. DATE
===================================================== */

function formatDate(
    dateString
) {

    if (!dateString) {
        return "-";
    }


    const date =
        new Date(
            dateString +
            "T00:00:00"
        );


    return (
        date.getFullYear()
        +
        "-"
        +
        String(
            date.getMonth() + 1
        ).padStart(2, "0")
        +
        "-"
        +
        String(
            date.getDate()
        ).padStart(2, "0")
    );
}


/* =====================================================
   16. CLOSED
===================================================== */

function isClosed(
    deadline
) {

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
            deadline +
            "T23:59:59"
        );


    return today > end;
}


/* =====================================================
   17. URL
===================================================== */

function isValidUrl(
    value
) {

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
   18. SECURITY
===================================================== */

function escapeHTML(
    value
) {

    return String(value)
        .replaceAll(
            "&",
            "&amp;"
        )
        .replaceAll(
            "<",
            "&lt;"
        )
        .replaceAll(
            ">",
            "&gt;"
        )
        .replaceAll(
            '"',
            "&quot;"
        )
        .replaceAll(
            "'",
            "&#039;"
        );
}


/* =====================================================
   19. ERROR
===================================================== */

function showFormError(
    message
) {

    formError.textContent =
        message;

    formError.classList.remove(
        "hidden"
    );
}


function showError(
    message
) {

    surveyList.innerHTML = `

        <div class="empty-state">

            <h3>
                불러오지 못했습니다.
            </h3>

            <p>
                ${escapeHTML(message)}
            </p>

        </div>

    `;
}


/* =====================================================
   20. TOAST
===================================================== */

let toastTimer;


function showToast(
    message
) {

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
