import "server-only";

import { redirect } from "next/navigation";
import { stripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SP = { session_id?: string };

export default async function SuccessPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const { session_id } = await searchParams;

  // If no session, just land them on Account
  if (!session_id || typeof session_id !== "string") {
    redirect("/account?paid=1");
  }

  // Best-effort verify the Checkout Session is paid
  try {
    const session = await stripe.checkout.sessions.retrieve(session_id, {
      expand: ["payment_intent"],
    });

    if (session?.payment_status !== "paid") {
      // If user reloaded or something odd, send them back safely
      redirect("/cart/review?canceled=1");
    }
  } catch {
    // If we can't verify for any reason, fail safe (don't show success UX)
    redirect("/cart/review?canceled=1");
  }

  // Head to My Account (your account page will show the latest order)
  redirect("/account?paid=1");
}
