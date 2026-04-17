import Link from "next/link";

export default function ManutencaoPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="max-w-md mx-auto px-6 text-center">
        <div className="flex items-center justify-center gap-2 mb-8">
          <span className="text-3xl">📘</span>
          <span className="text-2xl font-bold text-slate-900">BookReel</span>
        </div>

        <h1 className="text-2xl font-bold text-slate-900 mb-3">
          Estamos em manutencao
        </h1>

        <p className="text-slate-500 mb-8">
          Estamos fazendo melhorias importantes para voce. Voltaremos em breve.
        </p>

        <Link
          href="/"
          className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors"
        >
          Voltar para home
        </Link>
      </div>
    </div>
  );
}
