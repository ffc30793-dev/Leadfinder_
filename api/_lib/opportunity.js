// Avaliação de oportunidades por serviço + temperatura (quente / morno / frio).
//
// Princípios:
//  - Só usa dados realmente retornados pelo Google Places (e, em redesign/loja virtual, sinais
//    verificados na página inicial do site).
//  - Quando a necessidade não pode ser confirmada, o rótulo é "Oportunidade possível — verificar".
//  - Nunca inventa métricas (seguidores, vendas, qualidade de fotos etc.).

import { classificarSite } from "./sites.js";
import { normalizarTelefoneBR, linkWhatsApp, statusWhatsApp } from "../../shared/phone.js";

export const ROTULO_POSSIVEL = "Oportunidade possível — verificar";

const ROTULOS_SITE = {
  nao_identificado: "Site não identificado",
  terceiros: "Apenas rede social ou plataforma de terceiros",
  plataforma_gratuita: "Site em plataforma gratuita",
  proprio: "Site próprio"
};

// ---------- pontuação da temperatura (explícita e verificável) ----------
// Total = oportunidade (0–50) + contato (0–30) + atividade (0–20)
export const LIMITES_TEMPERATURA = { quente: 75, morno: 45 };

function pontosOportunidade(nivel) {
  return nivel === "provavel" ? 50 : nivel === "possivel" ? 30 : 8;
}

function pontosContato(whatsapp, tipoTelefone) {
  if (whatsapp === "disponivel") return 30;
  if (tipoTelefone === "fixo" || tipoTelefone === "incerto") return 15;
  return 0;
}

function pontosAtividade(avaliacoes) {
  if (avaliacoes >= 20) return 20;
  if (avaliacoes >= 5) return 12;
  if (avaliacoes >= 1) return 6;
  return 0;
}

export function calcularTemperatura({ opp, whatsapp, tipoTelefone, avaliacoes }) {
  const a = pontosOportunidade(opp.nivel);
  const c = pontosContato(whatsapp, tipoTelefone);
  const t = pontosAtividade(avaliacoes);
  const pontos = a + c + t;
  const nivel = pontos >= LIMITES_TEMPERATURA.quente ? "quente" : pontos >= LIMITES_TEMPERATURA.morno ? "morno" : "frio";
  return {
    nivel,
    pontos,
    preliminar: opp.confianca !== "alta",
    criterios: [
      { rotulo: `Oportunidade ${opp.nivel === "provavel" ? "provável" : opp.nivel === "possivel" ? "possível" : "baixa"}`, pontos: a, maximo: 50 },
      { rotulo: whatsapp === "disponivel" ? "Celular com WhatsApp possível" : tipoTelefone === "fixo" || tipoTelefone === "incerto" ? "Telefone fixo/incerto" : "Sem telefone utilizável", pontos: c, maximo: 30 },
      { rotulo: avaliacoes > 0 ? `${avaliacoes} avaliações no Google` : "Sem avaliações no Google", pontos: t, maximo: 20 }
    ]
  };
}

// ---------- avaliação por serviço ----------

function opp(nivel, rotulo, motivos, confianca) {
  return { nivel, rotulo, motivos, confianca };
}

function poucasFotos(fotos) {
  return Number.isFinite(fotos) && fotos < 3;
}

/**
 * ctx: { servico, grupo, site: {status,host,rede}, fotos, avaliacoes, inspecao? }
 * Devolve { nivel: provavel|possivel|baixa, rotulo, motivos[], confianca: alta|media|baixa }
 */
