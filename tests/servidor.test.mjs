import test from "node:test";
import assert from "node:assert/strict";

import { criarDeps, criarReq, criarRes, criarFetchPlaces, lugar, criarDbFalso, AGORA } from "./helpers.mjs";
import { criarHandlerLeads } from "../api/leads.js";
import { criarHandlerConta } from "../api/account.js";
import { criarHandlerWebhook } from "../api/cakto-webhook.js";
import { planoEfetivo, reservarPesquisa, devolverPesquisa, diaLocal, resumoConta } from "../api/_lib/account.js";
import { limparCacheCurto, enderecoDaCidade } from "../api/_lib/places.js";
import { montarLead } from "../api/_lib/opportunity.js";

const corpoBusca = { estado: "PI", cidade: "Teresina", segmento: "Pizzaria", servico: "criacao-sites" };
const chamar = async (handler, req) => { const res = criarRes(); await handler(req, res); return res; };

// Gera N lugares com ids sequenciais
const muitos = (prefixo, n, extra = () => ({})) => Array.from({ length: n }, (_, i) => lugar(`${prefixo}${i}`, extra(i)));

test.beforeEach(() => limparCacheCurto());

// Conta PRO ativa (sem teto de resultados por pesquisa) — o plano grátis mostra no máximo 10.
const virarPro = (deps) => deps.db.collection("accounts").doc("ana").set({
  plano: "PRO",
  assinatura: { status: "ativa", renovaEm: new Date(AGORA.getTime() + 5 * 86400000) },
  uso: { dia: "", contagem: 0 }
});

// ================= conta / cota =================
test("plano efetivo: pago só vale com assinatura ativa e no prazo", () => {
  const dia = 86400000;
  const ativa = { plano: "PRO", assinatura: { status: "ativa", renovaEm: new Date(AGORA.getTime() + 5 * dia) } };
  assert.equal(planoEfetivo(ativa, AGORA).plano, "PRO");

  const venceuDentroDaTolerancia = { plano: "PRO", assinatura: { status: "ativa", renovaEm: new Date(AGORA.getTime() - 1 * dia) } };
  assert.equal(planoEfetivo(venceuDentroDaTolerancia, AGORA).plano, "PRO");

  const expirada = { plano: "PRO", assinatura: { status: "ativa", renovaEm: new Date(AGORA.getTime() - 10 * dia) } };
  assert.equal(planoEfetivo(expirada, AGORA).plano, "FREE");
  assert.equal(planoEfetivo(expirada, AGORA).status, "expirada");

  const canceladaNoPeriodo = { plano: "MAX", assinatura: { status: "cancelada", renovaEm: new Date(AGORA.getTime() + 3 * dia) } };
  assert.equal(planoEfetivo(canceladaNoPeriodo, AGORA).plano, "MAX");
  const canceladaVencida = { plano: "MAX", assinatura: { status: "cancelada", renovaEm: new Date(AGORA.getTime() - 1 * dia) } };
  assert.equal(planoEfetivo(canceladaVencida, AGORA).plano, "FREE");

  assert.equal(planoEfetivo({ plano: "PRO" }, AGORA).plano, "FREE"); // "PRO" sem assinatura NÃO vale
  assert.equal(planoEfetivo({ plano: "PRO", assinatura: { status: "reembolsada", renovaEm: new Date(AGORA.getTime() + dia) } }, AGORA).plano, "FREE");
  assert.equal(planoEfetivo({ plano: "HACK" }, AGORA).plano, "FREE");
  assert.equal(planoEfetivo(null, AGORA).plano, "FREE");
});

test("cota: 20 pesquisas simultâneas no plano grátis consomem exatamente 5", async () => {
  const db = criarDbFalso();
  const rs = await Promise.all(Array.from({ length: 20 }, () => reservarPesquisa(db, "ana", { custo: 1, agora: AGORA })));
  assert.equal(rs.filter((r) => r.ok).length, 5);
  assert.equal(rs.filter((r) => !r.ok).length, 15);
  const conta = (await db.collection("accounts").doc("ana").get()).data();
  assert.equal(conta.uso.contagem, 5);
});

