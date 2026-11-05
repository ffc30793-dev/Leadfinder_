// POST /api/leads — busca de empresas (Google Places) com cota diária validada no servidor.

import { depsReais, autenticar, erro, lerCorpoJson, responder } from "./_lib/deps.js";
import { CUSTO_CONTINUACAO, CUSTO_PESQUISA, PLANOS } from "./_lib/plans.js";
import { devolverPesquisa, reservarPesquisa } from "./_lib/account.js";
import { ErroDeEntrada, criarCursor, grupoDaBusca, lerCursor, montarConsultas, validarEntrada } from "./_lib/estrategia.js";
import { buscarEmRodizio, cidadeDoEndereco, enderecoDaCidade, ErroPlaces, limpar } from "./_lib/places.js";
import { classificarSite, inspecionarVarios } from "./_lib/sites.js";
import { montarLead } from "./_lib/opportunity.js";
import { normalizar } from "../shared/catalog.js";
import { combinaComSegmento, ehEntidadePublica, segmentosAlvo } from "./_lib/relevancia.js";
import { normalizarTelefoneBR } from "../shared/phone.js";

const ALVO_POR_PESQUISA = 40; // empresas aceitas que encerram a busca antes do teto de requisições
const MAX_REQUISICOES = 6; // teto de chamadas ao Google por pesquisa (controle de custo)
const MAX_INSPECOES = 12; // sites analisados por pesquisa (redesign / loja virtual / cardápio)
const VALIDADE_CURSOR_MS = 30 * 60 * 1000;
const MAX_REQUISICOES_VIZINHAS = 2; // consultas extras ao Google quando a cidade pedida não rende nada
const SERVICOS_QUE_INSPECIONAM = new Set(["redesign-sites", "lojas-virtuais", "cardapios-catalogos"]);

// ---------- municípios no IBGE (validação + cidades da mesma microrregião) ----------
const cacheMunicipios = new Map(); // uf -> Map(nome normalizado -> { nome, micro })

