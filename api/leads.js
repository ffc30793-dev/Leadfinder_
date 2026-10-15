
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

    if (cidade.length > 100 || estado.length > 60 || nicho.length > 100) {
      return res.status(400).json({
        erro: "Um dos filtros é muito longo."
      });
    }

    const consultas = [
      `${nicho} em ${cidade}, ${estado}, Brasil`,
      `${nicho} telefone em ${cidade}, ${estado}, Brasil`,
      `${nicho} empresas em ${cidade}, ${estado}, Brasil`
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

    const resultados = await Promise.all(consultas.map(pesquisarGoogle));
    const empresas = new Map();

    function normalizar(texto) {
      return String(texto || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
    }

    function classificarUrl(url) {
      if (!url) return { site: "", instagram: "", redeSocial: "" };

      try {
        const endereco = new URL(
          /^https?:\/\//i.test(url) ? url : `https://${url}`
        );

        const host = endereco.hostname.toLowerCase().replace(/^www\./, "");

        const instagram = host === "instagram.com" ||
          host.endsWith(".instagram.com");

        const facebook = host === "facebook.com" ||
          host.endsWith(".facebook.com") ||
          host === "fb.com" ||
          host.endsWith(".fb.com");

        const outrasRedes = [
          "tiktok.com",
          "linkedin.com",
          "youtube.com",
          "youtu.be",
          "x.com",
          "twitter.com"
        ];

        const redeConhecida = outrasRedes.some(
          dominio => host === dominio || host.endsWith(`.${dominio}`)
        );

        if (instagram) {
          return { site: "", instagram: endereco.href, redeSocial: endereco.href };
        }

        if (facebook || redeConhecida) {
          return { site: "", instagram: "", redeSocial: endereco.href };
        }

        return { site: endereco.href, instagram: "", redeSocial: "" };
      } catch {
        return { site: "", instagram: "", redeSocial: "" };
      }
    }

    for (const local of resultados.flat()) {
      const nome = local.displayName?.text || "Empresa sem nome";
      const telefone =
        local.internationalPhoneNumber ||
        local.nationalPhoneNumber ||
        "";

      const numero = telefone.replace(/\D/g, "");
      const endereco = local.formattedAddress || `${cidade}, ${estado}`;
      const nomeNormalizado = normalizar(nome);
      const enderecoNormalizado = normalizar(endereco);

      const chaveNomeEndereco = `${nomeNormalizado}-${enderecoNormalizado}`;
      const chave = local.id
        ? `google:${local.id}`
        : numero
          ? `tel:${numero}`
          : `nome:${chaveNomeEndereco}`;

      const url = classificarUrl(local.websiteUri);
      let existente = empresas.get(chave);

      if (!existente) {
        existente = {
          id: local.id || `empresa-${chaveNomeEndereco}`,
          nome,
          endereco,
          telefone,
          numero,
          site: url.site,
          instagram: url.instagram,
          redeSocial: url.redeSocial,
          mapa: local.googleMapsUri || ""
        };

        empresas.set(chave, existente);
      } else {
        existente.telefone ||= telefone;
        existente.numero ||= numero;
        existente.site ||= url.site;
        existente.instagram ||= url.instagram;
        existente.redeSocial ||= url.redeSocial;
        existente.mapa ||= local.googleMapsUri || "";
      }
    }

    // Segunda deduplicação por telefone e nome/endereço.
    const listaUnica = new Map();

    for (const empresa of empresas.values()) {
      const chave = empresa.numero
        ? `tel:${empresa.numero}`
        : `nome:${normalizar(empresa.nome)}-${normalizar(empresa.endereco)}`;

      const existente = listaUnica.get(chave);

      if (existente) {
        existente.telefone ||= empresa.telefone;
        existente.numero ||= empresa.numero;
        existente.site ||= empresa.site;
        existente.instagram ||= empresa.instagram;
        existente.redeSocial ||= empresa.redeSocial;
        existente.mapa ||= empresa.mapa;
      } else {
        listaUnica.set(chave, { ...empresa });
      }
    }

    const lista = Array.from(listaUnica.values()).map(empresa => {
      const temTelefone = Boolean(empresa.numero);
      const temSite = Boolean(empresa.site);
      const temInstagram = Boolean(empresa.instagram);

      let situacao;

      if (temSite) {
        situacao = "POSSUI_SITE";
      } else if (temInstagram || empresa.redeSocial) {
        situacao = "SO_REDE_SOCIAL";
      } else {
        situacao = "SITE_NAO_ENCONTRADO";
      }

      // Pontuação de prospecção: prioriza ausência de site próprio.
      const pontuacaoContato =
        (temSite ? 0 : 4) +
        (temInstagram || empresa.redeSocial ? 2 : 0) +
        (temTelefone ? 1 : 0);

      return {
        ...empresa,
        whatsapp: temTelefone
          ? `https://wa.me/${empresa.numero}`
          : "",
        situacao,
        pontuacaoContato,
        temTelefone,
        temSite,
        temInstagram
      };
    });

    lista.sort((a, b) =>
      b.pontuacaoContato - a.pontuacaoContato ||
      a.nome.localeCompare(b.nome, "pt-BR")
    );

    return res.status(200).json({
      sucesso: true,
      quantidade: lista.length,
      fonte: "Google Places API",
      consultasRealizadas: consultas.length,
      aviso:
        "Links de redes sociais foram separados de sites próprios. A ausência de site nos dados do Google não comprova que a empresa não tenha um.",
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