test("cota: renova no dia seguinte (fuso de Brasília) e devolve pesquisa", async () => {
  const db = criarDbFalso();
  for (let i = 0; i < 5; i++) await reservarPesquisa(db, "ana", { custo: 1, agora: AGORA });
  assert.equal((await reservarPesquisa(db, "ana", { custo: 1, agora: AGORA })).ok, false);

  // 02:00 UTC de 25/10 ainda é 23:00 de 24/10 em Brasília -> mesmo dia, continua bloqueado
  const aindaMesmoDia = new Date("2026-10-25T02:00:00Z");
  assert.equal(diaLocal(aindaMesmoDia), "2026-10-24");
  assert.equal((await reservarPesquisa(db, "ana", { custo: 1, agora: aindaMesmoDia })).ok, false);

  // 03:30 UTC de 25/10 = 00:30 de 25/10 em Brasília -> novo dia
  const diaSeguinte = new Date("2026-10-25T03:30:00Z");
  assert.equal((await reservarPesquisa(db, "ana", { custo: 1, agora: diaSeguinte })).ok, true);

  await devolverPesquisa(db, "ana", { custo: 1, dia: "2026-10-25", agora: diaSeguinte });
  assert.equal((await db.collection("accounts").doc("ana").get()).data().uso.contagem, 0);
});

test("cota: plano gravado como PRO sem assinatura continua com limite do grátis", async () => {
  const db = criarDbFalso();
  await db.collection("accounts").doc("ana").set({ plano: "PRO", assinatura: null, uso: { dia: "", contagem: 0 } });
  const rs = await Promise.all(Array.from({ length: 8 }, () => reservarPesquisa(db, "ana", { custo: 1, agora: AGORA })));
  assert.equal(rs.filter((r) => r.ok).length, 5);
});

test("/api/account: informa plano, uso e checkout só se configurado", async () => {
  const deps = criarDeps({ env: { CAKTO_PRO_CHECKOUT: "https://pay.cakto.com.br/abc", CAKTO_MAX_CHECKOUT: "javascript:alert(1)" } });
  const res = await chamar(criarHandlerConta(deps), criarReq({ metodo: "GET" }));
  assert.equal(res.statusCode, 200);
  assert.equal(res.corpo.plano, "FREE");
  assert.equal(res.corpo.pesquisas.limite, 5);
  assert.equal(res.corpo.pesquisas.disponiveis, 5);
  const pro = res.corpo.planos.find((p) => p.id === "PRO");
  const max = res.corpo.planos.find((p) => p.id === "MAX");
  assert.equal(pro.checkoutUrl, "https://pay.cakto.com.br/abc");
  assert.equal(max.checkoutUrl, ""); // esquema inseguro é descartado
  assert.equal(res.corpo.planos.find((p) => p.id === "FREE").preco, 0);
  assert.equal(pro.preco, 19.9);
});

test("/api/account: exige login", async () => {
  const res = await chamar(criarHandlerConta(criarDeps()), criarReq({ metodo: "GET", token: "" }));
  assert.equal(res.statusCode, 401);
});

// ================= busca =================
test("busca: exige login, método POST e entrada válida", async () => {
  const f = criarFetchPlaces({ pizzaria: [[lugar("a")]] });
  const h = criarHandlerLeads(criarDeps({ fetch: f }));
  assert.equal((await chamar(h, criarReq({ token: "", corpo: corpoBusca }))).statusCode, 401);
  assert.equal((await chamar(h, criarReq({ token: "invalido", corpo: corpoBusca }))).statusCode, 401);
  assert.equal((await chamar(h, criarReq({ metodo: "GET" }))).statusCode, 405);
  assert.equal((await chamar(h, criarReq({ corpo: { ...corpoBusca, estado: "ZZ" } }))).statusCode, 400);
  assert.equal((await chamar(h, criarReq({ corpo: { ...corpoBusca, cidade: "Cidade Inventada" } }))).statusCode, 400);
  assert.equal(f.chamadas.length, 0); // nada foi cobrado do Google
});

test("busca: sem chave do Google responde 503 e não consome cota", async () => {
  const deps = criarDeps({ fetch: criarFetchPlaces({}) });
  delete deps.env.GOOGLE_PLACES_API_KEY;
  const res = await chamar(criarHandlerLeads(deps), criarReq({ corpo: corpoBusca }));
  assert.equal(res.statusCode, 503);
  assert.equal((await deps.db.collection("accounts").doc("ana").get()).exists, false);
});

