"use client";

/**
 * LandingApp — site público bookreel.ai (importado pela landing route)
 *
 * Origem: BookReelSitefinal.zip (app.jsx transformado).
 * Mudanças vs original:
 *   - "use client" + ESM React import (era global window.React)
 *   - assets/* → /landing/assets/* (servidos por web/public/landing/assets/)
 *   - TweaksPanel mantido como dev-only (só renderiza se ?dev=1 na URL)
 *   - window.App = App removido (export default usa convenção Next.js)
 *   - postMessage pro parent removido (não há iframe edit-mode em prod)
 *
 * Theme: força "livroai" (Light variant) — corresponde ao HTML preview do ZIP.
 */

import React, { useState, useEffect, useRef } from "react";


// Lucide-style icons (inline SVG)
const Icon = ({ name, ...props }) => {
  const icons = {
    book: <><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></>,
    arrow: <><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></>,
    sparkle: <><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .962 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.962 0z"/></>,
    check: <><path d="M20 6 9 17l-5-5"/></>,
    whatsapp: <><path d="M3 21l1.65-3.8a9 9 0 1 1 3.4 2.9L3 21"/><path d="M9 10a.5.5 0 0 0 1 0V9a.5.5 0 0 0-1 0v1a5 5 0 0 0 5 5h1a.5.5 0 0 0 0-1h-1a.5.5 0 0 0 0 1"/></>,
    plus: <><path d="M5 12h14"/><path d="M12 5v14"/></>,
    chevronLeft: <><path d="m15 18-6-6 6-6"/></>,
    chevronRight: <><path d="m9 18 6-6-6-6"/></>,
    upload: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></>,
    cpu: <><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M15 2v2"/><path d="M15 20v2"/><path d="M2 15h2"/><path d="M2 9h2"/><path d="M20 15h2"/><path d="M20 9h2"/><path d="M9 2v2"/><path d="M9 20v2"/></>,
    send: <><path d="M22 2 11 13"/><path d="M22 2l-7 20-4-9-9-4z"/></>,
    film: <><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/></>,
    images: <><path d="M18 22H4a2 2 0 0 1-2-2V6"/><path d="m22 13-1.296-1.296a2.41 2.41 0 0 0-3.408 0L11 18"/><circle cx="12" cy="8" r="2"/><rect width="16" height="16" x="6" y="2" rx="2"/></>,
    square: <><rect x="3" y="3" width="18" height="18" rx="2"/></>,
    mic: <><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></>,
    layout: <><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></>,
    fileText: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></>,
    layers: <><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></>,
    brain: <><path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/></>,
    palette: <><circle cx="13.5" cy="6.5" r=".5"/><circle cx="17.5" cy="10.5" r=".5"/><circle cx="8.5" cy="7.5" r=".5"/><circle cx="6.5" cy="12.5" r=".5"/><path d="M12 2a10 10 0 1 0 9.97 9.03A5 5 0 0 1 17 15h-1a2 2 0 0 0-2 2v3.5a.5.5 0 0 1-.8.4A9.9 9.9 0 0 1 12 2z"/></>,
    waveform: <><path d="M2 10v3"/><path d="M6 6v11"/><path d="M10 3v18"/><path d="M14 8v7"/><path d="M18 5v13"/><path d="M22 10v3"/></>,
    link: <><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></>,
    target: <><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></>,
    clock: <><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>,
    heart: <><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></>,
    messageCircle: <><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></>,
    dollar: <><line x1="12" y1="2" x2="12" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></>,
  };
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      {icons[name]}
    </svg>
  );
};

// ============================ NAVBAR ============================
const Navbar = () => {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return (
    <nav className={`navbar ${scrolled ? 'scrolled' : ''}`}>
      <div className="container nav-inner">
        <a href="#" className="logo">
          <span className="logo-mark"><Icon name="book"/></span>
          BookReel
        </a>
        <div className="nav-links">
          <a href="#produto" className="nav-link">Produto</a>
          <a href="#como-funciona" className="nav-link">Como Funciona</a>
          <a href="#precos" className="nav-link">Preços</a>
          <a href="#faq" className="nav-link">FAQ</a>
          <a href="#precos" className="btn btn-primary nav-cta">Começar agora<Icon name="arrow"/></a>
        </div>
      </div>
    </nav>
  );
};

// ============================ HERO ============================
const Hero = () => (
  <section className="hero" id="produto">
    <div className="hero-glow"/>
    <div className="hero-guides">
      <span/><span/><span/><span/>
    </div>
    <div className="container">
      <div className="hero-plate">
        <div className="plate-header">
          <div className="plate-meta-left">
            <span className="plate-code">BR · 2026 / 01</span>
            <span className="plate-sep">⎯</span>
            <span className="plate-code">ESC. 1 : 1</span>
          </div>
          <div className="plate-meta-right">
            <span className="plate-code">PRANCHA 01 / 04</span>
          </div>
        </div>
        <div className="hero-grid">
          <div className="hero-copy">
            <div className="hero-kicker">Para imobiliárias, corretores e marcas que vendem com <em>book</em></div>
            <h1 className="hero-headline">
              Seu book de produto,<br/>
              virando <em>dezenas de peças</em><br/>
              em uma tarde.
            </h1>
            <p className="hero-sub">
              Envie o book do empreendimento, do produto ou do projeto. Em horas, você recebe um pacote completo de conteúdo — reels, stories, carrosséis, podcast e landing — pronto para captar leads, nutrir e converter. Mantendo a sofisticação do material original.
            </p>
            <div className="hero-ctas">
              <a href="#precos" className="btn btn-primary btn-large">Solicitar demonstração<Icon name="arrow"/></a>
              <a href="#como-funciona" className="btn btn-outline btn-large">Ver o método</a>
            </div>
            <div className="hero-meta">
              <span className="hero-meta-item"><Icon name="check"/>7 dias sem cartão</span>
              <span className="hero-meta-item"><Icon name="check"/>Identidade preservada</span>
              <span className="hero-meta-item"><Icon name="check"/>LGPD · dados próprios</span>
            </div>
          </div>
          <HeroVisual/>
        </div>
        <div className="plate-footer">
          <span className="plate-code">FIG. 01 — EMPREENDIMENTO DE ALTO PADRÃO · DIAGRAMA DE ENTRADA / SAÍDA</span>
          <span className="plate-code">BOOKREEL ESTÚDIO · SP / BR</span>
        </div>
      </div>
    </div>
  </section>
);

// Architectural plate composition — luxury property photo with editorial overlays
const HeroVisual = () => (
  <div className="hero-visual hero-visual-photo">
    <div className="hv-photo-frame">
      {/* corner registration marks */}
      <span className="hv-reg hv-reg-tl"/>
      <span className="hv-reg hv-reg-tr"/>
      <span className="hv-reg hv-reg-bl"/>
      <span className="hv-reg hv-reg-br"/>

      {/* the photo */}
      <div className="hv-photo" style={{backgroundImage: "url('/landing/assets/hero-building.jpg')"}}/>
      <div className="hv-photo-grade"/>

      {/* editorial label strips */}
      <div className="hv-strip hv-strip-top">
        <span>EMPREENDIMENTO · ALTO PADRÃO</span>
        <span>N 23°33'22" / W 46°39'01"</span>
      </div>
      <div className="hv-strip hv-strip-side">
        <span>MANSÃO <em>OTHON</em></span>
        <span className="hv-strip-meta">48 PP · BOOK DE LANÇAMENTO</span>
      </div>

      {/* overlay technical legend */}
      <div className="hv-legend">
        <div className="hv-legend-row"><span className="hv-legend-num">01</span><span className="hv-legend-label">REEL 30"</span></div>
        <div className="hv-legend-row"><span className="hv-legend-num">02</span><span className="hv-legend-label">CARROSSEL · 8 LÂMINAS</span></div>
        <div className="hv-legend-row"><span className="hv-legend-num">03</span><span className="hv-legend-label">PODCAST 12'</span></div>
        <div className="hv-legend-row"><span className="hv-legend-num">04</span><span className="hv-legend-label">LANDING PAGE</span></div>
      </div>

      {/* floor-plan ghost overlay — subtle, editorial */}
      <svg className="hv-ghost-plan" viewBox="0 0 200 120" preserveAspectRatio="none">
        <rect x="2" y="2" width="196" height="116" fill="none" stroke="currentColor" strokeWidth="0.6"/>
        <line x1="80" y1="2" x2="80" y2="60" strokeWidth="0.4"/>
        <line x1="2" y1="60" x2="120" y2="60" strokeWidth="0.4"/>
        <line x1="120" y1="30" x2="120" y2="118" strokeWidth="0.4"/>
        <line x1="120" y1="80" x2="198" y2="80" strokeWidth="0.4"/>
      </svg>
    </div>
  </div>
);

