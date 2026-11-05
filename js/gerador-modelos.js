// Gerador de prompts por MODELOS ESTRUTURADOS (sem IA externa e sem chamadas de rede).
// Cada serviço tem campos próprios e uma estrutura própria; o segmento do negócio acrescenta orientações específicas.
// Dados não informados nunca são inventados: o prompt manda a IA marcar como "a confirmar".
import { normalizar } from "../shared/catalog.js";

const A_CONFIRMAR = "não informado — não invente; deixe marcado como “a confirmar”";
const v = (x) => (String(x ?? "").trim() ? String(x).trim() : A_CONFIRMAR);
const lista = (arr) => (Array.isArray(arr) && arr.length ? arr.join(", ") : A_CONFIRMAR);
const bullets = (arr) => arr.filter(Boolean).map((x) => `- ${x}`).join("\n");
const num = (arr) => arr.map((x, i) => `${i + 1}. ${x}`).join("\n");

export const CAMPOS_COMUNS = [
  { id: "nome", rotulo: "Nome do negócio", tipo: "texto", obrigatorio: true },
  { id: "segmento", rotulo: "Segmento / tipo de negócio", tipo: "texto", obrigatorio: true, dica: "Ex.: barbearia, pizzaria, estúdio de tatuagem" },
  { id: "cidade", rotulo: "Cidade", tipo: "texto" },
  { id: "uf", rotulo: "UF", tipo: "texto", curto: true },
  { id: "descricao", rotulo: "O que o negócio faz (em poucas palavras)", tipo: "area" },
  { id: "publico", rotulo: "Público-alvo", tipo: "texto" },
  { id: "diferenciais", rotulo: "Diferenciais reais", tipo: "area", dica: "Só o que for verdadeiro e comprovável" },
  { id: "tom", rotulo: "Tom de voz", tipo: "select", opcoes: ["Profissional e confiável", "Descontraído e próximo", "Premium e sofisticado", "Jovem e ousado"] },
  { id: "telefone", rotulo: "Telefone / WhatsApp", tipo: "texto" },
  { id: "instagram", rotulo: "Instagram ou outros links", tipo: "texto" },
  { id: "endereco", rotulo: "Endereço", tipo: "texto" }
];

const ESTILOS = ["Moderno e limpo", "Elegante / premium", "Rústico / artesanal", "Vibrante e jovem", "Minimalista", "Sem preferência"];

