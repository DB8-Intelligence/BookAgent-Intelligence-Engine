# Scripts de Mensagens WhatsApp — BookAgent

**Data:** 2026-04-04
**Canal:** WhatsApp via Evolution API
**Tom:** direto, prático, sem jargão técnico

---

## Etapa 1 — Primeiro Contato (Fluxo 7)

### 1.1 Saudação inicial (lead envia qualquer mensagem)

```
Olá! 👋

Aqui é o BookAgent — eu transformo o PDF do seu lançamento em conteúdo pronto para Instagram, Facebook e WhatsApp.

Para testar *agora*, é simples:
👉 Me manda o PDF do seu book ou material de lançamento

Em até 5 minutos você recebe o conteúdo pronto.

É gratuito nas primeiras 3 demonstrações.
```

---

### 1.2 Lead já enviou mensagem antes (retorno)

```
Olá de volta! 😊

Tem um novo lançamento para gerar conteúdo? É só mandar o PDF aqui.
```

---

### 1.3 Confirmação de recebimento do PDF

```
✅ Recebi o PDF!

Estou processando agora — isso leva de 3 a 5 minutos.

Vou te mandar o conteúdo aqui mesmo quando estiver pronto.
```

---

## Etapa 2 — Entrega do Resultado (Fluxo 3)

### 2.1 Resultado pronto — plano básico (entrega manual)

```
✨ Pronto! Aqui está o conteúdo do seu lançamento:

📸 *Post para Instagram*
[CONTEÚDO GERADO]

📝 *Legenda com hashtags*
[LEGENDA GERADA]

💬 *Sugestão para Stories*
[TEXTO PARA STORIES]

---
Para aprovar e receber o arquivo final, responda:
✅ *SIM* — aprovar e receber
✏️ *AJUSTAR* — pedir alteração
```

---

### 2.2 Resultado pronto — plano Pro (publicação automática disponível)

```
✨ Seu conteúdo está pronto!

📸 *Post para Instagram*
[CONTEÚDO GERADO]

📝 *Legenda com hashtags*
[LEGENDA GERADA]

---
Para publicar diretamente no Instagram e Facebook, responda:
✅ *SIM* — publicar agora
🕐 *AGENDAR* — publicar às [HORÁRIO SUGERIDO]
✏️ *AJUSTAR* — pedir alteração
```

---

### 2.3 Confirmação de publicação

```
🚀 Publicado com sucesso!

📸 Instagram: [link da publicação]
👍 Facebook: [link da publicação]

Quer gerar conteúdo para mais algum lançamento?
```

---

### 2.4 Falha na publicação (fallback)

```
⚠️ Houve um problema ao publicar automaticamente.

Não se preocupe — aqui está o conteúdo para você publicar manualmente:

[CONTEÚDO]

Se quiser, posso tentar publicar novamente. Responda *TENTAR NOVAMENTE*.
```

---

## Etapa 3 — Conversão (Fluxo 8)

### 3.1 Primeira mensagem de conversão (3h após resultado)

```
Oi! O conteúdo que gerei para você ficou bom? 😊

Se quiser usar o BookAgent para *todos* os seus lançamentos, tem dois planos:

📦 *Plano Básico — R$ 97/mês*
✅ 10 lançamentos por mês
✅ Conteúdo completo para cada um
✅ Você publica na hora que quiser

🚀 *Plano Pro — R$ 247/mês*
✅ 50 lançamentos por mês
✅ Publicação *automática* no Instagram e Facebook
✅ Você só aprova — o resto é automático

Para assinar, é só responder *BÁSICO* ou *PRO*.
```

---

### 3.2 Follow-up (24h sem resposta)

```
Tudo bem? 👋

Só passando para mostrar mais um resultado que geramos ontem para outro corretor:

[EXEMPLO DE OUTPUT — imagem ou texto]

Se quiser testar com mais um lançamento seu antes de decidir, é só mandar o PDF.
```

