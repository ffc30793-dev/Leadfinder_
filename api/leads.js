
export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ erro: "Use POST." });
  }

  try {
    // Mantém a verificação de login pelo Firebase.
    const firebaseKey = process.env.FIREBASE_API_KEY;

    if (!firebaseKey) {
      return res.status(500).json({
        erro: "Configure FIREBASE_API_KEY na Vercel."
      });
    }

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

    // Localiza a cidade usando OpenStreetMap.
    const local = `${cidade}, ${estado}, Brasil`;
    const geoUrl = new URL(
      "https://nominatim.openstreetmap.org/search"
    );
    geoUrl.searchParams.set("q", local);
    geoUrl.searchParams.set("format", "jsonv2");
    geoUrl.searchParams.set("limit", "1");
    geoUrl.searchParams.set("countrycodes", "br");

    const geoResponse = await fetch(geoUrl, {
      headers: {
        "User-Agent": "LeadFinder/1.0 (business search)"
      }
    });

    if (!geoResponse.ok) {
      return res.status(502).json({
        erro: "Não foi possível localizar a cidade. Tente novamente."
      });
    }

    const locais = await geoResponse.json();

    if (!locais.length) {
      return res.status(404).json({
        erro: "Cidade não encontrada. Confira cidade e estado."
      });
    }

    const { lat, lon } = locais[0];
    const raio = 10000;

    // Converte o segmento em categorias do OpenStreetMap.
    const termo = nicho.toLowerCase();
    let filtro;

    if (/restaurante|pizzaria|hamburgueria|lanchonete|cafeteria|padaria|bar/.test(termo)) {
      filtro = '["amenity"~"restaurant|fast_food|cafe|bar|pub|food_court|ice_cream"]';
    } else if (/salão|salao|barbearia|beleza/.test(termo)) {
      filtro = '["shop"="hairdresser"]';
    } else if (/dentista|clínica|clinica|médic|medic/.test(termo)) {
      filtro = '["amenity"~"clinic|dentist|doctors"]';
    } else if (/hotel|pousada/.test(termo)) {
      filtro = '["tourism"~"hotel|guest_house|motel|hostel"]';
    } else if (/mercado|supermercado/.test(termo)) {
      filtro = '["shop"~"supermarket|convenience|greengrocer"]';
    } else if (/loja|roupa|calçado|calcado/.test(termo)) {
      filtro = '["shop"~"clothes|shoes|electronics|variety_store"]';
    } else if (/oficina|auto center|mecânica|mecanica/.test(termo)) {
      filtro = '["shop"~"car_repair|tyres"]';
    } else if (/academia|fitness/.test(termo)) {
      filtro = '["leisure"="fitness_centre"]';
    } else if (/pet/.test(termo)) {
      filtro = '["shop"~"pet|pet_grooming"]';
    } else {
      filtro = '["name"]';
    }

    const query = `
      [out:json][timeout:20];
      (
        node${filtro}(around:${raio},${lat},${lon});
        way${filtro}(around:${raio},${lat},${lon});
        relation${filtro}(around:${raio},${lat},${lon});
      );
      out center tags 60;
    `;

    const overpassResponse = await fetch(
      "https://overpass-api.de/api/interpreter",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: "data=" + encodeURIComponent(query)
      }
    );

    if (!overpassResponse.ok) {
      return res.status(502).json({
        erro: "A busca gratuita está ocupada. Aguarde e tente novamente."
      });
    }

    const dados = await overpassResponse.json();

    const empresas = (dados.elements || [])
      .map((item) => {
        const tags = item.tags || {};
        const nome = tags.name || tags.brand || "";

        if (!nome) return null;

        const telefone =
          tags["contact:phone"] ||
          tags.phone ||
          tags["contact:mobile"] ||
          "";

        const latItem = item.lat ?? item.center?.lat;
        const lonItem = item.lon ?? item.center?.lon;

        const numero = telefone.replace(/\D/g, "");

        return {
          id: `${item.type}-${item.id}`,
          nome,
          endereco: [
            tags["addr:street"],
            tags["addr:housenumber"],
            tags["addr:suburb"],
            tags["addr:city"] || cidade,
            tags["addr:state"] || estado
          ].filter(Boolean).join(", "),
          telefone,
          site: tags["contact:website"] || tags.website || "",
          mapa: latItem != null && lonItem != null
            ? `https://www.openstreetmap.org/?mlat=${latItem}&mlon=${lonItem}#map=18/${latItem}/${lonItem}`
            : "",
          situacao: "UNKNOWN",
          whatsapp: numero
            ? `https://wa.me/${numero}`
            : ""
        };
      })
      .filter(Boolean);

    return res.status(200).json({
      sucesso: true,
      quantidade: empresas.length,
      fonte: "OpenStreetMap",
      aviso: "Dados comunitários; telefone e site podem não estar disponíveis.",
      empresas
    });
  } catch (error) {
    console.error("Erro na busca:", error);
    return res.status(500).json({
      erro: "Erro interno ao buscar empresas. Tente novamente."
    });
  }
}
