"use client";

/**
 * Landing Luxury Real Estate — INTERMETRIX palette
 *
 * Paleta: Azul Profundo (#0A1E3F) + Dourado (#D4AF37) + Cream (#F9F6F0)
 * Tipografia: Playfair Display (serif editorial) + Inter (sans)
 * Narrativa: "Arquitetos da Realidade" — posicionamento de autoridade
 *
 * Estrutura:
 *   1. Hero — headline serif + CTAs gold
 *   2. Manifesto — quote editorial full-bleed deep blue
 *   3. Entrega — 6 cards de outputs
 *   4. Processo — 4 passos numerados
 *   5. Planos — 3 tiers com Pro featured (borda gold)
 *   6. CTA final — convite sóbrio
 *   7. Footer — minimal
 */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Dados
// ---------------------------------------------------------------------------

const OUTPUTS = [
  { label: "Reels com narração",    desc: "3 peças verticais até 60s, TTS cinematográfico" },
  { label: "Podcast a duas vozes",  desc: "Episódio no estilo NotebookLM, 5-8 minutos" },
  { label: "Carrosséis",            desc: "3 artes 10 frames, design da sua identidade" },
  { label: "Stories com CTA",       desc: "3 stories prontos para sequência estratégica" },
  { label: "Landing page",          desc: "HTML publicável com copy e captura de leads" },
  { label: "Blog post SEO",         desc: "Artigo longo, keywords e estrutura ranking-ready" },
];

const STEPS = [
  { n: "01", title: "Envie o book",   desc: "PDF, apresentação ou material do lançamento. Qualquer formato." },
  { n: "02", title: "A IA decodifica", desc: "Extraímos narrativa, branding, fotografia e estrutura editorial." },
  { n: "03", title: "Você aprova",     desc: "Prévia via WhatsApp. Uma palavra aprova, rejeita ou refina." },
  { n: "04", title: "Distribuição",    desc: "Conteúdo pronto, publicação automática no Instagram e Facebook." },
];

