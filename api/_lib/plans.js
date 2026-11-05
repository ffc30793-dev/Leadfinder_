// Planos e limites — FONTE ÚNICA DE VERDADE (servidor).
// Valores e limites vieram do código existente do projeto (painel.html / js/app.js / backend/app-config.js).
// O navegador apenas exibe o que o servidor informa em /api/account; nunca decide limites.

export const PLANOS = {
  FREE: {
    id: "FREE",
    nome: "Grátis",
    preco: 0,
    limiteDiario: 5,
    // Máximo de empresas exibidas por pesquisa. Cada nova pesquisa traz empresas que ainda não apareceram.
    maxResultados: 5,
    recursos: ["5 pesquisas por dia", "5 empresas por pesquisa", "Abordagem básica"]
  },
  PRO: {
    id: "PRO",
    nome: "Pro",
    preco: 19.9,
    limiteDiario: 25,
    maxResultados: 15,
    recursos: ["25 pesquisas por dia", "15 empresas por pesquisa", "Organização de leads"]
  },
  MAX: {
    id: "MAX",
    nome: "Business",
    preco: 30,
    limiteDiario: 100,
    maxResultados: 50,
    recursos: ["100 pesquisas por dia", "50 empresas por pesquisa", "Recursos avançados"]
  }
};

// Variáveis de ambiente com os links de checkout (nomes já sugeridos em backend/README.md).
export const CHECKOUT_ENV = { PRO: "CAKTO_PRO_CHECKOUT", MAX: "CAKTO_MAX_CHECKOUT" };

// "Carregar mais resultados" chama o Google de novo, então consome pesquisas.
export const CUSTO_PESQUISA = 1;
export const CUSTO_CONTINUACAO = 1;

// Duração de um ciclo pago e tolerância para atraso de renovação (dias).
export const CICLO_DIAS = 30;
export const TOLERANCIA_DIAS = 2;

export function planoValido(id) {
  return Object.prototype.hasOwnProperty.call(PLANOS, id) ? id : "FREE";
}

/** Dados públicos dos planos (sem segredos). Links de checkout só aparecem se configurados. */
export function planosPublicos(env = {}) {
  return Object.values(PLANOS).map((p) => ({
    id: p.id,
    nome: p.nome,
    preco: p.preco,
    limiteDiario: p.limiteDiario,
    maxResultados: p.maxResultados,
    recursos: p.recursos,
    checkoutUrl: CHECKOUT_ENV[p.id] ? urlHttpsOuVazio(env[CHECKOUT_ENV[p.id]]) : ""
  }));
}

function urlHttpsOuVazio(valor) {
  try {
    const u = new URL(String(valor || "").trim());
    return u.protocol === "https:" ? u.toString() : "";
  } catch {
    return "";
  }
}
