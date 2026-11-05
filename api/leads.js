// POST /api/leads — busca de empresas (Google Places) com cota diária validada no servidor.

import crypto from "node:crypto";
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

const ALVO_POR_PESQUISA = 40; // (plano sem teto) empresas aceitas que encerram a busca antes do teto de requisições
const VALIDADE_CURSOR_MS = 30 * 60 * 1000;
const COMPLETAR_COM_VIZINHAS = true; // se a cidade não rende o suficiente, completa com cidades da mesma região
const VALIDADE_VISTOS_MS = 21 * 24 * 60 * 60 * 1000; // por quanto tempo uma empresa já exibida não volta
const MAX_VISTOS = 1500;

// Controle de custo e de velocidade por plano. A busca para assim que junta empresas suficientes.
//   requisicoes: teto de chamadas ao Google por pesquisa | paralelas: consultas simultâneas por onda
//   vizinhas: cidades vizinhas consultadas para completar | inspecoes: sites analisados (redesign / loja virtual / cardápio)
const BUSCA_POR_PLANO = {
  FREE: { requisicoes: 4, paralelas: 2, vizinhas: 2, inspecoes: 10 },
  PRO: { requisicoes: 8, paralelas: 3, vizinhas: 3, inspecoes: 20 },
  MAX: { requisicoes: 14, paralelas: 4, vizinhas: 4, inspecoes: 40 }
};
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

/** Outras cidades da mesma microrregião (Map nome limpo -> nome), ou null se não der para saber. */
async function cidadesVizinhasDe(fetchFn, uf, cidade) {
  try {
    const mapa = await carregarMunicipios(fetchFn, uf);
    const origem = mapa?.get(normalizar(cidade));
    if (!origem || origem.micro == null) return null;
    const nomes = new Map(); // nome limpo -> nome original (para consultar o Google pelo nome certo)
    for (const [chave, m] of mapa) if (m.micro === origem.micro && chave !== normalizar(cidade)) nomes.set(limpar(m.nome), m.nome);
    return nomes.size ? nomes : null;
  } catch {
    return null;
  }
}

// ---------- empresas já exibidas (só IDs de lugar, nada do conteúdo do Google) ----------
// Cada pesquisa nova da mesma cidade/segmento/serviço pula o que o usuário já viu, então "buscar de novo"
// sempre traz empresas diferentes até acabarem as disponíveis.
function chaveVistos(uf, cidade, servicoId, segmento) {
  return crypto.createHash("sha1").update([uf, normalizar(cidade), servicoId, normalizar(segmento)].join("|")).digest("hex").slice(0, 24);
}

async function lerVistos(deps, uid, chave, agora) {
  try {
    const snap = await deps.db.collection("users").doc(uid).collection("vistos").doc(chave).get();
    if (!snap.exists) return { ids: [], buscas: 0 };
    const d = snap.data() || {};
    const t = d.atualizadoEm?.toDate ? d.atualizadoEm.toDate() : d.atualizadoEm ? new Date(d.atualizadoEm) : null;
    if (!t || Number.isNaN(t.getTime()) || agora.getTime() - t.getTime() > VALIDADE_VISTOS_MS) return { ids: [], buscas: 0 };
    return { ids: Array.isArray(d.ids) ? d.ids : [], buscas: Number(d.buscas) || 0 };
  } catch (e) {
    console.error("Falha ao ler empresas já exibidas:", e?.message);
    return { ids: [], buscas: 0 }; // falha aberta: a busca segue
  }
}

