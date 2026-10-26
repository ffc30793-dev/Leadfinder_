# LeadFinder — Prospecção Inteligente (v2.0)

SaaS de prospecção: busca empresas reais no Brasil (Google Places), organiza leads, gera prompts de trabalho e controla
planos/limites no servidor. Front-end estático + funções serverless na Vercel + Firebase (Auth e Firestore).

## Áreas do app (`painel.html`, navegação por `#/rota`)
Visão geral · Buscar empresas · Meus leads · Gerador de conteúdo · Minha conta · Planos e assinatura.
Login/cadastro em `index.html`.

## Estrutura
```
index.html / painel.html     páginas (login e painel)
css/app.css                  único CSS
js/                          módulos do navegador (firebase, perfil, busca, leads, gerador, conta, planos…)
shared/                      código usado no navegador E no servidor (telefone BR, catálogo de segmentos/serviços)
api/leads.js                 POST /api/leads    busca de empresas (cota validada no servidor)
api/account.js               GET  /api/account  plano efetivo, uso do dia, planos públicos
api/cakto-webhook.js         POST /api/cakto-webhook  confirmação de pagamento
api/_lib/                    planos, cota, Places, avaliação de oportunidades, Cakto (não viram rotas)
firestore.rules              regras do Firestore (PUBLICAR no Firebase)
tests/                       testes do servidor (node) e do navegador (Playwright)
```

## O que foi corrigido (causas encontradas no código original)
1. **Perfil não gravava:** ao criar a conta, `onAuthStateChanged` redirecionava para o painel imediatamente e a gravação
   em `users/{uid}` era interrompida. Agora o cadastro **aguarda** a gravação antes de redirecionar.
2. **Contas antigas sem documento:** nada criava o perfil no login. Agora `garantirPerfil` cria/completa o documento ao
   entrar (sem mexer em contas do Authentication).
3. **Regras do Firestore:** bloqueavam qualquer `update` e deixavam o cliente criar o documento com qualquer campo
   (inclusive `plano`). Agora o cliente só grava nome/e-mail/telefone/createdAt/updatedAt; plano e limites ficam em
   `accounts/{uid}`, que **só o servidor** escreve. Campos legados (`plano`, `creditos`) em `users/` são ignorados.
4. **Limites no navegador:** a cota ficava em `localStorage` (burlável). Agora é uma transação no servidor.
5. Removidos arquivos duplicados/quebrados do ZIP original (`pages/`, `js/js/…`, 8 CSS sobrepostos, `leads.js` CommonJS solto).

## Publicar (GitHub + Vercel)
1. Crie um repositório no GitHub e envie esta pasta (`git init && git add . && git commit -m "LeadFinder v2" && git push`).
2. Na Vercel: **Add New → Project →** importe o repositório (Framework: *Other*; sem build command).
3. Em **Settings → Environment Variables**, cadastre as variáveis abaixo e faça **Redeploy**.
4. **Publique as regras do Firestore:** Firebase Console → Firestore → Regras → cole o conteúdo de `firestore.rules` → Publicar
   (ou `firebase deploy --only firestore:rules`). **Sem isso o perfil e os leads não gravam.**
5. Firebase Auth → Configurações → Domínios autorizados: adicione o domínio da Vercel.
6. Google Cloud: restrinja a chave do Firebase (apiKey do `js/firebase.js`) por domínio e a chave do Places por API.

## Variáveis de ambiente (veja `.env.example`)
| Variável | Obrigatória | Para quê |
|---|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | sim | JSON da conta de serviço (Admin SDK): valida o login, cota e plano |
| `GOOGLE_PLACES_API_KEY` | sim | busca (Places API **New** ativada) |
| `CURSOR_SECRET` | não | assina a continuação de resultados (padrão: derivado da conta de serviço) |
| `CAKTO_PRO_CHECKOUT`, `CAKTO_MAX_CHECKOUT` | para vender | links de checkout (https) |
| `CAKTO_WEBHOOK_SECRET` | para vender | autentica o webhook (sem ele, tudo é recusado) |
| `CAKTO_PRODUCT_PRO`, `CAKTO_PRODUCT_MAX` | para vender | ids de produto/oferta de cada plano (vírgula) |
| `CAKTO_SIGNATURE_HEADER` | não | cabeçalho de assinatura HMAC, se a Cakto usar |

## Planos e limites (mantidos do projeto original)
Grátis R$ 0 · 5 pesquisas/dia | Pro R$ 19,90 · 25/dia | Business (id `MAX`) R$ 30,00 · 100/dia.
Definidos em `api/_lib/plans.js`. O dia renova à meia-noite de Brasília. "Carregar mais" consome 1 pesquisa.

## Testes
```
npm test                                   # servidor (44 testes, sem rede)
python3 tests/browser/run_browser_tests.py # interface no Chromium (Firebase e /api simulados)
```
Veja `docs/RELATORIO-TESTES.md` para o que foi e o que NÃO foi testado.