const PLANS = [
  {
    tier: "starter",
    name: "Starter",
    price: 47,
    books: 1,
    cta: "Começar",
    href: "https://pay.kiwify.com.br/bookagent-starter",
    featured: false,
    desc: "Para o corretor que quer testar a transformação em escala.",
    features: [
      "1 book por mês",
      "Pacote completo: reels, podcast, carrosséis, stories, LP, blog",
      "Dashboard com todos os outputs",
      "Entrega em até 5 minutos",
    ],
  },
  {
    tier: "pro",
    name: "Pro",
    price: 97,
    books: 3,
    cta: "Experimentar 7 dias",
    href: "https://pay.kiwify.com.br/bookagent-pro",
    featured: true,
    desc: "Para quem trata marketing como infraestrutura de vendas.",
    features: [
      "3 books por mês",
      "Aprovação e comando via WhatsApp",
      "Publicação automática Instagram + Facebook",
      "Prioridade na fila de renderização",
      "Suporte humano dedicado",
    ],
  },
  {
    tier: "agency",
    name: "Atelier",
    price: 247,
    books: 10,
    cta: "Conversar",
    href: "https://wa.me/5571999733883?text=Quero+o+plano+Atelier+do+BookReel",
    featured: false,
    desc: "Para imobiliárias e agências que precisam operar em volume.",
    features: [
      "10 books por mês",
      "API programática para integração interna",
      "SLA dedicado, onboarding white-glove",
      "Máxima prioridade de processamento",
      "Customização de narrativa e branding",
    ],
  },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false);
  const heroRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="bg-cream text-ink font-sans">
      {/* =========================================================== */}
      {/* Header luxury — sticky, transparente → cream on scroll        */}
      {/* =========================================================== */}
      <header
        className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
          scrolled ? "bg-cream/95 backdrop-blur border-b border-ink/5 py-3" : "py-6"
        }`}
      >
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
          <Link href="/" className="flex items-baseline gap-3">
            <span className="font-serif text-2xl font-semibold text-ink tracking-tight">
              BookReel
            </span>
            <span className="hidden sm:inline text-[10px] uppercase tracking-[0.25em] text-gold-700 border-l border-gold/40 pl-3">
              Intelligence
            </span>
          </Link>
          <nav className="hidden md:flex items-center gap-8 text-sm">
            <a href="#entrega" className="text-ink/70 hover:text-ink transition-colors">
              Entrega
            </a>
            <a href="#processo" className="text-ink/70 hover:text-ink transition-colors">
              Processo
            </a>
            <a href="#planos" className="text-ink/70 hover:text-ink transition-colors">
              Planos
            </a>
            <Link
              href="/login"
              className="text-ink/70 hover:text-ink transition-colors"
            >
              Entrar
            </Link>
            <Link
              href="/register"
              className="px-4 py-2 bg-ink text-cream text-sm rounded-full hover:bg-ink-700 transition-colors"
            >
              Começar ateliê
            </Link>
          </nav>
        </div>
      </header>

      {/* =========================================================== */}
      {/* Hero                                                          */}
      {/* =========================================================== */}
      <section
        ref={heroRef}
        className="relative min-h-screen flex items-center pt-28 pb-20 overflow-hidden"
      >
        {/* Subtle gold radial accent */}
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none bg-landing-hero-accent"
        />

        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <div className="max-w-3xl">
            <div className="flex items-center gap-3 mb-8">
              <span className="block w-10 h-px bg-gold" />
              <span className="text-[11px] uppercase tracking-[0.3em] text-gold-700 font-medium">
                INTERMETRIX × BookReel
              </span>
            </div>

            <h1 className="font-serif text-5xl sm:text-6xl lg:text-7xl font-semibold leading-[1.05] text-ink tracking-tight">
              Arquitetos
              <br />
              <span className="italic text-gold-700">da Realidade</span>
            </h1>

            <p className="mt-8 text-lg sm:text-xl text-ink/70 leading-relaxed max-w-2xl">
              Transformamos books imobiliários em ecossistemas de conteúdo
              multimodal — do reel cinematográfico ao artigo SEO — preservando
              a identidade visual do corretor e a narrativa do empreendimento.
            </p>

            <div className="mt-10 flex flex-col sm:flex-row gap-4">
              <Link
                href="/register"
                className="inline-flex items-center justify-center gap-2 px-7 py-4 bg-ink text-cream rounded-full text-base font-medium hover:bg-ink-700 transition-all"
              >
                Começar ateliê
                <span aria-hidden>→</span>
              </Link>
              <a
                href="#processo"
                className="inline-flex items-center justify-center gap-2 px-7 py-4 border border-ink/20 text-ink rounded-full text-base font-medium hover:border-ink hover:bg-ink hover:text-cream transition-all"
              >
                Ver o método
              </a>
            </div>

            <div className="mt-16 grid grid-cols-3 gap-6 max-w-md">
              <Stat number="5min" label="Entrega média" />
              <Stat number="6" label="Formatos por book" />
              <Stat number="100%" label="Na sua identidade" />
            </div>
          </div>
        </div>

        {/* Thin gold line — bottom frame */}
        <div className="absolute bottom-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold/30 to-transparent" />
      </section>

      {/* =========================================================== */}
      {/* Manifesto — full bleed deep blue                             */}
      {/* =========================================================== */}
      <section className="relative bg-ink text-cream py-28 overflow-hidden">
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-[0.03] pointer-events-none bg-landing-manifesto-lines"
        />
        <div className="max-w-4xl mx-auto px-6 relative z-10 text-center">
          <span className="block w-10 h-px bg-gold mx-auto mb-8" />
          <p className="text-[11px] uppercase tracking-[0.35em] text-gold-400 mb-6">
            Manifesto
          </p>
          <h2 className="font-serif text-4xl sm:text-5xl lg:text-6xl font-medium leading-tight text-cream">
            Não produzimos conteúdo.
            <br />
            <span className="italic text-gold-300">Esculpimos autoridade.</span>
          </h2>
          <p className="mt-10 text-lg text-cream/70 leading-relaxed max-w-2xl mx-auto">
            O BookReel nasceu da convicção de que cada imóvel merece uma
            narrativa digna da decisão que representa. Nossa IA não substitui
            o corretor — ela amplifica sua assinatura, preserva seu gosto,
            carrega sua voz por todos os canais relevantes.
          </p>
        </div>
      </section>

      {/* =========================================================== */}
      {/* Entrega — 6 outputs                                          */}
      {/* =========================================================== */}
      <section id="entrega" className="py-28 bg-cream">
        <div className="max-w-7xl mx-auto px-6">
          <div className="max-w-2xl mb-16">
            <span className="block w-10 h-px bg-gold mb-6" />
            <p className="text-[11px] uppercase tracking-[0.3em] text-gold-700 mb-4 font-medium">
              A Entrega
            </p>
            <h2 className="font-serif text-4xl sm:text-5xl font-medium leading-tight text-ink">
              Um book. <span className="italic">Seis formatos.</span> Zero
              retrabalho.
            </h2>
            <p className="mt-6 text-lg text-ink/70 leading-relaxed">
              Cada lançamento vira um ecossistema completo de marketing, com a
              sua paleta, sua fotografia e sua linguagem preservadas em cada
              peça.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-ink/5 border border-ink/5 rounded-2xl overflow-hidden">
            {OUTPUTS.map((o, i) => (
              <div
                key={o.label}
                className="bg-cream p-8 group hover:bg-ink hover:text-cream transition-colors duration-300 flex flex-col"
              >
                <span className="font-serif text-3xl text-gold group-hover:text-gold-300 mb-6 tracking-tight">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="font-serif text-xl text-ink group-hover:text-cream mb-2">
                  {o.label}
                </h3>
                <p className="text-sm text-ink/60 group-hover:text-cream/70 leading-relaxed">
                  {o.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* =========================================================== */}
      {/* Processo — 4 passos                                          */}
      {/* =========================================================== */}
      <section id="processo" className="py-28 bg-ink text-cream">
        <div className="max-w-7xl mx-auto px-6">
          <div className="max-w-2xl mb-16">
            <span className="block w-10 h-px bg-gold mb-6" />
            <p className="text-[11px] uppercase tracking-[0.3em] text-gold-400 mb-4 font-medium">
              Método
            </p>
            <h2 className="font-serif text-4xl sm:text-5xl font-medium leading-tight text-cream">
              Quatro passos entre você <span className="italic text-gold-300">e o mercado.</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {STEPS.map((step) => (
              <div key={step.n} className="relative">
                <div className="font-serif text-6xl text-gold/80 mb-4 leading-none">
                  {step.n}
                </div>
                <h3 className="font-serif text-xl text-cream mb-3">
                  {step.title}
                </h3>
                <p className="text-sm text-cream/60 leading-relaxed">
                  {step.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* =========================================================== */}
      {/* Planos                                                       */}
      {/* =========================================================== */}
      <section id="planos" className="py-28 bg-cream">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <span className="block w-10 h-px bg-gold mx-auto mb-6" />
            <p className="text-[11px] uppercase tracking-[0.3em] text-gold-700 mb-4 font-medium">
              Investimento
            </p>
            <h2 className="font-serif text-4xl sm:text-5xl font-medium leading-tight text-ink">
              Escolha <span className="italic">a escala do seu ateliê.</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {PLANS.map((plan) => (
              <div
                key={plan.tier}
                className={`relative p-10 rounded-2xl flex flex-col ${
                  plan.featured
                    ? "bg-ink text-cream border-2 border-gold shadow-2xl shadow-ink/20 scale-[1.02]"
                    : "bg-white text-ink border border-ink/10"
                }`}
              >
                {plan.featured && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-gold text-ink text-[10px] font-semibold uppercase tracking-widest rounded-full">
                    Recomendado
                  </div>
                )}

                <h3 className="font-serif text-3xl mb-2">{plan.name}</h3>
                <p className={`text-sm mb-8 ${plan.featured ? "text-cream/70" : "text-ink/60"}`}>
                  {plan.desc}
                </p>

                <div className="flex items-baseline gap-1 mb-2">
                  <span className="font-serif text-5xl font-semibold">R${plan.price}</span>
                  <span className={`text-sm ${plan.featured ? "text-cream/60" : "text-ink/50"}`}>
                    /mês
                  </span>
                </div>
                <p className={`text-sm mb-8 ${plan.featured ? "text-gold-300" : "text-gold-700"}`}>
                  {plan.books} {plan.books === 1 ? "book" : "books"} por mês
                </p>

                <ul className="space-y-3 mb-10 flex-1">
                  {plan.features.map((f) => (
                    <li
                      key={f}
                      className={`flex items-start gap-3 text-sm leading-relaxed ${
                        plan.featured ? "text-cream/80" : "text-ink/70"
                      }`}
                    >
                      <span
                        className={`shrink-0 mt-1.5 w-1 h-1 rounded-full ${
                          plan.featured ? "bg-gold" : "bg-gold-700"
                        }`}
                      />
                      {f}
                    </li>
                  ))}
                </ul>

                <a
                  href={plan.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`block text-center px-6 py-4 rounded-full text-sm font-medium transition-all ${
                    plan.featured
                      ? "bg-gold text-ink hover:bg-gold-400"
                      : "bg-ink text-cream hover:bg-ink-700"
                  }`}
                >
                  {plan.cta}
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* =========================================================== */}
      {/* CTA final                                                    */}
      {/* =========================================================== */}
      <section className="py-28 bg-ink text-cream relative overflow-hidden">
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-[0.04] pointer-events-none bg-landing-cta-glow"
        />
        <div className="max-w-3xl mx-auto px-6 text-center relative z-10">
          <span className="block w-10 h-px bg-gold mx-auto mb-8" />
          <h2 className="font-serif text-4xl sm:text-5xl font-medium leading-tight text-cream mb-8">
            O próximo lançamento
            <br />
            <span className="italic text-gold-300">merece este cuidado.</span>
          </h2>
          <Link
            href="/register"
            className="inline-flex items-center gap-2 px-8 py-4 bg-gold text-ink rounded-full text-base font-medium hover:bg-gold-400 transition-all"
          >
            Começar agora
            <span aria-hidden>→</span>
          </Link>
        </div>
      </section>

      {/* =========================================================== */}
      {/* Footer                                                       */}
      {/* =========================================================== */}
      <footer className="bg-ink-900 text-cream/60 py-12 border-t border-gold/10">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-baseline gap-3">
            <span className="font-serif text-xl text-cream">BookReel</span>
            <span className="text-[10px] uppercase tracking-[0.3em] text-gold-700">
              Intelligence Engine
            </span>
          </div>
          <p className="text-xs tracking-wide">
            © {new Date().getFullYear()} DB8 Intelligence · Salvador, BA
          </p>
        </div>
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Stat({ number, label }: { number: string; label: string }) {
  return (
    <div>
      <div className="font-serif text-3xl text-ink tracking-tight">{number}</div>
      <div className="text-xs text-ink/60 mt-1">{label}</div>
    </div>
  );
}
