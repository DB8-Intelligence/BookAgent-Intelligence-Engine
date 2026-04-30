/**
 * /landing — site público bookreel.ai
 *
 * Substitui o redirect anterior (Sprint pré-NEW-SITE) que mandava /landing → /.
 * Agora `/landing` é o destino canônico do site público (chamado pelo middleware
 * quando Host=bookreel.ai). A landing antiga em `/` (page.tsx INTERMETRIX)
 * permanece intacta — bookreel.app continua exibindo a landing legada por
 * enquanto, até decisão sobre dashboard-only no .app.
 *
 * Implementação: importa os 3 CSS files do pacote original (Light theme via
 * data-theme="livroai") e renderiza o LandingApp client component.
 */

import LandingApp from "./_components/LandingApp.jsx";

// CSS do pacote original — escopado a esta rota via Next.js (app router carrega
// per-segment). Ordem importa: theme antes de styles antes de editorial.
import "./theme.css";
import "./styles.css";
import "./editorial.css";

export const metadata = {
  metadataBase: new URL("https://bookreel.ai"),
  title: "BookReel — Seu book imobiliário em 12 peças de conteúdo em 15 minutos",
  description:
    "Envie o book do empreendimento. Em 15 minutos, receba reels, stories, carrosséis, podcast e landing — pronto para captar leads, nutrir e converter, mantendo a sofisticação do material original.",
  alternates: {
    canonical: "https://bookreel.ai",
  },
  openGraph: {
    title: "BookReel — 12 peças de conteúdo a partir do seu book imobiliário",
    description:
      "Para imobiliárias, corretores e marcas que vendem com book. Em 15 minutos, do PDF a reels, stories, carrosséis, podcast e landing — preservando sua identidade.",
    url: "https://bookreel.ai",
    siteName: "BookReel",
    images: [
      {
        url: "/landing/assets/hero-building.jpg",
        width: 1200,
        height: 630,
        alt: "Empreendimento de alto padrão — exemplo de book processado pelo BookReel",
      },
    ],
    locale: "pt_BR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "BookReel — 12 peças de conteúdo em 15 minutos",
    description:
      "Para imobiliárias, corretores e marcas que vendem com book.",
    images: ["/landing/assets/hero-building.jpg"],
  },
};

export default function Page() {
  return <LandingApp />;
}
