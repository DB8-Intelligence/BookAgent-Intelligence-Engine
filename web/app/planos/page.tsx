"use client";

import Link from "next/link";

// ── plano definitions (mirrors plan-config.ts) ──────────────────────────────

const PLANS = [
  {
    tier: "starter",
    name: "Starter",
    price: 47,
    booksPerMonth: 1,
    description: "Para o corretor que quer experimentar",
    featured: false,
    cta: "Começar grátis",
    ctaHref: "#",
    features: [
      { label: "1 book por mês", included: true },
      { label: "3 reels com narração (TTS)", included: true },
      { label: "1 podcast estilo NotebookLM", included: true },
      { label: "3 carrosséis (10 imgs cada)", included: true },
      { label: "3 stories com CTA", included: true },
      { label: "1 landing page + 1 blog post", included: true },
      { label: "Dashboard de outputs", included: true },
      { label: "Aprovação via WhatsApp", included: false },
      { label: "Publicação automática (IG/FB)", included: false },
      { label: "API programática", included: false },
    ],
  },
  {
    tier: "pro",
    name: "Pro",
    price: 97,
    booksPerMonth: 3,
    description: "Para o corretor ativo com lançamentos frequentes",
    featured: true,
    cta: "Testar 7 dias grátis",
    ctaHref: "#",
    features: [
      { label: "3 books por mês", included: true },
      { label: "3 reels com narração (TTS)", included: true },
      { label: "1 podcast estilo NotebookLM", included: true },
      { label: "3 carrosséis (10 imgs cada)", included: true },
      { label: "3 stories com CTA", included: true },
      { label: "1 landing page + 1 blog post", included: true },
      { label: "Dashboard de outputs", included: true },
      { label: "Aprovação via WhatsApp", included: true },
      { label: "Publicação automática (IG/FB)", included: true },
      { label: "API programática", included: false },
    ],
  },
  {
    tier: "agency",
    name: "Agência",
    price: 247,
    booksPerMonth: 10,
    description: "Para imobiliárias e agências com alto volume",
    featured: false,
    cta: "Falar com vendas",
    ctaHref: "#",
    features: [
      { label: "10 books por mês", included: true },
      { label: "3 reels com narração (TTS)", included: true },
      { label: "1 podcast estilo NotebookLM", included: true },
      { label: "3 carrosséis (10 imgs cada)", included: true },
      { label: "3 stories com CTA", included: true },
      { label: "1 landing page + 1 blog post", included: true },
      { label: "Dashboard de outputs", included: true },
      { label: "Aprovação via WhatsApp", included: true },
      { label: "Publicação automática (IG/FB)", included: true },
      { label: "API programática", included: true },
    ],
  },
];

// ── output per book (shared across all plans) ────────────────────────────────

const OUTPUTS_PER_BOOK = [
  { icon: "🎬", label: "3 reels", sub: "com narração TTS 30–60s" },
  { icon: "🎙️", label: "1 podcast", sub: "2 vozes, estilo NotebookLM" },
  { icon: "🖼️", label: "3 carrosséis", sub: "10 imagens geradas por IA cada" },
  { icon: "📱", label: "3 stories", sub: "com texto e CTA" },
  { icon: "🌐", label: "1 landing page", sub: "HTML pronto para publicar" },
  { icon: "✍️", label: "1 blog post", sub: "SEO-ready" },
];

// ── benchmark ────────────────────────────────────────────────────────────────

const BENCHMARK = [
  { tool: "Lano.com.br", price: "R$ 147/mês", what: "Posts de texto + captions", video: false, tts: false, pdf: false },
  { tool: "BookReel Starter", price: "R$ 47/mês", what: "Vídeo + podcast + carrossel + story", video: true, tts: true, pdf: true },
];

// ── component ────────────────────────────────────────────────────────────────

