/* =========================================
   SCHOOL SURVEY
   JAVASCRIPT
========================================= */


const surveyList =
    document.getElementById("surveyList");

const surveyCount =
    document.getElementById("surveyCount");

const searchInput =
    document.getElementById("searchInput");

const clearSearch =
    document.getElementById("clearSearch");

const emptyState =
    document.getElementById("emptyState");

const filterButtons =
    document.querySelectorAll(".filter");

const qrModal =
    document.getElementById("qrModal");

const modalClose =
    document.getElementById("modalClose");

const qrTitle =
    document.getElementById("qrTitle");

const qrContainer =
    document.getElementById("qrcode");

const downloadQR =
    document.getElementById("downloadQR");


let surveys = [];

let selectedGrade = "all";

let selectedQR = null;


/* =========================================
   LOAD DATA
========================================= */

async function loadSurveys() {

    try {

        const response =
            await fetch("surveys.json");

        if (!response.ok) {
            throw new Error(
                "설문 데이터를 불러올 수 없습니다."
            );
        }

        surveys =
            await response.json();

        renderSurveys();

    } catch (error) {

        console.error(error);

        surveyList.innerHTML = `
            <div class="empty">
                <div class="empty-icon">!</div>

                <h3>
                    설문을 불러오지 못했습니다.
                </h3>

                <p>
                    surveys.json 파일을 확인해주세요.
                </p>
            </div>
        `;
    }

}


/* =========================================
   RENDER SURVEYS
========================================= */

function renderSurveys() {

    const keyword =
        searchInput.value
            .trim()
            .toLowerCase();


    const filtered =
        surveys.filter(survey => {

            /*
             * 학년 필터
             */

            const gradeMatch =
                selectedGrade === "all" ||
                survey.grade.includes(
                    Number(selectedGrade)
                );


            /*
             * 검색
             */

            const searchMatch =
                survey.title
                    .toLowerCase()
                    .includes(keyword)

                ||

                survey.description
                    .toLowerCase()
                    .includes(keyword);


            return gradeMatch && searchMatch;

        });


    surveyCount.textContent =
        filtered.length;


    if (filtered.length === 0) {

        surveyList.innerHTML = "";

        emptyState.classList.remove(
            "hidden"
        );

        return;
    }


    emptyState.classList.add(
        "hidden"
    );


    surveyList.innerHTML =
        filtered
            .map(createSurveyCard)
            .join("");

}


/* =========================================
   CREATE CARD
========================================= */

function createSurveyCard(survey) {

    const closed =
        survey.status === "closed";


    const gradeText =
        survey.grade.length === 3

            ? "전체"

            : survey.grade
                .map(
                    grade => `${grade}학년`
                )
                .join(", ");


    const statusText =
        closed
            ? "마감"
            : "진행 중";


    return `

        <article
            class="survey-card
            ${closed ? "closed" : ""}"
        >

            <div class="survey-main">

                <div class="survey-meta">

                    <span class="grade-badge">
                        ${gradeText}
                    </span>

                    <span
                        class="status
                        ${closed
                            ? "status-closed"
                            : "status-active"}"
                    >
                        ${statusText}
                    </span>

                </div>


                <h3 class="survey-title">
                    ${escapeHTML(
                        survey.title
                    )}
                </h3>


                <p class="survey-description">
                    ${escapeHTML(
                        survey.description
                    )}
                </p>


                <p class="survey-date">
                    마감일 · ${survey.deadline}
                </p>

            </div>


            <div class="survey-actions">

                <button
                    class="qr-button"
                    onclick="openQR(
                        '${escapeJS(survey.title)}',
                        '${escapeJS(survey.url)}'
                    )"
                >
                    QR
                </button>


                <a
                    href="${survey.url}"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="participate-button"
                >
                    참여하기
                </a>

            </div>

        </article>

    `;
}


/* =========================================
   GRADE FILTER
========================================= */

filterButtons.forEach(button => {

    button.addEventListener(
        "click",
        () => {

            filterButtons.forEach(btn => {

                btn.classList.remove(
                    "active"
                );

            });


            button.classList.add(
                "active"
            );


            selectedGrade =
                button.dataset.grade;


            renderSurveys();

        }
    );

});


/* =========================================
   SEARCH
========================================= */

searchInput.addEventListener(
    "input",
    () => {

        if (searchInput.value) {

            clearSearch.style.display =
                "block";

        } else {

            clearSearch.style.display =
                "none";

        }


        renderSurveys();

    }
);


/* =========================================
   CLEAR SEARCH
========================================= */

clearSearch.addEventListener(
    "click",
    () => {

        searchInput.value = "";

        clearSearch.style.display =
            "none";

        renderSurveys();

        searchInput.focus();

    }
);


/* =========================================
   QR
========================================= */

function openQR(title, url) {

    qrTitle.textContent =
        title;


    qrContainer.innerHTML =
        "";


    selectedQR = {
        title: title,
        url: url
    };


    new QRCode(
        qrContainer,
        {
            text: url,

            width: 200,

            height: 200,

            correctLevel:
                QRCode.CorrectLevel.H
        }
    );


    qrModal.classList.remove(
        "hidden"
    );


    document.body.style.overflow =
        "hidden";

}


/* =========================================
   CLOSE QR
========================================= */

function closeQR() {

    qrModal.classList.add(
        "hidden"
    );

    document.body.style.overflow =
        "";

}


modalClose.addEventListener(
    "click",
    closeQR
);


document.querySelector(
    ".modal-background"
).addEventListener(
    "click",
    closeQR
);


document.addEventListener(
    "keydown",
    event => {

        if (event.key === "Escape") {
            closeQR();
        }

    }
);


/* =========================================
   DOWNLOAD QR
========================================= */

downloadQR.addEventListener(
    "click",
    () => {

        if (!selectedQR) {
            return;
        }


        const canvas =
            qrContainer.querySelector(
                "canvas"
            );


        if (!canvas) {
            return;
        }


        const link =
            document.createElement("a");


        link.download =
            `${selectedQR.title}-QR.png`;


        link.href =
            canvas.toDataURL(
                "image/png"
            );


        link.click();

    }
);


/* =========================================
   SECURITY
========================================= */

function escapeHTML(value) {

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


function escapeJS(value) {

    return String(value)

        .replaceAll(
            "\\",
            "\\\\"
        )

        .replaceAll(
            "'",
            "\\'"
        )

        .replaceAll(
            "\n",
            "\\n"
        )

        .replaceAll(
            "\r",
            "\\r"
        );

}


/* =========================================
   START
========================================= */

loadSurveys();