test("busca: deduplica por ID entre consultas e paginação, remove outra cidade e empresas fechadas", async () => {
  const f = criarFetchPlaces({
    pizzaria: [
      [lugar("p1"), lugar("p2"), lugar("fora", { formattedAddress: "Rua X, 1 - Timon - MA, Brasil" }), lugar("fechada", { businessStatus: "CLOSED_PERMANENTLY" })],
      [lugar("p2"), lugar("p3")] // p2 repetido na página 2
    ],
    "melhores": [[lugar("p1"), lugar("p4")]]
  });
  const deps = criarDeps({ fetch: f });
  const res = await chamar(criarHandlerLeads(deps), criarReq({ corpo: corpoBusca }));
  assert.equal(res.statusCode, 200);
  const ids = res.corpo.empresas.map((e) => e.id).sort();
  assert.deepEqual(ids, ["p1", "p2", "p3", "p4"]);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(res.corpo.descartados.foraDaCidade >= 1, true);
  assert.equal(res.corpo.descartados.fechadas >= 1, true);
  assert.equal(res.corpo.descartados.duplicadas >= 2, true);
  assert.equal(res.corpo.uso.usadas, 1);
  assert.equal(res.corpo.parcial, false);
  assert.equal(res.corpo.continuacao, "");
});

test("busca: respeita o teto de requisições ao Google e oferece continuação sem repetir empresas", async () => {
  // 1 consulta com 8 páginas de 20 empresas (160 no total); teto de 6 requisições por pesquisa
  const paginas = Array.from({ length: 8 }, (_, p) => muitos(`q${p}_`, 20));
  const f = criarFetchPlaces({ pizzaria: paginas, "melhores": [[]], "centro": [[]] });
  const deps = criarDeps({ fetch: f, env: {} });
  await virarPro(deps);
  const h = criarHandlerLeads(deps);

  const r1 = await chamar(h, criarReq({ corpo: corpoBusca }));
  assert.equal(r1.statusCode, 200);
  assert.ok(r1.corpo.requisicoesGoogle <= 6);
  assert.equal(r1.corpo.parcial, true);
  assert.ok(r1.corpo.continuacao);
  assert.ok(r1.corpo.avisos.some((a) => /parciais/i.test(a)));
  const ids1 = r1.corpo.empresas.map((e) => e.id);
  assert.ok(ids1.length >= 40);

  const r2 = await chamar(h, criarReq({ corpo: { ...corpoBusca, continuacao: r1.corpo.continuacao, excluir: ids1 } }));
  assert.equal(r2.statusCode, 200);
  const ids2 = r2.corpo.empresas.map((e) => e.id);
  assert.ok(ids2.length > 0);
  assert.equal(ids2.filter((id) => ids1.includes(id)).length, 0, "continuação não pode repetir empresas já exibidas");
  assert.equal(r2.corpo.uso.usadas, 2); // a continuação consome 1 pesquisa
});

test("busca: continuação adulterada, de outro usuário ou de outra cidade é recusada", async () => {
  const paginas = Array.from({ length: 8 }, (_, p) => muitos(`z${p}_`, 20));
  const f = criarFetchPlaces({ pizzaria: paginas, "melhores": [[]], "centro": [[]] });
  const deps = criarDeps({ fetch: f });
  await virarPro(deps);
  const h = criarHandlerLeads(deps);
  const r1 = await chamar(h, criarReq({ corpo: corpoBusca }));
  const cont = r1.corpo.continuacao;
  assert.ok(cont);

  assert.equal((await chamar(h, criarReq({ corpo: { ...corpoBusca, continuacao: cont + "x" } }))).statusCode, 400);
  assert.equal((await chamar(h, criarReq({ token: "tok-bia", corpo: { ...corpoBusca, continuacao: cont } }))).statusCode, 400);
  assert.equal((await chamar(h, criarReq({ corpo: { ...corpoBusca, cidade: "Parnaíba", continuacao: cont } }))).statusCode, 400);
});

test("busca: o limite diário é aplicado no servidor (6ª pesquisa do plano grátis é recusada)", async () => {
  const f = criarFetchPlaces({ pizzaria: [[lugar("a")]], "melhores": [[]], "centro": [[]] });
  const h = criarHandlerLeads(criarDeps({ fetch: f }));
  const codigos = [];
  for (let i = 0; i < 6; i++) codigos.push((await chamar(h, criarReq({ corpo: corpoBusca }))).statusCode);
  assert.deepEqual(codigos, [200, 200, 200, 200, 200, 429]);
  const bloqueada = await chamar(h, criarReq({ corpo: corpoBusca }));
  assert.equal(bloqueada.corpo.codigo, "limite_diario");
  assert.equal(bloqueada.corpo.uso.limite, 5);
  const chamadasAntes = f.chamadas.length;
  await chamar(h, criarReq({ corpo: corpoBusca }));
  assert.equal(f.chamadas.length, chamadasAntes, "pesquisa bloqueada não pode chamar o Google");
});

