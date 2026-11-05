// Cartão de empresa (usado na busca e em Meus leads) e ações comuns.
import { esc, icon, urlSegura, copiar, toast } from "./ui.js";

export const SERVICOS_NOME = {
  "criacao-sites": "Criação de sites", "redesign-sites": "Redesign de sites", "cardapios-catalogos": "Cardápios e catálogos",
  "design-grafico": "Design gráfico", "redes-sociais": "Redes sociais", "edicao-imagens": "Edição de imagens",
  "landing-pages": "Landing pages", "lojas-virtuais": "Lojas virtuais"
};

export const textoContato = (l) =>
  [l.nome, l.categoria, l.endereco, l.telefone ? `Tel.: ${l.telefone}` : "", l.site ? `Site: ${l.site}` : "", l.mapa ? `Mapa: ${l.mapa}` : ""]
    .filter(Boolean).join("\n");

export function linhasInfo(l) {
  const out = [];
  if (l.endereco) out.push(`<div>${icon("pin")}<span>${esc(l.endereco)}</span></div>`);
  if (l.telefone) {
    const t = l.telefoneTipo === "fixo" ? " (fixo)" : l.telefoneTipo === "incerto" ? " (tipo incerto)" : "";
    out.push(`<div>${icon("phone")}<span>${esc(l.telefone)}${t}</span></div>`);
  } else out.push(`<div>${icon("phone")}<span class="muted">Telefone não informado</span></div>`);
  const s = urlSegura(l.site);
  const rotulo = l.siteRotulo || ({ nao_identificado: "Site não identificado", terceiros: "Apenas rede social/terceiros", plataforma_gratuita: "Site em plataforma gratuita", proprio: "Site próprio" }[l.siteStatus] || (l.site ? "Site" : "Site não identificado"));
  out.push(`<div>${icon("globe")}<span>${esc(rotulo)}${s ? ` — <a href="${esc(s)}" target="_blank" rel="noopener noreferrer">${esc(l.siteHost || s)}</a>` : ""}</span></div>`);
  if (typeof l.nota === "number") out.push(`<div>${icon("star")}<span>${esc(l.nota.toFixed(1))} (${esc(l.avaliacoes || 0)} avaliações no Google)</span></div>`);
  return out.join("");
}

export function botoesContato(l, idx) {
  const wa = l.whatsapp && urlSegura(l.whatsapp) ? `<a class="btn btn-wa btn-sm" href="${esc(urlSegura(l.whatsapp))}" target="_blank" rel="noopener noreferrer">${icon("whatsapp")} WhatsApp</a>` : "";
  const site = urlSegura(l.site) ? `<a class="btn btn-sm" href="${esc(urlSegura(l.site))}" target="_blank" rel="noopener noreferrer">${icon("globe")} Abrir site</a>` : "";
  const mapa = urlSegura(l.mapa) ? `<a class="btn btn-sm" href="${esc(urlSegura(l.mapa))}" target="_blank" rel="noopener noreferrer">${icon("pin")} Localização</a>` : "";
  return `${wa}<button class="btn btn-sm" type="button" data-copiar="${idx}">${icon("copy")} Copiar contato</button>${site}${mapa}`;
}

export async function acaoCopiar(l) {
  (await copiar(textoContato(l))) ? toast("Contato copiado.") : toast("Não foi possível copiar automaticamente.", "err");
}

/** Leva os dados da empresa para o Gerador de conteúdo. */
export function prepararGerador(l, servico) {
  sessionStorage.setItem("lf_prefill_gerador", JSON.stringify({
    servico: servico || l.servico || l.oportunidade?.servico || "criacao-sites",
    nome: l.nome || "", categoria: l.categoria || "", cidade: l.cidade || "", uf: l.uf || "",
    endereco: l.endereco || "", telefone: l.telefone || "", site: l.site || ""
  }));
  location.hash = "#/gerador";
}
