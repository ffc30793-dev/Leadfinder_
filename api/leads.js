// api/leads.js

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
      url.startsWith("http") ? url : `https://${url}`
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

  if (!numero) return null;

  // O link é uma tentativa de contato; não confirma que o número
  // esteja cadastrado no WhatsApp.
  return `https://wa.me/${numero}`;
}

function pontuarLead(lead) {
  let pontos = 0;

  if (lead.statusSite === "SITE_NAO_ENCONTRADO") pontos += 10;
  if (lead.statusSite === "SO_REDE_SOCIAL") pontos += 6;
  if (lead.telefone) pontos += 3;
  if (lead.endereco) pontos += 1;
  if (lead.site && lead.statusSite === "TEM_SITE") pontos -= 10;

  return pontos;
}

function chaveLead(lead) {
  if (lead.placeId) return `place:${lead.placeId}`;

  // Não deduplicar somente pelo telefone: filiais diferentes podem
  // compartilhar o mesmo número.
  return [
    normalizarTexto(lead.nome),
    normalizarTexto(lead.endereco)
  ].join("|");
}

function removerDuplicados(leads) {
  const unicos = new Map();

  for (const lead of leads) {
    const chave = chaveLead(lead);

    if (!unicos.has(chave)) {
      unicos.set(chave, lead);
      continue;
    }

    // Quando há registros equivalentes, conservar o mais completo.
    const anterior = unicos.get(chave);
    const completude = item =>
      Number(Boolean(item.telefone)) +
      Number(Boolean(item.site)) +
      Number(Boolean(item.endereco)) +
      Number(Boolean(item.placeId));

    if (completude(lead) > completude(anterior)) {
      unicos.set(chave, lead);
    }
  }

  return [...unicos.values()];
}

function formatarLead(place) {
  const site = place.websiteUri || "";
  const telefone = place.nationalPhoneNumber || place.internationalPhoneNumber || "";
  const statusSite = classificarUrl(site);

  const lead = {
    placeId: place.id || "",
    nome: place.displayName?.text || "Estabelecimento sem nome",
    endereco: place.formattedAddress || "",
    telefone,
    whatsapp: criarLinkWhatsApp(telefone),
    site,
    statusSite,
    categoria: place.primaryTypeDisplayName?.text || "",
    avaliacao: place.rating ?? null,
    totalAvaliacoes: place.userRatingCount ?? 0,
    mapsUrl: place.googleMapsUri || ""
  };

  lead.pontuacao = pontuarLead(lead);

  return lead;
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
    const erro = await resposta.text();
    throw new Error(`Google Places retornou ${resposta.status}: ${erro}`);
  }

  const dados = await resposta.json();
  return dados.places || [];
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      sucesso: false,
      erro: "Método não permitido."
    });
  }

  try {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        sucesso: false,
        erro: "A chave da API do Google Places não está configurada na Vercel."
      });
    }

    const corpo = req.body || {};
    const cidade = String(corpo.cidade || "").trim();
    const estado = String(corpo.estado || "").trim();
    const nicho = String(corpo.nicho || corpo.segmento || "").trim();

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

    const leads = resultados
      .flat()
      .map(formatarLead);

    const unicos = removerDuplicados(leads);

    unicos.sort((a, b) => b.pontuacao - a.pontuacao);

    return res.status(200).json({
      sucesso: true,
      cidade,
      estado,
      nicho,
      total: unicos.length,
      leads: unicos
    });
  } catch (erro) {
    console.error("Erro na busca de leads:", erro);

    return res.status(500).json({
      sucesso: false,
      erro: "Não foi possível buscar os estabelecimentos. Tente novamente."
    });
  }
};
