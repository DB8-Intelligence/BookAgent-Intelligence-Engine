/**
 * /landing — redirecionado pra `/` (landing luxury "Arquitetos da Realidade").
 *
 * Mantido pra backward-compat de links externos/marketing antigos.
 */

import { redirect } from "next/navigation";

export default function LandingRedirect(): never {
  redirect("/");
}