// Kept for legacy reference — original technical visual (unused)
const HeroVisualTechnical = () => (
  <div className="hero-visual">
    <svg className="hv-frame" viewBox="0 0 520 600" preserveAspectRatio="xMidYMid meet">
      <rect width="520" height="600" fill="none"/>

      {/* Dimension lines top */}
      <g className="hv-dim">
        <line x1="40" y1="30" x2="480" y2="30" />
        <line x1="40" y1="24" x2="40" y2="36"/>
        <line x1="480" y1="24" x2="480" y2="36"/>
        <line x1="260" y1="24" x2="260" y2="36"/>
        <text x="150" y="22" className="hv-dim-text">12 PEÇAS</text>
        <text x="370" y="22" className="hv-dim-text">1 BOOK</text>
      </g>

      {/* Main plan - floor plan of an apartment */}
      <g className="hv-plan" transform="translate(60, 70)">
        {/* outer walls */}
        <rect x="0" y="0" width="400" height="270" fill="none" stroke="currentColor" strokeWidth="2.5"/>
        {/* interior walls */}
        <line x1="160" y1="0" x2="160" y2="130" strokeWidth="1.5"/>
        <line x1="0" y1="130" x2="240" y2="130" strokeWidth="1.5"/>
        <line x1="240" y1="60" x2="240" y2="270" strokeWidth="1.5"/>
        <line x1="240" y1="180" x2="400" y2="180" strokeWidth="1.5"/>
        <line x1="80" y1="130" x2="80" y2="270" strokeWidth="1.5"/>

        {/* door arcs */}
        <path d="M 40 130 A 20 20 0 0 1 60 110" fill="none" strokeWidth="1"/>
        <path d="M 160 50 A 20 20 0 0 0 180 30" fill="none" strokeWidth="1"/>
        <path d="M 240 100 A 20 20 0 0 1 260 80" fill="none" strokeWidth="1"/>

        {/* furniture outlines */}
        <rect x="20" y="20" width="60" height="80" fill="none" strokeWidth="0.8" opacity="0.6"/>
        <rect x="180" y="20" width="50" height="90" fill="none" strokeWidth="0.8" opacity="0.6"/>
        <circle cx="120" cy="200" r="25" fill="none" strokeWidth="0.8" opacity="0.6"/>
        <rect x="260" y="20" width="120" height="30" fill="url(#hvHatch)" strokeWidth="0.8" opacity="0.45"/>
        <rect x="280" y="200" width="100" height="50" fill="none" strokeWidth="0.8" opacity="0.6"/>

        {/* room labels */}
        <text x="80" y="80" className="hv-room" textAnchor="middle">SUITE</text>
        <text x="200" y="70" className="hv-room" textAnchor="middle">ESTAR</text>
        <text x="320" y="120" className="hv-room" textAnchor="middle">TERRAÇO</text>
        <text x="40" y="205" className="hv-room" textAnchor="middle">BAN.</text>
        <text x="160" y="215" className="hv-room" textAnchor="middle">COZINHA</text>
        <text x="320" y="235" className="hv-room" textAnchor="middle">JANTAR</text>

        {/* North arrow */}
        <g transform="translate(370, 20)" className="hv-north">
          <circle r="14" fill="none" strokeWidth="0.8"/>
          <path d="M 0 -14 L 4 4 L 0 0 L -4 4 Z" fill="currentColor"/>
          <text y="26" className="hv-dim-text" textAnchor="middle">N</text>
        </g>
      </g>

      {/* Dimension lines left */}
      <g className="hv-dim">
        <line x1="30" y1="70" x2="30" y2="340"/>
        <line x1="24" y1="70" x2="36" y2="70"/>
        <line x1="24" y1="340" x2="36" y2="340"/>
      </g>

      {/* Output thumbnails as overlaid lâminas */}
      <g className="hv-outputs">
        <g transform="translate(300, 370)" className="hv-lamina hv-lamina-1">
          <rect width="84" height="148" fill="currentColor" opacity="0.06"/>
          <rect width="84" height="148" fill="none" strokeWidth="0.8"/>
          <rect x="6" y="6" width="72" height="100" fill="currentColor" opacity="0.12"/>
          <line x1="6" y1="118" x2="60" y2="118" strokeWidth="0.6" opacity="0.6"/>
          <line x1="6" y1="126" x2="50" y2="126" strokeWidth="0.6" opacity="0.45"/>
          <line x1="6" y1="134" x2="66" y2="134" strokeWidth="0.6" opacity="0.45"/>
          <text x="4" y="-4" className="hv-lamina-label">FIG. 02 · REEL 30"</text>
        </g>
        <g transform="translate(400, 360)" className="hv-lamina hv-lamina-2">
          <rect width="84" height="148" fill="currentColor" opacity="0.04"/>
          <rect width="84" height="148" fill="none" strokeWidth="0.8"/>
          <rect x="6" y="6" width="72" height="72" fill="currentColor" opacity="0.12"/>
          <rect x="6" y="84" width="28" height="28" fill="currentColor" opacity="0.08"/>
          <rect x="40" y="84" width="28" height="28" fill="currentColor" opacity="0.08"/>
          <line x1="6" y1="122" x2="72" y2="122" strokeWidth="0.6" opacity="0.5"/>
          <line x1="6" y1="132" x2="52" y2="132" strokeWidth="0.6" opacity="0.4"/>
          <text x="4" y="-4" className="hv-lamina-label">FIG. 03 · CARROSSEL</text>
        </g>
        <g transform="translate(200, 400)" className="hv-lamina hv-lamina-3">
          <rect width="80" height="110" fill="currentColor" opacity="0.05"/>
          <rect width="80" height="110" fill="none" strokeWidth="0.8"/>
          <g transform="translate(40, 55)">
            {Array.from({length: 13}).map((_, i) => (
              <line key={i} x1={-30 + i*5} y1={-(6 + (i%3)*4 + (i%4)*3)} x2={-30 + i*5} y2={(6 + (i%3)*4 + (i%4)*3)} strokeWidth="1" opacity="0.7"/>
            ))}
          </g>
          <text x="4" y="-4" className="hv-lamina-label">FIG. 04 · PODCAST</text>
        </g>
      </g>

      {/* connecting guide lines */}
      <g className="hv-guides">
        <path d="M 360 340 L 360 370" />
        <path d="M 420 340 L 440 360" />
        <path d="M 260 340 L 240 400" />
      </g>
    </svg>
  </div>
);

// ============================ EDITORIAL MARQUEE BANNER ============================
const MARQUEE_TOKENS = [
  'LUXURY BOOK', 'REELS', 'STORIES', 'CARROSSEL', 'PODCAST', 'LANDING PAGE',
  'ESSAY EDITORIAL', 'NARRATIVA DE MARCA', 'ONDE O LIVRO VIRA CAMPANHA',
  'IMÓVEIS DE ALTO PADRÃO', 'BRANDS PREMIUM', 'ARQUITETURA', 'MODA & LUXO', 'AUTOMOTIVO',
];

const EditorialMarquee = () => {
  // duplicate list so the translate loop is seamless
  const row = [...MARQUEE_TOKENS, ...MARQUEE_TOKENS, ...MARQUEE_TOKENS];
  return (
    <section className="marquee-band" aria-label="Formatos gerados">
      <div className="marquee-rule marquee-rule-top"/>
      <div className="marquee-row marquee-row-left">
        <div className="marquee-track">
          {row.map((t, i) => (
            <span key={i} className="marquee-item">
              <span className="marquee-text">{t}</span>
              <span className="marquee-sep" aria-hidden="true">◆</span>
            </span>
          ))}
        </div>
      </div>
      <div className="marquee-rule"/>
      <div className="marquee-row marquee-row-right">
        <div className="marquee-track marquee-track-reverse">
          {row.map((t, i) => (
            <span key={i} className="marquee-item">
              <span className="marquee-sep" aria-hidden="true">⎯</span>
              <span className="marquee-text marquee-text-thin">{t}</span>
            </span>
          ))}
        </div>
      </div>
      <div className="marquee-rule marquee-rule-bottom"/>
    </section>
  );
};

const LogoStrip = () => (
  <div className="hairline-container"><div className="hairline"/></div>
);

// ============================ PROBLEMA ============================
const Problema = () => {
  const dores = [
    { n: 'I',   t: 'O tempo que não se recupera', d: 'Uma campanha completa por lançamento consome semanas do seu time. Tempo que deveria estar vendendo, atendendo ou fechando.' },
    { n: 'II',  t: 'O conteúdo que não traduz', d: 'Material genérico, sem narrativa. Não comunica o valor do produto para quem realmente decide pela compra.' },
    { n: 'III', t: 'A agência que não entende', d: 'Orçamentos a partir de R$ 15k por campanha — e mesmo assim raramente com o vocabulário do seu mercado.' },
    { n: 'IV',  t: 'A janela que se fecha', d: 'Enquanto o book permanece engavetado, o lançamento perde inércia e a oportunidade de captar leads qualificados.' },
  ];
  return (
    <section>
      <div className="container">
        <div className="section-header">
          <div className="eyebrow">§ I · O Problema</div>
          <h2 className="section-title">Quem vende com book <em>não tem tempo</em> para ser também produtora de conteúdo — e mesmo quando tem, o resultado raramente está à altura do material original.</h2>
        </div>
        <div className="problem-grid editorial-grid">
          {dores.map(d => (
            <div key={d.n} className="editorial-cell">
              <div className="editorial-num">{d.n}</div>
              <h3 className="editorial-title">{d.t}</h3>
              <p className="editorial-desc">{d.d}</p>
            </div>
          ))}
        </div>
        <div className="stat-banner">
          <div className="stat-number">78%</div>
          <div>
            <div className="stat-text">dos compradores de alto padrão pesquisam o produto e a marca <em>antes</em> do primeiro contato comercial.</div>
            <div className="stat-source">* FONTE · ABRAINC / DATAFOLHA · 2025</div>
          </div>
        </div>
      </div>
    </section>
  );
};

