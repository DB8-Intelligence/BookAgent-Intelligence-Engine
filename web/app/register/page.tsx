"use client";

import { useState } from "react";
import Link from "next/link";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = getSupabaseBrowser();

    const { error: authError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { name: name.trim() },
      },
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    setSuccess(true);
    setLoading(false);
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="max-w-sm mx-auto px-6 w-full text-center">
          <div className="text-4xl mb-4">📬</div>
          <h1 className="text-xl font-bold text-slate-900 mb-2">Verifique seu email</h1>
          <p className="text-sm text-slate-500 mb-6">
            Enviamos um link de confirmacao para <strong>{email}</strong>.
            Clique no link para ativar sua conta.
          </p>
          <Link href="/login">
            <Button variant="outline" className="w-full">Voltar para login</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="max-w-sm mx-auto px-6 w-full">
        <div className="flex items-center justify-center gap-2 mb-8">
          <span className="text-3xl">📘</span>
          <span className="text-2xl font-bold text-slate-900">BookReel</span>
        </div>

        <h1 className="text-xl font-bold text-slate-900 text-center mb-2">
          Criar conta
        </h1>
        <p className="text-sm text-slate-500 text-center mb-6">
          Comece a transformar seus books em conteudo.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-slate-700 mb-1">
              Nome
            </label>
            <Input
              id="name"
              type="text"
              placeholder="Seu nome"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">
              Email
            </label>
            <Input
              id="email"
              type="email"
              placeholder="seu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1">
              Senha
            </label>
            <Input
              id="password"
              type="password"
              placeholder="Minimo 6 caracteres"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 text-center">{error}</p>
          )}

          <Button
            type="submit"
            className="w-full"
            disabled={loading || !name.trim() || !email.trim() || password.length < 6}
          >
            {loading ? "Criando conta..." : "Criar conta"}
          </Button>
        </form>

        <p className="text-sm text-slate-500 text-center mt-6">
          Ja tem uma conta?{" "}
          <Link href="/login" className="text-slate-900 font-medium underline">
            Entrar
          </Link>
        </p>
      </div>
    </div>
  );
}
