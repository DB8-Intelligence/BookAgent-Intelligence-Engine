# BookAgent Intelligence Engine — Guia de Providers

> Parte 45: Integração com Providers Reais de IA e TTS
> Data: 2026-04-04 | Versão: 0.2.0

---

## Visão Geral

O BookAgent suporta três camadas de providers:

| Camada | Função | Providers Suportados |
|--------|--------|---------------------|
| **IA Textual** | Blog, landing page, roteiros | Anthropic, OpenAI, Gemini |
| **TTS** | Síntese de voz / narração MP3 | OpenAI TTS, ElevenLabs |
| **PDF** | Extração de texto e imagens | Integrado (pdf-parse) |

O sistema **funciona sem nenhuma API key** — geração local de alta qualidade sempre disponível como fallback.

---

## 1. Roteamento Multi-Provider (ProviderRouter)

O BookAgent usa um `ProviderRouter` que resolve o melhor provider para cada tipo de tarefa:

| Tarefa | Provider ideal | Motivo |
|--------|---------------|--------|
| `blog` | **OpenAI** | GPT-4o — copy crisp, SEO-friendly |
| `landing_page` | **OpenAI** | GPT-4o — headlines de alta conversão |
| `media_script` | **Anthropic** | Claude — raciocínio narrativo, fluidez |
| `multimodal` | **Gemini** | Visão nativa, análise de PDFs e imagens |

### Resolução de Provider (por prioridade)

Para cada tarefa, o router resolve nesta ordem:

1. **Env var específico** (ex: `AI_BLOG_PROVIDER=openai`)
2. **`AI_PROVIDER`** global (fallback default, backward compat)
3. **Auto-seleção inteligente** — usa o melhor disponível baseado nas chaves configuradas

### Configuração por tarefa

```env
AI_BLOG_PROVIDER=openai          # blog text generation
AI_LANDING_PROVIDER=openai       # landing page copy
AI_MEDIA_PROVIDER=anthropic      # media scripts / narração
AI_MULTIMODAL_PROVIDER=gemini    # análise de imagens/documentos

AI_PROVIDER=anthropic            # fallback default (backward compat)
AI_GENERATION_MODE=auto          # auto | ai | local
```

### Auto-seleção (quando env vars não estão definidos)

| Tarefa | Prioridade automática |
|--------|----------------------|
| `blog` | openai → anthropic → gemini |
| `landing_page` | openai → anthropic → gemini |
| `media_script` | anthropic → openai → gemini |
| `multimodal` | gemini → openai → anthropic |

O primeiro provider com API key disponível é selecionado automaticamente.

---

## 2. Ambiente db8-agent (Railway)

O BookAgent no Railway usa as chaves já configuradas no serviço **db8-agent**.
Não é necessário provisionar novas chaves — apenas mapear as variáveis no Railway.

### Configuração recomendada para Railway