// ---------- orientações por segmento ----------
const DICAS = [
  { chaves: ["barbearia", "barbeiro"], itens: ["Destaque agendamento por WhatsApp e a tabela de serviços (corte, barba, combos).", "Galeria de trabalhos reais (antes/depois quando houver autorização).", "Mostre horário de funcionamento e endereço com mapa."] },
  { chaves: ["salao", "cabeleireiro", "beleza", "estetica"], itens: ["Organize serviços por categoria (cabelo, unhas, estética).", "Inclua galeria de trabalhos e botão de agendamento.", "Se houver profissionais, apresente-os somente com dados fornecidos."] },
  { chaves: ["tatuagem", "tatuador", "piercing"], itens: ["Portfólio organizado por estilo (blackwork, fineline, realismo etc.), somente com trabalhos reais.", "Seção de cuidados antes/depois da sessão e regras de agendamento (idade mínima e documento, se aplicável).", "Fluxo de orçamento por WhatsApp pedindo referência, tamanho e local do corpo."] },
  { chaves: ["pizza", "hamburguer", "hamburgueria", "restaurante", "lanchonete", "acai", "sorveteria", "padaria", "cafeteria", "confeitaria"], itens: ["Cardápio por categorias, com fotos reais e pedido por WhatsApp.", "Informe horário, área de entrega e formas de pagamento somente se fornecidos.", "Destaque combos e itens mais pedidos apenas se o cliente informar."] },
  { chaves: ["clinica", "dentista", "odonto", "medic", "consultorio"], itens: ["Apresente especialidades e serviços com linguagem clara e sem promessas de resultado.", "Inclua agendamento e localização; mencione convênios apenas se informados.", "Respeite normas do conselho profissional: nada de antes/depois enganoso nem garantia de cura."] },
  { chaves: ["roupa", "moda", "boutique", "multimarcas", "loja"], itens: ["Catálogo por categoria (masculino, feminino, acessórios) com tabela de tamanhos.", "Pedido ou dúvidas por WhatsApp; destaque lançamentos só se informados.", "Cite marcas apenas se forem fornecidas."] },
  { chaves: ["academia", "pilates", "crossfit"], itens: ["Liste modalidades, horários e estrutura apenas com dados reais.", "Chamada para aula experimental somente se o negócio oferecer."] },
  { chaves: ["oficina", "mecanica", "auto"], itens: ["Liste serviços (revisão, freios, suspensão etc.) e peça orçamento por WhatsApp.", "Mostre localização e horário; destaque garantia somente se informada."] },
  { chaves: ["imobiliaria", "imovel", "corretor"], itens: ["Imóveis em destaque com filtros simples e contato direto do corretor.", "Inclua CRECI apenas se informado."] },
  { chaves: ["hotel", "pousada"], itens: ["Apresente acomodações, localização e canal de reserva.", "Não invente comodidades, tarifas ou avaliações."] },
  { chaves: ["pet", "veterin"], itens: ["Serviços (banho e tosa, consultas, produtos) com agendamento por WhatsApp.", "Galeria com fotos reais dos atendimentos, se houver."] }
];

export function dicasDoSegmento(segmento) {
  const s = normalizar(segmento);
  const achado = DICAS.find((d) => d.chaves.some((c) => s.includes(c)));
  return achado ? achado.itens : ["Use linguagem e estrutura adequadas ao segmento informado.", "Priorize o canal de contato preferido do negócio (normalmente WhatsApp)."];
}

function contexto(d) {
  const local = [d.cidade, d.uf].filter(Boolean).join(" - ");
  return `CONTEXTO DO NEGÓCIO
- Nome: ${v(d.nome)}
- Segmento: ${v(d.segmento)}
- Localização: ${local || A_CONFIRMAR}
- Endereço: ${v(d.endereco)}
- Contato: ${v(d.telefone)}
- Redes/links: ${v(d.instagram)}
- O que faz: ${v(d.descricao)}
- Público-alvo: ${v(d.publico)}
- Diferenciais: ${v(d.diferenciais)}
- Tom de voz: ${v(d.tom)}`;
}

const REGRAS = `REGRAS DE HONESTIDADE
- Não invente preços, avaliações, depoimentos, certificações, prêmios, números, fotos de pessoas ou serviços que não foram informados.
- Onde faltar informação, use um espaço claramente marcado como “a confirmar” e liste ao final tudo o que preciso fornecer.`;

function bloco(titulo, corpo) { return `${titulo}\n${corpo}`; }

