# BookAgent Intelligence Engine — Pipeline Visual v1.0

## 1. Estratégia de Extração de Imagens de PDF

### Abordagem Multi-Estratégia com Fallback

A extração de imagens de PDFs imobiliários é o ponto mais crítico do pipeline. Books de empreendimentos têm PDFs heterogêneos — alguns com imagens embutidas de alta qualidade, outros com imagens achatadas no layout.

**Estratégia em camadas:**

| Camada | Método | Quando usar | Biblioteca |
|---|---|---|---|
| **1. Extração direta** | Extrair image streams do PDF | Quando o PDF tem imagens embutidas como objetos separados | `pdf-lib`, `pdfjs-dist` |
| **2. Renderização de página** | Renderizar página inteira como imagem | Quando imagens estão achatadas no layout | `pdf2pic`, `pdfjs-dist` canvas |
| **3. Recorte inteligente** | Detectar regiões visuais e recortar | Quando a página mistura texto e imagens | `sharp` + heurística de regiões |
| **4. OCR + Visão** | Usar modelo de visão para identificar imagens | Fallback final para PDFs problemáticos | Gemini Vision / GPT-4 Vision |

**Fluxo de decisão:**
```
PDF recebido
  │
  ├─ Tentar extração direta de image streams
  │   ├─ Sucesso (imagens encontradas) → Usar imagens extraídas
  │   └─ Falha (sem streams de imagem)
  │       │
  │       ├─ Renderizar página completa como imagem
  │       │   ├─ Analisar com heurística de regiões
  │       │   │   ├─ Regiões visuais detectadas → Recortar
  │       │   │   └─ Sem regiões claras → Usar página inteira
  │       │   └─ Fallback: enviar para LLM Vision
  │       │
  │       └─ Resultado: lista de assets extraídos
```

---

## 2. Tipos de Assets a Extrair

### 2.1 Images (Imagens Embutidas)

**O que são**: Fotografias, renders 3D, ilustrações embutidas no PDF como objetos de imagem separados.
**Detecção**: Extraídas diretamente dos streams de imagem do PDF.
**Formatos**: JPEG, PNG (convertidos de JPEG2000, JBIG2 se necessário).
**Critério mínimo**: largura ≥ 200px E altura ≥ 200px (descartar ícones e artefatos).

### 2.2 Page Renders (Renderização de Página Completa)

**O que são**: A página inteira do PDF renderizada como imagem de alta resolução.
**Detecção**: Sempre gerada — serve como fallback e referência visual.
**Formatos**: PNG a 300 DPI.
**Uso**: Referência para correlação, fallback quando extração direta falha, preservação de layout.

### 2.3 Icons (Ícones e Gráficos Pequenos)

**O que são**: Ícones de diferenciais, selos, certificações, logos de parceiros.
**Detecção**: Imagens extraídas com largura < 200px OU razão de aspecto ~1:1 e tamanho pequeno.
**Uso**: Decoração de carrosséis, ícones em landing pages, complemento visual.

### 2.4 Layout Blocks (Blocos de Layout)

**O que são**: Seções/regiões recortadas de uma página — por exemplo, a área de diferenciais, a área de plantas.
**Detecção**: Análise de regiões visuais na página renderizada (bordas, fundos coloridos, separadores).
**Uso**: Quando a informação relevante é uma composição de texto + imagem + background que não pode ser separada.

### 2.5 Visual Backgrounds (Fundos Visuais)

**O que são**: Texturas, gradientes, padrões de fundo usados nas páginas.
**Detecção**: Análise da cor dominante por região; áreas grandes com cor/textura uniforme.
**Uso**: Replicar o "visual feel" do material nos outputs gerados; manter consistência de branding.

---

## 3. Estratégia de Correlação Texto + Imagem

### 3.1 Proximidade Espacial

**Método**: Analisar a posição (x, y) de cada imagem e bloco de texto na página.
**Lógica**: O bloco de texto mais próximo espacialmente (acima, abaixo ou ao lado) é o candidato.
**Confiança**: Alta quando posições estão disponíveis no PDF.

### 3.2 Co-localização de Página

**Método**: Todo texto de uma página é associado às imagens da mesma página.
**Lógica**: Se a página tem 1 imagem dominante e texto ao redor, todo texto se refere a ela.
**Confiança**: Média — funciona bem para páginas com layout simples (1 imagem + texto).

### 3.3 Matching Semântico (LLM)

**Método**: Enviar thumbnail da imagem e blocos de texto candidatos ao LLM.
**Prompt**: "Dada esta imagem de um material imobiliário e estes blocos de texto, qual texto melhor descreve ou se relaciona com a imagem?"
**Confiança**: Alta mas custosa — reservar para casos ambíguos.

