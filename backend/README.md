# Backend / Cloud Functions

O frontend nunca deve consultar diretamente uma API de leads que exija chave secreta.

Fluxo recomendado:

`Front-end -> HTTPS Callable/HTTP Cloud Function -> API externa -> normalização -> Firestore -> Front-end`

Endpoints sugeridos:

- `POST /search-leads`
  - autenticar usuário
  - validar plano e créditos
  - aplicar rate limit
  - reservar/consumir 6 créditos em transação
  - consultar provedor
  - normalizar e deduplicar
  - limitar resultados conforme plano
  - registrar `searches`
  - devolver `leads`

- `POST /cakto/webhook`
  - validar assinatura/segredo do webhook
  - localizar usuário/pedido
  - confirmar pagamento
  - atualizar plano e créditos no Firestore
  - registrar idempotência para não liberar duas vezes

Variáveis de ambiente sugeridas:

`LEADS_API_KEY`
`LEADS_API_BASE_URL`
`CAKTO_WEBHOOK_SECRET`
`CAKTO_PRO_CHECKOUT`
`CAKTO_MAX_CHECKOUT`

Não coloque essas variáveis no HTML, CSS ou JS público.

A lista completa de cidades deve vir de uma fonte de dados/backend confiável. O protótipo deliberadamente não inventa uma lista parcial de cidades.

## Exemplo de contrato de resposta

```json
{
  "leads": [
    {
      "id": "provider-id",
      "name": "Nome fornecido pela fonte",
      "category": "Categoria fornecida",
      "address": "Endereço fornecido",
      "city": "Cidade",
      "state": "UF",
      "phone": "Telefone",
      "whatsapp": "WhatsApp se disponível",
      "site": null,
      "socials": [],
      "rating": null,
      "hours": null,
      "source": "provider"
    }
  ]
}
```

Nunca preencha campos desconhecidos com dados inventados.
