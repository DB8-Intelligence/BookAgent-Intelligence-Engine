# BookAgent Intelligence Engine — MVP e Roadmap v1.0

## 1. MVP Fase 1 — "PDF to Sources" (4-6 semanas)

### Objetivo
Provar que o sistema consegue receber um PDF de empreendimento, extrair imagens, correlacionar com texto e produzir fontes estruturadas.

### Escopo

| Módulo | Entregável |
|---|---|
| **Ingestion** | Upload de PDF, extração de texto com `pdf-parse` |
| **Asset Extraction** | Extração de imagens embutidas + page renders com `sharp`/`pdfjs-dist` |
| **Text-Image Correlation** | Correlação por co-localização de página |
| **Source Intelligence** | Classificação manual + heurísticas básicas (posição, palavras-chave) |
| **Asset Storage** | Salvamento em sistema de arquivos local com `metadata.json` |
| **API** | Endpoint `POST /process` + `GET /process/:id` |
| **Core** | Orchestrator + Pipeline + JobManager funcionais |

### Critérios de Pronto
- [ ] PDF enviado via API retorna job_id
- [ ] Imagens extraídas e salvas em `storage/assets/{job_id}/`
- [ ] Fontes estruturadas geradas com tipo, título, imagens e confidence score
- [ ] Metadados de assets persistidos em JSON
- [ ] Consulta de status do job funcional

### Resultado
Um PDF entra → fontes estruturadas saem (JSON). Sem geração de conteúdo ainda.

---

## 2. MVP Fase 2 — "Sources to Content" (4-6 semanas)

### Objetivo
Gerar os primeiros outputs visuais e textuais a partir das fontes.

### Escopo

| Módulo | Entregável |
|---|---|
| **Branding** | Extração de paleta de cores das imagens hero |
| **Source Intelligence** | Classificação automática via LLM (Gemini/OpenAI) |
| **Narrative** | Geração de narrativas (comercial, social) via LLM |
| **Media — ImageGen** | Geração de carrosséis (PNG) e posts (PNG) |
| **Blog** | Geração de artigo de blog (Markdown) |
| **Personalization** | Logo overlay + CTA básico (nome, WhatsApp) |
| **Adapters** | Integração com 1 LLM (OpenAI ou Gemini) |

### Critérios de Pronto
- [ ] Carrossel de 10 slides gerado automaticamente a partir de 1 PDF
- [ ] 3+ variações de posts gerados
- [ ] 1 artigo de blog gerado com imagens inline
- [ ] Paleta de cores extraída corretamente em 80% dos testes
- [ ] Logo e CTA aplicados nos outputs
- [ ] Classificação automática com confidence ≥ 0.7 em 70% das fontes

### Resultado
Um PDF entra → carrosséis, posts e blog saem. Primeiros outputs usáveis comercialmente.

---

## 3. Pós-MVP — "Full Media Pipeline" (8-12 semanas)

### Escopo

| Módulo | Entregável |
|---|---|
| **Media — VideoGen** | Reels (MP4 9:16), stories (MP4 animado), vídeos longos |
| **Media — AudioGen** | Áudio monólogo (TTS), áudio podcast (multi-voz) |
| **Landing Page** | Geração de landing page HTML standalone |
| **Media — SlideGen** | Apresentações PPTX |
| **Output Selection** | Seleção inteligente baseada em qualidade dos assets |
| **Branding avançado** | Tipografia, composição, estilo visual |
| **Personalization avançada** | CTA completo (todos os campos), posicionamento configurável |
| **Adapters** | Multi-provider (OpenAI + Gemini), TTS (ElevenLabs) |
| **Infra** | Filas (BullMQ), storage cloud (S3), webhooks |

### Critérios de Pronto
- [ ] Reel de 30s gerado automaticamente
- [ ] Stories de 5+ cards animados
- [ ] Vídeo longo ≤ 16MB para WhatsApp
- [ ] Áudio monólogo de 2-3 min com voz natural
- [ ] Landing page responsiva com Lighthouse ≥ 80
- [ ] Apresentação de 15 slides
- [ ] Pipeline assíncrono com filas
- [ ] Webhooks para notificação de conclusão

---

## 4. Ordem de Implementação por Módulo

