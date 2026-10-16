
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const PROJECT_ID = "leadfinder-378a9";
const COLECAO_USUARIOS = "usuarios";
const CUSTO_BUSCA = 6;

const SOCIAL_DOMAINS = [
  "instagram.com",
  "facebook.com",
  "tiktok.com",
  "linkedin.com",
  "youtube.com",
  "youtu.be",
  "x.com",
  "twitter.com",
  "wa.me",
  "whatsapp.com"
];

function obterFirebaseAdmin() {
  const existente = getApps().find(
    app => app.options.projectId === PROJECT_ID
  );

  if (existente) return existente;

  const credencialRaw =
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY ||
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
    process.env.FIREBASE_SERVICE_ACCOUNT;

  if (!credencialRaw) {
    throw new Error(
      "Configure a credencial Firebase nas variáveis da Vercel."
    );
  }

  let credencial;

  try {
    credencial = JSON.parse(credencialRaw);
  } catch {
    throw new Error("A credencial Firebase precisa ser um JSON válido.");
  }

  if (credencial.project_id !== PROJECT_ID) {
    throw new Error("A credencial pertence a outro projeto Firebase.");
  }

  return initializeApp({
    credential: cert(credencial),
    projectId: PROJECT_ID
  });
}

function normalizarTexto(valor = "") {
  return String(valor)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function classificarUrl(url = "") {
  if (!url) return "SITE_NAO_ENCONTRADO";

  try {
    const endereco = new URL(
      /^https?:\/\//i.test(url) ? url : `https://${url}`
    );

    const host = endereco.hostname
      .toLowerCase()
      .replace(/^www\./, "");

    const ehRedeSocial = SOCIAL_DOMAINS.some(
      dominio => host === dominio || host.endsWith(`.${dominio}`)
    );

    return ehRedeSocial ? "SO_REDE_SOCIAL" : "TEM_SITE";
  } catch {
    return "SITE_NAO_ENCONTRADO";
  }
}

function normalizarTelefone(telefone = "") {
  return String(telefone).replace(/\D/g, "");
}

function criarLinkWhatsApp(telefone = "") {
  const numero = normalizarTelefone(telefone);
  return numero ? `https://wa.me/${numero}` : "";
}

function formatarLead(place) {
  const site = place.websiteUri || "";
  const telefone =
    place.nationalPhoneNumber ||
    place.internationalPhoneNumber ||
    "";

  const endereco = place.formattedAddress || "";
  const situacao = classificarUrl(site);

  let pontuacao = 0;

  if (situacao === "SITE_NAO_ENCONTRADO") pontuacao += 10;
  if (situacao === "SO_REDE_SOCIAL") pontuacao += 6;
  if (telefone) pontuacao += 3;
  if (endereco) pontuacao += 1;
  if (situacao === "TEM_SITE") pontuacao -= 10;

  return {
    id: place.id || "",
    nome: place.displayName?.text || "Estabelecimento sem nome",
    endereco,
    telefone,
    whatsapp: criarLinkWhatsApp(telefone),
    site,
    mapa: place.googleMapsUri || "",
    situacao,
    categoria: place.primaryTypeDisplayName?.text || "",
    avaliacao: place.rating ?? null,
    totalAvaliacoes: place.userRatingCount ?? 0,
    pontuacao
  };
}

function chaveLead(lead) {
  if (lead.id) return `id:${lead.id}`;

  return [
    normalizarTexto(lead.nome),
    normalizarTexto(lead.endereco)
  ].join("|");
}

function removerDuplicados(leads) {
  const unicos = new Map();

  for (const lead of leads) {
    const chave = chaveLead(lead);
    const anterior = unicos.get(chave);

    const completude = item =>
      Number(Boolean(item.telefone)) +
      Number(Boolean(item.site)) +
      Number(Boolean(item.endereco));

    if (!anterior || completude(lead) > completude(anterior)) {
      unicos.set(chave, lead);
    }
  }

  return [...unicos.values()];
}

async function buscarGooglePlaces({ apiKey, consulta, cidade, estado }) {
  const resposta = await fetch(
    "https://places.googleapis.com/v1/places:searchText",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": [
          "places.id",
          "places.displayName",
          "places.formattedAddress",
          "places.nationalPhoneNumber",
          "places.internationalPhoneNumber",
          "places.websiteUri",
          "places.primaryTypeDisplayName",
          "places.rating",
          "places.userRatingCount",
          "places.googleMapsUri"
        ].join(",")
      },
      body: JSON.stringify({
        textQuery: `${consulta} em ${cidade}, ${estado}, Brasil`,
        pageSize: 20,
        languageCode: "pt-BR",
        regionCode: "BR"
      })
    }
  );

  if (!resposta.ok) {
    const detalhe = await resposta.text();

    console.error(
      "Google Places:",
      resposta.status,
      detalhe.slice(0, 500)
    );

    throw new Error(
      `Google Places retornou HTTP ${resposta.status}.`
    );
  }

  const dados = await resposta.json();
  return dados.places || [];
}

