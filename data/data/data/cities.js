// LeadFinder - Cidades do Brasil
// A lista completa de cidades será carregada pela API de municípios.
// Este arquivo mantém a estrutura pronta para o filtro do sistema.

const LeadFinderCities = {

    cache: {},

    async getByState(uf) {

        if (!uf) {
            return [];
        }

        const state = uf.toUpperCase();

        // Usa o cache quando já carregamos esse estado
        if (this.cache[state]) {
            return this.cache[state];
        }

        try {

            const response = await fetch(
                `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${state}/municipios`
            );

            if (!response.ok) {
                throw new Error(
                    "Não foi possível carregar as cidades."
                );
            }

            const data = await response.json();

            const cities = data.map(city => ({
                id: city.id,
                name: city.nome
            }));

            // Salva no cache
            this.cache[state] = cities;

            return cities;

        } catch (error) {

            console.error(
                "Erro ao carregar cidades:",
                error
            );

            return [];
        }
    },

    clearCache() {
        this.cache = {};
    }

};

// Disponibiliza para o restante do LeadFinder
window.LeadFinderCities = LeadFinderCities;
