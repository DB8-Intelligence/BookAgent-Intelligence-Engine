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
          Acesso restrito
        </h1>

        <p className="text-slate-500 mb-8">
          O BookReel esta em beta fechado. Se voce tem um codigo de convite, use-o para acessar.
        </p>

        <div className="flex flex-col gap-3">
          <Link
            href="/beta"
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors"
          >
            Inserir codigo de convite
          </Link>
          <Link
            href="/"
            className="text-sm text-slate-500 hover:text-slate-700 transition-colors"
          >
            Voltar para home
          </Link>
        </div>
      </div>
    </div>
  );
}
