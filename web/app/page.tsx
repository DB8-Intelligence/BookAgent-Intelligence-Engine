import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const PLANS = [
  {
    tier: "basic",
    name: "Basico",
    price: "R$ 97",
    period: "/mes",
    desc: "Para corretores individuais",
    features: [
      "10 books/mes",
      "Reels + Blog + Landing Page",
      "Dashboard completo",
      "Branding automatico",
      "Suporte por email",
    ],
    cta: "Comecar Gratis",
    highlight: false,
  },
  {
    tier: "pro",
    name: "Pro",
    price: "R$ 247",
    period: "/mes",
    desc: "Para corretores e equipes",
    features: [
      "50 books/mes",
      "Tudo do Basico +",
      "Publicacao automatica (IG/FB)",
      "WhatsApp integrado",
      "Campanhas e scheduling",
      "A/B testing",
      "Suporte prioritario",
    ],
    cta: "Testar 7 Dias Gratis",
    highlight: true,
  },
  {
    tier: "business",
    name: "Business",
    price: "R$ 997",
    period: "/mes",
    desc: "Para imobiliarias e integradores",
    features: [
      "500 books/mes",
      "Tudo do Pro +",
      "API programatica",
      "Multi-usuario (10 seats)",
      "SLA garantido",
      "Webhook customizado",
      "Gerente de conta",
    ],
    cta: "Falar com Vendas",
    highlight: false,
  },
];

const STEPS = [
  {
    num: "1",
    icon: "📤",
    title: "Envie o book",
    desc: "Upload do PDF pelo dashboard ou envie direto pelo WhatsApp. O sistema detecta e processa automaticamente.",
  },
  {
    num: "2",
    icon: "🧠",
    title: "IA processa em 17 etapas",
    desc: "Extracao de assets, branding, narrativa, media plans, blog, landing page, scoring — tudo automatico.",
  },
  {
    num: "3",
    icon: "📦",
    title: "Receba os conteudos prontos",
    desc: "Reels, carrosseis, artigos, landing pages — prontos para publicar ou agendar nas redes sociais.",
  },
];

const PAIN_POINTS = [
  { before: "4-6 horas criando posts manualmente", after: "Conteudo pronto em minutos" },
  { before: "Contrata designer para cada imovel", after: "IA gera tudo automaticamente" },
  { before: "Posts genericos sem identidade", after: "Branding extraido do proprio book" },
  { before: "Sem estrategia de conteudo", after: "Campanha completa com scheduling" },
  { before: "Publica 1x por semana", after: "Cadencia diaria no piloto automatico" },
];