### 3.4 Ordem de Aplicação

```
1. Tentar proximidade espacial (se posições disponíveis)
   ↓ (sem posição ou baixa confiança)
2. Usar co-localização de página
   ↓ (página com múltiplas imagens e textos)
3. Refinar com matching semântico via LLM
```

---

## 4. Estratégia de Identificação de Branding

### 4.1 Cores

**Extração**: Analisar os pixels das imagens extraídas e page renders.
**Método**: Quantização de cores (k-means com k=5-8) para identificar paleta dominante.
**Output**: `ColorPalette { primary, secondary, accent, background, text }`.

```
Imagem hero → extrair 5 cores dominantes
Page renders → extrair cores de fundo e texto
Combinar → paleta unificada do material
```

**Biblioteca**: `sharp` para extração de pixels + algoritmo de quantização.

### 4.2 Tipografia Aproximada

**Extração**: Não é possível extrair a fonte exata de um PDF renderizado.
**Método**: Classificar a tipografia em categorias aproximadas via LLM Vision.
**Categorias**: serif, sans-serif, display, script, monospace.
**Uso**: Selecionar fontes semelhantes (Google Fonts) para os outputs gerados.

### 4.3 Composição

**Extração**: Analisar o layout das páginas — proporções, alinhamentos, uso de espaço.
**Categorias**: 
- `full-bleed` (imagem de borda a borda)
- `grid` (layout em grade)
- `asymmetric` (composição assimétrica moderna)
- `centered` (conteúdo centralizado)
- `minimal` (muito espaço em branco)

### 4.4 Estilo Visual

**Classificação por LLM Vision**:
- `luxury-modern` — empreendimentos de alto padrão, design contemporâneo
- `luxury-classic` — alto padrão com referências clássicas
- `urban-modern` — jovem, urbano, compacto
- `resort` — lazer, tropical, férias
- `popular` — econômico, funcional, MCMV
- `corporate` — comercial, escritórios, salas

---

## 5. Estratégia de Armazenamento Interno de Assets

### Estrutura de Diretórios

```
storage/assets/{job_id}/
├── raw/                          # Imagens extraídas em resolução original
│   ├── page01_img01.png
│   ├── page01_img02.png
│   ├── page03_img01.png
│   └── ...
├── pages/                        # Páginas renderizadas como imagem completa
│   ├── page01.png
│   ├── page02.png
│   └── ...
├── thumbnails/                   # Thumbnails para preview rápido (300x300)
│   ├── page01_img01_thumb.png
│   ├── page01_thumb.png
│   └── ...
├── branding/                     # Assets de branding extraídos
│   ├── palette.json              # Paleta de cores
│   ├── style.json                # Classificação de estilo
│   └── logo_detected.png         # Logo detectado (se houver)
├── blocks/                       # Layout blocks recortados
│   ├── page03_block01.png
│   └── ...
└── metadata.json                 # Índice geral de todos os assets
```

### Convenção de Nomes

```
{page_number}_img{image_index}.{format}     → Imagens extraídas
{page_number}.{format}                      → Page renders
{page_number}_img{image_index}_thumb.{format} → Thumbnails
{page_number}_block{block_index}.{format}   → Layout blocks
```

### metadata.json

```json
{
  "jobId": "job_123",
  "totalPages": 16,
  "totalAssets": 24,
  "extractedAt": "2026-04-03T10:00:00Z",
  "assets": [
    {
      "id": "ast_001",
      "type": "image",
      "filePath": "raw/page01_img01.png",
      "thumbnailPath": "thumbnails/page01_img01_thumb.png",
      "page": 1,
      "width": 2400,
      "height": 1600,
      "sizeBytes": 1245000,
      "format": "png"
    }
  ]
}
```

---

## 6. Como Assets Alimentam Cada Output

### 6.1 Reels (9:16, até 90s)

- **Hero images**: Background principal, Ken Burns effect (zoom lento)
- **Lifestyle**: Cenas intermediárias, transições
- **Infraestrutura**: B-roll de amenidades
- **Planta**: Overlay rápido (2-3 segundos)
- **Branding**: Cores do material aplicadas em textos e transições

### 6.2 Stories (9:16, sequência de cards)

- **Hero**: Primeiro card (capa)
- **Diferencial**: Cards de destaque (1 diferencial por card)
- **Infraestrutura**: Cards de amenidades
- **Planta**: Card de planta (com dados de metragem)
- **Investimento**: Card de preço/condições
- **CTA**: Último card com dados de contato

