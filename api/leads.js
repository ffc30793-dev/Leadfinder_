// POST /api/leads — busca de empresas (Google Places) com cota diária validada no servidor.

import { depsReais, autenticar, erro, lerCorpoJson, responder } from "./_lib/deps.js";
import { CUSTO_CONTINUACAO, CUSTO_PESQUISA, PLANOS } from "./_lib/plans.js";
import { devolverPesquisa, reservarPesquisa } from "./_lib/account.js";
import { ErroDeEntrada, criarCursor, grupoDaBusca, lerCursor, montarConsultas, validarEntrada } from "./_lib/estrategia.js";
import { buscarEmRodizio, enderecoDaCidade, ErroPlaces } from "./_lib/places.js";
import { classificarSite, inspecionarVarios } from "./_lib/sites.js";
import { montarLead } from "./_lib/opportunity.js";
import { normalizar } from "../shared/catalog.js";

const ALVO_POR_PESQUISA = 40; // empresas aceitas que encerram a busca antes do teto de requisições
const MAX_REQUISICOES = 6; // teto de chamadas ao Google por pesquisa (controle de custo)
const MAX_INSPECOES = 12; // sites analisados por pesquisa (redesign / loja virtual / cardápio)
const VALIDADE_CURSOR_MS = 30 * 60 * 1000;
const SERVICOS_QUE_INSPECIONAM = new Set(["redesign-sites", "lojas-virtuais", "cardapios-catalogos"]);

// ---------- validação do município no IBGE (falha aberta se o IBGE estiver fora do ar) ----------
const cacheMunicipios = new Map();