test("busca: usuário não consegue se promover alterando dados do perfil (users/ não vale como plano)", async () => {
  const db = criarDbFalso();
  await db.collection("users").doc("ana").set({ nome: "Ana", plano: "MAX", creditos: 9999 });
  const f = criarFetchPlaces({ pizzaria: [[lugar("a")]], "melhores": [[]], "centro": [[]] });
  const h = criarHandlerLeads(criarDeps({ db, fetch: f }));
  const codigos = [];
  for (let i = 0; i < 7; i++) codigos.push((await chamar(h, criarReq({ corpo: corpoBusca }))).statusCode);
  assert.equal(codigos.filter((c) => c === 200).length, 5);
});

test("busca: falha do Google na 1ª requisição devolve a pesquisa ao usuário", async () => {
  const f = criarFetchPlaces({ pizzaria: [[lugar("a")]] }, { status: 503 });
  const deps = criarDeps({ fetch: f });
  const res = await chamar(criarHandlerLeads(deps), criarReq({ corpo: corpoBusca }));
  assert.equal(res.statusCode, 502);
  assert.match(res.corpo.erro, /não foi descontada/);
  assert.equal((await deps.db.collection("accounts").doc("ana").get()).data().uso.contagem, 0);
});

test("busca: chave inválida (403) responde 503 e não desconta; limite do Google (429) responde 429", async () => {
  const d1 = criarDeps({ fetch: criarFetchPlaces({}, { status: 403 }) });
  const r1 = await chamar(criarHandlerLeads(d1), criarReq({ corpo: corpoBusca }));
  assert.equal(r1.statusCode, 503);
  assert.equal(r1.corpo.codigo, "google_config");
  limparCacheCurto();
  const d2 = criarDeps({ fetch: criarFetchPlaces({}, { status: 429 }) });
  const r2 = await chamar(criarHandlerLeads(d2), criarReq({ corpo: corpoBusca }));
  assert.equal(r2.statusCode, 429);
  assert.equal(r2.corpo.codigo, "google_limite");
  assert.equal((await d2.db.collection("accounts").doc("ana").get()).data().uso.contagem, 0);
});

test("busca: falha em página posterior gera resultado parcial com aviso (e cobra a pesquisa)", async () => {
  const f = criarFetchPlaces({ pizzaria: [muitos("a", 5), muitos("b", 5)], "melhores": [muitos("c", 5)], "centro": [[]] }, { falharNaRequisicao: 2 });
  const res = await chamar(criarHandlerLeads(criarDeps({ fetch: f })), criarReq({ corpo: corpoBusca }));
  assert.equal(res.statusCode, 200);
  assert.equal(res.corpo.parcial, true);
  assert.ok(res.corpo.avisos.some((a) => /parciais/i.test(a)));
  assert.ok(res.corpo.empresas.length > 0);
});

test("busca: nenhuma empresa nova não consome pesquisa", async () => {
  const f = criarFetchPlaces({ pizzaria: [[lugar("x")]], "melhores": [[]], "centro": [[]] });
  const deps = criarDeps({ fetch: f });
  const res = await chamar(criarHandlerLeads(deps), criarReq({ corpo: { ...corpoBusca, excluir: ["x"] } }));
  assert.equal(res.corpo.total, 0);
  assert.equal(res.corpo.uso.usadas, 0);
});

test("busca: grava histórico (somente metadados) na subcoleção do usuário", async () => {
  const f = criarFetchPlaces({ pizzaria: [[lugar("a"), lugar("b")]], "melhores": [[]], "centro": [[]] });
  const deps = criarDeps({ fetch: f });
  await chamar(criarHandlerLeads(deps), criarReq({ corpo: corpoBusca }));
  const chaves = [...deps.db._dados.keys()].filter((k) => k.startsWith("users/ana/searches/"));
  assert.equal(chaves.length, 1);
  const reg = deps.db._dados.get(chaves[0]);
  assert.equal(reg.total, 2);
  assert.equal(JSON.stringify(reg).includes("Pizzaria a"), false); // nenhum conteúdo do Google armazenado
});

