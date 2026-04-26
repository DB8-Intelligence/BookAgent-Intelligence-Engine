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
  title: "BookReel — Seu book imobiliário em 12 peças de conteúdo",
  description:
    "Envie o book do empreendimento. Em horas, receba reels, stories, carrosséis, podcast e landing — pronto para captar leads, nutrir e converter, mantendo a sofisticação do material original.",
};

export default function Page() {
  return <LandingApp />;
}
