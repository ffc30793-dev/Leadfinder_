
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

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
  if (getApps().length) {
    return getAuth();
  }

  const credencialRaw =
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY ||
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
    process.env.FIREBASE_SERVICE_ACCOUNT;

  if (!credencialRaw) {
    throw new Error(
      "Configure FIREBASE_SERVICE_ACCOUNT na Vercel."
    );
  }

  let credencial;

  try {
    credencial = JSON.parse(credencialRaw);
  } catch {
    throw new Error(
      "A variável Firebase precisa conter um JSON válido."
    );
  }

  if (credencial.project_id !== "leadfinder-378a9") {
    throw new Error(
      "O projeto da credencial Firebase não corresponde ao projeto LeadFinder."
    );
  }

  initializeApp({
    credential: cert(credencial),
    projectId: "leadfinder-378a9"
  });

  return getAuth();
}

function normalizarTexto(valor = "") {
  return String(valor)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function classificarUrl(url = "") {
  if (!url) {
    return "SITE_NAO_ENCONTRADO";
  }

  try {
    const endereco = new URL(
      url.startsWith("http") ? url : `https://${url}`
    );

    const host = endereco.hostname
      .toLowerCase()
      .replace(/^www\./, "");

    const ehRedeSocial = SOCIAL_DOMAINS.some(
      dominio =>
        host === dominio || host.endsWith(`.${dominio}`)
    );

    return ehRedeSocial
      ? "SO_REDE_SOCIAL"
      : "TEM_SITE";
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
  const statusSite = classificarUrl(site);

  let pontuacao = 0;

  if (statusSite === "SITE_NAO_ENCONTRADO") {
    pontuacao += 10;
  }

  if (statusSite === "SO_REDE_SOCIAL") {
    pontuacao += 6;
  }

  if (telefone) pontuacao += 3;
  if (endereco) pontuacao += 1;

  if (statusSite === "TEM_SITE") {
    pontuacao -= 10;
  }

  return {
    id: place.id || "",
    nome: place.displayName?.text || "Estabelecimento sem nome",
    endereco,
    telefone,
    whatsapp: criarLinkWhatsApp(telefone),
    site,
    mapa: place.googleMapsUri || "",
    situacao: statusSite,
    categoria: place.primaryTypeDisplayName?.text || "",
    avaliacao: place.rating ?? null,
    totalAvaliacoes: place.userRatingCount ?? 0,
    pontuacao
  };
}

function chaveLead(lead) {
  if (lead.id) {
    return `id:${lead.id}`;
  }

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

async function buscarGooglePlaces({
  apiKey,
  consulta,
  cidade,
  estado
}) {
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
      detalhe
    );

    throw new Error(
      `Google Places retornou HTTP ${resposta.status}. Verifique a API, o faturamento, as restrições da chave e a cota.`
    );
  }

  const dados = await resposta.json();

  return dados.places || [];
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

    let usuario;

    try {
      const firebaseAuth = obterFirebaseAdmin();

      usuario = await firebaseAuth.verifyIdToken(token);
    } catch (erroAuth) {
      console.error(
        "Falha na autenticação Firebase:",
        erroAuth.code || "",
        erroAuth.message || ""
      );

      return res.status(401).json({
        sucesso: false,
        erro: "Falha na autenticação Firebase.",
        codigo: erroAuth.code || "sem_codigo",
        detalhe: erroAuth.message || "Erro desconhecido"
      });
    }

    if (!usuario?.uid) {
      return res.status(401).json({
        sucesso: false,
        erro: "Não foi possível validar sua conta."
      });
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        sucesso: false,
        erro: "A variável GOOGLE_MAPS_API_KEY não está configurada na Vercel."
      });
    }

    const corpo = req.body || {};

    const cidade = String(corpo.cidade || "").trim();
    const estado = String(corpo.estado || "").trim();

    const nicho = String(
      corpo.nicho || corpo.segmento || ""
    ).trim();

    if (!cidade || !estado || !nicho) {
      return res.status(400).json({
        sucesso: false,
        erro: "Informe cidade, estado e segmento."
      });
    }

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

    empresas.sort(
      (a, b) => b.pontuacao - a.pontuacao
    );

    return res.status(200).json({
      sucesso: true,
      cidade,
      estado,
      nicho,
      total: empresas.length,
      empresas
    });
  } catch (erro) {
    console.error("Erro na busca de leads:", erro);

    return res.status(500).json({
      sucesso: false,
      erro:
        erro.message?.startsWith("Google Places retornou HTTP")
          ? erro.message
          : "Não foi possível buscar os estabelecimentos. Confira os logs da Vercel."
    });
  }
}
