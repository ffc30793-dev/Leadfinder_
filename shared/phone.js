// Normalização de telefones brasileiros.
// Usado no servidor (api/) e no navegador (js/). Não depende de nada externo.

const DDDS_VALIDOS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48, 49, 51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69,
  71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85, 86, 87, 88, 89, 91, 92, 93, 94, 95, 96, 97, 98, 99
]);

export function soDigitos(valor) {
  return String(valor ?? "").replace(/\D/g, "");
}

/**
 * Classifica um número brasileiro.
 * tipo:
 *  - "movel"    : DDD + 9 + 8 dígitos (11 dígitos) -> pode ter WhatsApp
 *  - "fixo"     : DDD + 8 dígitos começando em 2–5  (10 dígitos) -> sem botão de WhatsApp
 *  - "incerto"  : 10 dígitos começando em 6–9 (formato antigo de celular) -> sem botão de WhatsApp
 *  - "invalido" : não é um número nacional utilizável (0800, DDD inexistente, tamanho errado)
 *  - "ausente"  : vazio
 */
export function normalizarTelefoneBR(valor) {
  let d = soDigitos(valor);
  if (!d) return { valido: false, tipo: "ausente" };

  if (d.startsWith("0055")) d = d.slice(4);
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) d = d.slice(2);

  if (d.length !== 10 && d.length !== 11) return { valido: false, tipo: "invalido" };

  const ddd = Number(d.slice(0, 2));
  if (!DDDS_VALIDOS.has(ddd)) return { valido: false, tipo: "invalido" };

  const local = d.slice(2);
  let tipo;
  if (local.length === 9) {
    tipo = local[0] === "9" ? "movel" : "invalido";
  } else if (/^[2-5]/.test(local)) {
    tipo = "fixo";
  } else if (/^[6-9]/.test(local)) {
    tipo = "incerto";
  } else {
    tipo = "invalido";
  }
  if (tipo === "invalido") return { valido: false, tipo };

  return {
    valido: true,
    tipo,
    ddd: String(ddd),
    nacional: d,
    e164: `55${d}`,
    formatado: formatarNacional(d)
  };
}

export function formatarNacional(d) {
  const ddd = d.slice(0, 2);
  const local = d.slice(2);
  return local.length === 9
    ? `(${ddd}) ${local.slice(0, 5)}-${local.slice(5)}`
    : `(${ddd}) ${local.slice(0, 4)}-${local.slice(4)}`;
}

/** Link do WhatsApp somente quando o número é móvel e válido. O usuário decide enviar. */
export function linkWhatsApp(norm, texto = "") {
  if (!norm || norm.tipo !== "movel") return "";
  const base = `https://wa.me/${norm.e164}`;
  return texto ? `${base}?text=${encodeURIComponent(texto)}` : base;
}

export function statusWhatsApp(norm) {
  if (!norm || norm.tipo === "ausente") return "sem_telefone";
  if (norm.tipo === "movel") return "disponivel";
  if (norm.tipo === "fixo") return "fixo";
  return "incerto";
}
