// Compatibilidade com versões antigas: o LeadFinder agora usa limite diário de pesquisas.
export const DEFAULT_PLANS = {
  FREE: { dailySearches: 5, maxResults: 6, approach: "simple" },
  PRO: { dailySearches: 25, maxResults: 15, approach: "enhanced" },
  MAX: { dailySearches: 100, maxResults: 50, approach: "advanced" }
};
export function dailyLimit(plan = "FREE") { return DEFAULT_PLANS[String(plan).toUpperCase()]?.dailySearches ?? 5; }
export function canSearch(user, usedToday = 0) { return usedToday < dailyLimit(user?.plan || user?.plano || "FREE"); }
export function consumeCreditsLocal(user) { return user; }
