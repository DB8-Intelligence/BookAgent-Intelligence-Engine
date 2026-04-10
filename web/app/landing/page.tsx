"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const PLANS = [
  {
    tier: "starter",
    name: "Starter",
    price: 47,
    books: 1,
    cta: "Começar agora",
    href: "https://pay.kiwify.com.br/bookagent-starter",
    featured: false,
    outputs: ["3 reels com narração", "1 podcast 2 vozes", "3 carrosséis 10 imgs", "3 stories com CTA", "1 landing page", "1 blog post SEO"],
    extras: ["Dashboard de outputs", "Entrega em até 5 min"],
  },
  {
    tier: "pro",
    name: "Pro",
    price: 97,
    books: 3,
    cta: "Testar 7 dias grátis",
    href: "https://pay.kiwify.com.br/bookagent-pro",
    featured: true,
    outputs: ["3 reels com narração", "1 podcast 2 vozes", "3 carrosséis 10 imgs", "3 stories com CTA", "1 landing page", "1 blog post SEO"],
    extras: ["Aprovação via WhatsApp", "Publicação automática IG/FB", "Dashboard de outputs"],
  },
  {
    tier: "agency",
    name: "Agência",
    price: 247,
    books: 10,
    cta: "Falar com vendas",
    href: "https://wa.me/5571999733883?text=Quero+o+plano+Agência+do+BookReel",
    featured: false,
    outputs: ["3 reels com narração", "1 podcast 2 vozes", "3 carrosséis 10 imgs", "3 stories com CTA", "1 landing page", "1 blog post SEO"],
    extras: ["Aprovação via WhatsApp", "Publicação automática IG/FB", "API programática", "Máxima prioridade"],
  },
];

const OUTPUTS = [
  { icon: "▶", label: "3 Reels", sub: "com narração TTS até 60s" },
  { icon: "🎙", label: "1 Podcast", sub: "2 vozes estilo NotebookLM" },
  { icon: "◼", label: "3 Carrosséis", sub: "10 imagens geradas por IA" },
  { icon: "◻", label: "3 Stories", sub: "com texto e CTA" },
  { icon: "◈", label: "1 Landing Page", sub: "HTML pronta para publicar" },
  { icon: "✦", label: "1 Blog Post", sub: "otimizado para SEO" },
];

const STEPS = [
  { n: "01", title: "Envia o PDF", desc: "Mande o book do lançamento pelo WhatsApp ou dashboard. Qualquer formato." },
  { n: "02", title: "IA processa", desc: "O pipeline analisa, extrai, gera narrativas e produz todos os formatos automaticamente." },
  { n: "03", title: "Aprova", desc: "Você recebe a prévia via WhatsApp. Aprova, reprova ou pede ajuste com uma palavra." },
  { n: "04", title: "Publica", desc: "Conteúdo entregue pronto. Nos planos Pro e Agência, publicamos direto no Instagram e Facebook." },
];

