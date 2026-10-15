// Regra central de créditos (também deve existir no backend).
export const SEARCH_COST=6;
export const DEFAULT_PLANS={
 FREE:{credits:30,maxResults:6,approach:"simple"},
 PRO:{credits:100,maxResults:15,approach:"enhanced"},
 MAX:{credits:null,maxResults:50,approach:"advanced"}
};
export function canSearch(user){return Number(user?.credits||0)>=SEARCH_COST;}
export function consumeCreditsLocal(user){if(!canSearch(user)) throw new Error("INSUFFICIENT_CREDITS");user.credits-=SEARCH_COST;return user;}