async function carregarMunicipios(fetchFn, uf) {
  if (cacheMunicipios.has(uf)) return cacheMunicipios.get(uf);
  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), 3000);
  try {
    const r = await fetchFn(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios?orderBy=nome`, { signal: controle.signal });
    if (!r.ok) return null;
    const lista = await r.json();
    const mapa = new Map(lista.map((m) => [normalizar(m.nome), { nome: m.nome, micro: m.microrregiao?.id ?? null }]));
    cacheMunicipios.set(uf, mapa);
    return mapa;
  } finally {
    clearTimeout(timer);
  }
}

// Falha aberta: se o IBGE estiver fora do ar, a busca segue.
async function municipioExiste(fetchFn, uf, cidade) {
  try {
    const mapa = await carregarMunicipios(fetchFn, uf);
    return mapa ? mapa.has(normalizar(cidade)) : true;
  } catch {
    return true;
  }
}

/** Outras cidades da mesma microrregião (nomes normalizados), ou null se não der para saber. */
async function cidadesVizinhasDe(fetchFn, uf, cidade) {
  try {
    const mapa = await carregarMunicipios(fetchFn, uf);
    const origem = mapa?.get(normalizar(cidade));
    if (!origem || origem.micro == null) return null;
    const nomes = new Set();
    for (const [chave, m] of mapa) if (m.micro === origem.micro && chave !== normalizar(cidade)) nomes.add(limpar(m.nome));
    return nomes.size ? nomes : null;
  } catch {
    return null;
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
      const teto = plano.maxResultados || 0; // 0 = sem teto
      const inspeciona = SERVICOS_QUE_INSPECIONAM.has(entrada.servico.id);
      // Com teto, a busca para quando junta empresas suficientes (com folga para as que a avaliação descarta).
      const alvo = teto ? Math.ceil(teto * (inspeciona ? 2.4 : 1.4)) : ALVO_POR_PESQUISA;

      const estados = cursor ? cursor.estados : montarConsultas(entrada).map((q) => ({ q }));
      const excluidos = new Set(entrada.excluir);
      const aceitos = new Map();
      const descartados = {
        foraDaCidade: 0, fechadas: 0, duplicadas: 0, entidadesPublicas: 0, foraDoSegmento: 0,
        semWhatsapp: 0, jaTemSite: 0, semSiteParaRedesign: 0, naoAnalisados: 0, semOportunidade: 0
      };
      const segmentos = segmentosAlvo(entrada);

      // Só entra quem pode ser abordado agora: celular (WhatsApp) e que ainda precisa do serviço.
      const criarAceitador = (cidadeOk) => (p) => {
        if (!p?.id) return false;
        if (excluidos.has(p.id) || aceitos.has(p.id)) { descartados.duplicadas++; return false; }
        if (p.businessStatus && p.businessStatus !== "OPERATIONAL") { descartados.fechadas++; return false; }
        if (!cidadeOk(p)) { descartados.foraDaCidade++; return false; }
        if (ehEntidadePublica(p)) { descartados.entidadesPublicas++; return false; }
        if (!combinaComSegmento(p, segmentos)) { descartados.foraDoSegmento++; return false; }
        if (normalizarTelefoneBR(p.nationalPhoneNumber || "").tipo !== "movel") { descartados.semWhatsapp++; return false; }
        const siteStatus = classificarSite(p.websiteUri).status;
        if (entrada.servico.exigeSite && !["proprio", "plataforma_gratuita"].includes(siteStatus)) { descartados.semSiteParaRedesign++; return false; }
        if (entrada.servico.id === "criacao-sites" && siteStatus === "proprio") { descartados.jaTemSite++; return false; }
        aceitos.set(p.id, p);
        return true;
      };

      const aceitar = criarAceitador((p) => enderecoDaCidade(p.formattedAddress, entrada.cidade, entrada.uf));

      const busca = await buscarEmRodizio({
        fetch: deps.fetch,
        chave: chavePlaces,
        estados,
        aceitar,
        alvo,
        maxRequisicoes: MAX_REQUISICOES
      });

      const grupo = grupoDaBusca(entrada);
      let analisados = 0;

      // Analisa os sites (limitado), monta os leads e tira quem não precisa do serviço.
      const avaliar = async (lista, vizinha = false) => {
        let candidatos = lista;
        let inspecoes = new Map();
        if (inspeciona) {
          const comSite = (p) => p.websiteUri && ["proprio", "plataforma_gratuita"].includes(classificarSite(p.websiteUri).status);
          const urls = candidatos.filter(comSite).map((p) => p.websiteUri).slice(0, MAX_INSPECOES);
          inspecoes = await inspecionarVarios(urls, { fetch: deps.fetch, agora }, 5);
          analisados += urls.length;
          // Site que não deu para analisar nesta busca não é "oportunidade confirmada": fica de fora.
          const antes = candidatos.length;
          candidatos = candidatos.filter((p) => !comSite(p) || inspecoes.has(p.websiteUri));
          descartados.naoAnalisados += antes - candidatos.length;
        }
        let leads = candidatos.map((p) => {
          const cidade = vizinha ? cidadeDoEndereco(p.formattedAddress, entrada.uf) || entrada.cidade : entrada.cidade;
          const lead = montarLead(p, { servico: entrada.servico.id, grupo, cidade, uf: entrada.uf, agora, inspecao: inspecoes.get(p.websiteUri) });
          if (vizinha) lead.cidadeVizinha = true;
          return lead;
        });
        const antes = leads.length;
        leads = leads.filter((e) => e.oportunidade.nivel !== "baixa");
        descartados.semOportunidade += antes - leads.length;
        return leads;
      };

      let empresas = await avaliar([...aceitos.values()]);

      // Nada aproveitável na cidade pedida: tenta as cidades da mesma microrregião (até 2 consultas extras).
      let requisicoesExtras = 0;
      let cidadesVizinhas = [];
      if (!empresas.length && !cursor) {
        const vizinhas = await cidadesVizinhasDe(deps.fetch, entrada.uf, entrada.cidade);
        if (vizinhas) {
          const jaAvaliados = new Set(aceitos.keys());
          const aceitarVizinha = criarAceitador((p) => {
            const c = cidadeDoEndereco(p.formattedAddress, entrada.uf);
            return Boolean(c) && vizinhas.has(limpar(c));
          });
          try {
            const termo = montarConsultas(entrada)[0].split(" em ")[0];
            const extra = await buscarEmRodizio({
              fetch: deps.fetch,
              chave: chavePlaces,
              estados: [{ q: `${termo} perto de ${entrada.cidade}, ${entrada.estadoNome}` }],
              aceitar: aceitarVizinha,
              alvo,
              maxRequisicoes: MAX_REQUISICOES_VIZINHAS
            });
            requisicoesExtras = extra.requisicoes;
            empresas = await avaliar([...aceitos.values()].filter((p) => !jaAvaliados.has(p.id)), true);
            cidadesVizinhas = [...new Set(empresas.map((e) => e.cidade))];
          } catch (e) {
            console.error("Busca em cidades vizinhas falhou:", e?.message); // não derruba a busca principal
          }
        }
      }

      empresas.sort((a, b) =>
        b.temperatura.pontos - a.temperatura.pontos ||
        b.avaliacoes - a.avaliacoes ||
        a.nome.localeCompare(b.nome, "pt-BR")
      );

      let cortadoPeloPlano = false;
      if (teto && empresas.length > teto) {
        empresas = empresas.slice(0, teto);
        cortadoPeloPlano = true;
      }

      // Nada novo: devolve a pesquisa reservada.
      let usadas = reserva.usadas;
      if (!empresas.length) {
        await devolverPesquisa(deps.db, usuario.uid, { custo, dia: reserva.dia, agora });
        usadas -= custo;
      }

      const podeContinuar = busca.restam && !teto; // plano com teto: 1 pesquisa = até N empresas, sem "carregar mais"
      const parcial = podeContinuar || busca.falhaParcial;
      const avisos = [...busca.avisos];
      if (podeContinuar) avisos.push("Resultados parciais: a fonte pode ter mais empresas. Use “Carregar mais” para continuar sem repetir as já exibidas.");
      if (cortadoPeloPlano) avisos.push(`Seu plano mostra até ${teto} empresas por pesquisa, as de maior prioridade. Só aparecem empresas com celular (WhatsApp) que ainda precisam do serviço.`);
      if (cidadesVizinhas.length) avisos.push(`Nenhuma empresa aproveitável em ${entrada.cidade}; mostrando cidades vizinhas: ${cidadesVizinhas.join(", ")}.`);
      if (analisados) avisos.push(`Sites analisados nesta busca: ${analisados}. Os demais aparecem como “verificar”.`);
      avisos.push("Dados do cadastro público do Google Maps. Um número de celular não garante WhatsApp ativo, e “site não identificado” não confirma que a empresa não tenha site.");

      const continuacao = podeContinuar
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
          requisicoes: busca.requisicoes + requisicoesExtras
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
        requisicoesGoogle: busca.requisicoes + requisicoesExtras,
        cidadesVizinhas,
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
