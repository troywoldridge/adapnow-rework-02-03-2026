import React from "react";
import {
  Html,
  Head,
  Preview,
  Body,
  Container,
  Section,
  Text,
  Button,
  Img,
} from "@react-email/components";

interface ArtworkNeededEmailProps {
  name: string;
  orderId: string | number;
  uploadUrl: string;

  brandName?: string;
  brandTagline?: string;
  logoUrl?: string;

  supportEmail?: string;
  supportPhone?: string;
}

const styles = {
  body: {
    backgroundColor: "#f6f7fb",
    fontFamily: "sans-serif",
    padding: "24px 12px",
  },
  container: {
    maxWidth: 600,
    margin: "0 auto",
    backgroundColor: "#ffffff",
    borderRadius: 12,
    border: "1px solid #e5e7eb",
    overflow: "hidden",
  },
  header: {
    background: "#0047ab",
    padding: "16px 20px",
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  logo: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: "#fff",
    objectFit: "contain",
  },
  brandText: {
    color: "#fff",
    fontWeight: 700,
  },
  content: {
    padding: "20px",
  },
  button: {
    background: "#0047ab",
    color: "#fff",
    padding: "12px 18px",
    borderRadius: 8,
    textDecoration: "none",
    fontWeight: 700,
    display: "inline-block",
    marginTop: 16,
  },
  note: {
    marginTop: 16,
    fontSize: 14,
    color: "#475569",
  },
};

export default function ArtworkNeededEmail({
  name,
  orderId,
  uploadUrl,
  brandName = "ADAP",
  brandTagline = "Custom Print Experts",
  logoUrl,
  supportEmail,
  supportPhone,
}: ArtworkNeededEmailProps) {
  const orderIdStr = String(orderId);

  return (
    <Html>
      <Head />
      <Preview>Artwork needed for order #{orderIdStr}</Preview>

      <Body style={styles.body}>
        <Container style={styles.container}>
          <Section style={styles.header}>
            {logoUrl ? <Img src={logoUrl} style={styles.logo} /> : null}
            <div style={styles.brandText}>
              {brandName}
              <div style={{ fontSize: 12, opacity: 0.85 }}>{brandTagline}</div>
            </div>
          </Section>

          <Section style={styles.content}>
            <Text style={{ fontSize: 20, fontWeight: 700 }}>
              Hi {name},
            </Text>

            <Text>
              Your order <strong>#{orderIdStr}</strong> is waiting for artwork
              before production can begin.
            </Text>

            <Text>
              Upload your files now so we can start printing right away.
            </Text>

            <Button href={uploadUrl} style={styles.button}>
              Upload Artwork
            </Button>

            <Text style={styles.note}>
              Need help preparing files? Reply to this email
              {supportEmail ? ` or email ${supportEmail}` : ""}
              {supportPhone ? ` or call ${supportPhone}` : ""}.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
