// LeadFinder - app.js

document.addEventListener("DOMContentLoaded", () => {
    initApp();
});

function initApp() {
    console.log("LeadFinder iniciado.");

    setupNavigation();
    setupLogout();
    setupMobileMenu();
    loadUserData();
}

// ===============================
// NAVEGAÇÃO
// ===============================

function setupNavigation() {
    document.querySelectorAll("[data-page]").forEach(button => {
        button.addEventListener("click", () => {
            const page = button.dataset.page;

            if (page) {
                window.location.href = page;
            }
        });
    });
}

// ===============================
// LOGOUT
// ===============================

function setupLogout() {
    const logoutButtons = document.querySelectorAll(
        "#logout, .logout-btn, [data-logout]"
    );

    logoutButtons.forEach(button => {
        button.addEventListener("click", () => {
            localStorage.removeItem("leadfinder_user");
            localStorage.removeItem("leadfinder_logged");
            localStorage.removeItem("leadfinder_credits");

            window.location.href = "login.html";
        });
    });
}

// ===============================
// MENU MOBILE
// ===============================

function setupMobileMenu() {
    const menuButton = document.querySelector(
        "#menuButton, .menu-button, [data-menu]"
    );

    const menu = document.querySelector(
        "#mobileMenu, .mobile-menu"
    );

    if (!menuButton || !menu) return;

    menuButton.addEventListener("click", () => {
        menu.classList.toggle("active");
    });
}

// ===============================
// DADOS DO USUÁRIO
// ===============================

function loadUserData() {
    const userData = localStorage.getItem("leadfinder_user");

    if (!userData) return;

    try {
        const user = JSON.parse(userData);

        document.querySelectorAll("[data-user-name]").forEach(element => {
            element.textContent = user.nome || user.name || "Usuário";
        });

        document.querySelectorAll("[data-user-email]").forEach(element => {
            element.textContent = user.email || "";
        });

    } catch (error) {
        console.error("Erro ao carregar usuário:", error);
    }
}

// ===============================
// REDIRECIONAMENTO PARA LOGIN
// ===============================

function requireLogin() {
    const logged = localStorage.getItem("leadfinder_logged");

    if (logged !== "true") {
        window.location.href = "login.html";
        return false;
    }

    return true;
}

// ===============================
// CRÉDITOS
// ===============================

function getCredits() {
    const credits = localStorage.getItem("leadfinder_credits");

    if (credits === null) {
        localStorage.setItem("leadfinder_credits", "30");
        return 30;
    }

    return Number(credits);
}

function setCredits(value) {
    localStorage.setItem(
        "leadfinder_credits",
        String(Math.max(0, value))
    );

    updateCreditsUI();
}

function useCredit() {
    const credits = getCredits();

    if (credits <= 0) {
        alert("Você não possui créditos suficientes.");
        return false;
    }

    setCredits(credits - 1);
    return true;
}

function updateCreditsUI() {
    const credits = getCredits();

    document.querySelectorAll("[data-credits]").forEach(element => {
        element.textContent = credits;
    });
}

// Disponibiliza as funções para outros arquivos
window.LeadFinder = {
    requireLogin,
    getCredits,
    setCredits,
    useCredit,
    updateCreditsUI
};