async function descontarCreditos(db, uid, perfilAuth = {}) {
  const referencia = db.collection(COLECAO_USUARIOS).doc(uid);

  return db.runTransaction(async transacao => {
    const documento = await transacao.get(referencia);

    // Conta sem perfil no Firestore: cria o perfil FREE com 30 créditos.
    if (!documento.exists) {
      transacao.set(referencia, {
        nome: perfilAuth.name || (perfilAuth.email || "").split("@")[0] || "",
        email: perfilAuth.email || "",
        plano: "FREE",
        creditos: 30,
        criadoEm: FieldValue.serverTimestamp(),
        atualizadoEm: FieldValue.serverTimestamp()
      });
    }

    const usuario = documento.exists ? documento.data() : { creditos: 30 };
    const creditos = Number(usuario.creditos);

    if (!Number.isFinite(creditos) || creditos < CUSTO_BUSCA) {
      const erro = new Error(
        "Créditos insuficientes. Você precisa de 6 créditos para pesquisar."
      );
      erro.status = 402;
      throw erro;
    }

    const restantes = creditos - CUSTO_BUSCA;

    transacao.set(
      referencia,
      { creditos: restantes, atualizadoEm: FieldValue.serverTimestamp() },
      { merge: true }
    );

    return restantes;
  });
}

async function devolverCreditos(db, uid) {
  const referencia = db.collection(COLECAO_USUARIOS).doc(uid);

  await db.runTransaction(async transacao => {
    const documento = await transacao.get(referencia);
    if (!documento.exists) return;

    const creditos = Number(documento.data().creditos);
    if (!Number.isFinite(creditos)) return;

    transacao.update(referencia, {
      creditos: creditos + CUSTO_BUSCA,
      atualizadoEm: FieldValue.serverTimestamp()
    });
  });
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");

    return res.status(405).json({
      sucesso: false,
      erro: "Método não permitido. Use POST."
    });
  }

  let uid;
  let db;
  let cobrou = false;

  try {
    const autorizacao = req.headers.authorization || "";
    const token = autorizacao.startsWith("Bearer ")
      ? autorizacao.slice(7).trim()
      : "";

    if (!token) {
      return res.status(401).json({
        sucesso: false,
        erro: "Faça login para pesquisar leads."
      });
    }

    const app = obterFirebaseAdmin();
    const auth = getAuth(app);
    db = getFirestore(app);

    let usuario;

    try {
      usuario = await auth.verifyIdToken(token);
    } catch {
      return res.status(401).json({
        sucesso: false,
        erro: "Sua sessão é inválida ou expirou. Entre novamente."
      });
    }

    uid = usuario.uid;

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        sucesso: false,
        erro: "GOOGLE_MAPS_API_KEY não está configurada na Vercel."
      });
    }

    const corpo = req.body || {};
    const cidade = String(corpo.cidade || "").trim().slice(0, 100);
    const estado = String(corpo.estado || "").trim().slice(0, 100);
    const nicho = String(corpo.nicho || corpo.segmento || "")
      .trim()
      .slice(0, 100);

    if (!cidade || !estado || !nicho) {
      return res.status(400).json({
        sucesso: false,
        erro: "Informe cidade, estado e segmento."
      });
    }

    // Os créditos são validados e descontados no servidor.
    const creditosRestantes = await descontarCreditos(db, uid, usuario);
    cobrou = true;

    try {
      const consultas = [
        nicho,
        `${nicho} comércio`,
        `${nicho} empresa`,
        `${nicho} estabelecimento`
      ];

      const resultados = await Promise.all(
        consultas.map(consulta =>
          buscarGooglePlaces({
            apiKey,
            consulta,
            cidade,
            estado
          })
        )
      );

      const empresas = removerDuplicados(
        resultados.flat().map(formatarLead)
      );

      empresas.sort((a, b) => b.pontuacao - a.pontuacao);

      return res.status(200).json({
        sucesso: true,
        cidade,
        estado,
        nicho,
        total: empresas.length,
        empresas,
        creditosUtilizados: CUSTO_BUSCA,
        creditosRestantes
      });
    } catch (erroBusca) {
      // Se a busca falhar, tenta devolver os créditos descontados.
      try {
        await devolverCreditos(db, uid);
        cobrou = false;
      } catch (erroEstorno) {
        console.error("Falha ao devolver créditos:", erroEstorno);
      }

      console.error("Erro Google Places:", erroBusca);

      return res.status(502).json({
        sucesso: false,
        erro: "A busca falhou. Atualize o painel e confira seu saldo de créditos."
      });
    }
  } catch (erro) {
    console.error("Erro na API de leads:", erro);

    if (erro.status) {
      return res.status(erro.status).json({
        sucesso: false,
        erro: erro.message
      });
    }

    return res.status(500).json({
      sucesso: false,
      erro: "Erro interno ao pesquisar leads. Confira os logs da Vercel."
    });
  }
}
