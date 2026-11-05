# Relatório de testes — LeadFinder v2.0

Ambiente de teste: sem internet, sem credenciais. Por isso **nada foi testado contra Firebase, Google Places ou Cakto reais.**

## Executado e aprovado
**Servidor (`npm test`) — 44 de 44 passaram.** Firestore e Google simulados em memória:
- telefone BR (celular/fixo/antigo/0800/DDD inválido), link `wa.me` só para celular;
- estratégia por serviço (consultas diferentes), validação de entrada, cursor assinado (adulteração recusada);
- cota diária: 20 pesquisas simultâneas consomem exatamente 5; renovação à meia-noite de Brasília; devolução em falha;
  6ª pesquisa do plano grátis responde 429 **sem chamar o Google**; `plano: PRO` sem assinatura não vale;
- busca: paginação, teto de 6 requisições, dedupe por ID, remoção de outra cidade/fechadas, continuação sem repetir,
  falha parcial com aviso, falhas 403/429/503 do Google sem descontar pesquisa;
- serviços mudam resultado (criação de sites × redesign × redes sociais); temperatura com pontos explícitos;
- inspeção de sites: bloqueio de IP privado (SSRF), redirecionamentos, timeout, viewport/copyright/tecnologia antiga;
- webhook Cakto: sem segredo → 503, segredo errado → 401, HMAC, ativação, evento repetido/simultâneo aplicado 1 vez,
  produto desconhecido e usuário inexistente não ativam, cancelamento, reembolso, renovação; segredo nunca vai à auditoria.

**Interface (Chromium, 69 verificações) — 69 de 69 passaram.** Firebase simulado com as mesmas restrições de campos das regras:
abrir o site; rota privada; login de conta existente sem perfil → perfil criado; editar e recarregar; sair e entrar;
cadastro novo grava o perfil antes de redirecionar; documento legado preservado; erros de regras/conexão com mensagem clara;
banner offline; as 6 áreas e o botão voltar; busca, filtros, "carregar mais"; WhatsApp só em celular; salvar/recuperar/editar
leads; visão geral com números reais; gerador (prompts diferentes por serviço, copiar); planos com/sem checkout;
mensagem de limite diário; importação de leads antigos; sem rolagem horizontal em 375/768/1280 px; rótulos e links; sem erros no console.
Capturas em `tests/browser/shots/`.

**Segredos:** varredura sem chaves privadas no código. A única `apiKey` é a do app web do Firebase (pública por design, preservada do original).

## NÃO testado (depende de credenciais/serviços externos)
- Regras do Firestore no emulador/produção (`firestore.rules` foi escrito e revisado, mas **não executado**).
- Login, Firestore e `firebase-admin` reais; deploy na Vercel; Google Places real (campos, cobrança, `photos`).
- Cakto: nomes de eventos/campos e o método de assinatura são **suposições** (sem acesso à documentação). Pagamento de teste não foi feito.
- Teste do fluxo "pagamento → plano liberado" ponta a ponta.
