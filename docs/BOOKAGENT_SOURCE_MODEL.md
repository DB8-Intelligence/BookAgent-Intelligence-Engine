# BookAgent Intelligence Engine — Modelo de Fontes Estruturadas v1.0

## 1. O Que É Uma "Fonte" no BookAgent

Uma **fonte** (Source) é a unidade semântica central do BookAgent Intelligence Engine. Ela representa um bloco coerente de conteúdo extraído dos materiais de entrada, combinando:

- **Texto**: título, descrição, dados estruturados
- **Imagens**: assets visuais correlacionados ao texto
- **Metadados**: classificação, score de confiança, página de origem, contexto de branding

A fonte é inspirada no conceito de "source" do NotebookLM, mas vai além:
- **NotebookLM**: fonte = documento de texto para consulta
- **BookAgent**: fonte = unidade visual + textual + semântica para geração de conteúdo comercial

Cada material processado gera múltiplas fontes. Exemplo: um book de empreendimento gera fontes do tipo hero, lifestyle, planta, investimento, etc.

---

## 2. Tipos de Fontes

### 2.1 Hero

**Descrição**: Imagens e textos principais do empreendimento — fachada, renders 3D, identidade visual.
**Uso**: Capa de materiais, hero de landing page, primeiro slide de carrossel, thumbnail de vídeo.
**Características**: Alta resolução, forte identidade visual, normalmente nas primeiras páginas do book.

### 2.2 Lifestyle

**Descrição**: Imagens de pessoas, estilo de vida, ambientes decorados, cenas cotidianas.
**Uso**: Reels, stories, posts de engajamento, seções "viva aqui" de landing pages.
**Características**: Fotografia lifestyle, modelos, ambientes acolhedores, apelo emocional.

### 2.3 Diferencial

**Descrição**: Diferenciais do empreendimento — itens de lazer, segurança, sustentabilidade, tecnologia.
**Uso**: Carrossel de diferenciais, seções de landing page, argumentos de venda.
**Características**: Ícones, listas, textos curtos e objetivos.

### 2.4 Infraestrutura

**Descrição**: Áreas comuns — piscina, academia, salão de festas, playground, coworking.
**Uso**: Galeria de imagens, carrosséis, seções de amenidades em landing pages.
**Características**: Renders ou fotos de espaços, nomes de ambientes, metragens.

### 2.5 Planta

**Descrição**: Plantas humanizadas, layouts dos apartamentos/casas, tipologias.
**Uso**: Carrosséis de plantas, seção específica de landing page, slides de apresentação.
**Características**: Imagens técnicas mas humanizadas, metragens, número de quartos/suítes.

### 2.6 Comparativo

**Descrição**: Tabelas comparativas, dados de mercado, benchmarks com concorrentes.
**Uso**: Artigos de blog, slides de investimento, argumentos de autoridade.
**Características**: Dados tabulares, gráficos, comparações objetivas.

### 2.7 Investimento

**Descrição**: Informações financeiras — preço, condições de pagamento, valorização, ROI.
**Uso**: CTA final de landing page, slides de fechamento, artigos de investimento.
**Características**: Valores numéricos, tabelas de parcelas, projeções.

### 2.8 CTA

**Descrição**: Blocos de chamada para ação — "Fale com consultor", "Agende visita", "Saiba mais".
**Uso**: Final de todo output (reels, posts, landing page), botões de contato.
**Características**: Texto curto, urgência, dados de contato.

### 2.9 Institucional

**Descrição**: Informações da incorporadora/construtora — marca, história, portfólio, certificações.
**Uso**: Seção "quem está por trás" em landing pages, selo de confiança em posts.
**Características**: Logo da incorporadora, dados corporativos, track record.

### 2.10 Histórico/Editorial

**Descrição**: Contexto do bairro, cidade, região — história, infraestrutura urbana, mobilidade, serviços.
**Uso**: Artigos de blog, seção de localização em landing page, conteúdo de autoridade.
**Características**: Textos mais longos, dados geográficos, fotos da região.