```
 1. Core (Orchestrator + Pipeline + JobManager)         ✅ Estrutura criada
 2. Types (interfaces e enums globais)                  ✅ Estrutura criada
 3. API (Express + endpoints básicos)                   ✅ Estrutura criada
 4. Ingestion (PDF text extraction)                     ⬜ MVP Fase 1
 5. Asset Extraction (PDF image extraction)             ⬜ MVP Fase 1
 6. Storage Adapter (filesystem local)                  ⬜ MVP Fase 1
 7. Text-Image Correlation (co-localização)             ⬜ MVP Fase 1
 8. Source Intelligence (heurísticas)                   ⬜ MVP Fase 1
 9. Branding (extração de cores)                        ⬜ MVP Fase 2
10. LLM Adapter (OpenAI ou Gemini)                      ⬜ MVP Fase 2
11. Source Intelligence (classificação LLM)             ⬜ MVP Fase 2
12. Narrative Generation                                ⬜ MVP Fase 2
13. Media — ImageGen (carrosséis, posts)                ⬜ MVP Fase 2
14. Blog Generation                                     ⬜ MVP Fase 2
15. Personalization (logo + CTA básico)                 ⬜ MVP Fase 2
16. Media — VideoGen (reels, stories)                   ⬜ Pós-MVP
17. Media — AudioGen (monólogo, podcast)                ⬜ Pós-MVP
18. Landing Page Generation                             ⬜ Pós-MVP
19. Media — SlideGen (PPTX)                             ⬜ Pós-MVP
20. Output Selection (inteligente)                      ⬜ Pós-MVP
21. Infra (filas, cloud storage, webhooks)              ⬜ Pós-MVP
```

---

## 5. Dependências Críticas

```
Ingestion ─────────┐
                    ├──▶ Asset Extraction ──▶ Correlation ──▶ Source Intelligence
Storage Adapter ───┘                                              │
                                                                  ├──▶ Narrative ──┐
                                                                  │                │
LLM Adapter ──────────────────────────────────────────────────────┘                │
                                                                                   │
Branding ──────────────────────────────────────────────────────────────────────────┤
                                                                                   │
                                                         Media Generation ◀────────┘
                                                              │
                                                              ▼
                                                       Personalization
```

**Bloqueadores críticos**:
- Sem Ingestion → nada funciona
- Sem Asset Extraction → sem imagens → sem outputs visuais
- Sem LLM Adapter → sem classificação automática nem narrativas
- Sem Storage → sem persistência de assets/outputs

---

## 6. Principais Riscos

| Fase | Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|---|
| MVP 1 | PDFs com imagens achatadas (sem streams) | Alta | Alto | Page render como fallback |
| MVP 1 | Correlação texto-imagem imprecisa | Média | Médio | Começar com co-localização simples; refinar depois |
| MVP 2 | Custo de API LLM alto | Média | Médio | Cache agressivo; heurísticas primeiro, LLM como refinamento |
| MVP 2 | Qualidade visual dos carrosséis | Média | Alto | Templates bem desenhados; iteração rápida |
| MVP 2 | Tempo de geração > expectativa do usuário | Média | Médio | Pipeline assíncrono; feedback de progresso |
| Pós-MVP | Complexidade de geração de vídeo | Alta | Alto | Usar Remotion/ffmpeg; começar simples (slideshow) |
| Pós-MVP | Qualidade do TTS | Média | Médio | Usar ElevenLabs (qualidade premium); fallback OpenAI |
| Pós-MVP | Escalabilidade | Média | Alto | BullMQ + workers horizontais |

---

## 7. Quick Wins

| # | Quick Win | Esforço | Impacto | Quando |
|---|---|---|---|---|
| 1 | **Extrair imagens de 1 PDF e salvar** | 1 dia | Prova de conceito visual | Semana 1 |
| 2 | **Gerar 1 carrossel estático** | 2 dias | Primeiro output tangível | Semana 3 |
| 3 | **Extrair paleta de cores** | 1 dia | Branding visível | Semana 4 |
| 4 | **Gerar 1 post com logo overlay** | 1 dia | Personalização funcionando | Semana 5 |
| 5 | **Gerar 1 artigo de blog** | 2 dias | Primeiro output textual | Semana 6 |
| 6 | **API retornando status de job** | 0.5 dia | Integração possível | Semana 1 |

---

## 8. Critérios de Pronto por Fase

