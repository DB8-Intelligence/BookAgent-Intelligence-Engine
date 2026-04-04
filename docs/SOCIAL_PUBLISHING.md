# BookAgent Intelligence Engine — Publicação Social

> Parte 51: Integração Real de Publicação Social
> Data: 2026-04-04 | Versão: V1

---

## Visão Geral

A publicação social conecta o fluxo de aprovação do plano Pro com as redes sociais reais.
Quando um job é aprovado com `auto_publish=true`, o n8n Fluxo 4 chama o endpoint
`POST /api/v1/jobs/:jobId/social-publish` do BookAgent, que executa as chamadas à
Meta Graph API e persiste os resultados.

```
Aprovação final (Pro + auto_publish=true)
  ↓
n8n Fluxo 4: "Publicar nas Redes Sociais"
  ↓
POST /api/v1/jobs/:jobId/social-publish
  ↓
SocialPublisherService
  ├── Instagram Graph API (se imageUrl disponível)
  └── Facebook Graph API  (sempre, texto + link opcional)
  ↓
bookagent_publications (registro por plataforma)
  ↓
bookagent_job_meta.approval_status = 'published' | 'publish_failed'
```

---

## Escopo da V1

### Suportado

| Plataforma | Tipo de Post | Requisito |
|------------|-------------|-----------|
| Facebook   | Texto + link | Page ID + Page Access Token |
| Facebook   | Foto + legenda | Page ID + Access Token + imageUrl pública |
| Instagram  | Imagem + legenda | Business Account ID + Access Token + imageUrl pública |

### Não suportado na V1 (roadmap)

- Instagram: carrossel, reels, stories
- Facebook: vídeos, eventos
- LinkedIn, Twitter/X, YouTube
- Agendamento de publicações
- Análise de engajamento
- Upload direto de binários (apenas URLs públicas)

---

## Configuração

### Variáveis de Ambiente (BookAgent Railway)

```env
# Meta Graph API
META_ACCESS_TOKEN=EAABsbCS...            # User ou Page Access Token
META_INSTAGRAM_ACCOUNT_ID=17841234567890 # Instagram Business Account ID
META_FACEBOOK_PAGE_ID=123456789012345    # Facebook Page ID
```

### Obter as Credenciais

**Pré-requisitos:**
1. Conta Business Manager no Facebook
2. Página do Facebook conectada
3. Conta do Instagram Business vinculada à Página

**Passos:**

```
1. Acesse: https://developers.facebook.com
2. Crie um App → Business → Adicione produtos:
   - Instagram Graph API
   - Pages API
3. Gere um User Access Token com os escopos:
   - instagram_basic
   - instagram_content_publish
   - pages_manage_posts
   - pages_read_engagement
4. Converta para Long-Lived Token (60 dias):
   GET https://graph.facebook.com/v19.0/oauth/access_token
     ?grant_type=fb_exchange_token
     &client_id={app-id}
     &client_secret={app-secret}
     &fb_exchange_token={short-lived-token}
5. Para usar em produção, gere um Page Access Token permanente
6. Obtenha o Instagram Business Account ID:
   GET https://graph.facebook.com/v19.0/me/accounts?access_token={token}
   → pegue o page_id da página
   GET https://graph.facebook.com/v19.0/{page-id}?fields=instagram_business_account&access_token={token}
   → esse é o instagramAccountId
```

---

## API Endpoint

### POST /api/v1/jobs/:jobId/social-publish

**Request:**
```json
{
  "userId": "user_123",
  "platforms": ["instagram", "facebook"],

  // Conteúdo (opcional — se omitido, carregado dos artifacts)
  "caption": "Texto do post",
  "hashtags": ["livro", "marketing", "db8"],
  "imageUrl": "https://cdn.exemplo.com/cover.jpg",
  "linkUrl": "https://app.db8intelligence.com.br/jobs/uuid",

  // Credenciais (opcional — fallback para env vars)
  "accessToken": "EAABsbCS...",
  "instagramAccountId": "17841234567890",
  "facebookPageId": "123456789012345"
}
```

**Response 200 (sucesso total):**
```json
{
  "success": true,
  "data": {
    "jobId": "550e8400-...",
    "results": [
      {
        "platform": "instagram",
        "success": true,
        "postId": "17896129068003200",
        "postUrl": "https://www.instagram.com/p/17896129068003200/"
      },
      {
        "platform": "facebook",
        "success": true,
        "postId": "123456789012345_987654321098765",
        "postUrl": "https://www.facebook.com/123456789012345_987654321098765"
      }
    ],
    "successCount": 2,
    "failureCount": 0,
    "skippedCount": 0,
    "finalStatus": "published"
  }
}
```

