import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-24 text-center">
      <h1 className="text-4xl font-bold tracking-tight text-foreground mb-4">
        BookAgent Intelligence Engine
      </h1>
      <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
        Transforme materiais imobiliarios (PDF, video, audio) em conteudo multicanal:
        reels, blog posts, landing pages e mais.
      </p>
      <div className="flex items-center justify-center gap-4">
        <Link href="/upload">
          <Button size="lg">Novo Processamento</Button>
        </Link>
        <Link href="/dashboard">
          <Button variant="outline" size="lg">Ver Jobs</Button>
        </Link>
      </div>

      <div className="grid sm:grid-cols-3 gap-6 mt-16 text-left">
        {[
          { icon: "📄", title: "Upload inteligente", desc: "PDF, video, audio, PPTX — o engine detecta e processa automaticamente" },
          { icon: "🧠", title: "Pipeline de 17 etapas", desc: "Extracao, branding, narrativa, media plans, blog, landing page, scoring" },
          { icon: "📦", title: "Artefatos prontos", desc: "HTML, JSON render-spec, Markdown — prontos para publicacao ou renderizacao" },
        ].map((f) => (
          <div key={f.title} className="rounded-lg border p-6">
            <span className="text-3xl">{f.icon}</span>
            <h3 className="font-semibold mt-3 mb-1">{f.title}</h3>
            <p className="text-sm text-muted-foreground">{f.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
