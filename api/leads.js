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

    if (!firebaseKey || !placesKey) {
      return res.status(500).json({
        erro: "Configure as chaves do Firebase e do Google Places na Vercel."
      });
    }

    // 1. Validar a sessão do usuário
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
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ idToken: token })
      }
    );

    if (!authResponse.ok) {
      return res.status(401).json({
        erro: "Sessão inválida. Entre novamente."
      });
    }

    // 2. Validar filtros
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

    // 3. Consultas diferentes para encontrar mais empresas
    const consultas = [
      `${nicho} em ${cidade}, ${estado}, Brasil`,
      `${nicho} telefone em ${cidade}, ${estado}, Brasil`,
      `${nicho} comércio empresas em ${cidade}, ${estado}, Brasil`
    ];

    const fieldMask = [
      "places.id",
      "places.displayName",
      "places.formattedAddress",
      "places.nationalPhoneNumber",
      "places.internationalPhoneNumber",
      "places.websiteUri",
      "places.googleMapsUri"
    ].join(",");

    async function pesquisarGoogle(textQuery) {
      const resposta = await fetch(
        "https://places.googleapis.com/v1/places:searchText",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": placesKey,
            "X-Goog-FieldMask": fieldMask
          },
          body: JSON.stringify({
            textQuery,
            languageCode: "pt-BR",
            regionCode: "BR",
            pageSize: 20
          })
        }
      );

      const dados = await resposta.json().catch(() => ({}));

      if (!resposta.ok) {
        console.error(
          "Erro Google Places:",
          resposta.status,
          dados.error?.status || "Erro na consulta"
        );

        throw new Error(
          resposta.status === 429
            ? "Limite de consultas do Google atingido."
            : "Não foi possível concluir as pesquisas no Google Places."
        );
      }

      return dados.places || [];
    }

    // Executa as consultas em paralelo
    const resultados = await Promise.all(
      consultas.map(pesquisarGoogle)
    );

    // 4. Reunir e eliminar empresas repetidas
    const empresasPorId = new Map();
    const empresasPorTelefone = new Map();
    const empresasPorNomeEndereco = new Map();

    for (const local of resultados.flat()) {
      const nome = local.displayName?.text || "Empresa sem nome";
      const telefone =
        local.internationalPhoneNumber ||
        local.nationalPhoneNumber ||
        "";

      const numero = telefone.replace(/\D/g, "");
      const endereco = local.formattedAddress || `${cidade}, ${estado}`;

      const chaveNomeEndereco = `${nome} ${endereco}`
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");

      // Identificador do Google é a forma mais confiável de deduplicar
      if (local.id && empresasPorId.has(local.id)) {
        const existente = empresasPorId.get(local.id);

        // Completa dados que estejam ausentes no primeiro resultado
        existente.telefone ||= telefone;
        existente.numero ||= numero;
        existente.site ||= local.websiteUri || "";
        existente.mapa ||= local.googleMapsUri || "";
        continue;
      }

      // Também verifica telefone e combinação de nome/endereço
      if (numero && empresasPorTelefone.has(numero)) {
        continue;
      }

      if (
        chaveNomeEndereco &&
        empresasPorNomeEndereco.has(chaveNomeEndereco)
      ) {
        continue;
      }

      const empresa = {
        id: local.id || `empresa-${chaveNomeEndereco}`,
        nome,
        endereco,
        telefone,
        numero,
        site: local.websiteUri || "",
        mapa: local.googleMapsUri || ""
      };

      if (local.id) {
        empresasPorId.set(local.id, empresa);
      }

      if (numero) {
        empresasPorTelefone.set(numero, empresa);
      }

      if (chaveNomeEndereco) {
        empresasPorNomeEndereco.set(chaveNomeEndereco, empresa);
      }
    }

    // 5. Organizar contatos disponíveis
    const empresas = Array.from(empresasPorId.values());

    // Inclui também empresas sem ID, que foram guardadas pelas outras chaves
    const todasEmpresas = new Map();

    for (const empresa of [
      ...empresas,
      ...empresasPorTelefone.values(),
      ...empresasPorNomeEndereco.values()
    ]) {
      todasEmpresas.set(empresa.id, empresa);
    }

    const lista = Array.from(todasEmpresas.values()).map((empresa) => {
      const temTelefone = Boolean(empresa.numero);
      const temSite = Boolean(empresa.site);

      // Pontuação indica disponibilidade de contato, não qualidade garantida
      const pontuacao =
        (temTelefone ? 2 : 0) +
        (temSite ? 1 : 0);

      return {
        id: empresa.id,
        nome: empresa.nome,
        endereco: empresa.endereco,
        telefone: empresa.telefone,
        site: empresa.site,
        mapa: empresa.mapa,
        whatsapp: temTelefone
          ? `https://wa.me/${empresa.numero}`
          : "",
        instagram: "",
        situacao: temSite ? "POSSUI_SITE" : "SITE_NAO_ENCONTRADO",
        pontuacaoContato: pontuacao,
        temTelefone,
        temSite,
        temInstagram: false
      };
    });

    // Empresas com mais informações de contato aparecem primeiro
    lista.sort((a, b) => {
      if (a.pontuacaoContato !== b.pontuacaoContato) {
        return b.pontuacaoContato - a.pontuacaoContato;
      }

      return a.nome.localeCompare(b.nome, "pt-BR");
    });

    return res.status(200).json({
      sucesso: true,
      quantidade: lista.length,
      fonte: "Google Places API",
      consultasRealizadas: consultas.length,
      aviso:
        "Resultados combinados e deduplicados. A ausência de um site nos dados do Google não comprova que a empresa não tenha site. Números encontrados não têm WhatsApp ativo confirmado.",
      empresas: lista
    });
  } catch (error) {
    console.error("Erro na busca:", error.message);

    return res.status(
      error.message.includes("Limite de consultas") ? 429 : 502
    ).json({
      erro: error.message || "Erro ao buscar empresas. Tente novamente."
    });
  }
                  }