// ================= serviços mudam os resultados =================
test("serviço: o mesmo conjunto de empresas é avaliado de formas diferentes por serviço", async () => {
  const lugares = [
    lugar("semsite", { nationalPhoneNumber: "(86) 99999-0001" }),
    lugar("insta", { websiteUri: "https://instagram.com/lojinha" }),
    lugar("proprio", { websiteUri: "https://www.exemplo-proprio.com.br" })
  ];
  const f = criarFetchPlaces({ pizzaria: [lugares], "melhores": [[]], "centro": [[]] });
  const rodar = async (servico) => {
    limparCacheCurto();
    const deps = criarDeps({ fetch: async (url, o) => (String(url).includes("places") || String(url).includes("ibge") ? f(url, o) : { ok: false, status: 500, headers: new Headers() }) });
    return chamar(criarHandlerLeads(deps), criarReq({ corpo: { ...corpoBusca, servico } }));
  };

  const sites = await rodar("criacao-sites");
  const porId = Object.fromEntries(sites.corpo.empresas.map((e) => [e.id, e]));
  assert.equal(porId.semsite.oportunidade.nivel, "provavel");
  assert.equal(porId.insta.oportunidade.nivel, "provavel");
  assert.equal(porId.proprio, undefined, "quem já tem site próprio não aparece em criação de sites");
  assert.equal(sites.corpo.descartados.jaTemSite, 1);
  assert.match(porId.semsite.oportunidade.motivos[0], /não confirma/i); // nunca afirma "sem site"

  const redesign = await rodar("redesign-sites");
  assert.deepEqual(redesign.corpo.empresas.map((e) => e.id), ["proprio"]); // só quem tem site próprio
  assert.equal(redesign.corpo.descartados.semSiteParaRedesign, 2);

  const redes = await rodar("redes-sociais");
  const r = Object.fromEntries(redes.corpo.empresas.map((e) => [e.id, e]));
  assert.equal(r.insta.oportunidade.nivel, "possivel");
  assert.match(r.insta.oportunidade.rotulo, /verificar/i);
});

// ================= avaliação e temperatura =================
test("temperatura: critérios explícitos e 'preliminar' quando a confiança não é alta", () => {
  const base = { servico: "criacao-sites", grupo: "alimentacao", cidade: "Teresina", uf: "PI", agora: AGORA };
  const quente = montarLead(lugar("a", { userRatingCount: 30 }), base);
  assert.equal(quente.temperatura.nivel, "quente");
  assert.equal(quente.temperatura.pontos, 50 + 30 + 20);
  assert.equal(quente.temperatura.preliminar, true); // "site não identificado" é confiança média
  assert.equal(quente.temperatura.criterios.length, 3);

  const fixo = montarLead(lugar("b", { nationalPhoneNumber: "(86) 3222-1234", userRatingCount: 0 }), base);
  assert.equal(fixo.whatsapp, "");
  assert.equal(fixo.whatsappStatus, "fixo");
  assert.equal(fixo.temperatura.pontos, 50 + 15 + 0);
  assert.equal(fixo.temperatura.nivel, "morno");

  const frio = montarLead(lugar("c", { nationalPhoneNumber: "", websiteUri: "https://www.bom.com.br", userRatingCount: 0 }), base);
  assert.equal(frio.temperatura.nivel, "frio");
  assert.equal(frio.oportunidade.confianca, "alta");
  assert.equal(frio.temperatura.preliminar, false);
});

test("lead: não inventa dados ausentes e diferencia 'site não identificado' de rede social", () => {
  const base = { servico: "criacao-sites", grupo: "", cidade: "Teresina", uf: "PI", agora: AGORA };
  const l = montarLead({ id: "z", displayName: { text: "Sem nada" } }, base);
  assert.equal(l.telefone, "");
  assert.equal(l.endereco, "");
  assert.equal(l.site, "");
  assert.equal(l.nota, null);
  assert.equal(l.fotos, null);
  assert.equal(l.whatsapp, "");
  assert.equal(l.siteStatus, "nao_identificado");
  assert.equal(l.siteRotulo, "Site não identificado");
  const s = montarLead({ id: "y", displayName: { text: "X" }, websiteUri: "https://facebook.com/x" }, base);
  assert.equal(s.siteStatus, "terceiros");
});

// ================= webhook Cakto =================
const SEGREDO = "segredo-cakto";
const envCakto = { CAKTO_WEBHOOK_SECRET: SEGREDO, CAKTO_PRODUCT_PRO: "prod-pro", CAKTO_PRODUCT_MAX: "prod-max" };
const evento = (nome, extra = {}) => ({
  secret: SEGREDO,
  event: nome,
  data: { id: "ped-1", status: "paid", customer: { email: "Ana@Exemplo.com" }, product: { id: "prod-pro" }, ...extra }
});

