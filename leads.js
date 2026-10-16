const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY;
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

const estados = {
  AC:"Acre", AL:"Alagoas", AP:"Amapá", AM:"Amazonas", BA:"Bahia",
  CE:"Ceará", DF:"Distrito Federal", ES:"Espírito Santo", GO:"Goiás",
  MA:"Maranhão", MT:"Mato Grosso", MS:"Mato Grosso do Sul", MG:"Minas Gerais",
  PA:"Pará", PB:"Paraíba", PR:"Paraná", PE:"Pernambuco", PI:"Piauí",
  RJ:"Rio de Janeiro", RN:"Rio Grande do Norte", RS:"Rio Grande do Sul",
  RO:"Rondônia", RR:"Roraima", SC:"Santa Catarina", SP:"São Paulo",
  SE:"Sergipe", TO:"Tocantins"
};

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({error:"Use POST para buscar empresas."});
  }
  if (!FIREBASE_API_KEY || !GOOGLE_MAPS_API_KEY) {
    return res.status(503).json({error:"Configure FIREBASE_API_KEY e GOOGLE_MAPS_API_KEY nas variáveis de ambiente do Vercel."});
  }
  const authorization = req.headers.authorization || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return res.status(401).json({error:"Entre na sua conta para buscar empresas."});

  try {
    const verify = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`,
      {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({idToken:token})}
    );
    if (!verify.ok) return res.status(401).json({error:"Sessão expirada. Entre novamente."});

    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const cidade = String(body.cidade || "").trim();
    const uf = String(body.estado || "").trim().toUpperCase();
    const nicho = String(body.nicho || "").trim();
    if (!cidade || !estados[uf] || !nicho) return res.status(400).json({error:"Selecione estado, cidade e segmento."});
    if (cidade.length > 100 || nicho.length > 80) return res.status(400).json({error:"Filtros muito longos."});

    const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        "X-Goog-Api-Key":GOOGLE_MAPS_API_KEY,
        "X-Goog-FieldMask":"places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.googleMapsUri,places.businessStatus"
      },
      body:JSON.stringify({
        textQuery:`${nicho} em ${cidade}, ${estados[uf]}, Brasil`,
        pageSize:20, regionCode:"BR", languageCode:"pt-BR"
      })
    });
    const data = await response.json();
    if (!response.ok) {
      console.error("Google Places API:", data);
      return res.status(502).json({error:"A busca falhou. Confira se a Places API (New) está ativada e se a chave tem permissão."});
    }
    const empresas = (data.places || []).map(p => ({
      id:p.id || "",
      nome:p.displayName?.text || "Empresa sem nome",
      endereco:p.formattedAddress || "Endereço não informado",
      telefone:p.nationalPhoneNumber || "",
      site:p.websiteUri || "",
      maps:p.googleMapsUri || "",
      status:p.businessStatus || "",
      semSiteListado:!p.websiteUri
    }));
    return res.status(200).json({total:empresas.length,empresas});
  } catch (error) {
    console.error("Erro na busca:", error);
    return res.status(500).json({error:"Erro inesperado ao buscar empresas. Tente novamente."});
  }
};
