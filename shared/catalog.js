// Catálogo compartilhado entre servidor e navegador.

export const ESTADOS = [
  ["AC", "Acre"], ["AL", "Alagoas"], ["AP", "Amapá"], ["AM", "Amazonas"], ["BA", "Bahia"],
  ["CE", "Ceará"], ["DF", "Distrito Federal"], ["ES", "Espírito Santo"], ["GO", "Goiás"],
  ["MA", "Maranhão"], ["MT", "Mato Grosso"], ["MS", "Mato Grosso do Sul"], ["MG", "Minas Gerais"],
  ["PA", "Pará"], ["PB", "Paraíba"], ["PR", "Paraná"], ["PE", "Pernambuco"], ["PI", "Piauí"],
  ["RJ", "Rio de Janeiro"], ["RN", "Rio Grande do Norte"], ["RS", "Rio Grande do Sul"],
  ["RO", "Rondônia"], ["RR", "Roraima"], ["SC", "Santa Catarina"], ["SP", "São Paulo"],
  ["SE", "Sergipe"], ["TO", "Tocantins"]
];

export const NOME_ESTADO = Object.fromEntries(ESTADOS);

// grupo: alimentacao | beleza | saude | varejo | servicos | auto | hospedagem
// termos: variações usadas para ampliar a cobertura da busca (a 1ª é o termo principal).
export const SEGMENTOS = [
  { id: "restaurante", nome: "Restaurante", grupo: "alimentacao", termos: ["restaurante", "self service", "churrascaria"],
    tipos: ["restaurant", "brazilian_restaurant", "steak_house", "barbecue_restaurant", "buffet_restaurant", "meal_takeaway", "food_court"],
    palavras: ["restaurante", "churrascaria", "self service", "self-service", "buffet", "marmita", "comida", "cozinha"] },
  { id: "pizzaria", nome: "Pizzaria", grupo: "alimentacao", termos: ["pizzaria", "pizza delivery"],
    tipos: ["pizza_restaurant"],
    palavras: ["pizza", "pizzaria"] },
  { id: "hamburgueria", nome: "Hamburgueria", grupo: "alimentacao", termos: ["hamburgueria", "hambúrguer artesanal", "lanchonete"],
    tipos: ["hamburger_restaurant", "fast_food_restaurant"],
    palavras: ["hamburg", "burger", "lanche", "hot dog"] },
  { id: "lanchonete", nome: "Lanchonete", grupo: "alimentacao", termos: ["lanchonete", "salgados", "food truck"],
    tipos: ["fast_food_restaurant", "sandwich_shop", "meal_takeaway"],
    palavras: ["lanche", "lanchonete", "salgado", "food truck", "hot dog", "pastel", "espetinho", "burger", "hamburg"] },
  { id: "acaiteria", nome: "Açaiteria e sorveteria", grupo: "alimentacao", termos: ["açaiteria", "sorveteria", "açaí"],
    tipos: ["ice_cream_shop", "dessert_shop", "juice_shop", "acai_shop"],
    palavras: ["acai", "sorvet", "gelato", "picole"] },
  { id: "padaria", nome: "Padaria", grupo: "alimentacao", termos: ["padaria", "confeitaria"],
    tipos: ["bakery", "cake_shop", "dessert_shop", "pastry_shop"],
    palavras: ["padaria", "panificadora", "confeitaria", "doceria", "bolo", "padoca"] },
  { id: "cafeteria", nome: "Cafeteria", grupo: "alimentacao", termos: ["cafeteria", "café"],
    tipos: ["cafe", "coffee_shop", "coffee_roastery"],
    palavras: ["cafe", "cafeteria", "coffee"] },
  { id: "barbearia", nome: "Barbearia", grupo: "beleza", termos: ["barbearia", "barbeiro"],
    tipos: ["barber_shop", "hair_care", "hair_salon"],
    palavras: ["barbea", "barber", "barbeiro"] },
  { id: "salao", nome: "Salão de beleza", grupo: "beleza", termos: ["salão de beleza", "cabeleireiro", "studio de beleza"],
    tipos: ["hair_salon", "beauty_salon", "hair_care", "nail_salon", "spa"],
    palavras: ["salao", "cabeleir", "beleza", "estetica", "hair", "nail", "unha", "studio", "make"] },
  { id: "tatuagem", nome: "Estúdio de tatuagem", grupo: "beleza", termos: ["estúdio de tatuagem", "tatuador", "piercing"],
    tipos: ["tattoo_shop", "tattoo_parlor", "body_piercing_shop"],
    palavras: ["tatu", "tattoo", "piercing", "ink"] },
  { id: "clinica", nome: "Clínica", grupo: "saude", termos: ["clínica", "clínica médica", "consultório"],
    tipos: ["medical_clinic", "doctor", "health", "physiotherapist", "dental_clinic", "dentist", "psychologist", "medical_lab", "wellness_center"],
    palavras: ["clinica", "consultorio", "medic", "saude", "fisio", "psico", "nutri", "dra ", "dr "] },
  { id: "dentista", nome: "Dentista", grupo: "saude", termos: ["dentista", "clínica odontológica", "ortodontista"],
    tipos: ["dentist", "dental_clinic"],
    palavras: ["odonto", "dentis", "dental", "ortodont", "sorriso"] },
  { id: "petshop", nome: "Pet shop", grupo: "saude", termos: ["pet shop", "clínica veterinária", "banho e tosa"],
    tipos: ["pet_store", "veterinary_care", "pet_care"],
    palavras: ["pet", "veterin", "racao", "tosa", "animal"] },
  { id: "academia", nome: "Academia", grupo: "saude", termos: ["academia", "studio de pilates", "crossfit"],
    tipos: ["gym", "fitness_center", "sports_activity_location", "yoga_studio"],
    palavras: ["academia", "fitness", "crossfit", "pilates", "treino", "muscula", "funcional", "studio"] },
  { id: "loja-roupas", nome: "Loja de roupas", grupo: "varejo", termos: ["loja de roupas", "boutique", "moda masculina", "multimarcas"],
    tipos: ["clothing_store", "shoe_store"],
    palavras: ["roupa", "moda", "boutique", "multimarcas", "confec", "fashion", "outlet", "jeans", "masculin", "feminin", "calcad", "store"] },
  { id: "imobiliaria", nome: "Imobiliária", grupo: "servicos", termos: ["imobiliária", "corretor de imóveis"],
    tipos: ["real_estate_agency"],
    palavras: ["imobil", "corretor", "imoveis", "imovel", "creci"] },
  { id: "oficina", nome: "Oficina mecânica", grupo: "auto", termos: ["oficina mecânica", "auto center", "mecânico"],
    tipos: ["car_repair", "auto_parts_store"],
    palavras: ["oficina", "mecanic", "auto center", "autocenter", "auto pecas", "funilaria", "borracharia", "auto"] },
  { id: "hotel", nome: "Hotel e pousada", grupo: "hospedagem", termos: ["hotel", "pousada"],
    tipos: ["hotel", "lodging", "inn", "bed_and_breakfast", "guest_house", "motel", "resort_hotel", "hostel"],
    palavras: ["hotel", "pousada", "hostel", "motel", "resort", "hospedagem"] }
];