**Response 422 (falha total):**
```json
{
  "success": true,
  "data": {
    "jobId": "550e8400-...",
    "results": [
      {
        "platform": "instagram",
        "success": false,
        "skipped": true,
        "skipReason": "Instagram requer imageUrl — forneça uma URL pública de imagem"
      },
      {
        "platform": "facebook",
        "success": false,
        "error": "Invalid OAuth access token"
      }
    ],
    "successCount": 0,
    "failureCount": 1,
    "skippedCount": 1,
    "finalStatus": "publish_failed"
  }
}
```

**Response 422 (sem caption):**
```json
{
  "success": false,
  "error": {
    "code": "NO_CONTENT",
    "message": "Caption não encontrada. Forneça \"caption\" ou verifique os artifacts do job."
  }
}
```

---

## Caption: Fonte de Dados

O serviço usa a caption na seguinte ordem de prioridade:

1. **Request body** — campo `caption` fornecido diretamente
2. **DB (migration 003)** — coluna `content` do artifact `media-metadata`
3. **Arquivo local** — lê `file_path` do artifact e parseia JSON

Se nenhuma fonte retornar caption, o endpoint retorna `422 NO_CONTENT`.

Para garantir que o caption sempre exista, o n8n pode passá-lo no body
após buscar os artifacts via `GET /jobs/:jobId/artifacts`.

---

## Fluxo de Estados

```
final_approved
  ↓ POST /social-publish
  ├── successCount > 0 → published
  └── successCount = 0 → publish_failed
                           ↓
                      Retry via Fluxo 6
                      POST /webhook/bookagent/publicar
                           ↓
                      POST /social-publish novamente
```

**Trigger de retry:** `publish_failed` → usuário solicita retry pelo dashboard
→ dashboard chama `POST /webhook/bookagent/publicar` do Fluxo 6
→ Fluxo 6 chama `/social-publish` novamente

---

## Persistência (bookagent_publications)

Cada chamada ao `/social-publish` insere uma linha por plataforma:

```sql
INSERT INTO bookagent_publications (
  job_id, user_id, platform, status,
  platform_post_id, platform_url, error,
  published_at, payload, response_metadata, attempt_count
)
```

| Campo | Preenchido quando |
|-------|-----------------|
| `platform_post_id` | Publicação bem-sucedida |
| `platform_url` | Publicação bem-sucedida |
| `error` | Falha na publicação |
| `payload` | Sempre (para diagnóstico) |
| `response_metadata` | Sempre (resposta bruta da API) |
| `attempt_count` | Incrementado a cada tentativa |

---

## n8n Workflows

| Workflow | ID | Trigger | Papel |
|----------|----|---------| ------|
| Fluxo 4 | `66e8qpwkHcBFLUP7` | POST /webhook/bookagent/aprovacao | Chama social-publish quando `auto_publish=true` |
| Fluxo 6 | `FsMA0okYCQ2hAjGB` | POST /webhook/bookagent/publicar | Retry e publicação manual |

---

## Limitações Conhecidas da V1

1. **Instagram sem imagem é ignorado** — `skipped` com `skipReason`. Para posts de imagem,
   o BookAgent precisa de uma URL pública. Em V1, isso vem do request ou de CDN externo.

2. **Token de curta duração** — User Access Tokens expiram em ~60 dias.
   Configure um Page Access Token permanente ou implemente refresh automático.

3. **Sem retry automático** — se a Meta API retornar erro transiente (ex: rate limit),
   o endpoint retorna `publish_failed` e o usuário precisa acionar o retry manualmente.

4. **Sem upload de mídia** — apenas URLs públicas são suportadas. O BookAgent
   não faz upload de arquivos binários para a Meta.

5. **Instagram shortcode** — o `postUrl` retornado usa o `id` direto, não o shortcode.
   A URL pode não ser válida para usuários externos sem ajuste posterior.

---

## Próximos Passos (V2+)

- Integrar com storage CDN (Cloudflare R2 ou S3) para upload de imagens
- Implementar refresh automático de tokens Meta
- Adicionar retry automático com backoff para erros transientes
- Suporte a carrossel no Instagram
- Relatório de engajamento por post
- LinkedIn e Twitter/X
