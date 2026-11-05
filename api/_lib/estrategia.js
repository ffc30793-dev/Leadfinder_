// Estratégia de pesquisa: o serviço escolhido muda os termos consultados e a avaliação posterior.

import crypto from "node:crypto";
import { NOME_ESTADO, SEGMENTOS, acharSegmento, acharServico, normalizar } from "../../shared/catalog.js";

export class ErroDeEntrada extends Error {
  constructor(mensagem, codigo = "entrada_invalida") {
    super(mensagem);
    this.codigo = codigo;
  }
}

/** Valida e normaliza o corpo recebido. */
export function validarEntrada(corpo) {
  const uf = String(corpo?.estado ?? "").trim().toUpperCase();
  if (!NOME_ESTADO[uf]) throw new ErroDeEntrada("Selecione um estado válido.");

  const cidade = String(corpo?.cidade ?? "").trim();
  if (!cidade || cidade.length > 80) throw new ErroDeEntrada("Selecione uma cidade.");
  if (/[<>{}\\]/.test(cidade)) throw new ErroDeEntrada("Cidade inválida.");

  const servicoId = String(corpo?.servico ?? "criacao-sites").trim();
  const servico = acharServico(servicoId);
  if (!servico) throw new ErroDeEntrada("Serviço inválido.");

  const segmentoBruto = String(corpo?.segmento ?? "").trim();
  if (segmentoBruto.length > 80 || /[<>{}\\]/.test(segmentoBruto)) throw new ErroDeEntrada("Segmento inválido.");

  let segmento = segmentoBruto ? acharSegmento(segmentoBruto) : null;
  let termosLivres = null;
  if (segmentoBruto && !segmento) termosLivres = [segmentoBruto]; // segmento digitado pelo usuário

  if (!segmentoBruto && !servico.segmentosPadrao) {
    throw new ErroDeEntrada("Escolha um segmento para pesquisar.");
  }
  if (segmento && servico.gruposAceitos && !servico.gruposAceitos.includes(segmento.grupo)) {
    throw new ErroDeEntrada(`O serviço "${servico.nome}" não se aplica ao segmento "${segmento.nome}".`, "segmento_incompativel");
  }

  const excluir = Array.isArray(corpo?.excluir)
    ? corpo.excluir.slice(0, 600).map((x) => String(x).slice(0, 200))
    : [];

  return {
    uf,
    estadoNome: NOME_ESTADO[uf],
    cidade,
    servico,
    segmento,
    termosLivres,
    excluir,
    continuacao: typeof corpo?.continuacao === "string" ? corpo.continuacao.slice(0, 8000) : ""
  };
}

/** Termos de busca: do segmento escolhido, de texto livre ou dos segmentos padrão do serviço. */
function termosDaBusca({ segmento, termosLivres, servico }) {
  if (termosLivres) return termosLivres;
  if (segmento) return segmento.termos;
  // busca ampla ligada ao serviço (ex.: cardápios -> restaurantes, lanchonetes, pizzarias...)
  return (servico.segmentosPadrao || [])
    .map((id) => SEGMENTOS.find((s) => s.id === id)?.termos[0])
    .filter(Boolean);
}

/** Lista ordenada de consultas de texto (deduplicada). A 1ª é a mais precisa. */
export function montarConsultas(entrada, maximo = 4) {
  const { cidade, estadoNome } = entrada;
  const local = `${cidade}, ${estadoNome}`;
  const termos = termosDaBusca(entrada);
  const candidatas = [];

  // 1ª passada: termo exato de cada variação
  for (const t of termos) candidatas.push(`${t} em ${local}`);
  // 2ª passada: variações de formulação do termo principal (mais cobertura)
  const principal = termos[0];
  if (principal) {
    candidatas.push(`melhores ${principal} em ${local}`);
    candidatas.push(`${principal} centro ${local}`);
  }

  const vistas = new Set();
  const unicas = [];
  for (const q of candidatas) {
    const k = normalizar(q);
    if (!vistas.has(k)) {
      vistas.add(k);
      unicas.push(q);
    }
  }
  return unicas.slice(0, maximo);
}

/** Grupo do segmento (para a avaliação). Em busca ampla/texto livre, usa o 1º segmento padrão. */
export function grupoDaBusca({ segmento, servico }) {
  if (segmento) return segmento.grupo;
  const id = servico.segmentosPadrao?.[0];
  return id ? SEGMENTOS.find((s) => s.id === id)?.grupo || "" : "";
}

// ---------- cursor assinado ----------
// O cursor guarda os tokens de página do Google por consulta. É assinado com HMAC para que o
// cliente não possa alterá-lo (por exemplo, para consultar outra cidade sem passar pelas validações).

function assinar(payloadB64, segredo) {
  return crypto.createHmac("sha256", segredo).update(payloadB64).digest("base64url");
}

export function criarCursor(dados, segredo) {
  if (!segredo) throw new Error("Segredo do cursor ausente.");
  const payload = Buffer.from(JSON.stringify(dados)).toString("base64url");
  return `${payload}.${assinar(payload, segredo)}`;
}

export function lerCursor(cursor, segredo) {
  if (!cursor || !segredo) return null;
  const [payload, assinatura] = String(cursor).split(".");
  if (!payload || !assinatura) return null;
  const esperado = assinar(payload, segredo);
  const a = Buffer.from(assinatura);
  const b = Buffer.from(esperado);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}