export function avaliarServico(ctx) {
  const { servico, grupo, site, fotos, avaliacoes, inspecao } = ctx;
  const semSiteProprio = site.status === "nao_identificado" || site.status === "terceiros";
  const aviso = "O Google não lista site próprio; isso não confirma que a empresa não tenha um.";

  switch (servico) {
    case "criacao-sites": {
      if (site.status === "nao_identificado") {
        return opp("provavel", "Site próprio não identificado", [aviso], "media");
      }
      if (site.status === "terceiros") {
        return opp("provavel", "Só rede social/plataforma de terceiros", [`O link listado no Google leva a ${site.rede} (não é site próprio).`], "media");
      }
      if (site.status === "plataforma_gratuita") {
        return opp("possivel", ROTULO_POSSIVEL, [`Site hospedado em plataforma gratuita (${site.rede}); pode valer um domínio e site próprios.`], "media");
      }
      return opp("baixa", "Já tem site próprio", [`Site próprio identificado (${site.host}).`], "alta");
    }

    case "redesign-sites": {
      if (site.status === "nao_identificado" || site.status === "terceiros") {
        return opp("baixa", "Sem site próprio para redesenhar", [aviso], "media");
      }
      const problemas = [];
      if (inspecao?.ok) {
        if (inspecao.fora) problemas.push(`A página inicial respondeu com erro HTTP ${inspecao.status}.`);
        if (inspecao.httpsFinal === false) problemas.push("O site abre sem HTTPS.");
        if (inspecao.viewport === false) problemas.push("A página não declara viewport (sinal de que pode não ser adaptada a celulares).");
        if (inspecao.anoCopyright && inspecao.anoCopyright <= ctx.anoAtual - 4) problemas.push(`O rodapé indica copyright de ${inspecao.anoCopyright}.`);
        if (inspecao.tecnologiaAntiga) problemas.push("A página usa tecnologia antiga (frames, marquee ou Flash).");
      }
      if (site.status === "plataforma_gratuita") problemas.push(`Site em plataforma gratuita (${site.rede}).`);
      if (problemas.length) {
        return opp("provavel", "Problemas verificados no site", problemas.map((p) => `Verificado: ${p}`), inspecao?.ok ? "alta" : "media");
      }
      if (inspecao && !inspecao.ok) {
        return opp("possivel", ROTULO_POSSIVEL, ["Não foi possível analisar o site automaticamente; abra e avalie manualmente."], "baixa");
      }
      if (inspecao?.ok) return opp("baixa", "Nenhum problema verificável encontrado", ["HTTPS, viewport e rodapé sem sinais de problema na página inicial."], "media");
      return opp("possivel", ROTULO_POSSIVEL, ["Site próprio identificado, mas não analisado nesta busca; avalie manualmente."], "baixa");
    }

    case "cardapios-catalogos": {
      if (grupo && grupo !== "alimentacao") {
        return opp("baixa", "Fora do ramo alimentício", ["O segmento não é de alimentação."], "media");
      }
      if (semSiteProprio) {
        return opp("possivel", ROTULO_POSSIVEL, ["Estabelecimento do ramo alimentício sem site próprio identificado; verifique se já tem cardápio digital."], "baixa");
      }
      if (inspecao?.ok && inspecao.sinaisCardapio.length === 0) {
        return opp("possivel", ROTULO_POSSIVEL, ["Site próprio sem menção a cardápio na página inicial (verificação parcial)."], "baixa");
      }
      return opp("baixa", "Possível presença de cardápio online", ["Há site próprio ou menção a cardápio; avalie manualmente."], "baixa");
    }

    case "design-grafico": {
      const sinais = [];
      if (semSiteProprio) sinais.push("Sem site próprio identificado (identidade visual online pode estar pouco consolidada).");
      if (poucasFotos(fotos)) sinais.push(`Poucas fotos no perfil do Google (${fotos}).`);
      if (avaliacoes < 5) sinais.push("Poucas avaliações públicas (baixa presença online observável).");
      return sinais.length
        ? opp("possivel", ROTULO_POSSIVEL, sinais, "baixa")
        : opp("baixa", "Sem sinais observáveis", ["Nada nos dados públicos aponta carência de comunicação visual."], "baixa");
    }

    case "redes-sociais": {
      if (site.status === "terceiros" && /instagram|facebook|tiktok|youtube|linktr|bio/.test(site.rede)) {
        return opp("possivel", ROTULO_POSSIVEL, [`O Google lista ${site.rede} como link do negócio. Avalie manualmente a frequência e a qualidade das publicações.`], "baixa");
      }
      if (site.status === "nao_identificado") {
        return opp("possivel", ROTULO_POSSIVEL, ["Nenhum perfil social ou site listado nos dados do Google; procure o negócio no Instagram/Facebook."], "baixa");
      }
      return opp("baixa", "Presença digital já listada", ["Há site próprio ou plataforma listada; redes não foram avaliadas."], "baixa");
    }

    case "edicao-imagens": {
      const sinais = [];
      if (poucasFotos(fotos)) sinais.push(`Poucas fotos no perfil do Google (${fotos}).`);
      if (grupo === "varejo" || grupo === "alimentacao") sinais.push("Segmento que depende de fotos de produtos; avalie as imagens publicadas.");
      return sinais.length
        ? opp("possivel", ROTULO_POSSIVEL, sinais, "baixa")
        : opp("baixa", "Sem sinais observáveis", ["Segmento sem dependência clara de fotos de produtos."], "baixa");
    }

    case "landing-pages": {
      const conversao = ["saude", "servicos", "beleza", "auto"].includes(grupo);
      if (semSiteProprio && conversao) {
        return opp("possivel", ROTULO_POSSIVEL, ["Negócio que vive de contato/agendamento e sem site próprio identificado; uma página de captação pode ajudar."], "baixa");
      }
      if (conversao) {
        return opp("possivel", ROTULO_POSSIVEL, ["Já tem site, mas uma landing page de campanha específica pode ser avaliada."], "baixa");
      }
      return opp("baixa", "Menos aderente", ["Segmento com menor dependência de captação por página dedicada."], "baixa");
    }

    case "lojas-virtuais": {
      const vende = ["varejo", "alimentacao", "beleza", "saude"].includes(grupo);
      if (!vende) return opp("baixa", "Menos aderente", ["Segmento que normalmente não vende produtos online."], "baixa");
      if (semSiteProprio) {
        return opp("possivel", ROTULO_POSSIVEL, ["Comércio sem site próprio identificado; avalie se vende só por redes sociais/WhatsApp."], "baixa");
      }
      if (inspecao?.ok) {
        return inspecao.sinaisLoja.length
          ? opp("baixa", "Sinais de loja virtual", [`A página inicial menciona: ${inspecao.sinaisLoja.slice(0, 3).join(", ")}.`], "media")
          : opp("possivel", ROTULO_POSSIVEL, ["Site próprio sem sinais de loja virtual na página inicial (verificação parcial)."], "media");
      }
      return opp("possivel", ROTULO_POSSIVEL, ["Site próprio identificado; não foi verificado se possui venda online."], "baixa");
    }

    default:
      return opp("baixa", "Serviço não reconhecido", [], "baixa");
  }
}