---

## 3. Campos Sugeridos por Fonte

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | string (UUID) | Identificador único da fonte |
| `type` | SourceType (enum) | Tipo da fonte (hero, lifestyle, etc.) |
| `title` | string | Título gerado ou extraído |
| `description` | string | Descrição textual do conteúdo |
| `images` | SourceAsset[] | Assets visuais associados |
| `tags` | string[] | Tags para busca e filtragem |
| `confidenceScore` | number (0-1) | Confiança na classificação |
| `sourcePage` | number | Página de origem no material |
| `rawText` | string | Texto bruto extraído da página |
| `brandingContext` | BrandingContext | Cores e estilo detectados neste bloco |
| `metadata` | SourceMetadata | Metadados adicionais |
| `priority` | number (1-10) | Prioridade para uso em outputs |
| `createdAt` | Date | Timestamp de criação |

---

## 4. Relação Entre Fonte e Assets Visuais

Cada fonte pode ter múltiplos assets visuais. A correlação é feita pelo módulo Text-Image Correlation:

```
Fonte (hero)
  ├── Asset: render_fachada.png    (imagem embutida, pág. 1)
  ├── Asset: render_noturno.png    (imagem embutida, pág. 2)
  └── Asset: page_1_full.png       (página renderizada completa)

Fonte (planta)
  ├── Asset: planta_2q.png         (imagem embutida, pág. 8)
  └── Asset: planta_3q.png         (imagem embutida, pág. 9)
```

**Regras**:
- Uma fonte tem no mínimo 1 asset (pode ser apenas page render)
- Um asset pertence a exatamente 1 fonte
- Assets sem correlação de texto são candidatos a fonte "hero" ou "institucional"

---

## 5. Relação Entre Fonte e Outputs Finais

| Tipo de Fonte | Reel | Story | Carrossel | Post | Blog | Landing | Apresentação | Podcast |
|---|---|---|---|---|---|---|---|---|
| Hero | Capa/intro | 1o card | 1o slide | Imagem principal | Featured image | Hero banner | Capa | Intro |
| Lifestyle | Cenas | Cards | Slides meio | Post engajamento | Imagens inline | Seção lifestyle | Slides | Narrativa |
| Diferencial | Destaques | Cards | Slides | Post lista | Seção artigo | Seção features | Slides | Tópicos |
| Infraestrutura | B-roll | Cards | Slides | Post galeria | Seção artigo | Grid amenidades | Slides | Descrição |
| Planta | Overlay | Card | Slide dedicado | Post técnico | Imagem inline | Seção plantas | Slide | Menção |
| Investimento | Texto overlay | Card final | Slide final | Post dados | Seção artigo | Seção preço | Slide | Pitch |
| CTA | Tela final | Último card | Último slide | Rodapé | CTA inline | Formulário | Último slide | Encerramento |
| Institucional | Logo | Logo | Logo slide | Selo | Menção | Rodapé | Capa/rodapé | Credibilidade |
| Editorial | — | — | — | — | Corpo do artigo | Seção bairro | Contexto | Contexto |

---

## 6. Estratégia de Classificação Automática

### 6.1 Abordagem Híbrida (Heurísticas + LLM)

**Passo 1 — Heurísticas rápidas (sem custo de API)**:
- Páginas 1-2 do PDF → candidatas a `hero`
- Imagem com pessoas → candidata a `lifestyle`
- Texto com "m²", "quartos", "suítes" → candidata a `planta`
- Texto com "R$", "parcela", "entrada" → candidata a `investimento`
- Tabelas comparativas → candidata a `comparativo`
- Texto com "lazer", "piscina", "academia" → candidata a `infraestrutura`

