// LeadFinder - auth.js

document.addEventListener("DOMContentLoaded", () => {
    setupAuth();
});

function setupAuth() {
    setupLogin();
    setupRegister();
}

// ===============================
// LOGIN
// ===============================

function setupLogin() {
    const form = document.querySelector("#loginForm");

    if (!form) return;

    form.addEventListener("submit", (event) => {
        event.preventDefault();

        const email = document.querySelector("#email")?.value.trim();
        const password = document.querySelector("#password")?.value;

        if (!email || !password) {
            showAuthMessage("Preencha todos os campos.");
            return;
        }

        const users = getUsers();

        const user = users.find(
            item => item.email === email && item.password === password
        );

        if (!user) {
            showAuthMessage("E-mail ou senha incorretos.");
            return;
        }

        localStorage.setItem(
            "leadfinder_user",
            JSON.stringify(user)
        );

        localStorage.setItem("leadfinder_logged", "true");

        if (localStorage.getItem("leadfinder_credits") === null) {
            localStorage.setItem("leadfinder_credits", "30");
        }

        window.location.href = "dashboard.html";
    });
}

// ===============================
// CADASTRO
// ===============================

function setupRegister() {
    const form = document.querySelector("#cadastroForm");

    if (!form) return;

    form.addEventListener("submit", (event) => {
        event.preventDefault();

        const nome =
            document.querySelector("#nome")?.value.trim();

        const email =
            document.querySelector("#email")?.value.trim();

        const telefone =
            document.querySelector("#telefone")?.value.trim();

        const password =
            document.querySelector("#password")?.value;

        if (!nome || !email || !telefone || !password) {
            showAuthMessage("Preencha todos os campos.");
            return;
        }

        if (password.length < 6) {
            showAuthMessage(
                "A senha precisa ter pelo menos 6 caracteres."
            );
            return;
        }

        const users = getUsers();

        const existingUser = users.find(
            user => user.email === email
        );

        if (existingUser) {
            showAuthMessage(
                "Já existe uma conta com esse e-mail."
            );
            return;
        }

        const newUser = {
            id: Date.now(),
            nome,
            email,
            telefone,
            password,
            plano: "Grátis",
            criadoEm: new Date().toISOString()
        };

        users.push(newUser);

        localStorage.setItem(
            "leadfinder_users",
            JSON.stringify(users)
        );

        localStorage.setItem(
            "leadfinder_user",
            JSON.stringify(newUser)
        );

        localStorage.setItem("leadfinder_logged", "true");
        localStorage.setItem("leadfinder_credits", "30");

        window.location.href = "dashboard.html";
    });
}

// ===============================
// USUÁRIOS
// ===============================

function getUsers() {
    try {
        return JSON.parse(
            localStorage.getItem("leadfinder_users")
        ) || [];
    } catch (error) {
        return [];
    }
}

// ===============================
// MENSAGENS
// ===============================

function showAuthMessage(message) {
    const messageElement =
        document.querySelector(
            "#authMessage, .auth-message"
        );

    if (messageElement) {
        messageElement.textContent = message;
        messageElement.classList.add("active");
    } else {
        alert(message);
    }
}

// ===============================
// VERIFICAR LOGIN
// ===============================

function isLoggedIn() {
    return localStorage.getItem("leadfinder_logged") === "true";
}

window.LeadFinderAuth = {
    getUsers,
    isLoggedIn
};