test("webhook: recusa sem segredo configurado, sem assinatura e com segredo errado", async () => {
  const sem = await chamar(criarHandlerWebhook(criarDeps({ env: {} })), criarReq({ token: "", corpo: evento("purchase_approved") }));
  assert.equal(sem.statusCode, 503);
  const deps = criarDeps({ env: envCakto });
  const h = criarHandlerWebhook(deps);
  const errado = await chamar(h, criarReq({ token: "", corpo: { ...evento("purchase_approved"), secret: "errado" } }));
  assert.equal(errado.statusCode, 401);
  const ausente = await chamar(h, criarReq({ token: "", corpo: { ...evento("purchase_approved"), secret: undefined } }));
  assert.equal(ausente.statusCode, 401);
  assert.equal((await deps.db.collection("accounts").doc("ana").get()).exists, false);
});

test("webhook: aceita assinatura HMAC no cabeçalho", async () => {
  const { createHmac } = await import("node:crypto");
  const corpo = Buffer.from(JSON.stringify({ event: "purchase_approved", data: { id: "h1", status: "paid", customer: { email: "ana@exemplo.com" }, product: { id: "prod-max" } } }));
  const assinatura = createHmac("sha256", SEGREDO).update(corpo).digest("hex");
  const deps = criarDeps({ env: envCakto });
  const res = await chamar(criarHandlerWebhook(deps), criarReq({ token: "", corpo, cabecalhos: { "x-cakto-signature": assinatura } }));
  assert.equal(res.statusCode, 200);
  assert.equal((await deps.db.collection("accounts").doc("ana").get()).data().plano, "MAX");
  const ruim = await chamar(criarHandlerWebhook(criarDeps({ env: envCakto })), criarReq({ token: "", corpo, cabecalhos: { "x-cakto-signature": "00" + assinatura.slice(2) } }));
  assert.equal(ruim.statusCode, 401);
});

test("webhook: pagamento aprovado ativa o plano; evento repetido não duplica nem estende", async () => {
  const deps = criarDeps({ env: envCakto });
  const h = criarHandlerWebhook(deps);
  const r1 = await chamar(h, criarReq({ token: "", corpo: evento("purchase_approved") }));
  assert.equal(r1.statusCode, 200);
  assert.equal(r1.corpo.processado, true);
  const conta1 = (await deps.db.collection("accounts").doc("ana").get()).data();
  assert.equal(conta1.plano, "PRO");
  assert.equal(conta1.assinatura.status, "ativa");
  assert.equal(planoEfetivo(conta1, AGORA).plano, "PRO");

  const depoisDeUmDia = new Date(AGORA.getTime() + 86400000);
  const h2 = criarHandlerWebhook({ ...deps, now: () => depoisDeUmDia });
  const r2 = await chamar(h2, criarReq({ token: "", corpo: evento("purchase_approved") }));
  assert.equal(r2.corpo.duplicado, true);
  const conta2 = (await deps.db.collection("accounts").doc("ana").get()).data();
  assert.deepEqual(conta2.assinatura.renovaEm, conta1.assinatura.renovaEm);

  const auditorias = [...deps.db._dados.entries()].filter(([k]) => k.startsWith("paymentEvents/"));
  assert.equal(auditorias.length, 1);
  assert.equal(JSON.stringify(auditorias[0][1]).includes(SEGREDO), false, "o segredo nunca vai para a auditoria");
  assert.equal(auditorias[0][1].status, "aplicado");
});

test("webhook: entregas simultâneas do mesmo evento aplicam uma única vez", async () => {
  const deps = criarDeps({ env: envCakto });
  const h = criarHandlerWebhook(deps);
  const rs = await Promise.all(Array.from({ length: 6 }, () => chamar(h, criarReq({ token: "", corpo: evento("purchase_approved") }))));
  assert.equal(rs.filter((r) => r.corpo.processado === true).length, 1);
  assert.equal(rs.filter((r) => r.corpo.duplicado === true).length, 5);
});

