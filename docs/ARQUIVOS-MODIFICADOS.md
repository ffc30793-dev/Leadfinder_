# Resumo das mudanças em relação ao ZIP original

**Novos/reescritos:** `index.html`, `painel.html`, `css/app.css`, `js/*` (app, auth-page, perfil, buscar, leads, leads-dados, gerador,
gerador-modelos, conta, planos, visao-geral, api, ui, estado, cartao, firebase), `shared/*`, `api/leads.js`, `api/account.js`,
`api/cakto-webhook.js`, `api/_lib/*`, `firestore.rules`, `firestore.indexes.json`, `firebase.json`, `vercel.json`, `package.json`,
`.env.example`, `.gitignore`, `README.md`, `docs/*`, `tests/*`.

**Preservado:** configuração do Firebase (mesmo projeto, mesmas contas do Authentication), SDK 10.14.1, uso de `GOOGLE_PLACES_API_KEY`,
`FIREBASE_SERVICE_ACCOUNT`, nomes `CAKTO_PRO_CHECKOUT`/`CAKTO_MAX_CHECKOUT`, planos e preços, favicon/logo.

**Removido (duplicado, quebrado ou substituído):** `pages/`, `js/js/…`, `dashboard.html`/`configuracoes.html`/`planos.html` soltos,
`leads.js` CommonJS na raiz, 8 arquivos CSS sobrepostos, `data/*` demonstrativos, `backend/*` (docs migrados para o README).

**Decisões que precisam da sua confirmação:** veja "Pendências" na mensagem de entrega.