export default function PlanosPage() {
  return (
    <div className="min-h-screen">

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-4 pt-20 pb-12 text-center">
        <div className="inline-block text-xs font-semibold tracking-widest uppercase px-3 py-1 rounded-full border border-border text-muted-foreground mb-6">
          Planos BookReel
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-foreground mb-4">
          Do PDF ao conteúdo completo.<br />
          <span className="text-muted-foreground font-normal">Em minutos.</span>
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-3">
          Envie o PDF do lançamento. O BookReel gera reels, podcast, carrosséis, stories e landing page — automaticamente.
        </p>
        <p className="text-sm text-muted-foreground">
          Sem digitação. Sem design. Sem edição de vídeo.
        </p>
      </section>

      {/* Outputs por book */}
      <section className="max-w-4xl mx-auto px-4 pb-12">
        <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground text-center mb-6">
          O que cada book gera
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {OUTPUTS_PER_BOOK.map((o) => (
            <div key={o.label} className="flex items-start gap-3 rounded-xl border border-border bg-card p-4">
              <span className="text-2xl">{o.icon}</span>
              <div>
                <p className="font-semibold text-sm text-foreground">{o.label}</p>
                <p className="text-xs text-muted-foreground">{o.sub}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Planos */}
      <section className="max-w-5xl mx-auto px-4 pb-16">
        <div className="grid sm:grid-cols-3 gap-4 items-start">
          {PLANS.map((plan) => (
            <div
              key={plan.tier}
              className={`relative rounded-2xl border p-6 flex flex-col gap-5 ${
                plan.featured
                  ? "border-foreground bg-foreground text-background shadow-xl scale-[1.02]"
                  : "border-border bg-card text-foreground"
              }`}
            >
              {plan.featured && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-background text-foreground text-xs font-semibold border border-border">
                  Mais popular
                </div>
              )}

              {/* Header */}
              <div>
                <p className={`text-xs font-semibold tracking-widest uppercase mb-1 ${plan.featured ? "text-background/60" : "text-muted-foreground"}`}>
                  {plan.name}
                </p>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-bold">R$ {plan.price}</span>
                  <span className={`text-sm ${plan.featured ? "text-background/60" : "text-muted-foreground"}`}>/mês</span>
                </div>
                <p className={`text-sm mt-1 ${plan.featured ? "text-background/70" : "text-muted-foreground"}`}>
                  {plan.booksPerMonth} book{plan.booksPerMonth > 1 ? "s" : ""}/mês · {plan.description}
                </p>
              </div>

              {/* CTA */}
              <Link
                href={plan.ctaHref}
                className={`w-full text-center py-2.5 px-4 rounded-xl text-sm font-semibold transition-opacity hover:opacity-80 ${
                  plan.featured
                    ? "bg-background text-foreground"
                    : "bg-foreground text-background"
                }`}
              >
                {plan.cta}
              </Link>

              {/* Features */}
              <ul className="flex flex-col gap-2.5">
                {plan.features.map((f) => (
                  <li key={f.label} className="flex items-start gap-2 text-sm">
                    <span className={`mt-0.5 text-base leading-none ${
                      f.included
                        ? plan.featured ? "text-background" : "text-foreground"
                        : plan.featured ? "text-background/30" : "text-muted-foreground/30"
                    }`}>
                      {f.included ? "✓" : "–"}
                    </span>
                    <span className={
                      f.included
                        ? plan.featured ? "text-background/90" : "text-foreground"
                        : plan.featured ? "text-background/40" : "text-muted-foreground"
                    }>
                      {f.label}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Sem fidelidade · Cancele quando quiser · Pagamento via Hotmart
        </p>
      </section>

      {/* Benchmark */}
      <section className="max-w-3xl mx-auto px-4 pb-20">
        <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground text-center mb-6">
          Comparativo de mercado
        </p>
        <div className="rounded-2xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-left px-4 py-3 text-muted-foreground font-medium">Ferramenta</th>
                <th className="text-left px-4 py-3 text-muted-foreground font-medium">Preço</th>
                <th className="text-left px-4 py-3 text-muted-foreground font-medium">Gera a partir de PDF</th>
                <th className="text-left px-4 py-3 text-muted-foreground font-medium">Vídeo/TTS</th>
              </tr>
            </thead>
            <tbody>
              {BENCHMARK.map((b, i) => (
                <tr key={b.tool} className={i < BENCHMARK.length - 1 ? "border-b border-border" : ""}>
                  <td className={`px-4 py-3 font-semibold ${b.tool.includes("BookReel") ? "text-foreground" : "text-muted-foreground"}`}>
                    {b.tool}
                  </td>
                  <td className="px-4 py-3 text-foreground">{b.price}</td>
                  <td className="px-4 py-3">
                    <span className={b.pdf ? "text-foreground" : "text-muted-foreground/40"}>
                      {b.pdf ? "✓ automático" : "–"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={b.video ? "text-foreground" : "text-muted-foreground/40"}>
                      {b.video ? "✓ incluso" : "–"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground text-center mt-3">
          Lano.com.br gera posts de texto a partir de dados inseridos manualmente. BookReel processa o PDF e gera vídeo, podcast e imagens sem digitação.
        </p>
      </section>

      {/* FAQ */}
      <section className="max-w-2xl mx-auto px-4 pb-24">
        <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground text-center mb-8">
          Dúvidas frequentes
        </p>
        <div className="flex flex-col gap-6">
          {[
            {
              q: "Como envio o PDF?",
              a: "Pelo dashboard (upload direto) ou enviando o arquivo via WhatsApp para o número do BookReel. O pipeline processa automaticamente.",
            },
            {
              q: "O que é o podcast estilo NotebookLM?",
              a: "Um áudio de até 60 segundos com dois apresentadores discutindo os diferenciais do lançamento — gerado automaticamente a partir do conteúdo do book.",
            },
            {
              q: "Os reels ficam prontos para publicar?",
              a: "Sim. Você recebe os arquivos de vídeo em 9:16, já com narração, trilha e legendas. Aprovação via WhatsApp antes da entrega (planos Pro e Agência).",
            },
            {
              q: "Posso mudar de plano a qualquer momento?",
              a: "Sim. Upgrade e downgrade sem fidelidade. O limite de books é renovado mensalmente.",
            },
          ].map((item) => (
            <div key={item.q} className="border-b border-border pb-5">
              <p className="font-semibold text-foreground mb-1.5">{item.q}</p>
              <p className="text-sm text-muted-foreground leading-relaxed">{item.a}</p>
            </div>
          ))}
        </div>
      </section>

    </div>
  );
}
