export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ erro: "Use POST." });
  }

  try {
    const firebaseKey = process.env.FIREBASE_API_KEY;
    const placesKey = process.env.GOOGLE_PLACES_API_KEY;

    if (!firebaseKey) {
      return res.status(500).json({
        erro: "Configure FIREBASE_API_KEY na Vercel."
      });
    }

    if (!placesKey) {
      return res.status(500).json({
        erro: "Configure GOOGLE_PLACES_API_KEY na Vercel."
      });
    }

    // Verifica a sessão do usuário no Firebase.
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : "";

    if (!token) {
      return res.status(401).json({
        erro: "Faça login para buscar empresas."
      });
    }

    const authResponse = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(firebaseKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken: token })
      }
    );

    if (!authResponse.ok) {
      return res.status(401).json({
        erro: "Sessão inválida. Entre novamente."
      });
    }

    const body = req.body || {};
    const cidade = String(body.cidade || "").trim();
    const estado = String(body.estado || "").trim();
    const nicho = String(body.nicho || "").trim();

    if (!cidade || !estado || !nicho) {
      return res.status(400).json({
        erro: "Informe cidade, estado e segmento."
      });
    }

    if (
      cidade.length > 100 ||
      estado.length > 60 ||
      nicho.length > 100
    ) {
      return res.status(400).json({
        erro: "Um dos filtros é muito longo."
      });
    }

    // Pesquisa estabelecimentos na Google Places API.
    const respostaGoogle = await fetch(
      "https://places.googleapis.com/v1/places:searchText",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": placesKey,
          "X-Goog-FieldMask": [
            "places.id",
            "places.displayName",
            "places.formattedAddress",
            "places.nationalPhoneNumber",
            "places.internationalPhoneNumber",
            "places.websiteUri",
            "places.googleMapsUri"
          ].join(",")
        },
        body: JSON.stringify({
          textQuery: `${nicho} em ${cidade}, ${estado}, Brasil`,
          languageCode: "pt-BR",
          regionCode: "BR",
          pageSize: 20
        })
      }
    );

    const dadosGoogle = await respostaGoogle.json().catch(() => ({}));

    if (!respostaGoogle.ok) {
      console.error(
        "Erro Google Places:",
        respostaGoogle.status,
        dadosGoogle
      );

      if (respostaGoogle.status === 403) {
        return res.status(502).json({
          erro: "A Google Places API recusou a consulta. Verifique o faturamento, as restrições da chave e se a API está ativada."
        });
      }

      if (respostaGoogle.status === 429) {
        return res.status(429).json({
          erro: "Limite de consultas atingido. Tente novamente mais tarde."
        });
      }

      return res.status(502).json({
        erro: "Não foi possível consultar o Google Places. Confira a configuração da API."
      });
    }

    const empresas = (dadosGoogle.places || []).map((local) => {
      const telefone =
        local.nationalPhoneNumber ||
        local.internationalPhoneNumber ||
        "";

      let numero = telefone.replace(/\D/g, "");

      if (
        numero &&
        local.internationalPhoneNumber
      ) {
        numero = local.internationalPhoneNumber.replace(/\D/g, "");
      }

      return {
        id: local.id,
        nome: local.displayName?.text || "Empresa sem nome",
        endereco: local.formattedAddress || `${cidade}, ${estado}`,
        telefone,
        site: local.websiteUri || "",
        mapa: local.googleMapsUri || "",
        situacao: "UNKNOWN",
        whatsapp: numero ? `https://wa.me/${numero}` : ""
      };
    });

    return res.status(200).json({
      sucesso: true,
      quantidade: empresas.length,
      fonte: "Google Places API",
      aviso: "Os dados dependem das informações disponíveis no Google. Confirme os contatos antes de abordar as empresas.",
      empresas
    });

  } catch (error) {
    console.error("Erro na busca:", error);

    return res.status(500).json({
      erro: "Erro interno ao buscar empresas. Tente novamente."
    });
  }
}