// ---------- montagem do lead ----------

/** Converte um place do Google em lead pronto para a interface. */
export function montarLead(place, { servico, grupo, cidade, uf, agora, inspecao }) {
  const url = place.websiteUri || "";
  const site = classificarSite(url);
  const tel = normalizarTelefoneBR(place.nationalPhoneNumber || "");
  const wa = statusWhatsApp(tel);
  const fotos = Array.isArray(place.photos) ? place.photos.length : null;
  const avaliacoes = Number(place.userRatingCount || 0);

  const avaliacao = avaliarServico({
    servico, grupo, site, fotos, avaliacoes, inspecao, anoAtual: agora.getFullYear()
  });
  const temperatura = calcularTemperatura({ opp: avaliacao, whatsapp: wa, tipoTelefone: tel.tipo, avaliacoes });

  return {
    id: place.id,
    nome: place.displayName?.text || "Empresa sem nome",
    categoria: place.primaryTypeDisplayName?.text || "",
    endereco: place.formattedAddress || "",
    cidade,
    uf,
    telefone: place.nationalPhoneNumber || "",
    telefoneTipo: tel.tipo,
    whatsapp: linkWhatsApp(tel),
    whatsappStatus: wa,
    site: url,
    siteStatus: site.status,
    siteRotulo: ROTULOS_SITE[site.status],
    siteHost: site.host,
    mapa: place.googleMapsUri || "",
    nota: typeof place.rating === "number" ? place.rating : null,
    avaliacoes,
    fotos,
    statusNegocio: place.businessStatus || "",
    encontradoEm: agora.toISOString(),
    oportunidade: { servico, ...avaliacao, preliminar: avaliacao.confianca !== "alta" },
    temperatura
  };
}
