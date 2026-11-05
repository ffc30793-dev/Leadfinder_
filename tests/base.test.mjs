import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

import { normalizarTelefoneBR, linkWhatsApp, statusWhatsApp } from "../shared/phone.js";
import { validarEntrada, montarConsultas, criarCursor, lerCursor, ErroDeEntrada } from "../api/_lib/estrategia.js";
import { classificarSite, inspecionarSite } from "../api/_lib/sites.js";
import { enderecoDaCidade } from "../api/_lib/places.js";

// ---------------- telefone ----------------
test("telefone: celular com máscara vira link wa.me com 55 + DDD", () => {
  const n = normalizarTelefoneBR("(86) 99999-1234");
  assert.equal(n.tipo, "movel");
  assert.equal(n.e164, "5586999991234");
  assert.equal(linkWhatsApp(n), "https://wa.me/5586999991234");
});

test("telefone: aceita +55, 0055 e espaços", () => {
  assert.equal(normalizarTelefoneBR("+55 86 99999-1234").e164, "5586999991234");
  assert.equal(normalizarTelefoneBR("0055 86 99999 1234").e164, "5586999991234");
});

test("telefone: fixo NÃO gera link de WhatsApp", () => {
  const n = normalizarTelefoneBR("(86) 3222-1234");
  assert.equal(n.tipo, "fixo");
  assert.equal(linkWhatsApp(n), "");
  assert.equal(statusWhatsApp(n), "fixo");
});

test("telefone: formato antigo de celular (8 dígitos iniciando em 9) é 'incerto' e sem link", () => {
  const n = normalizarTelefoneBR("(86) 9999-1234");
  assert.equal(n.tipo, "incerto");
  assert.equal(linkWhatsApp(n), "");
});

test("telefone: 0800, DDD inexistente, vazio e lixo são rejeitados", () => {
  assert.equal(normalizarTelefoneBR("0800 123 4567").valido, false);
  assert.equal(normalizarTelefoneBR("(10) 99999-1234").valido, false);
  assert.equal(normalizarTelefoneBR("").tipo, "ausente");
  assert.equal(normalizarTelefoneBR("123").valido, false);
  assert.equal(linkWhatsApp(normalizarTelefoneBR("123")), "");
});

// ---------------- entrada e estratégia ----------------
const base = { estado: "PI", cidade: "Teresina", segmento: "Pizzaria", servico: "criacao-sites" };

test("entrada: valida estado, cidade e segmento", () => {
  assert.throws(() => validarEntrada({ ...base, estado: "XX" }), ErroDeEntrada);
  assert.throws(() => validarEntrada({ ...base, cidade: "" }), ErroDeEntrada);
  assert.throws(() => validarEntrada({ ...base, segmento: "" }), /segmento/i); // criação de sites exige segmento
  assert.throws(() => validarEntrada({ ...base, servico: "inexistente" }), ErroDeEntrada);
  assert.throws(() => validarEntrada({ ...base, cidade: "<script>" }), ErroDeEntrada);
});

test("entrada: cardápios aceita busca ampla sem segmento, mas recusa segmento fora de alimentação", () => {
  const ok = validarEntrada({ ...base, servico: "cardapios-catalogos", segmento: "" });
  assert.equal(ok.segmento, null);
  assert.throws(() => validarEntrada({ ...base, servico: "cardapios-catalogos", segmento: "Barbearia" }), /não se aplica/);
});

test("estratégia: o serviço muda as consultas (cardápios amplia para alimentação)", () => {
  const sites = montarConsultas(validarEntrada(base));
  const cardapio = montarConsultas(validarEntrada({ ...base, servico: "cardapios-catalogos", segmento: "" }));
  assert.ok(sites.every((q) => /pizz/i.test(q)));
  assert.ok(cardapio.some((q) => /restaurante/i.test(q)) && cardapio.some((q) => /lanchonete/i.test(q)));
  assert.notDeepEqual(sites, cardapio);
});

test("estratégia: consultas sem repetição e limitadas", () => {
  const q = montarConsultas(validarEntrada(base), 4);
  assert.equal(new Set(q.map((x) => x.toLowerCase())).size, q.length);
  assert.ok(q.length <= 4 && q.length >= 3);
  assert.ok(q.every((x) => x.includes("Teresina, Piauí")));
});

test("estratégia: segmento digitado livremente vira termo de busca", () => {
  const e = validarEntrada({ ...base, segmento: "Loja de instrumentos musicais" });
  assert.equal(montarConsultas(e)[0], "Loja de instrumentos musicais em Teresina, Piauí");
});