async function municipioExiste(fetchFn, uf, cidade) {
  try {
    if (!cacheMunicipios.has(uf)) {
      const controle = new AbortController();
      const timer = setTimeout(() => controle.abort(), 3000);
      try {
        const r = await fetchFn(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios?orderBy=nome`, { signal: controle.signal });
        if (!r.ok) return true;
        const lista = await r.json();
        cacheMunicipios.set(uf, new Set(lista.map((m) => normalizar(m.nome))));
      } finally {
        clearTimeout(timer);
      }
    }
    return cacheMunicipios.get(uf).has(normalizar(cidade));
  } catch {
    return true;
  }
}

export function criarHandlerLeads(deps) {
  return async function handler(req, res) {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return erro(res, 405, "Use POST.", "metodo");
    }

    const chavePlaces = deps.env.GOOGLE_PLACES_API_KEY || deps.env.GOOGLE_MAPS_API_KEY;
    if (!chavePlaces) {
      return erro(res, 503, "A busca ainda não foi configurada (chave do Google Places ausente).", "config");
    }

    const usuario = await autenticar(req, deps);
    if (!usuario) return erro(res, 401, "Sessão inválida. Entre novamente.", "nao_autenticado");

    let entrada;
    try {
      entrada = validarEntrada(lerCorpoJson(req));
    } catch (e) {
      if (e instanceof ErroDeEntrada || e.codigo === "json_invalido") return erro(res, 400, e.message, e.codigo);
      throw e;
    }

    if (!(await municipioExiste(deps.fetch, entrada.uf, entrada.cidade))) {
      return erro(res, 400, "Cidade não encontrada para este estado (fonte: IBGE).", "cidade_invalida");
    }

    // ---- continuação (cursor assinado) ----
    let cursor = null;
    const chaveSegmento = entrada.segmento?.id || entrada.termosLivres?.[0] || "";
    if (entrada.continuacao) {
      cursor = lerCursor(entrada.continuacao, deps.segredoCursor);
      const ok =
        cursor &&
        cursor.uid === usuario.uid &&
        cursor.uf === entrada.uf &&
        cursor.cidade === entrada.cidade &&
        cursor.servico === entrada.servico.id &&
        cursor.segmento === chaveSegmento &&
        cursor.exp > deps.now().getTime();
      if (!ok) return erro(res, 400, "Esta continuação expirou. Faça uma nova pesquisa.", "continuacao_invalida");
    }

    // ---- cota (transação no servidor) ----
    const agora = deps.now();
    const custo = cursor ? CUSTO_CONTINUACAO : CUSTO_PESQUISA;
    const reserva = await reservarPesquisa(deps.db, usuario.uid, { custo, agora });
    if (!reserva.ok) {
      return responder(res, 429, {
        sucesso: false,
        codigo: "limite_diario",
        erro: `Você já usou suas ${reserva.limite} pesquisas de hoje. O limite renova à meia-noite (horário de Brasília).`,
        uso: { limite: reserva.limite, usadas: reserva.usadas, disponiveis: reserva.restantes }
      });
    }

    try {
      const plano = PLANOS[reserva.plano];
      const estados = cursor ? cursor.estados : montarConsultas(entrada).map((q) => ({ q }));
      const excluidos = new Set(entrada.excluir);
      const aceitos = new Map();
      const descartados = { foraDaCidade: 0, fechadas: 0, duplicadas: 0, semSiteParaRedesign: 0 };

      const aceitar = (p) => {
        if (!p?.id) return false;
        if (excluidos.has(p.id) || aceitos.has(p.id)) { descartados.duplicadas++; return false; }
        if (p.businessStatus && p.businessStatus !== "OPERATIONAL") { descartados.fechadas++; return false; }
        if (!enderecoDaCidade(p.formattedAddress, entrada.cidade, entrada.uf)) { descartados.foraDaCidade++; return false; }
        aceitos.set(p.id, p);
        return true;
      };

      const busca = await buscarEmRodizio({
        fetch: deps.fetch,
        chave: chavePlaces,
        estados,
        aceitar,
        alvo: ALVO_POR_PESQUISA,
        maxRequisicoes: MAX_REQUISICOES
      });

      let candidatos = [...aceitos.values()];

      // Redesign só faz sentido para quem tem algum site para avaliar.
      if (entrada.servico.exigeSite) {
        const antes = candidatos.length;
        candidatos = candidatos.filter((p) => ["proprio", "plataforma_gratuita"].includes(classificarSite(p.websiteUri).status));
        descartados.semSiteParaRedesign = antes - candidatos.length;
      }

      // Análise real dos sites (limitada) para os serviços que dependem do conteúdo da página.
      let inspecoes = new Map();
      let analisados = 0;
      if (SERVICOS_QUE_INSPECIONAM.has(entrada.servico.id)) {
        const urls = candidatos
          .map((p) => p.websiteUri)
          .filter((u) => u && ["proprio", "plataforma_gratuita"].includes(classificarSite(u).status))
          .slice(0, MAX_INSPECOES);
        inspecoes = await inspecionarVarios(urls, { fetch: deps.fetch, agora }, 5);
        analisados = urls.length;
      }

      const grupo = grupoDaBusca(entrada);
      let empresas = candidatos.map((p) =>
        montarLead(p, { servico: entrada.servico.id, grupo, cidade: entrada.cidade, uf: entrada.uf, agora, inspecao: inspecoes.get(p.websiteUri) })
      );

      empresas.sort((a, b) =>
        b.temperatura.pontos - a.temperatura.pontos ||
        b.avaliacoes - a.avaliacoes ||
        a.nome.localeCompare(b.nome, "pt-BR")
      );

      let cortadoPeloPlano = false;
      if (plano.maxResultados && empresas.length > plano.maxResultados) {
        empresas = empresas.slice(0, plano.maxResultados);
        cortadoPeloPlano = true;
      }

      // Nada novo: devolve a pesquisa reservada.
      let usadas = reserva.usadas;
      if (!empresas.length) {
        await devolverPesquisa(deps.db, usuario.uid, { custo, dia: reserva.dia, agora });
        usadas -= custo;
      }

      const parcial = busca.restam || busca.falhaParcial || cortadoPeloPlano;
      const avisos = [...busca.avisos];
      if (busca.restam) avisos.push("Resultados parciais: a fonte pode ter mais empresas. Use “Carregar mais” para continuar sem repetir as já exibidas.");
      if (cortadoPeloPlano) avisos.push(`Seu plano mostra até ${plano.maxResultados} empresas por pesquisa.`);
      if (analisados) avisos.push(`Sites analisados nesta busca: ${analisados}. Os demais aparecem como “verificar”.`);
      avisos.push("Dados do cadastro público do Google Maps. Um número de celular não garante WhatsApp ativo, e “site não identificado” não confirma que a empresa não tenha site.");

      const continuacao = busca.restam
        ? criarCursor({ uid: usuario.uid, uf: entrada.uf, cidade: entrada.cidade, servico: entrada.servico.id, segmento: chaveSegmento, estados: busca.estados, exp: agora.getTime() + VALIDADE_CURSOR_MS }, deps.segredoCursor)
        : "";

      // Histórico (apenas metadados; o conteúdo do Google não é armazenado aqui).
      try {
        await deps.db.collection("users").doc(usuario.uid).collection("searches").add({
          criadoEm: agora,
          uf: entrada.uf,
          cidade: entrada.cidade,
          servico: entrada.servico.id,
          segmento: entrada.segmento?.nome || entrada.termosLivres?.[0] || "",
          total: empresas.length,
          continuacao: Boolean(cursor),
          requisicoes: busca.requisicoes
        });
      } catch (e) {
        console.error("Falha ao registrar histórico:", e?.message);
      }

      return responder(res, 200, {
        sucesso: true,
        fonte: "Google Places API",
        servico: entrada.servico.id,
        total: empresas.length,
        empresas,
        parcial,
        continuacao,
        consultas: estados.map((e) => e.q),
        requisicoesGoogle: busca.requisicoes,
        descartados,
        avisos,
        uso: { limite: reserva.limite, usadas, disponiveis: Math.max(0, reserva.limite - usadas) },
        geradoEm: agora.toISOString()
      });
    } catch (e) {
      // Falha: a pesquisa reservada volta para o usuário.
      try { await devolverPesquisa(deps.db, usuario.uid, { custo, dia: reserva.dia, agora }); } catch (e2) { console.error("Falha ao devolver pesquisa:", e2?.message); }

      if (e instanceof ErroPlaces) {
        const status = e.codigo === "google_limite" ? 429 : e.codigo === "google_config" ? 503 : 502;
        return erro(res, status, `${e.message} Sua pesquisa não foi descontada.`, e.codigo);
      }
      console.error("Erro na busca:", e?.message);
      return erro(res, 500, "Erro inesperado ao buscar empresas. Sua pesquisa não foi descontada.", "interno");
    }
  };
}

export default async function handler(req, res) {
  try {
    return await criarHandlerLeads(await depsReais())(req, res);
  } catch (e) {
    console.error("Falha ao iniciar /api/leads:", e?.message);
    return erro(res, e?.codigo === "config" ? 503 : 500, e?.codigo === "config" ? "Servidor sem configuração do Firebase Admin." : "Erro interno.", e?.codigo || "interno");
  }
}
