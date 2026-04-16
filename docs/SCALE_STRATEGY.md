# BookAgent Intelligence Engine — Estratégia de Escala

## 1. Canais de Aquisição

### 1.1 WhatsApp Funnel (Automatizado)
- **Entrada**: Usuário envia PDF via WhatsApp
- **Pipeline**: BookAgent processa 17 estágios automaticamente
- **Saída**: Preview de conteúdo + CTA de upgrade
- **Nurturing**: Sequência automatizada de 8 passos (welcome → demo → resultados → oferta → last chance)
- **Endpoint**: `POST /api/v1/funnel/whatsapp/webhook`
- **Evolution API**: Envio/recepção de mensagens

### 1.2 Dashboard (Self-Service)
- **Entrada**: Upload de PDF via UploadWizard
- **Pipeline**: Processamento via BullMQ (async) ou sync
- **Saída**: Artifacts visualizáveis + download
- **Endpoint**: `POST /api/v1/process`

### 1.3 API Programática (B2B)
- **Entrada**: POST com file_url via API key
- **Pipeline**: Mesmo motor, autenticado por X-API-Key
- **Saída**: JSON com artifacts + webhook de conclusão
- **Endpoint**: `POST /api/public/v1/process`
- **Plano mínimo**: Business

### 1.4 Referrals / Afiliados
- **Tracking**: Clique → signup → conversão
- **Comissão**: Configurável por tipo de parceiro
- **Dashboard**: Métricas de referral por parceiro
- **Endpoint**: `POST /api/v1/partners/referrals/click`

### 1.5 Publicação Orgânica
- **Geração em escala**: ContentSchedule agenda posts
- **Plataformas**: Instagram, Facebook, WhatsApp
- **Automação**: n8n cron → getDueSchedules → publish

## 2. Estrutura de Parcerias

### 2.1 Tipos de Parceiro

| Tipo | Comissão Default | Duração |
|------|-----------------|---------|
| Agency | 20% Revenue Share | 12 meses |
| Brokerage | 15% Percentual | 6 meses |
| Affiliate | R$50/signup | Vitalício |
| White Label | 30% Revenue Share | Vitalício |
| Integrator | 10% Percentual | 12 meses |

### 2.2 White-Label
- Branding customizável (logo, cores, nome)
- Domínio customizado
- "Powered by BookAgent" opcional
- Limites de end-customers configuráveis
- Planos permitidos definidos por parceiro

### 2.3 Programa de Afiliados
- Referral code único por parceiro
- Tracking de clique → signup → conversão
- Payouts automáticos (pending → approved → paid)
- Dashboard de métricas por parceiro

## 3. Modelo de API

### 3.1 Autenticação
- **Header**: `X-API-Key: ba_live_...`
- **Hash**: SHA-256 (key nunca armazenada em plaintext)
- **Validação**: Lookup por hash no bookagent_api_keys
- **Plano**: Apenas Business tem acesso à API

### 3.2 Endpoints Públicos

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| POST | /api/public/v1/process | Iniciar processamento |
| GET | /api/public/v1/jobs/:id | Status do job |
| GET | /api/public/v1/artifacts/:jobId | Listar artifacts |
| GET | /api/public/v1/usage | Uso da API key |

### 3.3 Rate Limits por Plano

| Plano | Requests/min | Jobs/mês | Features |
|-------|-------------|----------|----------|
| Basic | 20 | 10 | PDF, blog |
| Pro | 60 | 50 | + video, auto-publish |
| Business | 200 | 500 | + API, white-label |

### 3.4 API Pricing (Pay-per-Use)

| Tier | Base/mês | Jobs inclusos | Extra/job |
|------|----------|--------------|-----------|
| Free | R$0 | 5 | - |
| Starter | R$97 | 50 | R$5 |
| Growth | R$297 | 200 | R$4 |
| Enterprise | R$997 | 1000 | R$3 |

## 4. Integrações com Sistemas Externos

### 4.1 Catálogo de Conectores

| Sistema | Tipo | Eventos Suportados | Direção |
|---------|------|-------------------|---------|
| ImobCreator Studio | Plataforma | job_completed, artifact_ready | Outbound/Both |
| NexoOmnix Platform | Suite Marketing | job_completed, content_approved | Outbound/Both |
| HubSpot CRM | CRM | lead_created, lead_converted | Outbound |
| Pipedrive CRM | CRM | lead_created, lead_converted | Outbound |
| RD Station CRM | CRM | lead_created, lead_converted | Outbound |
| CRM Genérico | Webhook | lead_created, job_completed | Outbound |
| Zapier | Automação | job_completed, lead_created | Outbound |
| n8n | Automação | Todos os eventos | Both |
| Webhook Custom | Custom | Todos os eventos | Outbound |