---

### 3.3 Última mensagem (72h sem resposta)

```
Última mensagem por aqui! Não quero ser chato. 😄

Só queria deixar registrado: o BookAgent está disponível quando você precisar.

Quando tiver um novo lançamento, manda o PDF aqui — as 3 demos gratuitas ainda estão disponíveis.

Qualquer dúvida, estou aqui!
```

---

### 3.4 Resposta positiva à oferta

```
Ótimo! 🎉

Para ativar seu plano [BÁSICO/PRO], acesse o link abaixo:
👉 [LINK DE PAGAMENTO]

Depois de pagar, seu acesso é ativado automaticamente em menos de 1 minuto.

Qualquer dúvida, me chama aqui mesmo!
```

---

### 3.5 Resposta negativa à oferta

```
Entendi, sem problemas! 😊

Se mudar de ideia, é só me chamar. As demos gratuitas continuam disponíveis.

Boa sorte nos seus lançamentos! 🏡
```

---

## Etapa 4 — Retenção

### 4.1 Reativação (usuário sem uso por 10 dias)

```
Oi [NOME]! Tudo bem?

Já faz alguns dias — você tem algum lançamento novo por aí?

Me manda o PDF e a gente gera o conteúdo agora! 😊
```

---

### 4.2 Alerta de limite próximo (80% do plano usado)

```
⚠️ Aviso rápido: você usou 8 dos 10 jobs do seu plano este mês.

Ainda dá tempo de gerar mais 2 conteúdos antes do dia [DATA RENOVAÇÃO].

Se precisar de mais, o upgrade para o Plano Pro libera até 50 jobs. Quer saber mais?
```

---

### 4.3 Limite atingido — oferta de upgrade

```
Você atingiu o limite do seu plano este mês! 🎯

Isso significa que você está usando bem o BookAgent. 😊

Para continuar gerando conteúdo *agora*, você pode fazer upgrade para o Plano Pro (R$ 247/mês):
✅ 50 jobs por mês
✅ Publicação automática no Instagram e Facebook

Quer fazer o upgrade? Responda *UPGRADE*.

Ou aguarde a renovação automática no dia [DATA RENOVAÇÃO].
```

---

### 4.4 Resumo mensal (enviado no último dia do mês)

```
📊 Resumo do seu mês no BookAgent:

✅ Lançamentos processados: [N]
📸 Posts gerados: [N]
⏱️ Tempo economizado: aproximadamente [N] horas
[SE PRO] 🚀 Publicações automáticas: [N]

No mês que vem você tem [LIMITE] jobs disponíveis.

Obrigado por usar o BookAgent! 🏡
```

---

## Mensagens de Suporte

### Erro no processamento

```
⚠️ Houve um problema ao processar seu PDF.

Possíveis causas:
- PDF protegido por senha
- Arquivo muito grande (> 50 MB)
- Formato não suportado

Pode tentar reenviar? Se o problema continuar, me manda uma mensagem e resolvo manualmente.
```

---

### Ajuste solicitado

```
Anotei! ✏️

Você quer ajustar:
1️⃣ O texto do post
2️⃣ A legenda
3️⃣ As hashtags
4️⃣ Tudo

Responda o número ou descreva o que quer mudar.
```

---

## Configuração no n8n

Todas as mensagens acima devem ser configuradas como variáveis de template nos nós "Enviar Mensagem" da Evolution API no n8n.

**Tokens de substituição:**
- `[NOME]` → `{{ $json.body.userName }}`
- `[CONTEÚDO GERADO]` → resultado do BookAgent
- `[LINK DE PAGAMENTO]` → URL do Stripe/PagBank (configurada como env var)
- `[N]` → contador do Supabase
- `[DATA RENOVAÇÃO]` → calculada com base em `created_at` do plano
- `[HORÁRIO SUGERIDO]` → lógica: próxima terça/quinta às 9h (maior engajamento)