test("webhook: produto desconhecido, status não pago e usuário inexistente não ativam plano", async () => {
  const deps = criarDeps({ env: envCakto });
  const h = criarHandlerWebhook(deps);
  const r1 = await chamar(h, criarReq({ token: "", corpo: evento("purchase_approved", { id: "x1", product: { id: "outro" } }) }));
  assert.equal(r1.corpo.motivo, "produto_desconhecido");
  const r2 = await chamar(h, criarReq({ token: "", corpo: evento("purchase_approved", { id: "x2", status: "pending" }) }));
  assert.equal(r2.corpo.processado, false);
  const r3 = await chamar(h, criarReq({ token: "", corpo: evento("purchase_approved", { id: "x3", customer: { email: "ninguem@exemplo.com" } }) }));
  assert.equal(r3.corpo.motivo, "sem_usuario");
  assert.equal((await deps.db.collection("accounts").doc("ana").get()).exists, false);
  const status = [...deps.db._dados.entries()].filter(([k]) => k.startsWith("paymentEvents/")).map(([, v]) => v.status).sort();
  assert.deepEqual(status, ["ignorado", "produto_desconhecido", "sem_usuario"]);
});

test("webhook: cancelamento mantém até o fim do período; reembolso derruba na hora", async () => {
  const deps = criarDeps({ env: envCakto });
  const h = criarHandlerWebhook(deps);
  await chamar(h, criarReq({ token: "", corpo: evento("purchase_approved") }));

  await chamar(h, criarReq({ token: "", corpo: evento("subscription_canceled", { id: "c1" }) }));
  let conta = (await deps.db.collection("accounts").doc("ana").get()).data();
  assert.equal(conta.assinatura.status, "cancelada");
  assert.equal(planoEfetivo(conta, AGORA).plano, "PRO");
  assert.equal(planoEfetivo(conta, new Date(AGORA.getTime() + 40 * 86400000)).plano, "FREE"); // após o período pago

  await chamar(h, criarReq({ token: "", corpo: evento("refund", { id: "r1" }) }));
  conta = (await deps.db.collection("accounts").doc("ana").get()).data();
  assert.equal(conta.plano, "FREE");
  assert.equal(planoEfetivo(conta, AGORA).plano, "FREE");
});

test("webhook: renovação estende o ciclo", async () => {
  const deps = criarDeps({ env: envCakto });
  await chamar(criarHandlerWebhook(deps), criarReq({ token: "", corpo: evento("purchase_approved") }));
  const mais20 = new Date(AGORA.getTime() + 20 * 86400000);
  await chamar(criarHandlerWebhook({ ...deps, now: () => mais20 }), criarReq({ token: "", corpo: evento("subscription_renewed", { id: "ren-2" }) }));
  const conta = (await deps.db.collection("accounts").doc("ana").get()).data();
  assert.ok(conta.assinatura.renovaEm.getTime() > AGORA.getTime() + 45 * 86400000);
  assert.equal(resumoConta(conta, mais20).statusAssinatura, "ativa");
});


// ================= só aparece quem pode ser abordado e precisa do serviço =================
test("busca: plano grátis mostra no máximo 10 empresas e não oferece \"carregar mais\"", async () => {
  const f = criarFetchPlaces({ pizzaria: [muitos("g", 20), muitos("h", 20)], "melhores": [[]], "centro": [[]] });
  const deps = criarDeps({ fetch: f });
  const res = await chamar(criarHandlerLeads(deps), criarReq({ corpo: corpoBusca }));
  assert.equal(res.statusCode, 200);
  assert.equal(res.corpo.empresas.length, 10);
  assert.equal(res.corpo.continuacao, "");
  assert.equal(res.corpo.parcial, false);
  assert.ok(res.corpo.avisos.some((a) => /até 10 empresas/.test(a)));
  assert.equal(res.corpo.uso.usadas, 1);
});

test("busca: descarta Correios, prefeitura, .gov.br, outro tipo de negócio e quem não tem celular", async () => {
  const f = criarFetchPlaces({
    pizzaria: [[
      lugar("ok1"),
      lugar("correios", { displayName: { text: "Correios" }, primaryType: "post_office", types: ["post_office"] }),
      lugar("pref", { displayName: { text: "Prefeitura Municipal de Teresina" }, primaryType: "local_government_office", types: ["local_government_office"], websiteUri: "https://teresina.pi.gov.br" }),
      lugar("outro", { displayName: { text: "Mecânica do Zé" }, primaryType: "car_repair", types: ["car_repair"] }),
      lugar("fixo", { nationalPhoneNumber: "(86) 3222-1234" }),
      lugar("semtel", { nationalPhoneNumber: "" }),
      lugar("temsite", { websiteUri: "https://www.pizzariabomsabor.com.br" })
    ]],
    "melhores": [[]], "centro": [[]]
  });
  const res = await chamar(criarHandlerLeads(criarDeps({ fetch: f })), criarReq({ corpo: corpoBusca }));
  assert.deepEqual(res.corpo.empresas.map((e) => e.id), ["ok1"]);
  const d = res.corpo.descartados;
  assert.equal(d.entidadesPublicas, 2);
  assert.equal(d.foraDoSegmento, 1);
  assert.equal(d.semWhatsapp, 2);
  assert.equal(d.jaTemSite, 1);
  assert.ok(res.corpo.empresas.every((e) => e.whatsapp));
});