async function gravarVistos(deps, uid, chave, anteriores, novosIds, agora) {
  try {
    const ids = [...anteriores.ids, ...novosIds.filter((id) => !anteriores.ids.includes(id))].slice(-MAX_VISTOS);
    await deps.db.collection("users").doc(uid).collection("vistos").doc(chave).set({ ids, buscas: anteriores.buscas + 1, atualizadoEm: agora });
  } catch (e) {
    console.error("Falha ao gravar empresas já exibidas:", e?.message);
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

    const chaveSegmento = entrada.segmento?.id || entrada.termosLivres?.[0] || "";
    const chaveDosVistos = chaveVistos(entrada.uf, entrada.cidade, entrada.servico.id, chaveSegmento);
    const [cidadeValida, vistos] = await Promise.all([
      municipioExiste(deps.fetch, entrada.uf, entrada.cidade),
      lerVistos(deps, usuario.uid, chaveDosVistos, deps.now())
    ]);
    if (!cidadeValida) {
      return erro(res, 400, "Cidade não encontrada para este estado (fonte: IBGE).", "cidade_invalida");
    }

    // ---- continuação (cursor assinado) ----
    let cursor = null;
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
      const cfg = BUSCA_POR_PLANO[plano.id] || BUSCA_POR_PLANO.FREE;
      const inspeciona = SERVICOS_QUE_INSPECIONAM.has(entrada.servico.id);
      // Com teto, a busca para quando junta empresas suficientes (com folga para as que a avaliação descarta).
      const alvo = teto ? Math.ceil(teto * (inspeciona ? 2.4 : 1.4)) : ALVO_POR_PESQUISA;

      // A cada nova pesquisa começa por outra formulação da consulta: o Google devolve outras empresas no topo.
      const consultas = montarConsultas(entrada);
      const giro = consultas.length ? vistos.buscas % consultas.length : 0;
      const estados = cursor ? cursor.estados : [...consultas.slice(giro), ...consultas.slice(0, giro)].map((q) => ({ q }));
      const excluidos = new Set([...entrada.excluir, ...vistos.ids]);
      const aceitos = new Map();
      const descartados = {
        foraDaCidade: 0, fechadas: 0, duplicadas: 0, jaExibidas: 0, entidadesPublicas: 0, foraDoSegmento: 0,
        semWhatsapp: 0, jaTemSite: 0, semSiteParaRedesign: 0, naoAnalisados: 0, semOportunidade: 0
      };
      const segmentos = segmentosAlvo(entrada);
      const jaContadas = new Set();

      // Só entra quem pode ser abordado agora: celular (WhatsApp) e que ainda precisa do serviço.
      const criarAceitador = (cidadeOk) => (p) => {
        if (!p?.id) return false;
        if (excluidos.has(p.id)) {
          if (!jaContadas.has(p.id)) { jaContadas.add(p.id); descartados.jaExibidas++; } // conta cada empresa uma vez só
          return false;
        }
        if (aceitos.has(p.id)) { descartados.duplicadas++; return false; }
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
        maxRequisicoes: cfg.requisicoes,
        paralelas: cfg.paralelas
      });

      const grupo = grupoDaBusca(entrada);
      let analisados = 0;

      // Analisa os sites (limitado), monta os leads e tira quem não precisa do serviço.
      const avaliar = async (lista, vizinha = false) => {
        let candidatos = lista;
        let inspecoes = new Map();
        if (inspeciona) {
          const comSite = (p) => p.websiteUri && ["proprio", "plataforma_gratuita"].includes(classificarSite(p.websiteUri).status);
          const urls = candidatos.filter(comSite).map((p) => p.websiteUri).slice(0, cfg.inspecoes);
          inspecoes = await inspecionarVarios(urls, { fetch: deps.fetch, agora }, 8);
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

      // Faltam empresas na cidade pedida: completa com as cidades da mesma microrregião, consultadas ao mesmo tempo.
      let requisicoesExtras = 0;
      let cidadesVizinhas = [];
      let faltavaTudo = !empresas.length;
      const faltam = teto ? teto - empresas.length : empresas.length ? 0 : 1;
      if (COMPLETAR_COM_VIZINHAS && faltam > 0 && !cursor) {
        const vizinhas = await cidadesVizinhasDe(deps.fetch, entrada.uf, entrada.cidade);
        if (vizinhas) {
          const jaAvaliados = new Set(aceitos.keys());
          const aceitarVizinha = criarAceitador((p) => {
            const c = cidadeDoEndereco(p.formattedAddress, entrada.uf);
            return Boolean(c) && vizinhas.has(limpar(c));
          });
          try {
            const termo = consultas[0].split(" em ")[0];
            const nomes = [...vizinhas.values()].slice(0, cfg.vizinhas);
            const estadosVizinhos = [
              { q: `${termo} perto de ${entrada.cidade}, ${entrada.estadoNome}` },
              ...nomes.map((n) => ({ q: `${termo} em ${n}, ${entrada.estadoNome}` }))
            ];
            const extra = await buscarEmRodizio({
              fetch: deps.fetch,
              chave: chavePlaces,
              estados: estadosVizinhos,
              aceitar: aceitarVizinha,
              alvo: Math.ceil(faltam * (inspeciona ? 2.4 : 1.4)),
              maxRequisicoes: estadosVizinhos.length + 1,
              paralelas: estadosVizinhos.length
            });
            requisicoesExtras = extra.requisicoes;
            const deVizinhas = await avaliar([...aceitos.values()].filter((p) => !jaAvaliados.has(p.id)), true);
            empresas = [...empresas, ...deVizinhas];
            cidadesVizinhas = [...new Set(deVizinhas.map((e) => e.cidade))];
          } catch (e) {
            console.error("Busca em cidades vizinhas falhou:", e?.message); // não derruba a busca principal
          }
        }
      }

      empresas.sort((a, b) =>
        Number(Boolean(a.cidadeVizinha)) - Number(Boolean(b.cidadeVizinha)) || // empresas da cidade pedida vêm antes das vizinhas
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
      if (cidadesVizinhas.length) {
        avisos.push(faltavaTudo
          ? `Nenhuma empresa aproveitável em ${entrada.cidade}; mostrando cidades vizinhas: ${cidadesVizinhas.join(", ")}.`
          : `${entrada.cidade} tinha poucas empresas aproveitáveis; completei com cidades vizinhas: ${cidadesVizinhas.join(", ")}.`);
      }
      if (empresas.length) avisos.push("Pesquise de novo para ver outras empresas: as que já apareceram para você nesta busca não se repetem.");
      if (!empresas.length && descartados.jaExibidas) avisos.push(`Você já viu as ${descartados.jaExibidas} empresas disponíveis para esta busca. Tente outra cidade, outro segmento ou outro serviço.`);
      if (analisados) avisos.push(`Sites analisados nesta busca: ${analisados}. Os demais aparecem como “verificar”.`);
      avisos.push("Dados do cadastro público do Google Maps. Um número de celular não garante WhatsApp ativo, e “site não identificado” não confirma que a empresa não tenha site.");

      const continuacao = podeContinuar
        ? criarCursor({ uid: usuario.uid, uf: entrada.uf, cidade: entrada.cidade, servico: entrada.servico.id, segmento: chaveSegmento, estados: busca.estados, exp: agora.getTime() + VALIDADE_CURSOR_MS }, deps.segredoCursor)
        : "";

      // Histórico (apenas metadados) e IDs das empresas exibidas, gravados ao mesmo tempo.
      const gravarHistorico = async () => {
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
      };
      await Promise.all([
        gravarHistorico(),
        empresas.length ? gravarVistos(deps, usuario.uid, chaveDosVistos, vistos, empresas.map((e) => e.id), agora) : Promise.resolve()
      ]);

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