```env
# Ativar roteamento multi-provider por tarefa
AI_BLOG_PROVIDER=openai
AI_LANDING_PROVIDER=openai
AI_MEDIA_PROVIDER=anthropic
AI_MULTIMODAL_PROVIDER=gemini
AI_GENERATION_MODE=auto

# API Keys (já existem no db8-agent)
ANTHROPIC_API_KEY=sk-ant-api03-...
OPENAI_API_KEY=sk-proj-...
GEMINI_API_KEY=AIzaSy...

# TTS (usar ElevenLabs para PT-BR nativo)
TTS_PROVIDER=elevenlabs
TTS_SYNTHESIS_ENABLED=false          # true = gera MP3 reais
ELEVENLABS_API_KEY=sk_...

# Persistência
SUPABASE_URL=https://spjnymdizezgmzwoskoj.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

### O que acontece sem configurar os providers específicos

Se apenas `AI_PROVIDER=anthropic` + `ANTHROPIC_API_KEY` estiverem configurados:
- Blog → Anthropic (fallback para AI_PROVIDER)
- Landing page → Anthropic
- Media script → Anthropic
- Multimodal → Anthropic

Com a configuração completa (todas as 3 keys):
- Blog/Landing → OpenAI GPT-4o (auto-seleção otimizada)
- Media/Script → Anthropic Claude (raciocínio narrativo)
- Multimodal → Gemini (análise de imagens)

---

## 3. Providers de IA Textual

### Modo de geração (`AI_GENERATION_MODE`)

| Modo | Comportamento |
|------|--------------|
| `auto` | Usa IA se API key configurada; fallback local se não. **Recomendado.** |
| `ai` | Exige IA. Falha com erro se API key ausente. |
| `local` | Sempre usa geração local. Ignora providers mesmo que configurados. |

---

### 3.1 Anthropic (Claude)

**Ideal para:** raciocínio narrativo, textos longos, roteiros com fluidez, análise.

```env
ANTHROPIC_API_KEY=sk-ant-api03-...
ANTHROPIC_MODEL=claude-sonnet-4-20250514  # opcional (este é o padrão)
```

**Modelos:**
- `claude-sonnet-4-20250514` — padrão, excelente custo-benefício
- `claude-opus-4-6` — máxima qualidade, mais lento

**Usado em:** `media_script` (auto-seleção), `blog`/`landing` como fallback

---

### 3.2 OpenAI (GPT-4o)

**Ideal para:** copy de conversão, blog articles, landing pages, headlines.

```env
OPENAI_API_KEY=sk-proj-...
OPENAI_MODEL=gpt-4o-mini   # opcional (este é o padrão)
```

**Modelos:**
- `gpt-4o-mini` — padrão, rápido e econômico
- `gpt-4o` — máxima qualidade (usado automaticamente para Vision)

**Nota:** `OPENAI_API_KEY` é compartilhada com OpenAI TTS.

**Usado em:** `blog`, `landing_page` (auto-seleção)

---

### 3.3 Gemini (Google)

**Ideal para:** análise multimodal, documentos, imagens de PDFs.

```env
GEMINI_API_KEY=AIzaSy...
GEMINI_MODEL=gemini-2.0-flash  # opcional (este é o padrão)
```

**Modelos:**
- `gemini-2.0-flash` — padrão, rápido, multimodal
- `gemini-1.5-flash` — alternativa comprovada
- `gemini-1.5-pro` — máxima qualidade

**Usado em:** `multimodal` (auto-seleção)

---

## 4. Providers de TTS

### Configuração

```env
TTS_PROVIDER=openai-tts          # openai-tts | elevenlabs
TTS_SYNTHESIS_ENABLED=false      # true = gera arquivos MP3 reais
```

### Fluxo de síntese

1. `AudioModule` sempre gera `AudioPlan[]` (sem chamada de API)
2. Se `TTS_SYNTHESIS_ENABLED=true` **e** API key disponível → sintetiza
3. Arquivos salvos em `storage/outputs/audio/{planId}/seg-XX-{role}.mp3`
4. Falhas por segmento não interrompem o pipeline

---

### 4.1 OpenAI TTS

**Ideal para:** setup rápido, usa `OPENAI_API_KEY` já configurada.

```env
TTS_PROVIDER=openai-tts
TTS_SYNTHESIS_ENABLED=true
TTS_OPENAI_MODEL=tts-1      # tts-1 (rápido) | tts-1-hd (alta qualidade)
TTS_VOICE_ID=onyx           # voz padrão
```

**Vozes:**

| Voice ID | Perfil | Uso recomendado |
|----------|--------|-----------------|
| `alloy` | Neutro | Narrações institucionais |
| `echo` | Masculino, médio | Apresentações |
| `fable` | Neutro, narrativo | Histórias, podcasts |
| `onyx` | Masculino, grave | Empreendimentos premium (padrão) |
| `nova` | Feminino, caloroso | Residenciais |
| `shimmer` | Feminino, expressivo | Conteúdo aspiracional |

---

### 4.2 ElevenLabs

**Ideal para:** voz em português nativo, qualidade profissional.

```env
TTS_PROVIDER=elevenlabs
TTS_SYNTHESIS_ENABLED=true
ELEVENLABS_API_KEY=sk_...
ELEVENLABS_VOICE_ID=pNInz6obpgDQGcFmaJgB  # Adam (padrão)
ELEVENLABS_MODEL=eleven_multilingual_v2   # suporte PT-BR
```

**Vozes por perfil:**

| VoiceType | Voz | Voice ID | Perfil |
|-----------|-----|----------|--------|
| `male-deep` | Adam | `pNInz6obpgDQGcFmaJgB` | Grave, autoritativo |
| `male-professional` | Arnold | `VR6AewLTigWG4xSOukaG` | Profissional, claro |
| `male-casual` | Antoni | `ErXwobaYiN019PkySvjV` | Casual, amigável |
| `female-warm` | Bella | `EXAVITQu4vr4xnSDxMaL` | Caloroso, envolvente |
| `female-professional` | Rachel | `21m00Tcm4TlvDq8ikWAM` | Profissional, confiante |
| `female-casual` | Domi | `AZnzlk1XvdvUeBnXmlld` | Energético, jovial |

---

## 5. O que Cada Configuração Ativa

### Sem API Keys (padrão)
- Pipeline completo com geração local
- Blog HTML com texto inteligente por tom
- Landing Page com copy de conversão local
- Render specs com roteiros locais
- AudioPlans com timing e perfil de voz
- Entrega: `delivery=ready`, 13+ artifacts

### Com IA Textual (qualquer provider)
- Blog com introdução expandida (2-3 parágrafos fluidos)
- Blog com seções como texto corrido
- LP com headline/subheadline persuasivos
- LP com copy por seção otimizada para conversão
- Roteiro com narração ajustada ao timing da cena

### Com TTS Real
- MP3 por segmento do AudioPlan
- Diretório: `storage/outputs/audio/{planId}/seg-XX-{role}.mp3`
- Pronto para sincronização com vídeo (FFmpeg/Remotion)

---

## 6. Papel do n8n

O n8n **não** substitui os providers acima:

| O que o n8n faz | O que o BookAgent faz |
|-----------------|----------------------|
| Orquestra quando rodar o BookAgent | Executa o pipeline |
| Dispara `POST /api/v1/process` | Gera blog, LP, roteiros, áudio |
| Distribui outputs (WhatsApp, email) | Persiste jobs no Supabase |
| Retry em falhas transientes | Salva artifacts em disco |
| Integra com CRM, formulários | Expõe `/health` e endpoints de jobs |

O BookAgent chama os providers diretamente.
O n8n orquestra o fluxo de negócio ao redor do BookAgent.

---

## 7. Diagnóstico

```bash
# Verificar status dos providers configurados:
curl http://localhost:3000/health

