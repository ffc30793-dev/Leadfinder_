// LeadFinder - Histórico de pesquisas

const HISTORY_KEY = "leadfinder_search_history";

function getSearchHistory() {
    try {
        return JSON.parse(
            localStorage.getItem(HISTORY_KEY)
        ) || [];
    } catch (error) {
        console.error(
            "Erro ao carregar histórico:",
            error
        );

        return [];
    }
}

function addSearchHistory(search) {
    const history = getSearchHistory();

    const newSearch = {
        ...search,
        id: Date.now(),
        createdAt: new Date().toISOString()
    };

    history.unshift(newSearch);

    // Mantém no máximo 50 pesquisas localmente
    const updatedHistory = history.slice(0, 50);

    localStorage.setItem(
        HISTORY_KEY,
        JSON.stringify(updatedHistory)
    );

    return newSearch;
}

function removeSearchHistory(id) {
    const history = getSearchHistory();

    const updatedHistory = history.filter(
        item => item.id !== id
    );

    localStorage.setItem(
        HISTORY_KEY,
        JSON.stringify(updatedHistory)
    );

    return updatedHistory;
}

function clearSearchHistory() {
    localStorage.removeItem(HISTORY_KEY);
}

window.LeadFinderHistory = {
    get: getSearchHistory,
    add: addSearchHistory,
    remove: removeSearchHistory,
    clear: clearSearchHistory
};
