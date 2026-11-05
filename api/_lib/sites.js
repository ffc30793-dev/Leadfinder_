// Classificação do site listado no Google e verificação leve (e segura) da página inicial.
//
// IMPORTANTE: "site não identificado" significa apenas que o Google não listou um site para o perfil.
// Isso NÃO confirma que a empresa não tenha site.

import dns from "node:dns/promises";
import net from "node:net";

const REDES_E_AGREGADORES = [
  "instagram.com", "facebook.com", "fb.com", "fb.me", "tiktok.com", "youtube.com", "youtu.be",
  "twitter.com", "x.com", "linkedin.com", "wa.me", "whatsapp.com", "linktr.ee", "beacons.ai",
  "bio.link", "lnk.bio", "taplink.cc", "campsite.bio", "ifood.com.br", "anotaai.com",
  "goomer.app", "menudino.com", "olaclick.app", "ola.click", "olaclick.com", "mercadolivre.com.br", "shopee.com.br"
];

const PLATAFORMAS_GRATUITAS = [
  "wixsite.com", "weebly.com", "blogspot.com", "wordpress.com", "godaddysites.com", "business.site",
  "site123.me", "yolasite.com", "webnode.com", "webnode.com.br", "jimdosite.com", "mystrikingly.com",
  "carrd.co", "netlify.app", "github.io", "vercel.app", "canva.site", "notion.site", "sites.google.com",
  "000webhostapp.com", "ueniweb.com", "negocio.site"
];

function hostDe(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function casa(host, lista) {
  return lista.find((d) => host === d || host.endsWith(`.${d}`)) || "";
}

/**
 * Retorna { status, host, rede }:
 *  nao_identificado | terceiros (rede social/agregador) | plataforma_gratuita | proprio
 */
export function classificarSite(url) {
  if (!url) return { status: "nao_identificado", host: "", rede: "" };
  const host = hostDe(url);
  if (!host) return { status: "nao_identificado", host: "", rede: "" };
  const rede = casa(host, REDES_E_AGREGADORES);
  if (rede) return { status: "terceiros", host, rede };
  const plat = casa(host, PLATAFORMAS_GRATUITAS);
  if (plat) return { status: "plataforma_gratuita", host, rede: plat };
  return { status: "proprio", host, rede: "" };
}

// ---------- inspeção da página inicial ----------

function ipPrivado(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 10 || a === 127 || a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") || v.startsWith("::ffff:");
  }
  return true;
}

async function hostSeguro(host, { lookup, permitirPrivado }) {
  if (permitirPrivado) return true;
  if (!host || host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return false;
  if (net.isIP(host)) return !ipPrivado(host);
  try {
    const enderecos = await lookup(host, { all: true });
    return enderecos.length > 0 && enderecos.every((e) => !ipPrivado(e.address));
  } catch {
    return false;
  }
}

const SINAIS_LOJA = [
  "carrinho", "add to cart", "adicionar ao carrinho", "comprar agora", "woocommerce", "shopify",
  "nuvemshop", "lojaintegrada", "loja integrada", "tray.com.br", "vtex", "mercadopago", "pagseguro", "checkout"
];
const SINAIS_CARDAPIO = ["cardápio", "cardapio", "menu digital", "goomer", "menudino", "anotaai", "ifood", "qr code"];

async function lerLimitado(resposta, maxBytes) {
  const leitor = resposta.body?.getReader?.();
  if (!leitor) return (await resposta.text()).slice(0, maxBytes);
  const partes = [];
  let total = 0;
  while (total < maxBytes) {
    const { done, value } = await leitor.read();
    if (done) break;
    partes.push(value);
    total += value.length;
  }
  try { await leitor.cancel(); } catch { /* ignora */ }
  return Buffer.concat(partes.map((p) => Buffer.from(p))).toString("utf8").slice(0, maxBytes);
}

/**
 * Baixa a página inicial (com limites de tempo, tamanho e redirecionamentos) e extrai sinais verificáveis.
 * Nunca lança: em caso de falha devolve { ok:false, erro }.
 */
export async function inspecionarSite(url, opcoes = {}) {
  const {
    fetch: f = globalThis.fetch,
    lookup = dns.lookup,
    timeoutMs = 3500,
    maxBytes = 300_000,
    permitirPrivado = false,
    agora = new Date()
  } = opcoes;

  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), timeoutMs);

  try {
    let atual = new URL(url);
    const https0 = atual.protocol === "https:";
    let resposta = null;

    for (let salto = 0; salto <= 3; salto++) {
      if (!["http:", "https:"].includes(atual.protocol)) return { ok: false, erro: "protocolo" };
      if (!(await hostSeguro(atual.hostname.toLowerCase(), { lookup, permitirPrivado }))) return { ok: false, erro: "host_bloqueado" };

      resposta = await f(atual.toString(), {
        redirect: "manual",
        signal: controle.signal,
        headers: { "User-Agent": "LeadFinderBot/1.0 (+verificacao-de-site)", Accept: "text/html" }
      });
      if (resposta.status >= 300 && resposta.status < 400 && resposta.headers.get("location")) {
        atual = new URL(resposta.headers.get("location"), atual);
        continue;
      }
      break;
    }

    if (resposta.status >= 300 && resposta.status < 400) return { ok: false, erro: "redirecionamentos" };

    const status = resposta.status;
    if (status >= 400) return { ok: true, status, httpsFinal: atual.protocol === "https:", fora: true };

    const tipo = String(resposta.headers.get("content-type") || "");
    if (tipo && !/html|xml|text/i.test(tipo)) return { ok: false, erro: "nao_html" };

    const html = (await lerLimitado(resposta, maxBytes)).toLowerCase();

    const anos = [...html.matchAll(/(?:©|&copy;|copyright)[^0-9<]{0,25}((?:19|20)\d{2})(?:\s*[-–]\s*((?:19|20)\d{2}))?/g)]
      .flatMap((m) => [Number(m[1]), m[2] ? Number(m[2]) : 0])
      .filter((n) => n >= 1990 && n <= agora.getFullYear() + 1);

    return {
      ok: true,
      status,
      httpsFinal: atual.protocol === "https:",
      httpsInformado: https0,
      viewport: /<meta[^>]+name=["']viewport["']/.test(html),
      anoCopyright: anos.length ? Math.max(...anos) : null,
      tecnologiaAntiga: /<frameset|<marquee|application\/x-shockwave-flash|\.swf["']/.test(html),
      sinaisLoja: SINAIS_LOJA.filter((k) => html.includes(k)),
      sinaisCardapio: SINAIS_CARDAPIO.filter((k) => html.includes(k))
    };
  } catch (e) {
    return { ok: false, erro: e?.name === "AbortError" ? "tempo_esgotado" : "falha_de_rede" };
  } finally {
    clearTimeout(timer);
  }
}

/** Inspeciona vários sites com concorrência limitada. Retorna Map(url -> resultado). */
export async function inspecionarVarios(urls, opcoes = {}, concorrencia = 5) {
  const resultado = new Map();
  const fila = [...new Set(urls)];
  const trabalhadores = Array.from({ length: Math.min(concorrencia, fila.length) }, async () => {
    while (fila.length) {
      const url = fila.shift();
      resultado.set(url, await inspecionarSite(url, opcoes));
    }
  });
  await Promise.all(trabalhadores);
  return resultado;
}
