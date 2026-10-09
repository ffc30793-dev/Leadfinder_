
export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({
      erro: "Use o método POST."
    });
  }

  try {
    const firebaseKey = process.env.FIREBASE_API_KEY;
    const googleKey = process.env.GOOGLE_MAPS_API_KEY;

    if (!firebaseKey || !googleKey) {
      return res.status(500).json({
        erro: "Configure FIREBASE_API_KEY e GOOGLE_MAPS_API_KEY na Vercel."
      });
    }

    // Verifica se o usuário está autenticado no Firebase.
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
        erro: "Sessão inválida. Entre novamente na sua conta."
      });
    }

    const authData = await authResponse.json();
    const user = authData.users?.[0];

    if (!user) {
      return res.status(401).json({
        erro: "Usuário não encontrado."
      });
    }

    // Recebe os filtros enviados pelo site.
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

    // Pesquisa empresas no Google Places.
    const consulta = `${nicho} em ${cidade}, ${estado}, Brasil`;

    const placesResponse = await fetch(
      "https://places.googleapis.com/v1/places:searchText",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": googleKey,
          "X-Goog-FieldMask": [
            "places.id",
            "places.displayName",
            "places.formattedAddress",
            "places.nationalPhoneNumber",
            "places.websiteUri",
            "places.googleMapsUri",
            "places.businessStatus"
          ].join(",")
        },
        body: JSON.stringify({
          textQuery: consulta,
          pageSize: 10,
          languageCode: "pt-BR",
          regionCode: "BR"
        })
      }
    );

    const placesData = await placesResponse.json();

    if (!placesResponse.ok) {
      console.error("Google Places:", placesData);
      return res.status(502).json({
        erro: "Não foi possível consultar o Google Places. Confira a API e a chave na Vercel."
      });
    }

    const empresas = (placesData.places || []).map((place) => ({
      id: place.id || "",
      nome: place.displayName?.text || "Empresa sem nome",
      endereco: place.formattedAddress || "",
      telefone: place.nationalPhoneNumber || "",
      site: place.websiteUri || "",
      mapa: place.googleMapsUri || "",
      situacao: place.businessStatus || "UNKNOWN",
      whatsapp: place.nationalPhoneNumber
        ? `https://wa.me/${place.nationalPhoneNumber.replace(/\D/g, "").replace(/^0+/, "")}`
        : ""
    }));

    return res.status(200).json({
      sucesso: true,
      quantidade: empresas.length,
      empresas
    });
  } catch (error) {
    console.error("Erro na busca:", error);

    return res.status(500).json({
      erro: "Erro interno ao buscar empresas."
    });
  }
}

