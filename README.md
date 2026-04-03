# BookAgent Intelligence Engine

Motor de inteligência documental e geração de conteúdo multimodal para o mercado imobiliário.

## Visão do Projeto

O BookAgent Intelligence Engine transforma materiais brutos de empreendimentos (PDFs, vídeos, áudios, apresentações) em um ecossistema completo de ativos de marketing — reels, stories, carrosséis, blog posts, landing pages, apresentações, podcasts — preservando a identidade visual original e personalizando com dados do corretor.

**Não é um app. É um motor reutilizável**, consumido via API por outros produtos do ecossistema.

## Arquitetura

```
Input (PDF/Vídeo/Áudio) → Ingestão → Extração → Correlação → Branding
    → Fontes Estruturadas → Narrativas → Seleção de Outputs → Geração → Personalização → Outputs
```

## Estrutura de Módulos

### Core (`src/core/`)

| Arquivo | Função |
|---|---|
| `orchestrator.ts` | Cérebro do sistema — recebe input, coordena pipeline, retorna resultado |
| `pipeline.ts` | Define e executa a ordem dos estágios de processamento |
| `job-manager.ts` | Gerencia ciclo de vida dos jobs (criar, atualizar status, consultar) |

### Módulos (`src/modules/`)

| Módulo | Função |
|---|---|
| `ingestion/` | Recebe materiais brutos e extrai texto |
| `asset-extraction/` | Extrai imagens e assets visuais de PDFs |
| `text-image-correlation/` | Correlaciona texto ↔ imagem por proximidade e semântica |
| `branding/` | Identifica e preserva identidade visual (cores, estilo) |
| `source-intelligence/` | Classifica e estrutura fontes (hero, lifestyle, planta, etc.) |
| `narrative/` | Gera narrativas textuais por tipo (comercial, editorial, social) |
| `output-selection/` | Decide quais formatos gerar com base nos assets disponíveis |
| `media/` | Gera outputs de mídia (vídeo, imagem, áudio, apresentação) |
| `blog/` | Gera artigos de blog e conteúdo editorial |
| `landing-page/` | Gera landing pages de captação |
| `personalization/` | Aplica logo, CTA e dados do usuário nos outputs |

### Adapters (`src/adapters/`)

| Adapter | Função |
|---|---|
| `gemini/` | Integração com Google Gemini (visão, texto) |
| `openai/` | Integração com OpenAI (GPT, Vision, TTS, DALL-E) |
| `notebooklm/` | Processamento estilo NotebookLM (fontes, narrativas, podcast) |
| `pdf/` | Parsing de PDF com fallback entre bibliotecas |
| `video/` | Processamento de vídeo (ffmpeg) |
| `audio/` | Processamento de áudio (transcrição, TTS) |
| `storage/` | Armazenamento de arquivos (local → cloud) |

### API (`src/api/`)

| Endpoint | Método | Função |
|---|---|---|
| `/api/v1/process` | POST | Iniciar processamento de material |
| `/api/v1/process/:id` | GET | Consultar status de um job |
| `/health` | GET | Health check do serviço |

## Como Rodar Localmente

### Pré-requisitos

- Node.js >= 20.0.0
- npm ou yarn

### Instalação

```bash
npm install
```

### Desenvolvimento

```bash
npm run dev
```

### Build

```bash
npm run build
npm start
```

### Testes

```bash
npm test
```

## Estrutura de Diretórios

```
bookagent-intelligence-engine/
├── src/
│   ├── core/               # Orchestrator, Pipeline, Job Manager
│   ├── modules/            # Módulos de processamento
│   │   ├── ingestion/
│   │   ├── asset-extraction/
│   │   ├── text-image-correlation/
│   │   ├── branding/
│   │   ├── source-intelligence/
│   │   ├── narrative/
│   │   ├── output-selection/
│   │   ├── media/
│   │   ├── blog/
│   │   ├── landing-page/
│   │   └── personalization/
│   ├── adapters/           # Integrações externas
│   │   ├── gemini/
│   │   ├── openai/
│   │   ├── notebooklm/
│   │   ├── pdf/
│   │   ├── video/
│   │   ├── audio/
│   │   └── storage/
│   ├── api/                # Endpoints REST
│   │   ├── routes/
│   │   ├── controllers/
│   │   └── schemas/
│   ├── types/              # Tipos TypeScript globais
│   ├── utils/              # Utilitários
│   └── config/             # Configuração
├── storage/
│   ├── assets/             # Assets extraídos
│   ├── outputs/            # Outputs gerados
│   └── temp/               # Arquivos temporários
├── docs/                   # Documentação do produto
└── tests/                  # Testes
```

## Stack

- **Runtime**: Node.js 20+
- **Linguagem**: TypeScript 5.6+
- **Framework API**: Express
- **Validação**: Zod
- **Processamento de imagem**: Sharp
- **PDF**: pdf-parse
- **Testes**: Vitest

## Documentação

- [Product Vision](docs/PRODUCT_VISION.md)
- [System Architecture](docs/SYSTEM_ARCHITECTURE.md)
- [Source Model](docs/BOOKAGENT_SOURCE_MODEL.md)
- [Visual Pipeline](docs/BOOKAGENT_VISUAL_PIPELINE.md)
- [Outputs & Personalization](docs/BOOKAGENT_OUTPUTS_AND_PERSONALIZATION.md)
- [MVP Roadmap](docs/BOOKAGENT_MVP_ROADMAP.md)