test("busca: sem nenhuma empresa aproveitável devolve a pesquisa e informa os motivos", async () => {
  const f = criarFetchPlaces({ pizzaria: [[lugar("fixo", { nationalPhoneNumber: "(86) 3222-1234" })]], "melhores": [[]], "centro": [[]] });
  const res = await chamar(criarHandlerLeads(criarDeps({ fetch: f })), criarReq({ corpo: corpoBusca }));
  assert.equal(res.corpo.total, 0);
  assert.equal(res.corpo.descartados.semWhatsapp, 1);
  assert.equal(res.corpo.uso.usadas, 0); // pesquisa devolvida
});

test("cidade: aceita variações de grafia (hífen, apóstrofo) mas continua recusando outra cidade", () => {
  assert.equal(enderecoDaCidade("Rua A, 1 - Centro, Mogi-Mirim - SP, 13800-000, Brasil", "Mogi Mirim", "SP"), true);
  assert.equal(enderecoDaCidade("Rua A, 1 - Centro, Sant'Ana do Livramento - RS, Brasil", "Sant Ana do Livramento", "RS"), true);
  assert.equal(enderecoDaCidade("Rua A, 1 - Centro, Timon - MA, Brasil", "Teresina", "PI"), false);
  assert.equal(enderecoDaCidade("Rua A, 1 - Centro, Teresina - PI, Brasil", "Teresina", "MA"), false);
});

test("busca: cidade sem resultado aproveitável tenta cidades da mesma microrregião", async () => {
  const endParnaiba = "Rua A, 10 - Centro, Parnaíba - PI, 64200-000, Brasil";
  const endLuis = "Rua B, 20 - Centro, Luís Correia - PI, 64220-000, Brasil";
  const f = criarFetchPlaces({
    "perto de": [[
      lugar("viz1", { formattedAddress: endLuis }),
      lugar("fora", { formattedAddress: "Rua C, 5 - Centro, Teresina - PI, 64000-000, Brasil" }) // outra microrregião
    ]],
    pizzaria: [[lugar("fixo", { formattedAddress: endParnaiba, nationalPhoneNumber: "(86) 3322-1234" })]],
    "melhores": [[]], "centro": [[]]
  });
  const deps = criarDeps({ fetch: f });
  const res = await chamar(criarHandlerLeads(deps), criarReq({ corpo: { ...corpoBusca, cidade: "Parnaíba" } }));
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.corpo.empresas.map((e) => e.id), ["viz1"]);
  assert.equal(res.corpo.empresas[0].cidade, "Luís Correia");
  assert.equal(res.corpo.empresas[0].cidadeVizinha, true);
  assert.deepEqual(res.corpo.cidadesVizinhas, ["Luís Correia"]);
  assert.equal(res.corpo.uso.usadas, 1); // continua sendo 1 pesquisa para o usuário
  assert.ok(res.corpo.avisos.some((a) => /cidades vizinhas/i.test(a)));
});

test("busca: sem cidades vizinhas aproveitáveis devolve vazio e a pesquisa", async () => {
  const f = criarFetchPlaces({ "perto de": [[]], pizzaria: [[lugar("fixo", { formattedAddress: "Rua A, 10 - Centro, Parnaíba - PI, Brasil", nationalPhoneNumber: "(86) 3322-1234" })]], "melhores": [[]], "centro": [[]] });
  const res = await chamar(criarHandlerLeads(criarDeps({ fetch: f })), criarReq({ corpo: { ...corpoBusca, cidade: "Parnaíba" } }));
  assert.equal(res.corpo.total, 0);
  assert.deepEqual(res.corpo.cidadesVizinhas, []);
  assert.equal(res.corpo.uso.usadas, 0);
});

test("site: ola.click é plataforma de cardápio de terceiros, não site próprio", async () => {
  const { classificarSite } = await import("../api/_lib/sites.js");
  assert.equal(classificarSite("https://pizzaria-santaluz2024.ola.click").status, "terceiros");
  assert.equal(classificarSite("https://www.pizzariabomsabor.com.br").status, "proprio");
});
