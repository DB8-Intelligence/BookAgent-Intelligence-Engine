-- ============================================================================
-- Migration 009 — Atualiza nomes dos planos para starter/pro/agency
-- Preços: starter R$47/1 book, pro R$97/3 books, agency R$247/10 books
--
-- Composição de output por book (todos os planos):
--   - 3 reels com narração TTS (30–60s)
--   - 1 podcast estilo NotebookLM (2 vozes, até 60s)
--   - 3 carrosséis com até 10 imagens cada (Fal.ai / Imagen 3)
--   - 3 stories com texto e CTA
--   - 1 landing page HTML
--   - 1 blog post SEO
--
-- Custo operacional estimado: ~R$ 5,61/book (stack completa)
-- ============================================================================

-- Atualizar constraint de planos na tabela user_plans
ALTER TABLE bookagent_user_plans
  DROP CONSTRAINT IF EXISTS bookagent_user_plans_plan_check;

ALTER TABLE bookagent_user_plans
  ADD CONSTRAINT bookagent_user_plans_plan_check
  CHECK (plan IN ('free', 'starter', 'pro', 'agency'));

-- Migrar valores legados
UPDATE bookagent_user_plans SET plan = 'starter' WHERE plan = 'basic';
UPDATE bookagent_user_plans SET plan = 'agency'  WHERE plan IN ('business', 'max');

-- Atualizar constraint de plan_tier na tabela leads
ALTER TABLE bookagent_leads
  DROP CONSTRAINT IF EXISTS bookagent_leads_plan_tier_check;

ALTER TABLE bookagent_leads
  ADD CONSTRAINT bookagent_leads_plan_tier_check
  CHECK (plan_tier IN ('starter', 'pro', 'agency'));

-- Migrar leads existentes
UPDATE bookagent_leads SET plan_tier = 'starter' WHERE plan_tier = 'basic';
UPDATE bookagent_leads SET plan_tier = 'agency'  WHERE plan_tier = 'business';

-- Tabela de definição de planos (fonte de verdade para o frontend)
CREATE TABLE IF NOT EXISTS bookagent_plan_definitions (
  tier               TEXT PRIMARY KEY,
  name               TEXT NOT NULL,
  description        TEXT NOT NULL,
  price_monthly_brl  INTEGER NOT NULL,   -- centavos
  books_per_month    INTEGER NOT NULL,
  reels_per_book     INTEGER NOT NULL DEFAULT 3,
  podcasts_per_book  INTEGER NOT NULL DEFAULT 1,
  carousels_per_book INTEGER NOT NULL DEFAULT 3,
  stories_per_book   INTEGER NOT NULL DEFAULT 3,
  auto_publish       BOOLEAN NOT NULL DEFAULT false,
  whatsapp_approval  BOOLEAN NOT NULL DEFAULT false,
  api_access         BOOLEAN NOT NULL DEFAULT false,
  hotmart_product_id TEXT,
  active             BOOLEAN NOT NULL DEFAULT true,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Inserir/atualizar definições
INSERT INTO bookagent_plan_definitions
  (tier, name, description, price_monthly_brl, books_per_month,
   reels_per_book, podcasts_per_book, carousels_per_book, stories_per_book,
   auto_publish, whatsapp_approval, api_access)
VALUES
  ('starter', 'Starter',
   'Para o corretor que quer experimentar. 1 book por mês com pacote completo.',
   4700, 1, 3, 1, 3, 3, false, false, false),
  ('pro', 'Pro',
   'Para o corretor ativo. 3 books por mês com aprovação via WhatsApp.',
   9700, 3, 3, 1, 3, 3, true, true, false),
  ('agency', 'Agência',
   'Para imobiliárias e agências. 10 books por mês com API programática.',
   24700, 10, 3, 1, 3, 3, true, true, true)
ON CONFLICT (tier) DO UPDATE SET
  name               = EXCLUDED.name,
  description        = EXCLUDED.description,
  price_monthly_brl  = EXCLUDED.price_monthly_brl,
  books_per_month    = EXCLUDED.books_per_month,
  auto_publish       = EXCLUDED.auto_publish,
  whatsapp_approval  = EXCLUDED.whatsapp_approval,
  api_access         = EXCLUDED.api_access,
  updated_at         = NOW();
