// LeadFinder - Cidades do Brasil

const LeadFinderCities = {

    cache: {},

    async getByState(uf) {

        if (!uf) return [];

        const state = uf.toUpperCase();

        // Usa dados já carregados
        if (this.cache[state]) {
            return this.cache[state];
        }

        try {

            const response = await fetch(
                `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${state}/municipios`
            );

            if (!response.ok) {
                throw new Error(
                    "Erro ao carregar cidades."
                );
            }

            const data = await response.json();

            const cities = data
                .map(city => ({
                    id: city.id,
                    name: city.nome
                }))
                .sort((a, b) =>
                    a.name.localeCompare(
                        b.name,
                        "pt-BR"
                    )
                );

            this.cache[state] = cities;

            return cities;

        } catch (error) {

            console.error(
                "Erro ao buscar cidades:",
                error
            );

            return [];
        }
    },

    clearCache() {
        this.cache = {};
    }

};

// Disponibiliza para o sistema
window.LeadFinderCities = LeadFinderCities;