export default function LandingPage() {
  const [visible, setVisible] = useState(false);
  const heroRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setVisible(true);
  }, []);

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white overflow-x-hidden">
      {/* Font imports via style */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,700;1,9..144,400&family=DM+Sans:wght@300;400;500&display=swap');
        .font-display { font-family: 'Fraunces', serif; }
        .font-body { font-family: 'DM Sans', sans-serif; }
        .grain::after {
          content: '';
          position: fixed;
          inset: 0;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.04'/%3E%3C/svg%3E");
          pointer-events: none;
          z-index: 100;
          opacity: 0.4;
        }
        .glow-line {
          background: linear-gradient(90deg, transparent, #C9A84C, transparent);
          height: 1px;
        }
        .hero-glow {
          background: radial-gradient(ellipse 60% 40% at 50% 0%, rgba(201,168,76,0.15) 0%, transparent 70%);
        }
        .card-border {
          background: linear-gradient(145deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02));
          border: 1px solid rgba(255,255,255,0.08);
        }
        .card-border-gold {
          background: linear-gradient(145deg, rgba(201,168,76,0.12), rgba(201,168,76,0.03));
          border: 1px solid rgba(201,168,76,0.4);
        }
        .fade-up {
          opacity: 0;
          transform: translateY(24px);
          transition: opacity 0.7s ease, transform 0.7s ease;
        }
        .fade-up.visible {
          opacity: 1;
          transform: translateY(0);
        }
        .tag {
          background: rgba(201,168,76,0.12);
          border: 1px solid rgba(201,168,76,0.3);
          color: #C9A84C;
          font-size: 11px;
          font-weight: 500;
          letter-spacing: 0.1em;
          padding: 4px 12px;
          border-radius: 100px;
          text-transform: uppercase;
          display: inline-block;
        }
        .number-big {
          font-family: 'Fraunces', serif;
          font-size: clamp(56px, 10vw, 96px);
          font-weight: 700;
          line-height: 0.95;
          letter-spacing: -0.02em;
        }
        .step-line {
          position: absolute;
          left: 28px;
          top: 56px;
          bottom: -24px;
          width: 1px;
          background: linear-gradient(180deg, rgba(201,168,76,0.3), transparent);
        }
      `}</style>

      <div className="grain" />

      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4" style={{ background: 'rgba(10,10,10,0.8)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="font-display text-lg font-bold tracking-tight">
          Book<span style={{ color: '#C9A84C' }}>Agent</span>
        </div>
        <div className="flex items-center gap-6">
          <a href="#como-funciona" className="font-body text-sm text-white/50 hover:text-white transition-colors hidden sm:block">Como funciona</a>
          <a href="#planos" className="font-body text-sm text-white/50 hover:text-white transition-colors hidden sm:block">Planos</a>
          <a href="#planos" className="font-body text-sm px-4 py-2 rounded-lg font-medium transition-all hover:opacity-80" style={{ background: '#C9A84C', color: '#0A0A0A' }}>
            Começar
          </a>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative pt-32 pb-24 px-6 text-center" ref={heroRef}>
        <div className="hero-glow absolute inset-0 pointer-events-none" />
        <div className="relative max-w-4xl mx-auto">
          <div className={`fade-up ${visible ? 'visible' : ''}`} style={{ transitionDelay: '0.1s' }}>
            <span className="tag">Automação de conteúdo imobiliário</span>
          </div>
          <h1 className={`font-display mt-6 mb-6 fade-up ${visible ? 'visible' : ''}`} style={{ fontSize: 'clamp(40px, 7vw, 76px)', fontWeight: 700, lineHeight: '1.05', letterSpacing: '-0.02em', transitionDelay: '0.2s' }}>
            Do PDF do lançamento<br />
            ao conteúdo completo.<br />
            <em style={{ color: '#C9A84C', fontStyle: 'italic' }}>Em 5 minutos.</em>
          </h1>
          <p className={`font-body text-white/60 max-w-2xl mx-auto mb-10 fade-up ${visible ? 'visible' : ''}`} style={{ fontSize: '18px', lineHeight: '1.6', transitionDelay: '0.3s' }}>
            Envie o PDF do book. O BookReel gera reels, podcast, carrosséis, stories e landing page — tudo com narração, imagens e texto prontos para publicar.
          </p>
          <div className={`flex flex-col sm:flex-row items-center justify-center gap-4 fade-up ${visible ? 'visible' : ''}`} style={{ transitionDelay: '0.4s' }}>
            <a href="#planos" className="font-body px-8 py-4 rounded-xl font-medium text-base transition-all hover:scale-105 active:scale-95" style={{ background: '#C9A84C', color: '#0A0A0A' }}>
              Ver planos →
            </a>
            <a href="https://wa.me/5571999733883?text=Quero+testar+o+BookReel" className="font-body px-8 py-4 rounded-xl font-medium text-base transition-all hover:bg-white/5" style={{ border: '1px solid rgba(255,255,255,0.12)', color: 'white' }}>
              Falar no WhatsApp
            </a>
          </div>
          <p className="font-body text-white/30 text-sm mt-6">Sem contrato · Cancele quando quiser · 7 dias grátis no Pro</p>
        </div>
      </section>

      {/* Gold divider */}
      <div className="glow-line mx-auto max-w-2xl my-2" />

      {/* Outputs section */}
      <section className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <span className="tag">Output por book</span>
            <h2 className="font-display mt-4" style={{ fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 700 }}>
              Tudo que 1 PDF gera
            </h2>
            <p className="font-body text-white/50 mt-3">Cada book processado entrega um pacote completo de conteúdo em todos os formatos.</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {OUTPUTS.map((o, i) => (
              <div key={o.label} className="card-border rounded-2xl p-6" style={{ animationDelay: `${i * 0.1}s` }}>
                <div className="font-display text-2xl mb-3" style={{ color: '#C9A84C' }}>{o.icon}</div>
                <div className="font-display text-xl font-bold mb-1">{o.label}</div>
                <div className="font-body text-white/50 text-sm">{o.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="como-funciona" className="py-24 px-6" style={{ background: 'rgba(255,255,255,0.02)' }}>
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-16">
            <span className="tag">Processo</span>
            <h2 className="font-display mt-4" style={{ fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 700 }}>
              Como funciona
            </h2>
          </div>
          <div className="flex flex-col gap-8">
            {STEPS.map((s, i) => (
              <div key={s.n} className="flex gap-6 items-start relative">
                {i < STEPS.length - 1 && <div className="step-line" />}
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 font-display font-bold text-sm" style={{ background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.3)', color: '#C9A84C' }}>
                  {s.n}
                </div>
                <div className="pt-2">
                  <div className="font-display text-xl font-bold mb-2">{s.title}</div>
                  <div className="font-body text-white/55 text-base leading-relaxed">{s.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benchmark */}
      <section className="py-24 px-6">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <span className="tag">Comparativo</span>
            <h2 className="font-display mt-4" style={{ fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 700 }}>
              Por que BookReel?
            </h2>
          </div>
          <div className="card-border rounded-2xl overflow-hidden">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'DM Sans, sans-serif', fontSize: '14px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <th style={{ padding: '14px 20px', textAlign: 'left', color: 'rgba(255,255,255,0.4)', fontWeight: 400 }}>Ferramenta</th>
                  <th style={{ padding: '14px 20px', textAlign: 'left', color: 'rgba(255,255,255,0.4)', fontWeight: 400 }}>Preço</th>
                  <th style={{ padding: '14px 20px', textAlign: 'left', color: 'rgba(255,255,255,0.4)', fontWeight: 400 }}>Entrada via PDF</th>
                  <th style={{ padding: '14px 20px', textAlign: 'left', color: 'rgba(255,255,255,0.4)', fontWeight: 400 }}>Vídeo + TTS</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { name: 'Lano.com.br', price: 'R$ 147/mês', pdf: false, video: false },
                  { name: 'BookReel Starter', price: 'R$ 47/mês', pdf: true, video: true, highlight: true },
                ].map((r) => (
                  <tr key={r.name} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: r.highlight ? 'rgba(201,168,76,0.04)' : 'transparent' }}>
                    <td style={{ padding: '14px 20px', fontWeight: r.highlight ? 600 : 400, color: r.highlight ? '#C9A84C' : 'white' }}>{r.name}</td>
                    <td style={{ padding: '14px 20px', color: 'rgba(255,255,255,0.8)' }}>{r.price}</td>
                    <td style={{ padding: '14px 20px', color: r.pdf ? '#86efac' : 'rgba(255,255,255,0.2)' }}>{r.pdf ? '✓ automático' : '—'}</td>
                    <td style={{ padding: '14px 20px', color: r.video ? '#86efac' : 'rgba(255,255,255,0.2)' }}>{r.video ? '✓ incluso' : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="font-body text-white/30 text-sm text-center mt-4">Lano gera apenas posts de texto a partir de dados digitados manualmente.</p>
        </div>
      </section>

      {/* Plans */}
      <section id="planos" className="py-24 px-6" style={{ background: 'rgba(255,255,255,0.02)' }}>
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <span className="tag">Planos</span>
            <h2 className="font-display mt-4" style={{ fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 700 }}>
              Escolha seu plano
            </h2>
            <p className="font-body text-white/50 mt-3">Sem contrato · Cancele quando quiser · Upgrade a qualquer momento</p>
          </div>
          <div className="grid sm:grid-cols-3 gap-5 items-stretch">
            {PLANS.map((p) => (
              <div key={p.tier} className={`rounded-2xl p-7 flex flex-col ${p.featured ? 'card-border-gold' : 'card-border'}`} style={p.featured ? { position: 'relative' } : {}}>
                {p.featured && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-xs font-medium font-body" style={{ background: '#C9A84C', color: '#0A0A0A' }}>
                    Mais popular
                  </div>
                )}
                <div>
                  <div className="font-body text-xs font-medium tracking-widest uppercase mb-3" style={{ color: '#C9A84C' }}>{p.name}</div>
                  <div className="font-display" style={{ fontSize: '42px', fontWeight: 700, lineHeight: 1 }}>
                    R$ {p.price}
                    <span className="font-body text-base font-normal" style={{ color: 'rgba(255,255,255,0.4)' }}>/mês</span>
                  </div>
                  <div className="font-body text-sm mt-2 mb-6" style={{ color: 'rgba(255,255,255,0.5)' }}>
                    {p.books} book{p.books > 1 ? 's' : ''} por mês
                  </div>
                </div>
                <a href={p.href} target="_blank" rel="noopener noreferrer"
                  className="block text-center py-3 px-6 rounded-xl font-body font-medium text-sm transition-all hover:opacity-80 mb-6"
                  style={p.featured ? { background: '#C9A84C', color: '#0A0A0A' } : { background: 'rgba(255,255,255,0.06)', color: 'white', border: '1px solid rgba(255,255,255,0.1)' }}>
                  {p.cta}
                </a>
                <div className="flex flex-col gap-2 flex-1">
                  <div className="font-body text-xs font-medium tracking-widest uppercase mb-1" style={{ color: 'rgba(255,255,255,0.3)' }}>Output por book</div>
                  {p.outputs.map((o) => (
                    <div key={o} className="flex items-start gap-2 font-body text-sm" style={{ color: 'rgba(255,255,255,0.7)' }}>
                      <span style={{ color: '#C9A84C', marginTop: '1px' }}>✓</span> {o}
                    </div>
                  ))}
                  <div className="font-body text-xs font-medium tracking-widest uppercase mb-1 mt-4" style={{ color: 'rgba(255,255,255,0.3)' }}>Extras</div>
                  {p.extras.map((e) => (
                    <div key={e} className="flex items-start gap-2 font-body text-sm" style={{ color: 'rgba(255,255,255,0.7)' }}>
                      <span style={{ color: '#C9A84C', marginTop: '1px' }}>✓</span> {e}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-24 px-6">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-12">
            <span className="tag">Dúvidas</span>
            <h2 className="font-display mt-4" style={{ fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 700 }}>
              Perguntas frequentes
            </h2>
          </div>
          <div className="flex flex-col gap-6">
            {[
              { q: "Como envio o PDF?", a: "Pelo dashboard em app.bookreel.ai ou enviando o arquivo diretamente via WhatsApp para o número do BookReel. O sistema detecta automaticamente." },
              { q: "O que é o podcast estilo NotebookLM?", a: "Um áudio de até 60 segundos com dois apresentadores discutindo os diferenciais do lançamento — gerado automaticamente a partir do conteúdo do book. Pronto para stories e reels." },
              { q: "Os reels ficam prontos para publicar?", a: "Sim. Você recebe os arquivos de vídeo em 9:16, com narração, trilha e legendas. Nos planos Pro e Agência, podemos publicar direto no Instagram e Facebook após sua aprovação." },
              { q: "Quanto tempo leva o processamento?", a: "Em média 3 a 5 minutos por book. Você recebe uma notificação via WhatsApp (planos Pro e Agência) ou pode acompanhar no dashboard." },
              { q: "Posso mudar de plano?", a: "Sim, a qualquer momento, sem fidelidade. O upgrade vale imediatamente. O downgrade entra no próximo ciclo." },
              { q: "Funciona para qualquer tipo de lançamento?", a: "Sim. Casas, apartamentos, terrenos, empreendimentos comerciais. O BookReel extrai as informações específicas de cada book e gera conteúdo personalizado." },
            ].map((f) => (
              <div key={f.q} className="card-border rounded-xl p-6">
                <div className="font-display text-lg font-bold mb-2">{f.q}</div>
                <div className="font-body text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.55)' }}>{f.a}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-24 px-6 text-center" style={{ background: 'rgba(201,168,76,0.04)', borderTop: '1px solid rgba(201,168,76,0.12)' }}>
        <div className="max-w-2xl mx-auto">
          <div className="font-display mb-4" style={{ fontSize: 'clamp(32px, 5vw, 56px)', fontWeight: 700, lineHeight: 1.1 }}>
            Pronto para automatizar<br />
            seu conteúdo?
          </div>
          <p className="font-body mb-10" style={{ color: 'rgba(255,255,255,0.5)', fontSize: '17px' }}>
            Junte-se a corretores que já transformam seus books em conteúdo completo em minutos.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a href={PLANS[1].href} className="font-body px-10 py-4 rounded-xl font-medium text-base transition-all hover:scale-105" style={{ background: '#C9A84C', color: '#0A0A0A' }}>
              Testar 7 dias grátis
            </a>
            <a href="https://wa.me/5571999733883?text=Quero+saber+mais+sobre+o+BookReel" className="font-body px-10 py-4 rounded-xl font-medium text-base transition-all hover:bg-white/5" style={{ border: '1px solid rgba(255,255,255,0.12)' }}>
              Falar no WhatsApp
            </a>
          </div>
          <p className="font-body text-white/25 text-sm mt-6">7 dias grátis no Pro · Sem cartão para o Starter</p>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-10 px-6 text-center" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="font-display text-lg font-bold mb-3">
          Book<span style={{ color: '#C9A84C' }}>Agent</span>
        </div>
        <p className="font-body text-white/30 text-sm mb-4">
          DB8 Intelligence · Salvador, BA
        </p>
        <div className="flex items-center justify-center gap-6 font-body text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>
          <Link href="/planos" className="hover:text-white transition-colors">Planos</Link>
          <a href="https://wa.me/5571999733883" className="hover:text-white transition-colors">Suporte</a>
          <Link href="/dashboard" className="hover:text-white transition-colors">Dashboard</Link>
        </div>
      </footer>
    </div>
  );
}
