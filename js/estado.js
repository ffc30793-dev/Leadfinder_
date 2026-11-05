// Estado compartilhado do painel (somente interface/cache; limites e plano vêm do servidor).
export const estado = {
  user: null,
  perfil: null,
  perfilErro: "",
  conta: null,       // resposta de /api/account
  contaErro: "",
  leads: new Map(),  // placeId -> lead salvo
  leadsCarregados: false,
  leadsErro: "",
  buscas: null       // histórico recente (null = ainda não carregado)
};

const ouvintes = new Set();
export const aoMudar = (fn) => { ouvintes.add(fn); return () => ouvintes.delete(fn); };
export const notificar = () => ouvintes.forEach((f) => f());
