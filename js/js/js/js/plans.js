// LeadFinder - plans.js

const LeadFinderPlans = {

    free: {
        id: "free",
        name: "Grátis",
        price: 0,
        credits: 30,
        maxLeads: 6,
        approach: "simple"
    },

    pro: {
        id: "pro",
        name: "Pro",
        price: 19.90,
        credits: 100,
        maxLeads: 15,
        approach: "advanced"
    },

    max: {
        id: "max",
        name: "Max",
        price: 30,
        credits: 300,
        maxLeads: 50,
        approach: "premium"
    }

};

// ===============================
// PLANO ATUAL
// ===============================

function getCurrentPlan() {

    const userData =
        localStorage.getItem("leadfinder_user");

    if (!userData) {
        return LeadFinderPlans.free;
    }

    try {

        const user = JSON.parse(userData);

        const planId =
            String(user.plano || "free")
                .toLowerCase()
                .replace("grátis", "free")
                .replace("grátis", "free");

        if (planId.includes("max")) {
            return LeadFinderPlans.max;
        }

        if (planId.includes("pro")) {
            return LeadFinderPlans.pro;
        }

        return LeadFinderPlans.free;

    } catch (error) {

        console.error(
            "Erro ao carregar plano:",
            error
        );

        return LeadFinderPlans.free;
    }
}

// ===============================
// VERIFICAR PLANO
// ===============================

function hasPlan(planId) {

    const currentPlan =
        getCurrentPlan();

    return currentPlan.id === planId;
}

// ===============================
// ATUALIZAR PLANO
// ===============================

function setCurrentPlan(planId) {

    const plan =
        LeadFinderPlans[planId];

    if (!plan) {
        console.error("Plano inválido.");
        return false;
    }

    const userData =
        localStorage.getItem("leadfinder_user");

    if (!userData) {
        return false;
    }

    try {

        const user =
            JSON.parse(userData);

        user.plano = plan.name;

        localStorage.setItem(
            "leadfinder_user",
            JSON.stringify(user)
        );

        updatePlanUI();

        return true;

    } catch (error) {

        console.error(
            "Erro ao atualizar plano:",
            error
        );

        return false;
    }
}

// ===============================
// ATUALIZAR INTERFACE
// ===============================

function updatePlanUI() {

    const plan =
        getCurrentPlan();

    document
        .querySelectorAll("[data-plan]")
        .forEach(element => {
            element.textContent = plan.name;
        });

    document
        .querySelectorAll("[data-plan-credits]")
        .forEach(element => {
            element.textContent = plan.credits;
        });

    document
        .querySelectorAll("[data-plan-limit]")
        .forEach(element => {
            element.textContent = plan.maxLeads;
        });
}

// ===============================
// BOTÕES DOS PLANOS
// ===============================

function setupPlanButtons() {

    document
        .querySelectorAll("[data-select-plan]")
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    const planId =
                        button.dataset.selectPlan;

                    if (!planId) return;

                    if (
                        planId === "free"
                    ) {
                        setCurrentPlan("free");
                        return;
                    }

                    /*
                     * Futuramente aqui entra o
                     * checkout da Cakto.
                     *
                     * O plano NÃO deve ser liberado
                     * apenas pelo clique.
                     */

                    const checkout =
                        button.dataset.checkout;

                    if (checkout) {
                        window.location.href =
                            checkout;
                    } else {
                        alert(
                            "Checkout deste plano ainda não configurado."
                        );
                    }

                }
            );

        });
}

// ===============================
// INICIALIZAÇÃO
// ===============================

document.addEventListener(
    "DOMContentLoaded",
    () => {

        updatePlanUI();
        setupPlanButtons();

    }
);

// ===============================
// API
// ===============================

window.LeadFinderPlans = {

    all: LeadFinderPlans,

    current: getCurrentPlan,

    has: hasPlan,

    set: setCurrentPlan

};
