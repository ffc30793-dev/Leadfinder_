// LeadFinder - credits.js

const SEARCH_COST = 6;
const DEFAULT_CREDITS = 30;

// ===============================
// OBTER CRÉDITOS
// ===============================

function getAvailableCredits() {
    const savedCredits = localStorage.getItem(
        "leadfinder_credits"
    );

    if (savedCredits === null) {
        localStorage.setItem(
            "leadfinder_credits",
            DEFAULT_CREDITS
        );

        return DEFAULT_CREDITS;
    }

    const credits = Number(savedCredits);

    return Number.isFinite(credits) && credits >= 0
        ? credits
        : 0;
}

// ===============================
// ATUALIZAR CRÉDITOS
// ===============================

function setAvailableCredits(value) {
    const credits = Math.max(0, Number(value) || 0);

    localStorage.setItem(
        "leadfinder_credits",
        credits
    );

    updateCreditElements();

    return credits;
}

// ===============================
// VERIFICAR SE PODE PESQUISAR
// ===============================

function canSearch() {
    const credits = getAvailableCredits();

    if (credits < SEARCH_COST) {
        showCreditsWarning();
        return false;
    }

    return true;
}

// ===============================
// CONSUMIR 6 CRÉDITOS
// ===============================

function consumeSearchCredits() {
    if (!canSearch()) {
        return false;
    }

    const currentCredits = getAvailableCredits();

    const newCredits =
        currentCredits - SEARCH_COST;

    setAvailableCredits(newCredits);

    return true;
}

// ===============================
// ATUALIZAR INTERFACE
// ===============================

function updateCreditElements() {
    const credits = getAvailableCredits();

    document
        .querySelectorAll("[data-credits]")
        .forEach(element => {
            element.textContent = credits;
        });

    document
        .querySelectorAll(".credit-value")
        .forEach(element => {
            const numberElement =
                element.querySelector("[data-credits]");

            if (!numberElement) {
                element.textContent = credits;
            }
        });
}

// ===============================
// AVISO DE CRÉDITOS
// ===============================

function showCreditsWarning() {

    const message =
        "Você não possui créditos suficientes. " +
        "Cada pesquisa consome 6 créditos.";

    const warning =
        document.querySelector(
            "#creditsWarning, .credits-warning"
        );

    if (warning) {
        warning.textContent = message;
        warning.classList.add("active");
    } else {
        alert(message);
    }

    // Abre a seção de planos, quando disponível
    const plansSection =
        document.querySelector("#planos");

    if (plansSection) {
        setTimeout(() => {
            plansSection.scrollIntoView({
                behavior: "smooth",
                block: "start"
            });
        }, 500);
    }
}

// ===============================
// BOTÃO DE BUSCAR
// ===============================

function setupCreditSearch() {

    const searchButtons =
        document.querySelectorAll(
            "#searchButton, .search-button, [data-search]"
        );

    searchButtons.forEach(button => {

        button.addEventListener("click", event => {

            if (!canSearch()) {
                event.preventDefault();
                return;
            }

        });

    });
}

// ===============================
// INICIALIZAÇÃO
// ===============================

document.addEventListener(
    "DOMContentLoaded",
    () => {

        updateCreditElements();
        setupCreditSearch();

    }
);

// ===============================
// API DO LEADFINDER
// ===============================

window.LeadFinderCredits = {

    get: getAvailableCredits,

    set: setAvailableCredits,

    canSearch,

    consumeSearch: consumeSearchCredits,

    cost: SEARCH_COST

};