// ---------- modelos por serviço ----------
export const SERVICOS_GERADOR = {
  "criacao-sites": {
    nome: "Criação de sites",
    campos: [
      { id: "paginas", rotulo: "Páginas / seções", tipo: "checks", opcoes: ["Início", "Sobre", "Serviços ou produtos", "Galeria", "Depoimentos (somente reais)", "Contato", "Perguntas frequentes"] },
      { id: "funcionalidades", rotulo: "Funcionalidades", tipo: "checks", opcoes: ["Botão de WhatsApp", "Mapa de localização", "Formulário de contato", "Agendamento", "SEO local"] },
      { id: "estilo", rotulo: "Estilo visual", tipo: "select", opcoes: ESTILOS },
      { id: "tecnologia", rotulo: "Tecnologia", tipo: "select", opcoes: ["HTML, CSS e JavaScript puros (um site estático)", "React", "WordPress", "Sem preferência"] },
      { id: "referencias", rotulo: "Referências de sites ou cores", tipo: "area" }
    ],
    montar: (d) => [
      `Atue como um designer e desenvolvedor front-end sênior. Crie o site institucional completo de "${v(d.nome)}".`,
      contexto(d),
      bloco("ESCOPO", num([
        `Páginas/seções: ${lista(d.paginas)}.`,
        `Funcionalidades: ${lista(d.funcionalidades)}.`,
        `Estilo visual: ${v(d.estilo)}. Referências: ${v(d.referencias)}.`,
        `Tecnologia: ${v(d.tecnologia)}.`
      ])),
      bloco("ORIENTAÇÕES PARA ESTE SEGMENTO", bullets(dicasDoSegmento(d.segmento))),
      bloco("REQUISITOS TÉCNICOS", bullets(["Layout responsivo (celular primeiro), carregamento rápido e imagens otimizadas.", "Acessibilidade básica: contraste, textos alternativos, foco visível e HTML semântico.", "SEO local: title, meta description, dados estruturados LocalBusiness e cabeçalhos coerentes.", "Botões e links todos funcionais; sem placeholders quebrados."])),
      REGRAS,
      bloco("ENTREGA", "Entregue o código completo e organizado, mais instruções curtas de como editar textos, imagens e contatos e como publicar.")
    ].join("\n\n")
  },

  "redesign-sites": {
    nome: "Redesign de sites",
    campos: [
      { id: "siteAtual", rotulo: "Endereço do site atual", tipo: "texto" },
      { id: "problemas", rotulo: "Problemas que você percebeu", tipo: "area", dica: "Ex.: não abre bem no celular, visual antigo, lento" },
      { id: "manter", rotulo: "O que deve ser mantido", tipo: "area", dica: "Logo, cores, textos, estrutura" },
      { id: "objetivo", rotulo: "Objetivo principal", tipo: "select", opcoes: ["Gerar mais contatos", "Modernizar o visual", "Melhorar velocidade e uso no celular", "Reorganizar o conteúdo"] }
    ],
    montar: (d) => [
      `Atue como um especialista em UX/UI e desenvolvimento front-end. Faça o REDESIGN do site atual de "${v(d.nome)}", preservando o que funciona.`,
      `SITE ATUAL\n- Endereço: ${v(d.siteAtual)}\n- Problemas observados: ${v(d.problemas)}\n- Manter obrigatoriamente: ${v(d.manter)}\n- Objetivo principal: ${v(d.objetivo)}`,
      contexto(d),
      bloco("COMO TRABALHAR", num(["Primeiro, liste em tópicos o diagnóstico: o que está bom, o que atrapalha a conversão e o que é verificável (HTTPS, adaptação ao celular, velocidade, hierarquia, chamadas para ação).", "Proponha a nova estrutura de páginas e a nova hierarquia visual, justificando cada mudança.", "Reaproveite todo o conteúdo real existente; reescreva apenas o que estiver confuso, sem inventar informações.", "Entregue o código final do novo site e uma lista de tudo o que mudou."])),
      bloco("ORIENTAÇÕES PARA ESTE SEGMENTO", bullets(dicasDoSegmento(d.segmento))),
      REGRAS
    ].join("\n\n")
  },

  "design-grafico": {
    nome: "Design gráfico e identidade visual",
    campos: [
      { id: "entregaveis", rotulo: "Entregáveis", tipo: "checks", opcoes: ["Logotipo", "Paleta de cores", "Tipografia", "Cartão de visita", "Kit para redes sociais", "Resumo do manual de marca"] },
      { id: "estilo", rotulo: "Estilo desejado", tipo: "select", opcoes: ESTILOS },
      { id: "restricoes", rotulo: "Restrições (cores, símbolos, o que evitar)", tipo: "area" },
      { id: "referencias", rotulo: "Referências / marcas que inspiram", tipo: "area" }
    ],
    montar: (d) => [
      `Atue como um diretor de arte especialista em identidade visual para pequenos negócios. Crie a direção de identidade visual de "${v(d.nome)}".`,
      contexto(d),
      bloco("O QUE ENTREGAR", num([`Itens: ${lista(d.entregaveis)}.`, `Estilo: ${v(d.estilo)}. Referências: ${v(d.referencias)}.`, `Restrições: ${v(d.restricoes)}.`])),
      bloco("PROCESSO", num(["Resuma o conceito da marca em 3 frases e 5 palavras-chave.", "Apresente 3 caminhos visuais distintos (conceito, paleta com códigos HEX, par tipográfico, aplicação do logotipo).", "Detalhe o caminho recomendado com versões positiva/negativa/monocromática e margens de segurança.", "Mostre aplicações práticas: fachada ou embalagem, perfil de rede social e cartão."])),
      bloco("ORIENTAÇÕES PARA ESTE SEGMENTO", bullets(dicasDoSegmento(d.segmento))),
      REGRAS
    ].join("\n\n")
  },

  "redes-sociais": {
    nome: "Conteúdo para redes sociais",
    campos: [
      { id: "plataformas", rotulo: "Plataformas", tipo: "checks", opcoes: ["Instagram", "Facebook", "TikTok", "Status do WhatsApp"] },
      { id: "objetivo", rotulo: "Objetivo", tipo: "select", opcoes: ["Atrair novos clientes", "Aumentar pedidos / agendamentos", "Fortalecer a marca", "Divulgar uma promoção"] },
      { id: "frequencia", rotulo: "Frequência", tipo: "select", opcoes: ["3 posts por semana", "5 posts por semana", "Diária", "Apenas uma campanha"] },
      { id: "pilares", rotulo: "Temas que o negócio pode abordar", tipo: "area" },
      { id: "campanhas", rotulo: "Datas, ofertas ou campanhas reais do período", tipo: "area" }
    ],
    montar: (d) => [
      `Atue como um social media estrategista para negócios locais. Monte o planejamento de conteúdo de "${v(d.nome)}".`,
      contexto(d),
      bloco("BRIEFING", num([`Plataformas: ${lista(d.plataformas)}.`, `Objetivo: ${v(d.objetivo)}.`, `Frequência: ${v(d.frequencia)}.`, `Temas: ${v(d.pilares)}.`, `Campanhas/ofertas reais: ${v(d.campanhas)}.`])),
      bloco("ENTREGA", num(["Defina 4 pilares de conteúdo coerentes com o segmento.", "Crie um calendário de 2 semanas com formato (reels, carrossel, foto, stories), tema, legenda completa, chamada para ação e hashtags locais.", "Sugira 5 ideias de gravação simples com celular.", "Escreva 3 respostas-modelo para mensagens frequentes de clientes."])),
      bloco("ORIENTAÇÕES PARA ESTE SEGMENTO", bullets(dicasDoSegmento(d.segmento))),
      REGRAS + "\n- Não cite métricas, números de seguidores ou resultados que não foram fornecidos."
    ].join("\n\n")
  },

  "edicao-imagens": {
    nome: "Edição de imagens de produtos",
    campos: [
      { id: "tipoProduto", rotulo: "Tipo de produto", tipo: "texto", dica: "Ex.: camisetas, bolos, relógios" },
      { id: "problemas", rotulo: "Problemas nas fotos", tipo: "checks", opcoes: ["Fundo bagunçado", "Iluminação ruim", "Cor distorcida", "Baixa resolução", "Enquadramento torto"] },
      { id: "fundo", rotulo: "Fundo desejado", tipo: "select", opcoes: ["Branco puro", "Cinza neutro", "Ambientado (cenário simples)", "Transparente (PNG)"] },
      { id: "formato", rotulo: "Formato / tamanho", tipo: "texto", dica: "Ex.: 1080x1080 para Instagram e catálogo" },
      { id: "quantidade", rotulo: "Quantidade de imagens", tipo: "texto" }
    ],
    montar: (d) => [
      `Atue como um editor de imagens especialista em fotografia de produto para e-commerce e redes sociais. Padronize as fotos de "${v(d.nome)}".`,
      contexto(d),
      bloco("BRIEFING DAS IMAGENS", num([`Produto: ${v(d.tipoProduto)}.`, `Problemas a corrigir: ${lista(d.problemas)}.`, `Fundo: ${v(d.fundo)}.`, `Formato/tamanho: ${v(d.formato)}.`, `Quantidade: ${v(d.quantidade)}.`])),
      bloco("INSTRUÇÕES DE EDIÇÃO", bullets(["Recorte limpo, bordas naturais e sombra suave para dar profundidade.", "Corrija balanço de branco e saturação para que a cor do produto seja FIEL ao real.", "Mantenha o produto exatamente como é: não altere forma, estampa, logotipo, defeitos reais nem inclua itens que não existem.", "Padronize enquadramento, margens e proporção em todas as imagens.", "Exporte em alta qualidade para web (JPG/WebP leve) e uma versão em PNG quando houver fundo transparente."])),
      bloco("ORIENTAÇÕES PARA ESTE SEGMENTO", bullets(dicasDoSegmento(d.segmento))),
      "Se alguma foto for inviável de corrigir, diga qual e peça uma nova com orientações de como fotografar (luz natural, fundo liso, ângulos).",
      REGRAS
    ].join("\n\n")
  },

  "cardapios-catalogos": {
    nome: "Cardápios e catálogos digitais",
    campos: [
      { id: "formato", rotulo: "Formato", tipo: "select", opcoes: ["Página web com QR Code", "PDF para enviar no WhatsApp", "Catálogo para Instagram / WhatsApp Business", "Sem preferência"] },
      { id: "itens", rotulo: "Categorias e itens", tipo: "area", dica: "Cole aqui o cardápio ou lista de produtos, um por linha" },
      { id: "precos", rotulo: "Preços", tipo: "select", opcoes: ["Usar os preços informados na lista", "Não exibir preços"] },
      { id: "pedidos", rotulo: "Pedidos", tipo: "select", opcoes: ["Pedido por WhatsApp com mensagem pronta", "Apenas vitrine (sem pedido)"] },
      { id: "entrega", rotulo: "Horário e área de entrega", tipo: "texto" }
    ],
    montar: (d) => [
      `Atue como um designer de cardápios e catálogos digitais. Crie o cardápio/catálogo de "${v(d.nome)}".`,
      contexto(d),
      bloco("BRIEFING", num([`Formato: ${v(d.formato)}.`, `Preços: ${v(d.precos)}.`, `Pedidos: ${v(d.pedidos)}.`, `Entrega/horário: ${v(d.entrega)}.`])),
      bloco("ITENS (use exatamente estes dados)", v(d.itens)),
      bloco("REQUISITOS", bullets(["Navegação por categorias fixa no topo e leitura fácil no celular.", "Cada item com nome, descrição curta e preço (se permitido); campo de foto opcional.", "Botão de pedido que abre o WhatsApp com a mensagem já montada (o cliente decide enviar).", "Organização que permita ao dono editar itens e preços sem mexer em código."])),
      bloco("ORIENTAÇÕES PARA ESTE SEGMENTO", bullets(dicasDoSegmento(d.segmento))),
      REGRAS
    ].join("\n\n")
  },

  "landing-pages": {
    nome: "Landing pages",
    campos: [
      { id: "oferta", rotulo: "Oferta ou serviço principal da página", tipo: "area" },
      { id: "conversao", rotulo: "Ação que o visitante deve fazer", tipo: "select", opcoes: ["Chamar no WhatsApp", "Preencher formulário", "Ligar", "Agendar horário"] },
      { id: "cta", rotulo: "Texto do botão", tipo: "texto" },
      { id: "provaSocial", rotulo: "Provas sociais reais (depoimentos, números)", tipo: "area", dica: "Deixe em branco se não houver" },
      { id: "origem", rotulo: "De onde virá o tráfego", tipo: "texto", dica: "Ex.: anúncio no Instagram, Google" }
    ],
    montar: (d) => [
      `Atue como um especialista em landing pages de alta conversão para negócios locais. Crie a landing page de "${v(d.nome)}".`,
      contexto(d),
      bloco("FOCO DA PÁGINA", num([`Oferta: ${v(d.oferta)}.`, `Conversão desejada: ${v(d.conversao)} (botão: ${v(d.cta)}).`, `Origem do tráfego: ${v(d.origem)}.`, `Provas sociais disponíveis: ${v(d.provaSocial)}.`])),
      bloco("ESTRUTURA", num(["Título direto com a promessa principal e subtítulo explicando para quem é.", "Botão de ação visível logo na primeira tela e repetido ao longo da página.", "Benefícios (não só características) em até 4 blocos curtos.", "Como funciona em 3 passos.", "Prova social — somente a que foi fornecida; sem depoimentos inventados.", "Perguntas frequentes que removem objeções.", "Rodapé com contato, endereço e horário confirmados."])),
      bloco("ORIENTAÇÕES PARA ESTE SEGMENTO", bullets(dicasDoSegmento(d.segmento))),
      bloco("QUALIDADE", bullets(["Uma única meta por página; sem menu que distraia.", "Carregamento rápido, celular primeiro e formulário curto."])),
      REGRAS
    ].join("\n\n")
  },

  "lojas-virtuais": {
    nome: "Lojas virtuais",
    campos: [
      { id: "produtos", rotulo: "Categorias e principais produtos", tipo: "area" },
      { id: "qtdProdutos", rotulo: "Quantidade aproximada de produtos", tipo: "texto" },
      { id: "plataforma", rotulo: "Plataforma", tipo: "select", opcoes: ["Sem preferência", "Nuvemshop", "Loja Integrada", "Shopify", "WooCommerce (WordPress)", "Loja própria sob medida"] },
      { id: "pagamento", rotulo: "Pagamentos", tipo: "checks", opcoes: ["Pix", "Cartão de crédito", "Boleto"] },
      { id: "entrega", rotulo: "Entrega", tipo: "checks", opcoes: ["Correios", "Entrega local (motoboy)", "Retirada na loja"] }
    ],
    montar: (d) => [
      `Atue como um consultor de e-commerce e desenvolvedor. Planeje e estruture a loja virtual de "${v(d.nome)}".`,
      contexto(d),
      bloco("OPERAÇÃO", num([`Produtos: ${v(d.produtos)} (aprox. ${v(d.qtdProdutos)}).`, `Plataforma: ${v(d.plataforma)}.`, `Pagamentos: ${lista(d.pagamento)}.`, `Entrega: ${lista(d.entrega)}.`])),
      bloco("ENTREGA", num(["Recomende a plataforma mais adequada (se não houver preferência) com prós e contras para este porte de negócio.", "Defina a árvore de categorias, o padrão de cadastro de produto (título, descrição, variações, fotos) e a política de frete e trocas.", "Monte a página inicial, a página de produto e o checkout com foco em celular.", "Liste integrações necessárias (meios de pagamento, frete, WhatsApp, Google Analytics)."])),
      bloco("ORIENTAÇÕES PARA ESTE SEGMENTO", bullets(dicasDoSegmento(d.segmento))),
      REGRAS + "\n- Prazos de entrega, taxas e políticas devem vir do cliente; se faltarem, sugira modelos claramente marcados como “a confirmar”."
    ].join("\n\n")
  }
};

export function gerarPrompt(servicoId, dados) {
  const s = SERVICOS_GERADOR[servicoId];
  if (!s) throw new Error("Serviço desconhecido.");
  return s.montar(dados || {});
}