# Resposta inclui:
{
  "providers": {
    "ai": {
      "provider": "anthropic",
      "available": true,
      "mode": "auto",
      "availableProviders": ["anthropic", "openai", "gemini"]
    },
    "tts": {
      "provider": "elevenlabs",
      "available": true,
      "synthesisEnabled": false
    }
  }
}
```

**Logs durante execução com roteamento ativo:**
```
[ProviderRouter] Keys available: anthropic, openai, gemini
[ProviderRouter]   blog           → openai
[ProviderRouter]   landing_page   → openai
[ProviderRouter]   media_script   → anthropic
[ProviderRouter]   multimodal     → gemini
[RenderExport] AI text generation active (mode=auto, blog=openai, landing=openai, media=anthropic)
[AITextService] Generating blog with openai
[AITextService] Generating landing page with openai
[AITextService] Generating media script with anthropic
```

---

## 8. Referência Completa de Variáveis

| Variável | Valores | Default | Descrição |
|----------|---------|---------|-----------|
| `AI_GENERATION_MODE` | auto, ai, local | auto | Modo de geração |
| `AI_PROVIDER` | anthropic, openai, gemini | anthropic | Provider padrão (fallback) |
| `AI_BLOG_PROVIDER` | anthropic, openai, gemini | — | Provider para blog |
| `AI_LANDING_PROVIDER` | anthropic, openai, gemini | — | Provider para landing pages |
| `AI_MEDIA_PROVIDER` | anthropic, openai, gemini | — | Provider para roteiros |
| `AI_MULTIMODAL_PROVIDER` | anthropic, openai, gemini | — | Provider para análise multimodal |
| `ANTHROPIC_API_KEY` | sk-ant-... | — | Key Anthropic |
| `ANTHROPIC_MODEL` | claude-sonnet-... | claude-sonnet-4-20250514 | Modelo Claude |
| `OPENAI_API_KEY` | sk-proj-... | — | Key OpenAI (IA + TTS) |
| `OPENAI_MODEL` | gpt-4o, gpt-4o-mini | gpt-4o-mini | Modelo GPT |
| `GEMINI_API_KEY` | AIzaSy... | — | Key Google |
| `GEMINI_MODEL` | gemini-2.0-flash | gemini-2.0-flash | Modelo Gemini |
| `TTS_PROVIDER` | openai-tts, elevenlabs | openai-tts | Provider TTS |
| `TTS_SYNTHESIS_ENABLED` | true, false | false | Sintetizar MP3 |
| `TTS_OPENAI_MODEL` | tts-1, tts-1-hd | tts-1 | Modelo TTS OpenAI |
| `TTS_VOICE_ID` | onyx, nova, etc. | onyx | Voz padrão OpenAI TTS |
| `ELEVENLABS_API_KEY` | sk_... | — | Key ElevenLabs |
| `ELEVENLABS_VOICE_ID` | pNInz6... | pNInz6obpgDQGcFmaJgB | Voz ElevenLabs |
| `SUPABASE_URL` | https://... | — | URL Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | eyJ... | — | Service role key Supabase |