const WHATSAPP_CTA = "https://wa.me/5571999733883?text=Quero%20testar%20o%20BookReel";

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function LandingPage() {
  return (
    <div className="min-h-screen">
      {/* ── HERO ─────────────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-4 pt-20 pb-16 text-center">
        <Badge variant="secondary" className="mb-4 text-xs">
          Em beta fechado — acesso por convite
        </Badge>
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-foreground leading-tight">
          Transforme qualquer book de imovel em{" "}
          <span className="text-primary">conteudo pronto para vender</span>
        </h1>
        <p className="mt-6 text-lg sm:text-xl text-muted-foreground max-w-3xl mx-auto">
          Envie o PDF do empreendimento e receba reels, posts, artigos e landing pages
          em minutos — com o branding do proprio material, sem designer, sem esforco.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-8">
          <a href={WHATSAPP_CTA} target="_blank" rel="noopener noreferrer">
            <Button size="lg" className="text-base px-8 h-12 bg-emerald-600 hover:bg-emerald-700 text-white">
              Testar Gratis pelo WhatsApp
            </Button>
          </a>
          <Link href="/upload">
            <Button size="lg" variant="outline" className="text-base px-8 h-12">
              Acessar Dashboard
            </Button>
          </Link>
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          7 dias gratis. Sem cartao de credito. Cancele quando quiser.
        </p>
      </section>

      {/* ── ANTES vs DEPOIS ──────────────────────────────────────── */}
      <section className="bg-muted/50 py-16">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-10">
            Antes vs Depois do BookReel
          </h2>
          <div className="space-y-3">
            {PAIN_POINTS.map((p, i) => (
              <div key={i} className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900/30 p-4">
                  <p className="text-sm text-red-700 dark:text-red-400">
                    <span className="font-bold">Antes:</span> {p.before}
                  </p>
                </div>
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-900/30 p-4">
                  <p className="text-sm text-emerald-700 dark:text-emerald-400">
                    <span className="font-bold">Depois:</span> {p.after}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── COMO FUNCIONA ────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-4 py-16">
        <h2 className="text-2xl sm:text-3xl font-bold text-center mb-12">
          Como funciona — 3 passos
        </h2>
        <div className="grid sm:grid-cols-3 gap-8">
          {STEPS.map((s) => (
            <div key={s.num} className="text-center">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-primary/10 flex items-center justify-center text-3xl mb-4">
                {s.icon}
              </div>
              <div className="text-xs font-bold text-primary mb-1">PASSO {s.num}</div>
              <h3 className="font-bold text-lg mb-2">{s.title}</h3>
              <p className="text-sm text-muted-foreground">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── BENEFICIOS ───────────────────────────────────────────── */}
      <section className="bg-muted/50 py-16">
        <div className="max-w-5xl mx-auto px-4">
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-10">
            Por que corretores escolhem o BookReel
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { icon: "⚡", title: "Rapido", desc: "De PDF a conteudo pronto em minutos, nao horas" },
              { icon: "🎨", title: "Com sua marca", desc: "Cores, fontes e estilo extraidos do proprio book" },
              { icon: "📱", title: "Multi-formato", desc: "Reels, stories, carrosseis, blog, landing page" },
              { icon: "🤖", title: "Automatico", desc: "Agende e publique sem tocar no celular" },
              { icon: "💰", title: "Economico", desc: "Substitui designer + social media + copywriter" },
              { icon: "📊", title: "Inteligente", desc: "Aprende seu estilo e melhora a cada uso" },
              { icon: "🔒", title: "Seguro", desc: "Seus dados protegidos, nada compartilhado" },
              { icon: "💬", title: "Via WhatsApp", desc: "Envie o PDF pelo zap e receba os conteudos la mesmo" },
            ].map((b) => (
              <Card key={b.title}>
                <CardContent className="p-5">
                  <span className="text-2xl">{b.icon}</span>
                  <h3 className="font-semibold mt-2 mb-1 text-sm">{b.title}</h3>
                  <p className="text-xs text-muted-foreground">{b.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ── PLANOS ───────────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-4 py-16" id="planos">
        <h2 className="text-2xl sm:text-3xl font-bold text-center mb-4">
          Planos
        </h2>
        <p className="text-center text-muted-foreground mb-10">
          Comece gratis por 7 dias. Upgrade quando quiser.
        </p>
        <div className="grid sm:grid-cols-3 gap-6">
          {PLANS.map((p) => (
            <Card
              key={p.tier}
              className={p.highlight ? "ring-2 ring-primary shadow-lg relative" : ""}
            >
              {p.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="bg-primary text-primary-foreground text-[10px]">
                    Mais Popular
                  </Badge>
                </div>
              )}
              <CardContent className="p-6">
                <h3 className="font-bold text-lg">{p.name}</h3>
                <p className="text-xs text-muted-foreground mt-1 mb-4">{p.desc}</p>
                <div className="mb-4">
                  <span className="text-3xl font-extrabold">{p.price}</span>
                  <span className="text-sm text-muted-foreground">{p.period}</span>
                </div>
                <ul className="space-y-2 mb-6">
                  {p.features.map((f) => (
                    <li key={f} className="text-sm flex items-start gap-2">
                      <span className="text-emerald-500 mt-0.5">&#10003;</span>
                      {f}
                    </li>
                  ))}
                </ul>
                <a href={WHATSAPP_CTA} target="_blank" rel="noopener noreferrer">
                  <Button
                    className={`w-full ${p.highlight ? "bg-primary" : ""}`}
                    variant={p.highlight ? "default" : "outline"}
                  >
                    {p.cta}
                  </Button>
                </a>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* ── CTA FINAL ────────────────────────────────────────────── */}
      <section className="bg-primary text-primary-foreground py-16">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold mb-4">
            Pare de perder tempo criando posts manualmente
          </h2>
          <p className="text-lg opacity-90 mb-8">
            Envie seu primeiro book agora e veja o resultado em minutos.
            Sem cartao, sem compromisso.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a href={WHATSAPP_CTA} target="_blank" rel="noopener noreferrer">
              <Button size="lg" variant="secondary" className="text-base px-8 h-12">
                Testar Gratis pelo WhatsApp
              </Button>
            </a>
            <Link href="/upload">
              <Button size="lg" variant="outline" className="text-base px-8 h-12 border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10">
                Acessar Dashboard
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* ── FOOTER ───────────────────────────────────────────────── */}
      <footer className="border-t py-8">
        <div className="max-w-5xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="text-base">📘</span>
            <span className="font-semibold text-foreground">BookReel</span>
            <span>by DB8 Intelligence</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="hover:text-foreground">Dashboard</Link>
            <a href="#planos" className="hover:text-foreground">Planos</a>
            <a href={WHATSAPP_CTA} target="_blank" rel="noopener noreferrer" className="hover:text-foreground">WhatsApp</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