**Passo 2 — Classificação por LLM (refinamento)**:
- Enviar bloco de texto + thumbnail da imagem ao LLM
- Prompt: "Classifique este conteúdo imobiliário em uma das categorias: hero, lifestyle, diferencial, infraestrutura, planta, comparativo, investimento, CTA, institucional, editorial. Retorne o tipo e confidence score (0-1)."

**Passo 3 — Validação cruzada**:
- Se heurística e LLM concordam → confidence alto
- Se divergem → usar LLM com confidence reduzido
- Se ambos incertos → flag para revisão

---

## 7. Estratégia de Scoring e Priorização

Cada fonte recebe um score composto por:

| Fator | Peso | Cálculo |
|---|---|---|
| **Confidence da classificação** | 30% | Score do LLM (0-1) |
| **Qualidade visual** | 25% | Resolução da imagem / resolução mínima |
| **Relevância textual** | 20% | Comprimento e riqueza do texto associado |
| **Posição no material** | 15% | Primeiras páginas > últimas (para hero) |
| **Unicidade** | 10% | Fonte com tipo único > fonte com tipo já existente |

**Score final** = soma ponderada, normalizada para 1-10.

**Uso do score**:
- Fontes com score ≥ 7 → usadas em outputs premium (reel, landing page hero)
- Fontes com score 4-6 → usadas em outputs secundários (carrossel, blog inline)
- Fontes com score < 4 → descartadas ou usadas apenas como contexto

---

## 8. Exemplos em JSON

### Exemplo 1: Fonte Hero

```json
{
  "id": "src_a1b2c3d4",
  "type": "hero",
  "title": "Vitrine Residencial - Fachada Principal",
  "description": "Render 3D da fachada do empreendimento Vitrine Residencial, com destaque para a arquitetura contemporânea e paisagismo integrado.",
  "images": [
    {
      "id": "ast_x1y2z3",
      "filePath": "storage/assets/job_123/raw/page1_img1.png",
      "thumbnailPath": "storage/assets/job_123/thumbnails/page1_img1_thumb.png",
      "width": 2400,
      "height": 1600,
      "page": 1,
      "position": { "x": 0, "y": 0 },
      "classification": "hero"
    }
  ],
  "tags": ["fachada", "render", "contemporaneo", "paisagismo"],
  "confidenceScore": 0.95,
  "sourcePage": 1,
  "rawText": "Vitrine Residencial. Arquitetura contemporânea no coração da cidade.",
  "brandingContext": {
    "colors": { "primary": "#1A3A5C", "secondary": "#D4AF37", "accent": "#FFFFFF", "background": "#F5F5F5", "text": "#333333" },
    "style": "luxury-modern"
  },
  "metadata": {
    "extractedAt": "2026-04-03T10:00:00Z",
    "classifiedBy": "hybrid",
    "processingTimeMs": 1200
  },
  "priority": 10,
  "createdAt": "2026-04-03T10:00:00Z"
}
```

### Exemplo 2: Fonte Planta

```json
{
  "id": "src_e5f6g7h8",
  "type": "planta",
  "title": "Planta 2 Quartos - 65m²",
  "description": "Planta humanizada do apartamento de 2 quartos com suíte, varanda gourmet e 1 vaga de garagem.",
  "images": [
    {
      "id": "ast_m1n2o3",
      "filePath": "storage/assets/job_123/raw/page8_img1.png",
      "thumbnailPath": "storage/assets/job_123/thumbnails/page8_img1_thumb.png",
      "width": 1800,
      "height": 1200,
      "page": 8,
      "position": { "x": 100, "y": 200 },
      "classification": "planta"
    }
  ],
  "tags": ["planta", "2-quartos", "suite", "65m2", "varanda-gourmet"],
  "confidenceScore": 0.92,
  "sourcePage": 8,
  "rawText": "2 Quartos com Suíte | 65m² | Varanda Gourmet | 1 Vaga. Living integrado com cozinha americana, suíte com closet.",
  "brandingContext": {
    "colors": { "primary": "#1A3A5C", "secondary": "#D4AF37", "accent": "#FFFFFF", "background": "#F5F5F5", "text": "#333333" },
    "style": "luxury-modern"
  },
  "metadata": {
    "extractedAt": "2026-04-03T10:00:05Z",
    "classifiedBy": "hybrid",
    "processingTimeMs": 800,
    "area": "65m²",
    "bedrooms": 2,
    "suites": 1,
    "parkingSpots": 1
  },
  "priority": 8,
  "createdAt": "2026-04-03T10:00:05Z"
}
```

