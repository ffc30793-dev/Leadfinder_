// Relevância dos resultados do Google Places.
// O Text Search completa a lista com lugares sem relação (Correios, prefeitura...) quando a cidade
// tem poucos negócios do segmento. Aqui eles são barrados antes de aparecerem para o usuário.

import { SEGMENTOS, normalizar } from "../../shared/catalog.js";

// Tipos do Google que nunca são cliente em potencial.
const TIPOS_PUBLICOS = new Set([
  "local_government_office", "government_office", "city_hall", "courthouse", "post_office", "police",
  "fire_station", "embassy", "school", "primary_school", "secondary_school", "university", "library",
  "church", "place_of_worship", "cemetery", "funeral_home", "bank", "atm"
]);

// Nomes de órgãos públicos e instituições (comparados sem acento, em minúsculas).
const NOMES_PUBLICOS = /\b(correios|prefeitura|camara municipal|camara de vereadores|secretaria|delegacia|policia|cartorio|forum|detran|inss|receita federal|tribunal|fundacao|igreja|paroquia|capela|congregacao|escola|colegio|creche|ubs|posto de saude|unidade basica|caixa economica|banco do brasil|bradesco|sicoob|sicredi|cemiterio)\b/;

const DOMINIOS_PUBLICOS = /\.(gov|leg|jus|mp|mil)\.br$/;

function hostDe(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function tiposDo(place) {
  const lista = Array.isArray(place?.types) ? place.types : [];
  return place?.primaryType ? [place.primaryType, ...lista] : lista;
}

/** Órgão público, igreja, escola, banco... (não é o tipo de cliente que o LeadFinder procura). */
export function ehEntidadePublica(place) {
  if (DOMINIOS_PUBLICOS.test(hostDe(place?.websiteUri))) return true;
  if (tiposDo(place).some((t) => TIPOS_PUBLICOS.has(t))) return true;
  const nome = normalizar(place?.displayName?.text);
  return NOMES_PUBLICOS.test(nome);
}

/** Segmentos que a busca realmente procura (o escolhido ou os padrão do serviço). */
export function segmentosAlvo({ segmento, termosLivres, servico }) {
  if (termosLivres) return null; // texto livre: sem lista de tipos, só o bloqueio de entidades públicas
  if (segmento) return [segmento];
  const ids = servico?.segmentosPadrao || [];
  const lista = SEGMENTOS.filter((s) => ids.includes(s.id));
  return lista.length ? lista : null;
}

/** O lugar combina com algum dos segmentos? (tipo do Google OU palavra no nome/categoria) */
export function combinaComSegmento(place, segmentos) {
  if (!segmentos) return true;
  const tipos = new Set(tiposDo(place));
  const texto = normalizar(`${place?.displayName?.text || ""} ${place?.primaryTypeDisplayName?.text || ""}`);
  return segmentos.some((s) => {
    if ((s.tipos || []).some((t) => tipos.has(t))) return true;
    return (s.palavras || []).some((p) => texto.includes(normalizar(p)));
  });
}
