// Google Places API (New) — Text Search.
// Respeita limites e autenticação da API: nada de contornar cotas. Cada requisição é cobrada pelo Google,
// por isso há um teto de requisições por pesquisa e uma lista mínima de campos.

import { normalizar } from "../../shared/catalog.js";

export const URL_PLACES = "https://places.googleapis.com/v1/places:searchText";

// Campos mínimos necessários à interface. (telefone/site/avaliações estão no nível "Enterprise" do Google.)
export const CAMPOS = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.nationalPhoneNumber",
  "places.websiteUri",
  "places.googleMapsUri",
  "places.businessStatus",
  "places.primaryTypeDisplayName",
  "places.rating",
  "places.userRatingCount",
  "places.photos",
  "places.types",
  "places.primaryType",
  "nextPageToken"
].join(",");

export class ErroPlaces extends Error {
  constructor(mensagem, codigo, status) {
    super(mensagem);
    this.codigo = codigo; // google_config | google_limite | google_indisponivel
    this.status = status;
  }
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// Cache curtíssimo em memória (por instância) só para absorver cliques repetidos.
// Conteúdo do Google NÃO é gravado em disco nem em banco (restrições de armazenamento dos termos do Google).
const cacheCurto = new Map();
const TTL_CACHE_MS = 60_000;

async function requisitar(fetchFn, chave, corpo, { timeoutMs, tentativas = 2 }) {
  const chaveCache = JSON.stringify(corpo);
  const guardado = cacheCurto.get(chaveCache);
  if (guardado && guardado.expira > Date.now()) return guardado.dados;

  let ultimoErro;
  for (let i = 0; i < tentativas; i++) {
    const controle = new AbortController();
    const timer = setTimeout(() => controle.abort(), timeoutMs);
    try {
      const resp = await fetchFn(URL_PLACES, {
        method: "POST",
        signal: controle.signal,
        headers: { "Content-Type": "application/json", "X-Goog-Api-Key": chave, "X-Goog-FieldMask": CAMPOS },
        body: JSON.stringify(corpo)
      });
      const dados = await resp.json().catch(() => ({}));

      if (resp.ok) {
        cacheCurto.set(chaveCache, { dados, expira: Date.now() + TTL_CACHE_MS });
        if (cacheCurto.size > 200) cacheCurto.delete(cacheCurto.keys().next().value);
        return dados;
      }
      if (resp.status === 429) throw new ErroPlaces("Limite de consultas do Google atingido. Tente novamente em instantes.", "google_limite", 429);
      if (resp.status === 400 || resp.status === 401 || resp.status === 403) {
        console.error("Places config/permite:", resp.status, dados?.error?.status);
        throw new ErroPlaces("A busca no Google não está autorizada. Confira a chave e se a Places API (New) está ativada.", "google_config", resp.status);
      }
      ultimoErro = new ErroPlaces("O Google Places está instável no momento.", "google_indisponivel", resp.status);
    } catch (e) {
      if (e instanceof ErroPlaces && e.codigo !== "google_indisponivel") throw e;
      ultimoErro = e instanceof ErroPlaces ? e : new ErroPlaces(e?.name === "AbortError" ? "O Google demorou demais para responder." : "Falha de rede ao consultar o Google.", "google_indisponivel", 0);
    } finally {
      clearTimeout(timer);
    }
    if (i < tentativas - 1) await esperar(350);
  }
  throw ultimoErro;
}

/**
 * Executa as consultas em rodízio (uma página de cada vez) até atingir `alvo` empresas aceitas,
 * esgotar as páginas ou bater no teto de requisições.
 *
 * estados: [{ q, token }]  token: undefined = 1ª página | string = próxima página | null = esgotada
 * aceitar(place) -> boolean (cidade correta, não repetida, em funcionamento...) e conta para o alvo.
 */
export async function buscarEmRodizio({ fetch: fetchFn, chave, estados, aceitar, alvo, maxRequisicoes, timeoutMs = 9000 }) {
  const lugares = [];
  const avisos = [];
  let requisicoes = 0;
  let aceitos = 0;
  let falhaParcial = false;
  let primeiraPagina = true;

  let i = 0;
  while (requisicoes < maxRequisicoes && aceitos < alvo) {
    const ativos = estados.filter((e) => e.token !== null);
    if (!ativos.length) break;
    const est = ativos[i % ativos.length];
    i++;

    const corpo = {
      textQuery: est.q,
      languageCode: "pt-BR",
      regionCode: "BR",
      pageSize: 20,
      ...(est.token ? { pageToken: est.token } : {})
    };

    try {
      const dados = await requisitar(fetchFn, chave, corpo, { timeoutMs });
      requisicoes++;
      for (const p of dados.places || []) {
        lugares.push(p);
        if (aceitar(p)) aceitos++;
      }
      est.token = dados.nextPageToken || null;
    } catch (e) {
      // Falha na primeira requisição = a busca falhou. Depois disso, devolve o que já temos (parcial).
      if (primeiraPagina) throw e;
      falhaParcial = true;
      avisos.push(e.codigo === "google_limite"
        ? "O Google limitou as consultas; os resultados abaixo são parciais."
        : "Uma das consultas ao Google falhou; os resultados abaixo são parciais.");
      est.token = null;
      if (e.codigo === "google_limite") break;
    }
    primeiraPagina = false;
  }

  const restam = estados.some((e) => e.token !== null);
  return { lugares, avisos, requisicoes, falhaParcial, restam, estados };
}

// ---------- filtros de aceitação ----------

// Compara nomes ignorando acento, hífen, apóstrofo e espaços repetidos ("Mogi-Mirim" = "Mogi Mirim").
export const limpar = (t) => normalizar(t).replace(/[^a-z0-9]+/g, " ").trim();

/** O endereço retornado pertence à cidade/UF pedida? (Text Search às vezes devolve cidades vizinhas.) */
export function enderecoDaCidade(endereco, cidade, uf) {
  const alvo = normalizar(endereco);
  if (!alvo) return false;
  if (uf === "DF") return /\bdf\b|brasilia|distrito federal/.test(alvo);
  const cidadeOk = ` ${limpar(endereco)} `.includes(` ${limpar(cidade)} `);
  const ufOk = new RegExp(`(^|[^a-z])${uf.toLowerCase()}([^a-z]|$)`).test(alvo);
  return cidadeOk && ufOk;
}

export function limparCacheCurto() {
  cacheCurto.clear();
}

/** Extrai a cidade de um endereço do Google ("..., Altos - PI, 64290-000, Brasil" -> "Altos"). */
export function cidadeDoEndereco(endereco, uf) {
  const m = new RegExp(`,\\s*([^,]+?)\\s+-\\s+${uf}\\b`, "i").exec(String(endereco || ""));
  return m ? m[1].trim() : "";
}