### 6.3 Carrosséis (1:1 ou 4:5, 5-10 slides)

- **Hero**: Slide 1 (capa)
- **Lifestyle/Infraestrutura**: Slides 2-4 (imagens com texto overlay)
- **Diferencial**: Slides 5-7 (ícones + texto)
- **Planta**: Slide 8 (planta com dados)
- **Investimento**: Slide 9 (tabela simplificada)
- **CTA**: Slide 10 (contato)

### 6.4 Landing Page

| Seção | Fonte | Asset utilizado |
|---|---|---|
| Hero banner | Hero | Imagem principal em full-width |
| Galeria | Lifestyle + Infraestrutura | Carrossel de imagens |
| Diferenciais | Diferencial | Ícones + texto |
| Plantas | Planta | Imagens de plantas + dados |
| Investimento | Investimento | Tabela de condições |
| Sobre | Institucional | Logo + texto |
| Localização | Editorial | Mapa + texto do bairro |
| Formulário | CTA | Form + dados de contato |

### 6.5 Blog

- **Featured image**: Hero (principal)
- **Inline images**: Lifestyle, infraestrutura, planta
- **Corpo do texto**: Gerado a partir de fontes editorial + diferencial
- **CTA inline**: Dados de investimento + contato

---

## 7. Riscos Técnicos

| # | Risco | Impacto | Probabilidade | Mitigação |
|---|---|---|---|---|
| 1 | **PDFs heterogêneos** | Extração falha ou produz imagens de baixa qualidade | Alta | Multi-estratégia com fallback; page render como garantia |
| 2 | **Imagens achatadas** | Books com design "flat" não têm image streams separados | Média | Renderização de página + recorte inteligente |
| 3 | **Qualidade de imagem** | Imagens extraídas podem ter resolução insuficiente para vídeo | Média | Upscaling com IA (Real-ESRGAN); threshold mínimo de qualidade |
| 4 | **Extração de cores incorreta** | Paleta dominada por brancos/pretos de fundo | Média | Excluir cores de fundo; focar em imagens hero para extração |
| 5 | **Custo de LLM Vision** | Classificação e correlação via LLM em muitas imagens = custo alto | Média | Usar heurísticas primeiro; LLM apenas para refinamento |
| 6 | **Tempo de processamento** | PDFs grandes (50+ páginas) com muitas imagens | Baixa | Processamento paralelo por página; limite de páginas |
| 7 | **Formatos de imagem exóticos** | PDFs podem usar JBIG2, CCITT, JPEG2000 | Baixa | Bibliotecas de conversão; fallback para page render |

---

## 8. Ordem de Implementação

| Fase | Escopo | Entregável |
|---|---|---|
| **Fase 1** | Extração básica de image streams do PDF | `extractFromPDF()` retorna lista de imagens |
| **Fase 2** | Page render como fallback | Renderização de todas as páginas como PNG |
| **Fase 3** | Thumbnails e metadados | Geração automática de thumbnails + `metadata.json` |
| **Fase 4** | Extração de branding (cores) | `ColorPalette` extraída das imagens dominantes |
| **Fase 5** | Correlação básica (co-localização) | Texto associado a imagens por página |
| **Fase 6** | Recorte inteligente de regiões | Layout blocks extraídos de páginas mistas |
| **Fase 7** | Classificação de estilo via LLM | Estilo visual e tipografia classificados |
| **Fase 8** | Correlação semântica via LLM | Matching refinado texto ↔ imagem |

---

## 9. Estrutura de Diretórios Proposta (Completa)

```
storage/
├── assets/
│   └── {job_id}/
│       ├── raw/                    # Imagens originais extraídas
│       ├── pages/                  # Páginas renderizadas (300 DPI)
│       ├── thumbnails/             # Previews (300x300)
│       ├── blocks/                 # Regiões recortadas
│       ├── branding/               # Paleta, estilo, logo
│       └── metadata.json           # Índice de assets
│
├── outputs/
│   └── {job_id}/
│       ├── reels/                  # MP4 9:16
│       ├── stories/                # MP4/PNG 9:16
│       ├── carousels/              # PNG 1:1 ou 4:5
│       ├── posts/                  # PNG/JPG
│       ├── blog/                   # HTML/Markdown
│       ├── landing-pages/          # HTML/CSS/JS
│       ├── presentations/          # PPTX/PDF
│       ├── audio/                  # MP3
│       └── manifest.json           # Índice de outputs
│
└── temp/
    └── {job_id}/                   # Arquivos temporários (auto-cleanup)
```

---

*Documento gerado como Parte 4 — Pipeline Visual.*
*Versão: 1.0 | Data: 2026-04-03*