### Exemplo 3: Fonte Investimento

```json
{
  "id": "src_i9j0k1l2",
  "type": "investimento",
  "title": "Condições de Pagamento",
  "description": "Tabela de condições de pagamento com entrada facilitada, parcelas durante obra e financiamento bancário.",
  "images": [
    {
      "id": "ast_p4q5r6",
      "filePath": "storage/assets/job_123/raw/page12_img1.png",
      "thumbnailPath": "storage/assets/job_123/thumbnails/page12_img1_thumb.png",
      "width": 1200,
      "height": 800,
      "page": 12,
      "classification": "investimento"
    }
  ],
  "tags": ["investimento", "pagamento", "entrada", "financiamento", "parcelas"],
  "confidenceScore": 0.88,
  "sourcePage": 12,
  "rawText": "A partir de R$ 389.000. Entrada: 20% em até 36x. Saldo: financiamento bancário em até 420 meses. Previsão de entrega: Dez/2027.",
  "metadata": {
    "extractedAt": "2026-04-03T10:00:08Z",
    "classifiedBy": "hybrid",
    "processingTimeMs": 600,
    "priceFrom": 389000,
    "downPaymentPercent": 20,
    "deliveryDate": "2027-12"
  },
  "priority": 7,
  "createdAt": "2026-04-03T10:00:08Z"
}
```

---

## 9. Schema TypeScript

```typescript
// ============================================================
// BookAgent Source Model — Schema TypeScript
// ============================================================

// --- Enums ---

export enum SourceType {
  HERO = 'hero',
  LIFESTYLE = 'lifestyle',
  DIFERENCIAL = 'diferencial',
  INFRAESTRUTURA = 'infraestrutura',
  PLANTA = 'planta',
  COMPARATIVO = 'comparativo',
  INVESTIMENTO = 'investimento',
  CTA = 'cta',
  INSTITUCIONAL = 'institucional',
  EDITORIAL = 'editorial',
}

// --- Interfaces ---

export interface Source {
  id: string;
  type: SourceType;
  title: string;
  description: string;
  images: SourceAsset[];
  tags: string[];
  confidenceScore: number;      // 0.0 a 1.0
  sourcePage?: number;
  rawText?: string;
  brandingContext?: BrandingContext;
  metadata?: SourceMetadata;
  priority: number;             // 1 a 10
  createdAt: Date;
}

export interface SourceAsset {
  id: string;
  filePath: string;
  thumbnailPath?: string;
  width: number;
  height: number;
  page: number;
  position?: { x: number; y: number };
  classification?: SourceType;
}

export interface SourceMetadata {
  extractedAt: string;
  classifiedBy: 'heuristic' | 'llm' | 'hybrid' | 'manual';
  processingTimeMs: number;
  [key: string]: unknown;       // campos específicos por tipo de fonte
}

export interface BrandingContext {
  colors: ColorPalette;
  style: string;
}

export interface ColorPalette {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  text: string;
}

// --- Types ---

export type SourceCollection = Source[];

export type SourcesByType = Record<SourceType, Source[]>;

export type SourceScoreFactors = {
  classificationConfidence: number;   // peso 30%
  visualQuality: number;              // peso 25%
  textualRelevance: number;           // peso 20%
  positionInMaterial: number;         // peso 15%
  uniqueness: number;                 // peso 10%
};
```

---

*Documento gerado como Parte 3 — Inteligência Documental e Fontes.*
*Versão: 1.0 | Data: 2026-04-03*