// ---------------- cursor ----------------
test("cursor: assinado, íntegro e à prova de adulteração", () => {
  const c = criarCursor({ uid: "ana", n: 1 }, "seg");
  assert.deepEqual(lerCursor(c, "seg"), { uid: "ana", n: 1 });
  assert.equal(lerCursor(c, "outro-segredo"), null);
  const [p, s] = c.split(".");
  const adulterado = `${Buffer.from(JSON.stringify({ uid: "bia", n: 1 })).toString("base64url")}.${s}`;
  assert.equal(lerCursor(adulterado, "seg"), null);
  assert.equal(lerCursor("lixo", "seg"), null);
});

// ---------------- cidade no endereço ----------------
test("endereço: aceita a cidade pedida e rejeita vizinhas", () => {
  assert.ok(enderecoDaCidade("Rua A, 1 - Centro, Teresina - PI, 64000-000, Brasil", "Teresina", "PI"));
  assert.ok(!enderecoDaCidade("Rua B, 2 - Centro, Timon - MA, 65630-000, Brasil", "Teresina", "PI"));
  assert.ok(!enderecoDaCidade("Av. X, 3, Teresina - MA", "Teresina", "PI")); // mesmo nome, outro estado
  assert.ok(enderecoDaCidade("Rua Y, 4 - Sao Miguel do Tapuio - PI", "São Miguel do Tapuio", "PI")); // acentos
  assert.ok(enderecoDaCidade("SQS 1, Asa Sul, Brasília - DF, Brasil", "Brasília", "DF"));
});

// ---------------- sites ----------------
test("site: classifica ausente, rede social, plataforma gratuita e domínio próprio", () => {
  assert.equal(classificarSite("").status, "nao_identificado");
  assert.equal(classificarSite("https://www.instagram.com/barbearia").status, "terceiros");
  assert.equal(classificarSite("https://linktr.ee/loja").status, "terceiros");
  assert.equal(classificarSite("https://minhaloja.wixsite.com/inicio").status, "plataforma_gratuita");
  assert.equal(classificarSite("https://www.barbeariadoze.com.br/").status, "proprio");
});

function servidor(rotas) {
  return new Promise((resolve) => {
    const s = http.createServer((req, res) => {
      const r = rotas[req.url] || { status: 404, corpo: "x" };
      res.writeHead(r.status, { "Content-Type": "text/html", ...(r.cab || {}) });
      res.end(r.corpo || "");
    });
    s.listen(0, "127.0.0.1", () => resolve({ s, url: `http://127.0.0.1:${s.address().port}` }));
  });
}

test("inspeção: bloqueia endereços privados (SSRF) por padrão", async () => {
  const { s, url } = await servidor({ "/": { status: 200, corpo: "<html></html>" } });
  const r = await inspecionarSite(url + "/");
  s.close();
  assert.equal(r.ok, false);
  assert.equal(r.erro, "host_bloqueado");
});

test("inspeção: extrai viewport, copyright antigo, tecnologia antiga e sinais de loja", async () => {
  const { s, url } = await servidor({
    "/velho": { status: 200, corpo: "<html><frameset></frameset>© 2012 Loja</html>" },
    "/novo": { status: 200, corpo: '<html><meta name="viewport" content="width=device-width"><body>Carrinho — © 2026</body></html>' },
    "/redir": { status: 302, cab: { Location: "/novo" } },
    "/quebrado": { status: 500, corpo: "erro" }
  });
  const o = { permitirPrivado: true, agora: new Date("2026-10-24T00:00:00Z") };
  const velho = await inspecionarSite(url + "/velho", o);
  const novo = await inspecionarSite(url + "/novo", o);
  const redir = await inspecionarSite(url + "/redir", o);
  const quebrado = await inspecionarSite(url + "/quebrado", o);
  s.close();

  assert.equal(velho.viewport, false);
  assert.equal(velho.anoCopyright, 2012);
  assert.equal(velho.tecnologiaAntiga, true);
  assert.equal(novo.viewport, true);
  assert.deepEqual(novo.sinaisLoja, ["carrinho"]);
  assert.equal(redir.viewport, true); // seguiu o redirecionamento
  assert.equal(quebrado.fora, true);
  assert.equal(quebrado.status, 500);
});

test("inspeção: tempo esgotado não lança erro", async () => {
  const s = http.createServer(() => { /* nunca responde */ });
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  const r = await inspecionarSite(`http://127.0.0.1:${s.address().port}/`, { permitirPrivado: true, timeoutMs: 200 });
  s.closeAllConnections?.();
  s.close();
  assert.equal(r.ok, false);
  assert.equal(r.erro, "tempo_esgotado");
});