export const GRUPOS_ALIMENTACAO = ["alimentacao"];
export const GRUPOS_VAREJO = ["varejo"];

export function acharSegmento(valor) {
  const alvo = normalizar(valor);
  if (!alvo) return null;
  return SEGMENTOS.find((s) => s.id === alvo || normalizar(s.nome) === alvo) || null;
}

/**
 * Serviços que o usuário oferece. Cada um muda a estratégia de busca e a avaliação.
 * segmentosPadrao: usado quando o usuário não escolhe um segmento (busca ampla relacionada ao serviço).
 */
export const SERVICOS = [
  { id: "criacao-sites", nome: "Criação de sites", resumo: "Empresas sem site próprio identificado" },
  { id: "redesign-sites", nome: "Redesign de sites", resumo: "Empresas com site próprio e problemas verificáveis", exigeSite: true },
  { id: "cardapios-catalogos", nome: "Cardápios e catálogos digitais", resumo: "Restaurantes, lanchonetes e similares", gruposAceitos: ["alimentacao"], segmentosPadrao: ["restaurante", "lanchonete", "pizzaria", "hamburgueria", "acaiteria", "cafeteria", "padaria"] },
  { id: "design-grafico", nome: "Design gráfico e identidade visual", resumo: "Comunicação visual observável nos dados públicos" },
  { id: "redes-sociais", nome: "Conteúdo para redes sociais", resumo: "Presença social identificável nos dados" },
  { id: "edicao-imagens", nome: "Edição de imagens de produtos", resumo: "Lojas e negócios com produtos e fotos públicas", segmentosPadrao: ["loja-roupas", "padaria", "acaiteria"] },
  { id: "landing-pages", nome: "Landing pages", resumo: "Negócios de serviço que vivem de contato e agendamento" },
  { id: "lojas-virtuais", nome: "Lojas virtuais", resumo: "Comerciantes que podem vender online", gruposAceitos: ["varejo", "alimentacao", "beleza", "saude"], segmentosPadrao: ["loja-roupas", "petshop"] }
];

export function acharServico(id) {
  return SERVICOS.find((s) => s.id === id) || null;
}

export function normalizar(texto) {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
