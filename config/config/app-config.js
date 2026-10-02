// LeadFinder - Configuração geral

const LeadFinderConfig = {
    appName: "LeadFinder",
    version: "1.0.0",

    // Créditos
    defaultCredits: 30,
    searchCost: 6,

    // Planos
    plans: {
        free: {
            name: "Grátis",
            price: 0,
            credits: 30,
            maxLeads: 6
        },

        pro: {
            name: "Pro",
            price: 19.90,
            credits: 100,
            maxLeads: 15
        },

        max: {
            name: "Max",
            price: 30,
            credits: 300,
            maxLeads: 50
        }
    },

    // API
    apiBaseUrl: "",

    // WhatsApp
    whatsappCountryCode: "55",

    // Pesquisa
    search: {
        maxResults: 50,
        timeout: 15000
    }
};

window.LeadFinderConfig = LeadFinderConfig;