### 4.2 Modelo de Integração
- **Conexão**: Tenant registra sistema + config (API key, webhook URL)
- **Eventos**: Seleciona quais eventos disparam sync
- **Dispatch**: HMAC-SHA256 assinado, timeout 15s
- **Logs**: Cada sync logado com payload, resposta, duração, status
- **Health**: Ping endpoint para verificar conectividade

## 5. Modelo de Monetização

### 5.1 SaaS Direto (Assinatura)
- Basic: R$97/mês — 10 jobs, funcionalidades core
- Pro: R$247/mês — 50 jobs, video, auto-publish, WhatsApp
- Business: R$997/mês — 500 jobs, API, white-label, priority

### 5.2 API Usage (Pay-per-Use)
- Tiers: Free → Starter → Growth → Enterprise
- Base mensal + overage por job/request extra
- Invoicing automático com breakdown de uso

### 5.3 Licenciamento (White-Label)
- Revenue share 30% sobre receita dos end-customers
- Branding completo customizável
- Domínio customizado
- Limites de end-customers

### 5.4 Marketplace (Futuro)
- Templates premium
- Módulos add-on
- Integrações pagas

## 6. Sistema de Distribuição

### 6.1 Canais Ativos

| Canal | Modelo | Status |
|-------|--------|--------|
| SaaS Direto | Assinatura | Ativo |
| API Usage | Pay-per-Use | Ativo |
| White Label | Revenue Share | Ativo |
| Afiliados | Per-Signup | Ativo |
| Revenda Parceiros | Percentual | Ativo |
| Marketplace | Freemium | Futuro |

### 6.2 Dashboard de Distribuição
- **Endpoint**: `GET /api/v1/distribution/overview`
- Métricas: canais ativos, receita total, clientes, breakdown por canal, top canal

## 7. Automações

### 7.1 Lead Generation
- WhatsApp webhook → lead registration automática
- Tracking de source (utm_source, referral_code)
- 3 demos grátis por lead (trial automático)

### 7.2 Nurturing
- Sequências de 8 passos configuráveis
- Triggers: pdf_received, demo_completed, trial_expired
- Canais: WhatsApp, email (futuro)
- Condições: verificação de estágio do lead

### 7.3 Conversão
- Tracking de eventos: trial_start, trial_to_paid, plan_upgrade
- Atribuição por canal e campanha
- Métricas: CPL, CAC, conversion rate, revenue

### 7.4 Content Scheduling
- Agendamento de publicação por plataforma
- Cron job (n8n) busca posts pendentes → publica
- Status tracking: scheduled → publishing → published/failed

## 8. Endpoints da Parte 103

### Aquisição (`/api/v1/acquisition/`)
- `POST /campaigns` — Criar campanha de aquisição
- `GET /campaigns` — Listar campanhas
- `POST /schedules` — Agendar conteúdo
- `GET /schedules` — Listar agendamentos
- `POST /sequences` — Criar sequência nurturing
- `GET /sequences` — Listar sequências
- `POST /conversions` — Registrar conversão
- `GET /conversions` — Listar conversões
- `GET /growth-dashboard` — Dashboard de crescimento

### Integrações (`/api/v1/integrations/`)
- `POST /` — Criar conexão
- `GET /` — Listar conexões
- `GET /catalog` — Catálogo disponível
- `GET /:id` — Detalhe da conexão
- `DELETE /:id` — Desativar
- `POST /:id/ping` — Health check
- `POST /:id/test` — Testar dispatch
- `GET /:id/logs` — Logs de sync

### Distribuição (`/api/v1/distribution/`)
- `POST /channels` — Criar canal
- `GET /channels` — Listar canais
- `GET /overview` — Dashboard
- `POST /white-label` — Config white-label
- `GET /white-label/:partnerId` — Config do parceiro
- `POST /payouts` — Criar payout
- `GET /payouts/:partnerId` — Listar payouts
- `PATCH /payouts/:id/approve` — Aprovar payout
- `GET /api-pricing` — Tabela de preços
- `GET /api-invoices` — Invoices API

### Parceiros (`/api/v1/partners/`) — já existente
### API Pública (`/api/public/v1/`) — já existente
### Funnel (`/api/v1/funnel/`) — já existente
