// Utilitários de teste (sem rede, sem Firebase real).

/** Firestore mínimo em memória: collection/doc/get/set/update/add e transações serializadas. */
export function criarDbFalso() {
  const dados = new Map(); // caminho -> objeto
  let fila = Promise.resolve();
  let contador = 0;

  const snap = (caminho) => ({
    exists: dados.has(caminho),
    data: () => (dados.has(caminho) ? structuredClone(dados.get(caminho)) : undefined),
    id: caminho.split("/").pop()
  });

  function doc(caminho) {
    return {
      path: caminho,
      get: async () => snap(caminho),
      set: async (v) => { dados.set(caminho, structuredClone(v)); },
      update: async (v) => {
        if (!dados.has(caminho)) throw new Error("not-found");
        dados.set(caminho, { ...dados.get(caminho), ...structuredClone(v) });
      },
      collection: (nome) => colecao(`${caminho}/${nome}`)
    };
  }
  function colecao(caminho) {
    return {
      doc: (id) => doc(`${caminho}/${id}`),
      add: async (v) => {
        const id = `auto${++contador}`;
        dados.set(`${caminho}/${id}`, structuredClone(v));
        return { id };
      }
    };
  }

  const db = {
    _dados: dados,
    collection: (nome) => colecao(nome),
    runTransaction: (fn) => {
      // Transações serializadas: mesmo resultado que a repetição otimista do Firestore.
      const execucao = fila.then(async () => {
        const escritas = [];
        const tx = {
          get: async (ref) => snap(ref.path),
          set: (ref, v) => escritas.push(() => dados.set(ref.path, structuredClone(v))),
          update: (ref, v) => escritas.push(() => {
            if (!dados.has(ref.path)) throw new Error("not-found");
            dados.set(ref.path, { ...dados.get(ref.path), ...structuredClone(v) });
          })
        };
        const retorno = await fn(tx);
        escritas.forEach((e) => e());
        return retorno;
      });
      fila = execucao.catch(() => {});
      return execucao;
    }
  };
  return db;
}

export function criarRes() {
  const res = {
    statusCode: 200,
    headers: {},
    corpo: undefined,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    status(c) { this.statusCode = c; return this; },
    json(o) { this.corpo = o; return this; }
  };
  return res;
}

export function criarReq({ metodo = "POST", corpo = {}, token = "tok-ana", cabecalhos = {} } = {}) {
  return {
    method: metodo,
    body: corpo,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...cabecalhos }
  };
}

export const AGORA = new Date("2026-10-24T15:00:00Z"); // 12h em Brasília

export function criarDeps(extra = {}) {
  const db = extra.db || criarDbFalso();
  return {
    db,
    env: { GOOGLE_PLACES_API_KEY: "chave-teste", ...(extra.env || {}) },
    now: () => extra.agora || AGORA,
    segredoCursor: "segredo-de-teste",
    verifyToken: async (t) => {
      if (t === "tok-ana") return { uid: "ana" };
      if (t === "tok-bia") return { uid: "bia" };
      throw new Error("token inválido");
    },
    getUserByEmail: extra.getUserByEmail || (async (email) => {
      if (email === "ana@exemplo.com") return { uid: "ana" };
      const e = new Error("não existe"); e.code = "auth/user-not-found"; throw e;
    }),
    fetch: extra.fetch || (async () => { throw new Error("fetch não simulado"); })
  };
}

/** Cria um lugar do Google com valores padrão. */
export function lugar(id, extra = {}) {
  return {
    id,
    displayName: { text: `Pizzaria ${id}` },
    primaryType: "pizza_restaurant",
    types: ["pizza_restaurant", "restaurant"],
    formattedAddress: `Rua A, 10 - Centro, Teresina - PI, 64000-000, Brasil`,
    nationalPhoneNumber: "(86) 99999-1234",
    googleMapsUri: `https://maps.google.com/?cid=${id}`,
    businessStatus: "OPERATIONAL",
    userRatingCount: 12,
    rating: 4.6,
    ...extra
  };
}

/**
 * fetch simulado do Places. `paginas`: { "<trecho da consulta>": [[lugares pág.1], [lugares pág.2], ...] }.
 * Também responde ao IBGE com municípios fixos.
 */
export function criarFetchPlaces(paginas, { falharNaRequisicao = 0, status = 200 } = {}) {
  const chamadas = [];
  const f = async (url, opcoes = {}) => {
    if (String(url).includes("servicodados.ibge.gov.br")) {
      return { ok: true, status: 200, json: async () => [{ nome: "Teresina", microrregiao: { id: 1 } }, { nome: "Parnaíba", microrregiao: { id: 2 } }, { nome: "Luís Correia", microrregiao: { id: 2 } }, { nome: "São Miguel do Tapuio", microrregiao: { id: 3 } }] };
    }
    const corpo = JSON.parse(opcoes.body);
    chamadas.push(corpo);
    if (falharNaRequisicao && chamadas.length >= falharNaRequisicao && chamadas.length < falharNaRequisicao + 2) { // falha a tentativa e a repetição
      return { ok: false, status: 503, json: async () => ({}) };
    }
    if (status !== 200) return { ok: false, status, json: async () => ({ error: { status: "X" } }) };
    const especiais = /^(melhores|centro)$/;
    const ordem = Object.keys(paginas).sort((a, b) => Number(especiais.test(b)) - Number(especiais.test(a)));
    const chave = ordem.find((k) => corpo.textQuery.toLowerCase().includes(k));
    const lista = paginas[chave] || [[]];
    const idx = corpo.pageToken ? Number(corpo.pageToken.split(":")[1]) : 0;
    const proxima = idx + 1 < lista.length ? `${chave}:${idx + 1}` : undefined;
    return { ok: true, status: 200, json: async () => ({ places: lista[idx] || [], nextPageToken: proxima }) };
  };
  f.chamadas = chamadas;
  return f;
}
