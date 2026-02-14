import "server-only";

import React from "react";
import ArtworkNeededEmail from "@/emails/ArtworkNeededEmail";
import {
  getResendClient,
  getInvoicesFromEmail,
  getSupportEmail,
  getSupportPhone,
} from "@/lib/email/resend";

function logoUrl(): string | undefined {
  return (
    process.env.NEXT_PUBLIC_EMAIL_LOGO_URL ||
    "https://imagedelivery.net/pJ0fKvjCAbyoF8aD0BGu8Q/a90ba357-76ea-48ed-1c65-44fff4401600/productTile"
  );
}

export async function sendArtworkNeededEmail(args: {
  to: string;
  name: string;
  orderId: string | number;
  uploadUrl: string;
}) {
  const resend = getResendClient();

  const { data, error } = await resend.emails.send({
    from: getInvoicesFromEmail(),
    to: args.to,
    subject: `Artwork needed — order #${args.orderId}`,
    react: (
      <ArtworkNeededEmail
        name={args.name}
        orderId={args.orderId}
        uploadUrl={args.uploadUrl}
        logoUrl={logoUrl()}
        supportEmail={getSupportEmail()}
        supportPhone={getSupportPhone()}
      />
    ),
  });

  if (error) {
    throw new Error(`Resend send failed: ${JSON.stringify(error)}`);
  }

  return { ok: true, id: data?.id || null };
}