// ============================ DEMO (before/after slider) ============================
const Demo = () => {
  const [pos, setPos] = useState(50);
  const sliderRef = useRef(null);
  const dragging = useRef(false);

  const onMove = (clientX) => {
    if (!sliderRef.current) return;
    const rect = sliderRef.current.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 100;
    setPos(Math.max(5, Math.min(95, x)));
  };

  useEffect(() => {
    const onMouseMove = (e) => { if (dragging.current) onMove(e.clientX); };
    const onMouseUp = () => { dragging.current = false; };
    const onTouchMove = (e) => { if (dragging.current && e.touches[0]) onMove(e.touches[0].clientX); };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('touchmove', onTouchMove);
    window.addEventListener('touchend', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onMouseUp);
    };
  }, []);

  const outputs = [
    { i: 'film', t: 'Reels', d: '3 vídeos verticais com narração' },
    { i: 'images', t: 'Carrosséis', d: '3 séries de 6 a 10 slides' },
    { i: 'square', t: 'Stories', d: '3 conjuntos prontos' },
    { i: 'mic', t: 'Podcast', d: 'Episódio estilo NotebookLM' },
    { i: 'layout', t: 'Landing page', d: 'Responsiva, com CTA' },
    { i: 'fileText', t: 'Blog post', d: 'Artigo SEO completo' },
  ];

  return (
    <section>
      <div className="container">
        <div className="section-header">
          <div className="eyebrow">Demonstração</div>
          <h2 className="section-title">Arraste. Veja <em>um PDF virar doze peças</em> de conteúdo.</h2>
          <p className="section-subtitle">Um único book imobiliário, reinterpretado pela nossa IA em todos os formatos que o mercado consome hoje.</p>
        </div>
        <div className="demo-wrap">
          <div
            ref={sliderRef}
            className="demo-slider"
            onMouseDown={(e) => { dragging.current = true; onMove(e.clientX); }}
            onTouchStart={(e) => { dragging.current = true; onMove(e.touches[0].clientX); }}
          >
            <div className="demo-pane demo-before">
              <div className="demo-bookcover">
                <div className="demo-bookcover-frame">
                  <div className="demo-bookcover-image" style={{backgroundImage: "url('/landing/assets/hero-building.jpg')"}}/>
                  <div className="demo-bookcover-grade"/>
                  <div className="demo-bookcover-spine"/>
                  <div className="demo-bookcover-content">
                    <div className="demo-bookcover-topmeta">
                      <span className="demo-bookcover-brand">MOURA DUBEUX</span>
                      <span className="demo-bookcover-edition">ED. 01 / 2026</span>
                    </div>
                    <div className="demo-bookcover-title-block">
                      <span className="demo-bookcover-kicker">LUXURY RESIDENCES · SÃO PAULO</span>
                      <h3 className="demo-bookcover-title">Mansão<br/><em>Othon</em></h3>
                      <span className="demo-bookcover-sub">Book editorial · 48 páginas · PDF</span>
                    </div>
                    <div className="demo-bookcover-footer">
                      <span className="demo-bookcover-dot"/>
                      <span>PRONTO PARA UPLOAD</span>
                    </div>
                  </div>
                </div>
                <div className="demo-bookcover-caption">FIG. 01 — ARQUIVO DE ENTRADA · 48 PÁGINAS</div>
              </div>
            </div>
            <div className="demo-pane demo-after" style={{clipPath: `inset(0 0 0 ${pos}%)`}}>
              <div className="demo-outputs">
                {outputs.map(o => (
                  <div key={o.t} className="demo-output">
                    <span className="demo-output-ai">IA</span>
                    <Icon name={o.i} className="demo-output-icon"/>
                    <div>
                      <div className="demo-output-title">{o.t}</div>
                      <div className="demo-output-desc">{o.d}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="demo-label before">ANTES · PDF</div>
            <div className="demo-label after">DEPOIS · 12 PEÇAS</div>
            <div className="demo-handle" style={{left: `${pos}%`}}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="m9 18-6-6 6-6"/><path d="m15 18 6-6-6-6"/>
              </svg>
            </div>
          </div>
          <div className="demo-instruction">← ARRASTE PARA COMPARAR →</div>
        </div>
      </div>
    </section>
  );
};

// ============================ COMO FUNCIONA ============================
const ComoFunciona = () => (
  <section id="como-funciona">
    <div className="container">
      <div className="section-header">
        <div className="eyebrow">§ II · O Método</div>
        <h2 className="section-title">Três estágios. <em>Quinze minutos.</em> Zero instrução técnica.</h2>
      </div>
      <div className="pipeline-axon">
        <svg viewBox="0 0 1200 420" preserveAspectRatio="xMidYMid meet" className="axon-svg">
          <defs>
            <pattern id="axonGrid" width="24" height="24" patternUnits="userSpaceOnUse">
              <path d="M 24 0 L 0 0 0 24" fill="none" stroke="currentColor" strokeWidth="0.3" opacity="0.12"/>
            </pattern>
          </defs>
          <rect width="1200" height="420" fill="url(#axonGrid)" className="axon-grid"/>

          {/* Base platform line */}
          <line x1="80" y1="260" x2="1120" y2="260" strokeWidth="0.8" opacity="0.4"/>

          {/* Stage 1 — Upload: stack of real book covers */}
          <g transform="translate(180, 130)" className="axon-stage">
            <defs>
              <clipPath id="bookClip1"><rect x="-62" y="-60" width="86" height="116" rx="1"/></clipPath>
              <clipPath id="bookClip2"><rect x="-42" y="-46" width="86" height="116" rx="1"/></clipPath>
              <clipPath id="bookClip3"><rect x="-22" y="-32" width="86" height="116" rx="1"/></clipPath>
            </defs>

            {/* Back book — rotated left */}
            <g transform="rotate(-8) translate(-6, 4)">
              <rect x="-62" y="-60" width="86" height="116" fill="#F4EEDF" stroke="currentColor" strokeWidth="1" opacity="0.9"/>
              <image href="/landing/assets/hero-moodboard.jpg" x="-62" y="-60" width="86" height="116" preserveAspectRatio="xMidYMid slice" clipPath="url(#bookClip1)" opacity="0.75"/>
              <rect x="-62" y="-60" width="86" height="116" fill="rgba(26,35,50,0.25)" clipPath="url(#bookClip1)"/>
              <rect x="-62" y="-60" width="86" height="116" fill="none" stroke="currentColor" strokeWidth="1"/>
              <text x="-56" y="-44" fill="#F4EEDF" fontFamily="ui-monospace, monospace" fontSize="4" letterSpacing="0.4">ED. 02</text>
              <text x="-19" y="10" fill="#F4EEDF" fontFamily="'Playfair Display', serif" fontSize="10" fontStyle="italic" textAnchor="middle">Jardim</text>
              <line x1="-56" y1="48" x2="-26" y2="48" stroke="#F4EEDF" strokeWidth="0.3" opacity="0.6"/>
            </g>

            {/* Middle book — slight rotation */}
            <g transform="rotate(4) translate(2, 0)">
              <rect x="-42" y="-46" width="86" height="116" fill="#2A1F12" stroke="currentColor" strokeWidth="1"/>
              <image href="/landing/assets/hero-interior.jpg" x="-42" y="-46" width="86" height="116" preserveAspectRatio="xMidYMid slice" clipPath="url(#bookClip2)" opacity="0.65"/>
              <rect x="-42" y="-46" width="86" height="116" fill="rgba(42,31,18,0.5)" clipPath="url(#bookClip2)"/>
              <rect x="-42" y="-46" width="86" height="116" fill="none" stroke="currentColor" strokeWidth="1"/>
              <text x="-36" y="-30" fill="#C9A455" fontFamily="ui-monospace, monospace" fontSize="4" letterSpacing="0.4">AÇORÁ</text>
              <text x="1" y="26" fill="#F4EEDF" fontFamily="'Playfair Display', serif" fontSize="11" fontStyle="italic" textAnchor="middle">Açorá</text>
              <line x1="-36" y1="62" x2="-4" y2="62" stroke="#C9A455" strokeWidth="0.4" opacity="0.8"/>
            </g>

            {/* Front book — the featured Mansão Othon */}
            <g transform="rotate(-2) translate(8, -4)">
              <rect x="-22" y="-32" width="86" height="116" fill="#0E1520" stroke="currentColor" strokeWidth="1"/>
              <image href="/landing/assets/hero-building.jpg" x="-22" y="-32" width="86" height="116" preserveAspectRatio="xMidYMid slice" clipPath="url(#bookClip3)" opacity="0.75"/>
              <rect x="-22" y="-32" width="86" height="116" fill="url(#bookCoverGrade)" clipPath="url(#bookClip3)"/>
              <rect x="-22" y="-32" width="86" height="116" fill="none" stroke="currentColor" strokeWidth="1.2"/>
              <text x="-16" y="-16" fill="#C9A455" fontFamily="ui-monospace, monospace" fontSize="4" letterSpacing="0.5" fontWeight="600">MOURA DUBEUX</text>
              <text x="21" y="40" fill="#F4EEDF" fontFamily="'Playfair Display', serif" fontSize="11" textAnchor="middle" fontWeight="300">Mansão</text>
              <text x="21" y="52" fill="#F4EEDF" fontFamily="'Playfair Display', serif" fontSize="11" fontStyle="italic" textAnchor="middle">Othon</text>
              <line x1="-16" y1="72" x2="10" y2="72" stroke="#C9A455" strokeWidth="0.5"/>
              <text x="-16" y="80" fill="#F4EEDF" fontFamily="ui-monospace, monospace" fontSize="3.2" letterSpacing="0.3" opacity="0.8">LUXURY · 48 PP</text>
            </g>

            <defs>
              <linearGradient id="bookCoverGrade" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(14,21,32,0.3)"/>
                <stop offset="60%" stopColor="rgba(14,21,32,0.45)"/>
                <stop offset="100%" stopColor="rgba(14,21,32,0.75)"/>
              </linearGradient>
            </defs>

            {/* Arrow upload */}
            <g transform="translate(18, -96)" strokeWidth="1.4">
              <line x1="0" y1="20" x2="0" y2="-6"/>
              <polyline points="-6,0 0,-6 6,0" fill="none"/>
            </g>
            <text y="108" textAnchor="middle" className="axon-num">01</text>
            <text y="130" textAnchor="middle" className="axon-title">UPLOAD DO BOOK</text>
            <text y="150" textAnchor="middle" className="axon-desc">PDF · memorial · pranchas</text>
          </g>

          {/* Arrow 1->2 */}
          <g className="axon-connector" transform="translate(330, 160)">
            <line x1="0" y1="0" x2="190" y2="0" strokeWidth="0.8" strokeDasharray="3 3"/>
            <polyline points="184,-5 192,0 184,5" fill="none" strokeWidth="1"/>
            <text x="95" y="-8" textAnchor="middle" className="axon-conn-label">EXTRAÇÃO</text>
          </g>

          {/* Stage 2 — AI core: isometric cube with internal processing animation */}
          <g transform="translate(600, 130)" className="axon-stage axon-stage-ai">
            <defs>
              {/* Scan line gradient */}
              <linearGradient id="aiScanGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="currentColor" stopOpacity="0"/>
                <stop offset="45%" stopColor="currentColor" stopOpacity="0.55"/>
                <stop offset="55%" stopColor="currentColor" stopOpacity="0.55"/>
                <stop offset="100%" stopColor="currentColor" stopOpacity="0"/>
              </linearGradient>
              {/* Cube clip so inner effects stay inside */}
              <clipPath id="aiCubeClip">
                <polygon points="-70,15 0,-20 70,15 70,65 0,100 -70,65"/>
              </clipPath>
              {/* Radial glow for core */}
              <radialGradient id="aiCoreGlow" cx="0.5" cy="0.5" r="0.5">
                <stop offset="0%" stopColor="#C9A455" stopOpacity="0.55"/>
                <stop offset="60%" stopColor="#C9A455" stopOpacity="0.12"/>
                <stop offset="100%" stopColor="#C9A455" stopOpacity="0"/>
              </radialGradient>
            </defs>

            {/* Cube faces */}
            <g strokeWidth="1.2">
              <polygon points="0,-20 70,15 0,50 -70,15" fill="currentColor" opacity="0.06"/>
              <polygon points="0,-20 70,15 0,50 -70,15" fill="none"/>
              <polygon points="-70,15 -70,65 0,100 0,50" fill="currentColor" opacity="0.12"/>
              <polygon points="-70,15 -70,65 0,100 0,50" fill="none"/>
              <polygon points="70,15 70,65 0,100 0,50" fill="currentColor" opacity="0.09"/>
              <polygon points="70,15 70,65 0,100 0,50" fill="none"/>
              <line x1="0" y1="-20" x2="0" y2="50" opacity="0.35"/>
              <line x1="0" y1="50" x2="0" y2="100" opacity="0.35"/>
              <line x1="-35" y1="-2" x2="-35" y2="82" opacity="0.25"/>
              <line x1="35" y1="-2" x2="35" y2="82" opacity="0.25"/>
              <line x1="-70" y1="40" x2="70" y2="40" opacity="0.25"/>
            </g>

            {/* Internal processing animations — clipped to the cube */}
            <g clipPath="url(#aiCubeClip)">
              {/* Core glow */}
              <ellipse cx="0" cy="40" rx="50" ry="40" fill="url(#aiCoreGlow)" className="axon-ai-core-glow"/>

              {/* Horizontal scan beam — sweeps top to bottom */}
              <rect x="-70" y="-20" width="140" height="22" fill="url(#aiScanGrad)" className="axon-ai-scan"/>

              {/* Animated grid of data nodes (lattice dots) */}
              <g className="axon-ai-lattice" fill="currentColor">
                <circle cx="-40" cy="10" r="1.2" style={{animationDelay: '0s'}}/>
                <circle cx="-20" cy="18" r="1.2" style={{animationDelay: '0.2s'}}/>
                <circle cx="0"   cy="26" r="1.2" style={{animationDelay: '0.4s'}}/>
                <circle cx="20"  cy="18" r="1.2" style={{animationDelay: '0.6s'}}/>
                <circle cx="40"  cy="10" r="1.2" style={{animationDelay: '0.8s'}}/>
                <circle cx="-40" cy="40" r="1.2" style={{animationDelay: '1.0s'}}/>
                <circle cx="-20" cy="50" r="1.2" style={{animationDelay: '0.3s'}}/>
                <circle cx="0"   cy="58" r="1.5" style={{animationDelay: '0.5s'}}/>
                <circle cx="20"  cy="50" r="1.2" style={{animationDelay: '0.7s'}}/>
                <circle cx="40"  cy="40" r="1.2" style={{animationDelay: '0.9s'}}/>
                <circle cx="-30" cy="70" r="1.2" style={{animationDelay: '0.1s'}}/>
                <circle cx="0"   cy="80" r="1.4" style={{animationDelay: '0.4s'}}/>
                <circle cx="30"  cy="70" r="1.2" style={{animationDelay: '0.6s'}}/>
              </g>

              {/* Data stream — flowing diagonal lines on left face */}
              <g className="axon-ai-streams" stroke="currentColor" strokeWidth="0.6" fill="none" strokeLinecap="round">
                <line x1="-70" y1="22" x2="-52" y2="31" className="axon-ai-stream-l" style={{animationDelay: '0s'}}/>
                <line x1="-70" y1="38" x2="-52" y2="47" className="axon-ai-stream-l" style={{animationDelay: '0.6s'}}/>
                <line x1="-70" y1="54" x2="-52" y2="63" className="axon-ai-stream-l" style={{animationDelay: '1.2s'}}/>
                <line x1="70"  y1="22" x2="52"  y2="31" className="axon-ai-stream-r" style={{animationDelay: '0.3s'}}/>
                <line x1="70"  y1="38" x2="52"  y2="47" className="axon-ai-stream-r" style={{animationDelay: '0.9s'}}/>
                <line x1="70"  y1="54" x2="52"  y2="63" className="axon-ai-stream-r" style={{animationDelay: '1.5s'}}/>
              </g>

              {/* Central rotating accent ring */}
              <g className="axon-ai-ring" transform="translate(0, 50)">
                <ellipse cx="0" cy="0" rx="28" ry="12" fill="none" stroke="#C9A455" strokeWidth="0.6" strokeDasharray="2 4" opacity="0.7"/>
                <circle cx="28" cy="0" r="1.8" fill="#C9A455"/>
              </g>

              {/* Central pulse dot — the "brain" */}
              <circle cx="0" cy="50" r="2.5" fill="#C9A455" className="axon-ai-core-dot"/>
            </g>

            {/* Edge "model" labels — 3 IAs in orbit */}
            <g className="axon-ai-models" fontFamily="ui-monospace, monospace" fontSize="5.5" letterSpacing="0.3" opacity="0.7">
              <text x="-78" y="10" textAnchor="end" className="axon-ai-model" style={{animationDelay: '0s'}}>CLAUDE</text>
              <text x="78" y="10" textAnchor="start" className="axon-ai-model" style={{animationDelay: '0.8s'}}>GPT-4</text>
              <text x="0" y="-28" textAnchor="middle" className="axon-ai-model" style={{animationDelay: '1.6s'}}>GEMINI</text>
            </g>

            <text y="140" textAnchor="middle" className="axon-num">02</text>
            <text y="162" textAnchor="middle" className="axon-title">IA ANALISA &amp; GERA</text>
            <text y="182" textAnchor="middle" className="axon-desc">17 estágios · 3 modelos paralelos</text>
          </g>

          {/* Arrow 2->3 */}
          <g className="axon-connector" transform="translate(760, 160)">
            <line x1="0" y1="0" x2="190" y2="0" strokeWidth="0.8" strokeDasharray="3 3"/>
            <polyline points="184,-5 192,0 184,5" fill="none" strokeWidth="1"/>
            <text x="95" y="-8" textAnchor="middle" className="axon-conn-label">CURADORIA</text>
          </g>

          {/* Stage 3 — Output: fanned reels from different properties */}
          <g transform="translate(1020, 130)" className="axon-stage axon-stage-reels">
            <defs>
              <clipPath id="reelClip1"><rect x="-28" y="-44" width="56" height="100" rx="4"/></clipPath>
              <clipPath id="reelClip2"><rect x="-28" y="-44" width="56" height="100" rx="4"/></clipPath>
              <clipPath id="reelClip3"><rect x="-28" y="-44" width="56" height="100" rx="4"/></clipPath>
              <linearGradient id="reelGrade" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(14,21,32,0.35)"/>
                <stop offset="55%" stopColor="rgba(14,21,32,0)"/>
                <stop offset="100%" stopColor="rgba(14,21,32,0.85)"/>
              </linearGradient>
            </defs>

            {/* Back reel — Vista beira-mar, rotated left */}
            <g transform="rotate(-14) translate(-22, 6)" className="axon-reel axon-reel-back">
              <rect x="-30" y="-46" width="60" height="104" rx="5" fill="#0E1520"/>
              <image href="/landing/assets/hero-vista.jpg" x="-28" y="-44" width="56" height="100" preserveAspectRatio="xMidYMid slice" clipPath="url(#reelClip1)" opacity="0.9"/>
              <rect x="-28" y="-44" width="56" height="100" rx="4" fill="url(#reelGrade)" clipPath="url(#reelClip1)"/>
              <rect x="-30" y="-46" width="60" height="104" rx="5" fill="none" stroke="currentColor" strokeWidth="0.8" opacity="0.7"/>
              {/* progress bars */}
              <g opacity="0.85">
                <rect x="-24" y="-40" width="10" height="1" rx="0.5" fill="#FFFFFF"/>
                <rect x="-12" y="-40" width="14" height="1" rx="0.5" fill="#FFFFFF" opacity="0.5"/>
                <rect x="4"   y="-40" width="14" height="1" rx="0.5" fill="#FFFFFF" opacity="0.25"/>
              </g>
              <text x="-22" y="-32" fill="#F4EEDF" fontFamily="ui-monospace, monospace" fontSize="3.5" letterSpacing="0.3">@orlaimóveis</text>
              <text x="-22" y="48" fill="#F4EEDF" fontFamily="'Playfair Display', serif" fontSize="6" fontStyle="italic">frente mar</text>
            </g>

            {/* Front reel — Mansão Othon, center, animated */}
            <g transform="translate(0, 0)" className="axon-reel axon-reel-front">
              <rect x="-30" y="-46" width="60" height="104" rx="5" fill="#0E1520"/>
              <image href="/landing/assets/hero-building.jpg" x="-28" y="-44" width="56" height="100" preserveAspectRatio="xMidYMid slice" clipPath="url(#reelClip2)" className="axon-reel-img"/>
              <rect x="-28" y="-44" width="56" height="100" rx="4" fill="url(#reelGrade)" clipPath="url(#reelClip2)"/>
              <rect x="-30" y="-46" width="60" height="104" rx="5" fill="none" stroke="#C9A455" strokeWidth="1" opacity="0.95"/>
              {/* progress bars */}
              <g>
                <rect x="-24" y="-40" width="16" height="1" rx="0.5" fill="#FFFFFF"/>
                <rect x="-6" y="-40" width="10" height="1" rx="0.5" fill="#FFFFFF">
                  <animate attributeName="width" from="0" to="10" dur="2.4s" repeatCount="indefinite"/>
                </rect>
                <rect x="6"  y="-40" width="12" height="1" rx="0.5" fill="#FFFFFF" opacity="0.35"/>
              </g>
              <text x="-22" y="-32" fill="#F4EEDF" fontFamily="ui-monospace, monospace" fontSize="3.5" letterSpacing="0.3">@mouradubeux</text>
              <text x="-22" y="44" fill="#C9A455" fontFamily="ui-monospace, monospace" fontSize="2.8" letterSpacing="0.4">ONDE VIVER</text>
              <text x="-22" y="52" fill="#F4EEDF" fontFamily="'Playfair Display', serif" fontSize="6" fontStyle="italic">é um conceito.</text>
              {/* play button */}
              <g className="axon-reel-play">
                <circle cx="0" cy="6" r="6" fill="rgba(255,255,255,0.2)" stroke="rgba(255,255,255,0.8)" strokeWidth="0.6"/>
                <path d="M -2 3 L 3 6 L -2 9 Z" fill="#FFFFFF"/>
              </g>
              {/* heart icon */}
              <g transform="translate(20, 20)" opacity="0.9">
                <path d="M 0 2 a 2 2 0 0 1 3 0 a 2 2 0 0 1 3 0 a 2 2 0 0 1 0 3 l -3 3 l -3 -3 a 2 2 0 0 1 0 -3 z" fill="none" stroke="#FFFFFF" strokeWidth="0.5"/>
              </g>
            </g>

            {/* Front-right reel — Interior, rotated right */}
            <g transform="rotate(14) translate(22, 6)" className="axon-reel axon-reel-right">
              <rect x="-30" y="-46" width="60" height="104" rx="5" fill="#0E1520"/>
              <image href="/landing/assets/hero-interior.jpg" x="-28" y="-44" width="56" height="100" preserveAspectRatio="xMidYMid slice" clipPath="url(#reelClip3)" opacity="0.9"/>
              <rect x="-28" y="-44" width="56" height="100" rx="4" fill="url(#reelGrade)" clipPath="url(#reelClip3)"/>
              <rect x="-30" y="-46" width="60" height="104" rx="5" fill="none" stroke="currentColor" strokeWidth="0.8" opacity="0.7"/>
              <g opacity="0.85">
                <rect x="-24" y="-40" width="14" height="1" rx="0.5" fill="#FFFFFF" opacity="0.6"/>
                <rect x="-8"  y="-40" width="12" height="1" rx="0.5" fill="#FFFFFF"/>
                <rect x="6"   y="-40" width="12" height="1" rx="0.5" fill="#FFFFFF" opacity="0.25"/>
              </g>
              <text x="-22" y="-32" fill="#F4EEDF" fontFamily="ui-monospace, monospace" fontSize="3.5" letterSpacing="0.3">@altopadrao</text>
              <text x="-22" y="48" fill="#F4EEDF" fontFamily="'Playfair Display', serif" fontSize="6" fontStyle="italic">suíte máster</text>
            </g>

            {/* Engagement counters floating */}
            <g className="axon-reel-stats" fontFamily="ui-monospace, monospace" fontSize="4.5" letterSpacing="0.15" fill="currentColor" opacity="0.75">
              <g transform="translate(44, -28)">
                <circle cx="0" cy="0" r="1.4" fill="#C9A455"/>
                <text x="4" y="1.5">12.4K</text>
              </g>
              <g transform="translate(-54, -8)">
                <circle cx="0" cy="0" r="1.4" fill="#C9A455"/>
                <text x="-4" y="1.5" textAnchor="end">328</text>
              </g>
              <g transform="translate(48, 34)">
                <circle cx="0" cy="0" r="1.4" fill="#C9A455"/>
                <text x="4" y="1.5">1.2K</text>
              </g>
            </g>

            <text y="110" textAnchor="middle" className="axon-num">03</text>
            <text y="132" textAnchor="middle" className="axon-title">APROVA &amp; PUBLICA</text>
            <text y="152" textAnchor="middle" className="axon-desc">WhatsApp · Instagram · Web</text>
          </g>

          {/* Bottom dimension */}
          <g className="axon-dim" transform="translate(0, 390)">
            <line x1="180" y1="0" x2="1020" y2="0"/>
            <line x1="180" y1="-6" x2="180" y2="6"/>
            <line x1="1020" y1="-6" x2="1020" y2="6"/>
            <text x="600" y="-8" textAnchor="middle" className="axon-conn-label">≤ 15 MIN · DO UPLOAD À PRIMEIRA PEÇA</text>
          </g>
        </svg>
      </div>
    </div>
  </section>
);

// Preview cards — one per pipeline stage, showing the actual artifact at each step
const PipelinePreviewCards = () => {
  const [reelPlay, setReelPlay] = useState(true);
  const [carouselIdx, setCarouselIdx] = useState(0);
  const carousel = [
    { src: '/landing/assets/hero-vista.jpg',     tag: 'Vista beira-mar' },
    { src: '/landing/assets/hero-moodboard.jpg', tag: 'Mood board' },
    { src: '/landing/assets/hero-interior.jpg',  tag: 'Suíte máster' },
    { src: '/landing/assets/hero-building.jpg',  tag: 'Fachada' },
  ];
  useEffect(() => {
    const t = setInterval(() => setCarouselIdx(i => (i + 1) % carousel.length), 2600);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="ppc-row">
      {/* 01 · Book de origem */}
      <div className="ppc-card ppc-book">
        <div className="ppc-stage-label">
          <span className="ppc-stage-num">01</span>
          <span className="ppc-stage-sep">—</span>
          <span className="ppc-stage-name">MATERIAL DE ORIGEM</span>
        </div>
        <div className="ppc-surface ppc-book-surface">
          <div className="ppc-book-stack">
            <div className="ppc-book-page ppc-book-page-3" style={{backgroundImage: "url('/landing/assets/hero-gardens.jpg')"}}/>
            <div className="ppc-book-page ppc-book-page-2" style={{backgroundImage: "url('/landing/assets/hero-moodboard.jpg')"}}/>
            <div className="ppc-book-page ppc-book-page-1" style={{backgroundImage: "url('/landing/assets/hero-vista.jpg')"}}>
              <div className="ppc-book-cover-label">
                <span className="ppc-book-cover-sub">LUXURY RESIDENCES</span>
                <span className="ppc-book-cover-title">Mansão<br/><em>Othon</em></span>
                <span className="ppc-book-cover-meta">BOOK · 48 PP · PDF</span>
              </div>
              <div className="ppc-book-cover-shade"/>
            </div>
          </div>
        </div>
        <div className="ppc-caption">Book editorial enviado pelo cliente — PDF com plantas, renders e memorial.</div>
      </div>

      {/* 02 · Reel gerado */}
      <div className="ppc-card ppc-reel">
        <div className="ppc-stage-label">
          <span className="ppc-stage-num">02</span>
          <span className="ppc-stage-sep">—</span>
          <span className="ppc-stage-name">REEL · 9 : 16 · 30"</span>
        </div>
        <div className="ppc-surface ppc-reel-surface">
          <div className="ppc-phone">
            <div className={`ppc-phone-frame ${reelPlay ? 'playing' : ''}`}>
              <div className="ppc-phone-bg" style={{backgroundImage: "url('/landing/assets/hero-building.jpg')"}}/>
              <div className="ppc-phone-grade"/>
              {/* status bar */}
              <div className="ppc-phone-status">
                <span>9:41</span>
                <span className="ppc-notch"/>
                <span className="ppc-dots"><i/><i/><i/><i/></span>
              </div>
              {/* IG-style overlay */}
              <div className="ppc-phone-topline">
                <div className="ppc-phone-avatar"/>
                <div className="ppc-phone-user">
                  <div className="ppc-phone-handle">@mouradubeux</div>
                  <div className="ppc-phone-time">há 2h · Seguir</div>
                </div>
                <span className="ppc-phone-more">•••</span>
              </div>
              {/* typographic caption anim */}
              <div className="ppc-phone-caption">
                <span className="ppc-caption-kicker">ONDE VIVER</span>
                <span className="ppc-caption-hero">é um <em>conceito.</em></span>
                <span className="ppc-caption-tag">#luxuryresidences</span>
              </div>
              {/* progress */}
              <div className="ppc-phone-progress">
                <span/><span/><span/>
              </div>
              {/* play button */}
              <button className="ppc-phone-play" onClick={() => setReelPlay(p => !p)} aria-label={reelPlay ? 'Pausar' : 'Tocar'}>
                {reelPlay ? (
                  <svg viewBox="0 0 24 24" fill="currentColor"><rect x="7" y="5" width="3.5" height="14" rx="1"/><rect x="13.5" y="5" width="3.5" height="14" rx="1"/></svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 5 L19 12 L7 19 Z"/></svg>
                )}
              </button>
              {/* side actions */}
              <div className="ppc-phone-actions">
                <div className="ppc-phone-action"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg><span>12.4K</span></div>
                <div className="ppc-phone-action"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><span>328</span></div>
                <div className="ppc-phone-action"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg><span>1.2K</span></div>
              </div>
            </div>
          </div>
        </div>
        <div className="ppc-caption">Reel vertical com narração, legendas sincronizadas e cortes cinematográficos.</div>
      </div>

      {/* 03 · Carrossel publicado */}
      <div className="ppc-card ppc-carousel">
        <div className="ppc-stage-label">
          <span className="ppc-stage-num">03</span>
          <span className="ppc-stage-sep">—</span>
          <span className="ppc-stage-name">CARROSSEL · 8 LÂMINAS</span>
        </div>
        <div className="ppc-surface ppc-carousel-surface">
          <div className="ppc-carousel-frame">
            {carousel.map((c, i) => {
              const offset = i - carouselIdx;
              return (
                <div
                  key={i}
                  className="ppc-carousel-slide"
                  style={{
                    backgroundImage: `url('${c.src}')`,
                    transform: `translate(-50%, -50%) translateX(${offset * 58}%) scale(${offset === 0 ? 1 : 0.82})`,
                    opacity: Math.abs(offset) > 1 ? 0 : (offset === 0 ? 1 : 0.5),
                    zIndex: 10 - Math.abs(offset),
                  }}
                >
                  <div className="ppc-carousel-tag">{c.tag}</div>
                  <div className="ppc-carousel-slide-num">{String(i + 1).padStart(2, '0')}/{String(carousel.length).padStart(2, '0')}</div>
                </div>
              );
            })}
            <div className="ppc-carousel-dots">
              {carousel.map((_, i) => (
                <button key={i} className={`ppc-carousel-dot ${i === carouselIdx ? 'active' : ''}`} onClick={() => setCarouselIdx(i)} aria-label={`slide ${i+1}`}/>
              ))}
            </div>
          </div>
        </div>
        <div className="ppc-caption">Lâminas quadradas com ritmo editorial — capa, insights, CTA final.</div>
      </div>
    </div>
  );
};

// ============================ DIFERENCIAIS ============================
const Diferenciais = () => {
  const items = [
    { n: 'I',   t: 'Pipeline de 17 estágios', d: 'Extração, análise semântica, scoring, curadoria, geração, revisão e QA automatizado — como um atelier dividido em bancadas.', tag: 'Arquitetura' },
    { n: 'II',  t: 'Três IAs em orquestra', d: 'Claude, GPT-4 e Gemini. Cada modelo no que faz de melhor — narrativa, análise visual e síntese.', tag: 'Multi-modelo' },
    { n: 'III', t: 'Identidade preservada', d: 'Paleta, logo, tipografia e tom de voz aprendidos do seu material e aplicados em todas as peças.', tag: 'Brand-aware' },
    { n: 'IV',  t: 'Narração TTS profissional', d: 'Vozes neurais em português do Brasil com cadência adequada ao segmento premium.', tag: 'Áudio' },
    { n: 'V',   t: 'Correlação texto-imagem', d: 'Cada imagem gerada corresponde ao parágrafo certo. Nenhuma incoerência entre o produto e a narrativa.', tag: 'Coerência' },
    { n: 'VI',  t: 'Scoring de qualidade', d: 'Cada peça é avaliada antes de chegar a você. Só passa o que atinge o limiar de aprovação editorial.', tag: 'QA' },
  ];
  return (
    <section>
      <div className="container">
        <div className="section-header">
          <div className="eyebrow">§ III · Diferenciais</div>
          <h2 className="section-title">Não é um wrapper sobre ChatGPT.<br/>É um <em>atelier de conteúdo editorial</em>.</h2>
        </div>
        <div className="editorial-grid editorial-grid-3">
          {items.map(x => (
            <div key={x.t} className="editorial-cell">
              <div className="editorial-num">{x.n}</div>
              <h3 className="editorial-title">{x.t}</h3>
              <p className="editorial-desc">{x.d}</p>
              <div className="editorial-tag">{x.tag}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

// ============================ SOCIAL PROOF ============================
const SocialProof = () => {
  const [idx, setIdx] = useState(0);
  const tests = [
    { q: 'Em três semanas, automatizei o que minha assistente fazia em dois dias por lançamento. O ROI apareceu no primeiro book.', n: 'Rafael Andrade', r: 'Corretor · Faria Lima, SP', loc: 'SÃO PAULO', metric: '8h → 12 min', metricLabel: 'Tempo por lançamento' },
    { q: 'O nível do podcast gerado surpreendeu o cliente. Acharam que tinha sido produzido por estúdio. Fechamos três VGVs acima de oito dígitos.', n: 'Camila Borges', r: 'Sócia · Borges & Vasconcelos Imóveis', loc: 'RIO DE JANEIRO', metric: '3 VGVs', metricLabel: 'Fechados em 60 dias' },
    { q: 'O diferencial não é só velocidade. É consistência. Toda a minha comunicação passou a ter a mesma estética, sem eu precisar pensar nisso.', n: 'Thiago Menezes', r: 'Diretor · MZS High-End', loc: 'BELO HORIZONTE', metric: '100%', metricLabel: 'Identidade preservada' },
    { q: 'Usamos o book do nosso empreendimento, mas também catálogos de joias e coleções da marca. Em todos, o resultado veio com a mesma sofisticação do material de origem.', n: 'Beatriz Rocha', r: 'Head de Marketing · Grupo Âncora', loc: 'CURITIBA', metric: '4 marcas', metricLabel: 'Ativas na plataforma' },
    { q: 'Mandamos o PDF do novo modelo e saímos com reels, stories e um podcast de 12 minutos. Nossos concessionários começaram a publicar no mesmo dia.', n: 'Felipe Tavares', r: 'Gerente Digital · Importadora Premium', loc: 'PORTO ALEGRE', metric: 'Same-day', metricLabel: 'Publicação em rede' },
  ];
  useEffect(() => {
    const t = setInterval(() => setIdx(i => (i + 1) % tests.length), 9000);
    return () => clearInterval(t);
  }, []);
  const featured = tests[idx];
  const secondary = tests.filter((_, i) => i !== idx);
  const roman = ['I', 'II', 'III', 'IV', 'V'];
  return (
    <section className="sp-editorial">
      <div className="container">
        <div className="section-header">
          <div className="eyebrow">§ IV · Prova Social</div>
          <h2 className="section-title">Imobiliárias, corretores e marcas premium já <em>devolvendo horas</em> para o que importa.</h2>
        </div>
        <div className="metrics-row">
          <div className="metric">
            <div className="metric-num">500<em>+</em></div>
            <div className="metric-label">Peças geradas em beta</div>
          </div>
          <div className="metric">
            <div className="metric-num">50<em>+</em></div>
            <div className="metric-label">Clientes ativos</div>
          </div>
          <div className="metric">
            <div className="metric-num">R$ 2,8<em>bi</em></div>
            <div className="metric-label">VGV divulgado pela plataforma</div>
          </div>
        </div>

        {/* Editorial testimonial layout: hero quote + secondary cards */}
        <div className="testimonial-editorial">
          {/* LEFT — featured hero quote */}
          <figure className="testimonial-hero" key={idx}>
            <div className="testimonial-hero-chrome">
              <span className="testimonial-hero-index">DEPOIMENTO · {roman[idx]} / V</span>
              <span className="testimonial-hero-loc">{featured.loc}</span>
            </div>
            <div className="testimonial-hero-mark" aria-hidden="true">“</div>
            <blockquote className="testimonial-hero-quote">{featured.q}</blockquote>
            <div className="testimonial-hero-rule"/>
            <figcaption className="testimonial-hero-author">
              <div className="testimonial-hero-avatar">{featured.n.split(' ').map(x => x[0]).slice(0,2).join('')}</div>
              <div className="testimonial-hero-meta">
                <div className="testimonial-hero-name">{featured.n}</div>
                <div className="testimonial-hero-role">{featured.r}</div>
              </div>
              <div className="testimonial-hero-kpi">
                <div className="testimonial-hero-kpi-num">{featured.metric}</div>
                <div className="testimonial-hero-kpi-label">{featured.metricLabel}</div>
              </div>
            </figcaption>

            {/* progress pips */}
            <div className="testimonial-hero-pips" role="tablist">
              {tests.map((_, i) => (
                <button
                  key={i}
                  className={`testimonial-pip ${i === idx ? 'active' : ''}`}
                  onClick={() => setIdx(i)}
                  aria-label={`Depoimento ${i + 1}`}
                >
                  <span className="testimonial-pip-num">{String(i + 1).padStart(2, '0')}</span>
                  <span className="testimonial-pip-bar"><span className="testimonial-pip-fill"/></span>
                </button>
              ))}
            </div>
          </figure>

          {/* RIGHT — stacked secondary cards */}
          <div className="testimonial-stack">
            {secondary.slice(0, 3).map((t) => {
              const origIdx = tests.indexOf(t);
              return (
                <figure key={t.n} className="testimonial-mini" onClick={() => setIdx(origIdx)}>
                  <div className="testimonial-mini-head">
                    <span className="testimonial-mini-index">{roman[origIdx]}</span>
                    <span className="testimonial-mini-rule"/>
                    <span className="testimonial-mini-loc">{t.loc}</span>
                  </div>
                  <blockquote className="testimonial-mini-quote">{t.q}</blockquote>
                  <figcaption className="testimonial-mini-author">
                    <span className="testimonial-mini-name">{t.n}</span>
                    <span className="testimonial-mini-role">{t.r}</span>
                  </figcaption>
                </figure>
              );
            })}
          </div>
        </div>

        {/* Logo strip — editorial roll of client categories */}
        <div className="testimonial-roll">
          <div className="testimonial-roll-label">EM USO POR</div>
          <div className="testimonial-roll-items">
            <span>Imobiliárias Boutique</span>
            <span className="testimonial-roll-sep">·</span>
            <span>Corretores Autônomos</span>
            <span className="testimonial-roll-sep">·</span>
            <span>Maisons de Luxo</span>
            <span className="testimonial-roll-sep">·</span>
            <span>Concessionárias Premium</span>
            <span className="testimonial-roll-sep">·</span>
            <span>Incorporadoras</span>
          </div>
        </div>
      </div>
    </section>
  );
};

// ============================ PRICING ============================
const Pricing = () => {
  const [annual, setAnnual] = useState(false);
  const plans = [
    {
      name: 'Starter', desc: 'Para o corretor autônomo começando a produzir.',
      monthly: 147, yearly: 118,
      features: ['1 book por mês', 'Pacote completo (12 peças)', 'Narração TTS em português', 'Exportação em MP4/JPG/PDF', 'Suporte por e-mail'],
      cta: 'Começar', featured: false, trial: false,
    },
    {
      name: 'Pro', desc: 'Para corretores que publicam toda semana.',
      monthly: 367, yearly: 294,
      features: ['3 books por mês', 'Tudo do Starter', 'Aprovação via WhatsApp', 'Publicação automática Instagram + Facebook', 'Preservação completa de identidade visual', 'Suporte prioritário'],
      cta: 'Experimentar 7 dias grátis', featured: true, trial: true,
    },
    {
      name: 'Agência', desc: 'Para imobiliárias e agências de marketing.',
      monthly: 659, yearly: 527,
      features: ['10 books por mês', 'Tudo do Pro', 'API de integração', 'SLA dedicado (4h úteis)', 'Gerente de conta', 'White-label disponível'],
      cta: 'Falar com vendas', featured: false, trial: false,
    },
  ];
  return (
    <section id="precos">
      <div className="container">
        <div className="section-header" style={{textAlign: 'center'}}>
          <div className="eyebrow" style={{justifyContent: 'center'}}>Preços</div>
          <h2 className="section-title" style={{marginLeft: 'auto', marginRight: 'auto', textAlign: 'center'}}>Um investimento que se paga <em>no primeiro lançamento</em>.</h2>
          <p className="section-subtitle" style={{marginLeft: 'auto', marginRight: 'auto', textAlign: 'center'}}>Sem fidelidade. Sem taxa de setup. Cancele a qualquer momento.</p>
          <div className="pricing-toggle-wrap">
            <div className="pricing-toggle">
              <div className="pricing-toggle-indicator" style={{
                left: annual ? '50%' : '4px',
                right: annual ? '4px' : '50%',
              }}/>
              <button className={!annual ? 'active' : ''} onClick={() => setAnnual(false)}>Mensal</button>
              <button className={annual ? 'active' : ''} onClick={() => setAnnual(true)}>Anual<span className="pricing-discount">-20%</span></button>
            </div>
          </div>
        </div>
        <div className="pricing-grid">
          {plans.map(p => (
            <div key={p.name} className={`price-card ${p.featured ? 'featured' : ''}`}>
              {p.featured && <div className="price-featured-badge">Mais popular</div>}
              <h3 className="price-name">{p.name}</h3>
              <p className="price-desc">{p.desc}</p>
              <div className="price-amount">
                <span className="price-currency">R$</span>
                <span className="price-value">{annual ? p.yearly : p.monthly}</span>
                <span className="price-period">/mês</span>
                {p.trial && <div className="price-trial">7 dias grátis · sem cartão</div>}
              </div>
              <ul className="price-features">
                {p.features.map(f => (
                  <li key={f}><Icon name="check" className="price-check"/>{f}</li>
                ))}
              </ul>
              <button className={`btn ${p.featured ? 'btn-primary' : 'btn-outline'} price-cta`}>{p.cta}<Icon name="arrow"/></button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

// ============================ FAQ ============================
const FAQ = () => {
  const [open, setOpen] = useState(0);
  const items = [
    { q: 'O que exatamente é um "book imobiliário"?', a: 'É o PDF comercial de um empreendimento — normalmente o material de lançamento com plantas, fotos, localização e dados do imóvel. Se você já vende de alto padrão, você provavelmente já tem vários.' },
    { q: 'Quanto tempo demora para gerar as peças?', a: 'Em média 12 a 15 minutos do upload até todas as 12 peças prontas. Books muito grandes (80+ páginas) podem levar até 25 minutos. Você recebe notificação quando cada peça fica pronta.' },
    { q: 'Posso editar o conteúdo gerado?', a: 'Sim. Todos os textos, legendas, capas e narrações podem ser ajustados no editor. Você também pode refazer peças individuais mantendo o restante.' },
    { q: 'Como funciona a narração por IA?', a: 'Usamos vozes neurais treinadas em português do Brasil, com cadência adequada ao segmento premium. Você pode escolher entre 6 timbres (masculinos e femininos) e ajustar velocidade e ênfase.' },
    { q: 'Quais formatos de arquivo vocês aceitam?', a: 'PDF é o principal. Também aceitamos arquivos do Canva (link compartilhado), Apresentações do Google e PowerPoint. Tamanho máximo: 100MB.' },
    { q: 'Minha identidade visual é preservada?', a: 'Sim. A IA lê cores, tipografia e tom do seu material e aplica consistentemente em todas as peças geradas. Você também pode salvar sua marca no perfil para aplicação automática.' },
    { q: 'Posso cancelar a qualquer momento?', a: 'Sim, sem perguntas e sem multa. Cancelamento pelo próprio dashboard ou WhatsApp. Os créditos do mês corrente permanecem ativos até o fim do ciclo.' },
    { q: 'Os dados dos meus clientes ficam seguros?', a: 'Seus PDFs e peças geradas são criptografadas em trânsito e em repouso. LGPD compliant. Nenhum dado seu é usado para treinar modelos de IA.' },
  ];
  return (
    <section id="faq">
      <div className="container">
        <div className="section-header" style={{textAlign: 'center'}}>
          <div className="eyebrow" style={{justifyContent: 'center'}}>FAQ</div>
          <h2 className="section-title" style={{marginLeft: 'auto', marginRight: 'auto', textAlign: 'center'}}>Perguntas <em>frequentes</em>.</h2>
        </div>
        <div className="faq-wrap">
          {items.map((item, i) => (
            <div key={i} className={`faq-item ${open === i ? 'open' : ''}`} onClick={() => setOpen(open === i ? -1 : i)}>
              <div className="faq-question">
                {item.q}
                <span className="faq-toggle"><Icon name="plus"/></span>
              </div>
              <div className="faq-answer">
                <div className="faq-answer-inner">{item.a}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

// ============================ FINAL CTA ============================
const FinalCTA = () => (
  <section className="final-cta">
    <div className="final-cta-glow"/>
    <div className="container final-cta-inner">
      <div className="badge" style={{justifyContent: 'center'}}>
        <span className="badge-dot"/> Últimas 40 vagas do beta
      </div>
      <h2 className="final-cta-title">
        Seu próximo lançamento merece uma <em>campanha à altura</em>.
      </h2>
      <p className="final-cta-sub">Teste 7 dias sem custo. Se não devolver horas à sua semana, devolvemos o investimento.</p>
      <div className="final-cta-ctas">
        <a href="#precos" className="btn btn-primary btn-large">Começar agora<Icon name="arrow"/></a>
        <a href="#" className="btn btn-outline btn-large"><Icon name="whatsapp"/>Falar com o time</a>
      </div>
      <div className="final-cta-guarantee">GARANTIA DE 7 DIAS · SEM CARTÃO · SEM FIDELIDADE</div>
    </div>
  </section>
);

// ============================ FOOTER ============================
const Footer = () => (
  <footer>
    <div className="container">
      <div className="footer-grid">
        <div className="footer-brand">
          <a href="#" className="logo">
            <span className="logo-mark"><Icon name="book"/></span>
            BookReel
          </a>
          <p>Transformamos books imobiliários em campanhas multimídia usando inteligência artificial.</p>
          <a href="#" className="footer-whatsapp"><Icon name="whatsapp"/>(11) 9 8888-7777</a>
        </div>
        <div className="footer-col">
          <h4>Produto</h4>
          <ul>
            <li>Funcionalidades</li>
            <li>Preços</li>
            <li>API</li>
            <li>Changelog</li>
            <li>Roadmap</li>
          </ul>
        </div>
        <div className="footer-col">
          <h4>Empresa</h4>
          <ul>
            <li>Sobre</li>
            <li>Casos de uso</li>
            <li>Parceiros</li>
            <li>Carreiras</li>
            <li>Contato</li>
          </ul>
        </div>
        <div className="footer-col">
          <h4>Legal</h4>
          <ul>
            <li>Termos de uso</li>
            <li>Política de privacidade</li>
            <li>LGPD</li>
            <li>Segurança</li>
          </ul>
        </div>
      </div>
      <div className="footer-bottom">
        <span>© 2026 BookReel Tecnologia Ltda. Todos os direitos reservados.</span>
        <span className="footer-made"><span className="footer-brasil"/>FEITO NO BRASIL</span>
      </div>
    </div>
  </footer>
);

// ============================ TWEAKS PANEL ============================
const TweaksPanel = ({ tweaks, setTweak }) => {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    const onMsg = (e) => {
      if (e.data?.type === '__activate_edit_mode') setEnabled(true);
      if (e.data?.type === '__deactivate_edit_mode') setEnabled(false);
    };
    window.addEventListener('message', onMsg);
    // Sprint NEW SITE: postMessage para iframe parent só faz sentido no edit-mode
    // do tooling original. Em prod standalone (Next.js), window.parent === window
    // — o try/catch evita "Permission denied" em cross-origin frames.
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: '__edit_mode_available' }, '*');
      }
    } catch { /* no-op */ }
    return () => window.removeEventListener('message', onMsg);
  }, []);

  const colors = [
    { id: 'gold',     noir: '#C9A84C', maison: '#8A6F2F', livroai: '#E8B648' },
    { id: 'platinum', noir: '#D8DCE0', maison: '#6E6A62', livroai: '#8892A8' },
    { id: 'emerald',  noir: '#4C9E7F', maison: '#3E6B52', livroai: '#4E8A6F' },
    { id: 'copper',   noir: '#C97B4C', maison: '#8A4F2A', livroai: '#D97B3E' },
  ];

  const intensityMap = {
    subtle:    { glow: 0.4, soft: 0.6 },
    moderate:  { glow: 1,   soft: 1 },
    prominent: { glow: 1.8, soft: 1.5 },
  };

  const hexToRgb = (hex) => {
    const h = hex.replace('#', '');
    return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', tweaks.theme || 'maison');
    const c = colors.find(x => x.id === tweaks.accent) || colors[0];
    const theme = tweaks.theme || 'maison';
    const isNoir = theme === 'noir';
    const isLivroai = theme === 'livroai';
    const hex = c[theme] || c.maison;
    const [r, g, b] = hexToRgb(hex);
    const intensity = intensityMap[tweaks.intensity] || intensityMap.moderate;
    const root = document.documentElement;
    root.style.setProperty('--accent', hex);
    // Livroai uses a brighter, warmer accent — bump glow/soft baselines
    const glowBase   = isLivroai ? 0.28 : 0.18;
    const softBase   = isLivroai ? 0.14 : (isNoir ? 0.12 : 0.08);
    const borderBase = isLivroai ? 0.45 : (isNoir ? 0.28 : 0.35);
    root.style.setProperty('--accent-glow',   `rgba(${r}, ${g}, ${b}, ${(glowBase   * intensity.glow).toFixed(3)})`);
    root.style.setProperty('--accent-soft',   `rgba(${r}, ${g}, ${b}, ${(softBase   * intensity.soft).toFixed(3)})`);
    root.style.setProperty('--accent-border', `rgba(${r}, ${g}, ${b}, ${(borderBase * intensity.soft).toFixed(3)})`);
    // Livroai is bright/paper — keep grain very low so white stays white
    const grainOn = isLivroai ? '0.02' : (isNoir ? '0.035' : '0.055');
    root.style.setProperty('--grain-opacity', tweaks.grain ? grainOn : '0');
  }, [tweaks]);

  return (
    <div className={`tweaks-panel ${enabled ? 'visible' : ''}`}>
      <div className="tweaks-title"/>
      <div className="tweak-group">
        <label>Theme</label>
        <div className="tweak-pill-group">
          {[{id:'maison', label:'Maison'}, {id:'noir', label:'Noir'}, {id:'livroai', label:'Light'}].map(t => (
            <div key={t.id} className={`tweak-pill ${tweaks.theme === t.id ? 'active' : ''}`} onClick={() => setTweak('theme', t.id)}>
              {t.label}
            </div>
          ))}
        </div>
      </div>
      <div className="tweak-group">
        <label>Accent Color</label>
        <div className="color-swatches">
          {colors.map(c => (
            <div
              key={c.id}
              className={`swatch ${tweaks.accent === c.id ? 'active' : ''}`}
              style={{background: c[tweaks.theme] || c.maison}}
              onClick={() => setTweak('accent', c.id)}
            />
          ))}
        </div>
      </div>
      <div className="tweak-group">
        <label>Gold Intensity</label>
        <div className="tweak-pill-group">
          {['subtle', 'moderate', 'prominent'].map(v => (
            <div key={v} className={`tweak-pill ${tweaks.intensity === v ? 'active' : ''}`} onClick={() => setTweak('intensity', v)}>
              {v.slice(0, 4)}
            </div>
          ))}
        </div>
      </div>
      <div className="tweak-group tweak-switch">
        <label style={{marginBottom: 0}}>Grain texture</label>
        <div className={`tweak-toggle ${tweaks.grain ? 'on' : ''}`} onClick={() => setTweak('grain', !tweaks.grain)}/>
      </div>
    </div>
  );
};

// ============================ APP ============================
// Production defaults — Light theme ("livroai") matches the HTML preview
// shipped in the source ZIP. TweaksPanel só renderiza com ?dev=1 na URL.
const DEFAULT_TWEAKS = {
  theme: "livroai",
  accent: "gold",
  intensity: "moderate",
  grain: true,
};

const App = () => {
  const [tweaks, setTweaks] = useState(DEFAULT_TWEAKS);
  const [devMode, setDevMode] = useState(false);

  // Detecta ?dev=1 ou ?dev=true na query — só ativa o TweaksPanel em dev
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    const v = (sp.get("dev") || "").toLowerCase();
    setDevMode(v === "1" || v === "true");
    // Sincroniza data-theme no <html> com o valor inicial (substitui o
    // <html data-theme="..."> que o HTML preview do ZIP emitia)
    document.documentElement.setAttribute("data-theme", DEFAULT_TWEAKS.theme);
  }, []);

  // setTweak local — sem postMessage pro parent (não há iframe edit-mode em prod)
  const setTweak = (k, v) => {
    setTweaks((prev) => ({ ...prev, [k]: v }));
  };

  return (
    <>
      <Navbar/>
      <Hero/>
      <Problema/>
      <Demo/>
      <ComoFunciona/>
      <Diferenciais/>
      <SocialProof/>
      <Pricing/>
      <FAQ/>
      <FinalCTA/>
      <Footer/>
      {devMode && <TweaksPanel tweaks={tweaks} setTweak={setTweak}/>}
    </>
  );
};

export default App;