### MVP Fase 1 — "Done" quando:
- [ ] `POST /api/v1/process` aceita URL de PDF e retorna job_id
- [ ] `GET /api/v1/process/:id` retorna status e resultado
- [ ] PDF processado gera ≥ 5 fontes estruturadas
- [ ] Imagens extraídas com resolução ≥ 800px
- [ ] `metadata.json` gerado com todos os assets
- [ ] Testes unitários cobrindo core + ingestion + extraction
- [ ] README atualizado com instruções de uso

### MVP Fase 2 — "Done" quando:
- [ ] Carrossel de 10 slides gerado a partir de fontes
- [ ] 3 variações de posts gerados
- [ ] 1 artigo de blog com SEO básico
- [ ] Paleta de cores extraída (5 cores)
- [ ] Logo overlay funcional
- [ ] CTA com nome + WhatsApp em todos os outputs
- [ ] Classificação automática com accuracy ≥ 70%
- [ ] Demo funcional end-to-end (PDF → outputs)

### Pós-MVP — "Done" quando:
- [ ] 1 reel de 30s gerado
- [ ] Landing page responsiva gerada
- [ ] Áudio monólogo de 2min gerado
- [ ] Processamento via filas (BullMQ)
- [ ] Todos os 11 tipos de output funcionais
- [ ] API com webhooks de notificação
- [ ] Documentação de API completa

---

## 9. Roadmap Visual

```
SEMANA   1    2    3    4    5    6    7    8    9   10   11   12   13   14   15   16+
         ├────────────────────────┤    ├────────────────────────┤    ├─────────────────▶
              MVP FASE 1                    MVP FASE 2                  PÓS-MVP
         
         [Core + API]
         [Ingestion ──────────]
              [Asset Extraction ──]
                   [Correlation ──]
                   [Source Intel ──]
                                       [Branding ──]
                                       [LLM Adapter ──]
                                       [Narrative ────]
                                            [ImageGen ──────]
                                            [Blog ─────]
                                                 [Personalization]
                                                                    [VideoGen ─────]
                                                                    [AudioGen ───]
                                                                    [Landing ───]
                                                                    [SlideGen ─]
                                                                         [Infra ──▶]
```

---

## 10. Checklist Inicial de Desenvolvimento

### Infraestrutura (Semana 0)
- [x] Repositório criado
- [x] Estrutura de pastas definida
- [x] package.json configurado
- [x] tsconfig.json configurado
- [x] .gitignore configurado
- [x] README.md inicial
- [x] Core stubs (orchestrator, pipeline, job-manager)
- [x] Types globais definidos
- [x] API stubs (routes, controllers, schemas)
- [ ] Instalar dependências (`npm install`)
- [ ] Configurar ESLint
- [ ] Configurar Vitest
- [ ] CI/CD básico (GitHub Actions)

### MVP Fase 1 (Semanas 1-6)
- [ ] Implementar PDF text extraction (Ingestion)
- [ ] Implementar PDF image extraction (Asset Extraction)
- [ ] Implementar Storage adapter (filesystem local)
- [ ] Implementar correlação por co-localização
- [ ] Implementar classificação por heurísticas
- [ ] Conectar pipeline completo (end-to-end)
- [ ] Testes unitários
- [ ] Testes de integração com PDFs reais
- [ ] Documentação de API

---

## 11. Primeira Milestone Recomendada

### Milestone: "First PDF Processed" (Semana 2)

**Entregável**: Um PDF de empreendimento enviado via API gera uma lista de imagens extraídas + texto associado, salvos no filesystem.

**Concrete deliverables**:
1. Endpoint `POST /api/v1/process` recebendo `{ file_url, type: "pdf" }`
2. PDF baixado e texto extraído
3. Imagens extraídas e salvas em `storage/assets/{job_id}/raw/`
4. Thumbnails gerados em `storage/assets/{job_id}/thumbnails/`
5. `metadata.json` com lista de assets
6. Endpoint `GET /api/v1/process/:id` retornando resultado

**Por que esta milestone**: É o menor entregável que prova o pipeline funcionando end-to-end, da API ao storage. Sem fontes estruturadas ainda, sem narrativas — apenas extração bruta. Se isso funcionar, o resto é incremento.

---

*Documento gerado como Parte 6 — MVP e Roadmap.*
*Versão: 1.0 | Data: 2026-04-03*
