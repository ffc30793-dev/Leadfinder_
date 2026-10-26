# LeadFinder — revisão do pacote

## Base usada
Esta entrega usa a estrutura mais completa do arquivo `LeadFinder-v2.zip`, que contém frontend, endpoints de API, módulos compartilhados, regras do Firestore e testes.

## Configurações preservadas
- `js/firebase.js`: configuração web do Firebase do projeto `leadfinder-378a9` preservada.
- `api/` e módulos de servidor preservados, incluindo busca Google Places, conta e webhook Cakto.
- `.env.example`: nomes das variáveis de ambiente preservados; os segredos de produção devem continuar configurados nas Environment Variables da Vercel, não neste arquivo.
- `vercel.json`, `firebase.json`, `firestore.rules` e índices Firestore preservados da base.

## Correção feita nesta revisão
- Corrigido o comando de testes no `package.json`: o script anterior `node --test tests/` não encontrava os testes neste ambiente Node; agora usa `node --test tests/*.test.mjs`.

## Testes executados
- `node --test tests/*.test.mjs`: 44 testes passaram, 0 falharam.
- A execução de testes cobre lógica e endpoints com stubs/mocks; não substitui um teste real com Firebase, chave Google Places, variáveis Cakto e deploy da Vercel.

## Antes de publicar
1. Configure `FIREBASE_SERVICE_ACCOUNT` e `GOOGLE_PLACES_API_KEY` nas variáveis de ambiente da Vercel.
2. Configure os valores Cakto apenas se os pagamentos forem ativados.
3. Teste login/cadastro, gravação do perfil e uma busca real no ambiente publicado.
4. Não publique nem compartilhe credenciais privadas. A chave web do Firebase já presente é a configuração pública do app; restrinja seus domínios e APIs conforme necessário.
