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
  Hr,
  Img,
} from "@react-email/components";

type MoneyLine = { label: string; value: string };

interface OrderConfirmationEmailProps {
  name: string;
  orderId: string | number;
  orderTotal: string;

  orderDate?: string;
  orderUrl?: string;
  trackingUrl?: string;

  lines?: MoneyLine[];
  note?: string;

  supportEmail?: string;
  supportPhone?: string;
  supportUrl?: string;

  brandName?: string;
  brandTagline?: string;
  logoUrl?: string;
}

const styles = {
  body: {
    backgroundColor: "#f6f7fb",
    color: "#0f172a",
    fontFamily:
      'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, "Apple Color Emoji","Segoe UI Emoji"',
    margin: 0,
    padding: "24px 12px",
  } as React.CSSProperties,

  container: {
    maxWidth: 600,
    margin: "0 auto",
    backgroundColor: "#ffffff",
    borderRadius: 14,
    overflow: "hidden",
    border: "1px solid #e5e7eb",
    boxShadow: "0 10px 30px rgba(2, 6, 23, 0.08)",
  } as React.CSSProperties,

  header: {
    padding: "18px 20px",
    background:
      "linear-gradient(135deg, rgba(0,71,171,1) 0%, rgba(0,37,112,1) 100%)",
  } as React.CSSProperties,

  brandRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  } as React.CSSProperties,

  logo: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: "#ffffff",
    objectFit: "contain",
    display: "block",
  } as React.CSSProperties,

  brandText: {
    display: "flex",
    flexDirection: "column",
    lineHeight: 1.1,
  } as React.CSSProperties,

  brandName: {
    fontSize: 16,
    fontWeight: 800,
    color: "#ffffff",
    letterSpacing: "0.2px",
    margin: 0,
  } as React.CSSProperties,

  brandTagline: {
    fontSize: 12,
    color: "rgba(255,255,255,0.85)",
    margin: "2px 0 0 0",
  } as React.CSSProperties,

  content: {
    padding: "18px 20px 20px",
  } as React.CSSProperties,

  h1: {
    fontSize: 22,
    lineHeight: 1.25,
    fontWeight: 800,
    margin: "0 0 8px 0",
    color: "#0f172a",
  } as React.CSSProperties,

  p: {
    fontSize: 14,
    lineHeight: 1.6,
    margin: "0 0 10px 0",
    color: "#334155",
  } as React.CSSProperties,

  badgeRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    margin: "10px 0 14px",
  } as React.CSSProperties,

  badge: {
    display: "inline-block",
    fontSize: 12,
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid #e2e8f0",
    backgroundColor: "#f8fafc",
    color: "#0f172a",
    fontWeight: 700,
  } as React.CSSProperties,

  totalCard: {
    borderRadius: 12,
    border: "1px solid #e5e7eb",
    backgroundColor: "#f8fafc",
    padding: "12px 14px",
    margin: "14px 0 16px",
  } as React.CSSProperties,

  totalRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "baseline",
  } as React.CSSProperties,

  totalLabel: {
    fontSize: 12,
    color: "#475569",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.6px",
  } as React.CSSProperties,

  totalValue: {
    fontSize: 20,
    fontWeight: 900,
    color: "#0f172a",
  } as React.CSSProperties,

  table: {
    width: "100%",
    borderCollapse: "collapse",
    marginTop: 10,
  } as React.CSSProperties,

  tdLeft: {
    padding: "7px 0",
    fontSize: 13,
    color: "#334155",
  } as React.CSSProperties,

  tdRight: {
    padding: "7px 0",
    fontSize: 13,
    color: "#0f172a",
    textAlign: "right",
    fontWeight: 700,
    whiteSpace: "nowrap",
  } as React.CSSProperties,

  ctas: {
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 14,
  } as React.CSSProperties,

  primaryBtn: {
    backgroundColor: "#0047ab",
    color: "#ffffff",
    padding: "12px 16px",
    borderRadius: 10,
    textDecoration: "none",
    fontWeight: 800,
    fontSize: 14,
    display: "inline-block",
  } as React.CSSProperties,

  secondaryBtn: {
    backgroundColor: "#f1f5f9",
    color: "#0f172a",
    padding: "12px 16px",
    borderRadius: 10,
    textDecoration: "none",
    fontWeight: 800,
    fontSize: 14,
    display: "inline-block",
    border: "1px solid #e2e8f0",
  } as React.CSSProperties,

  noteBox: {
    marginTop: 14,
    padding: "12px 14px",
    borderRadius: 12,
    backgroundColor: "#fff7ed",
    border: "1px solid #fed7aa",
    color: "#7c2d12",
    fontSize: 13,
    lineHeight: 1.6,
  } as React.CSSProperties,

  footer: {
    padding: "14px 20px 18px",
    backgroundColor: "#0b1220",
  } as React.CSSProperties,

  footerText: {
    margin: 0,
    fontSize: 12,
    lineHeight: 1.6,
    color: "rgba(255,255,255,0.78)",
  } as React.CSSProperties,

  footerLink: {
    color: "#93c5fd",
    textDecoration: "underline",
    textUnderlineOffset: 2,
    fontWeight: 700,
  } as React.CSSProperties,

  hr: {
    borderColor: "#e5e7eb",
    margin: "14px 0",
  } as React.CSSProperties,
};

export default function OrderConfirmationEmail(props: OrderConfirmationEmailProps) {
  const {
    name,
    orderId,
    orderTotal,
    orderDate,
    orderUrl,
    trackingUrl,
    lines,
    note,
    supportEmail,
    supportPhone,
    supportUrl,
    brandName = "ADAP",
    brandTagline = "Custom Print Experts",
    logoUrl,
  } = props;

  const orderIdStr = String(orderId);
  const previewText = `Order confirmed — #${orderIdStr} • Total ${orderTotal}`;

  const hasSupport = Boolean(supportEmail || supportPhone || supportUrl);

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>

      <Body style={styles.body}>
        <Container style={styles.container}>
          <Section style={styles.header}>
            <div style={styles.brandRow as any}>
              {logoUrl ? (
                <Img
                  src={logoUrl}
                  alt={brandName}
                  width="44"
                  height="44"
                  style={styles.logo}
                />
              ) : null}

              <div style={styles.brandText as any}>
                <Text style={styles.brandName}>{brandName}</Text>
                <Text style={styles.brandTagline}>{brandTagline}</Text>
              </div>
            </div>
          </Section>

          <Section style={styles.content}>
            <Text style={styles.h1}>Thanks for your order, {name}!</Text>
            <Text style={styles.p}>
              We’ve received your order and it’s now in our system.
              {orderDate ? ` Placed on ${orderDate}.` : ""}
            </Text>

            <div style={styles.badgeRow as any}>
              <span style={styles.badge as any}>Order #{orderIdStr}</span>
              {trackingUrl ? <span style={styles.badge as any}>Tracking available</span> : null}
            </div>

            <div style={styles.totalCard}>
              <div style={styles.totalRow as any}>
                <span style={styles.totalLabel}>Order Total</span>
                <span style={styles.totalValue}>{orderTotal}</span>
              </div>

              {lines && lines.length ? (
                <>
                  <Hr style={styles.hr} />
                  <table style={styles.table}>
                    <tbody>
                      {lines.map((l) => (
                        <tr key={l.label}>
                          <td style={styles.tdLeft}>{l.label}</td>
                          <td style={styles.tdRight}>{l.value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              ) : null}
            </div>

            {(orderUrl || trackingUrl) ? (
              <div style={styles.ctas as any}>
                {orderUrl ? (
                  <Button href={orderUrl} style={styles.primaryBtn}>
                    View your order
                  </Button>
                ) : null}
                {trackingUrl ? (
                  <Button href={trackingUrl} style={styles.secondaryBtn}>
                    Track shipment
                  </Button>
                ) : null}
              </div>
            ) : null}

            {note ? <div style={styles.noteBox}>{note}</div> : null}

            <Hr style={styles.hr} />

            <Text style={{ ...styles.p, marginBottom: 0 }}>
              We’ll email updates as your order moves through production and shipping.
            </Text>
          </Section>

          <Section style={styles.footer}>
            {hasSupport ? (
              <Text style={styles.footerText}>
                Need help?{" "}
                {supportEmail ? (
                  <>
                    Email{" "}
                    <a style={styles.footerLink} href={`mailto:${supportEmail}`}>
                      {supportEmail}
                    </a>
                    {supportPhone || supportUrl ? " • " : ""}
                  </>
                ) : null}
                {supportPhone ? (
                  <>
                    Call{" "}
                    <a style={styles.footerLink} href={`tel:${supportPhone}`}>
                      {supportPhone}
                    </a>
                    {supportUrl ? " • " : ""}
                  </>
                ) : null}
                {supportUrl ? (
                  <>
                    Visit{" "}
                    <a style={styles.footerLink} href={supportUrl}>
                      Support Center
                    </a>
                  </>
                ) : null}
              </Text>
            ) : (
              <Text style={styles.footerText}>This is an automated email from {brandName}.</Text>
            )}

            <Text style={{ ...styles.footerText, marginTop: 10, opacity: 0.7 }}>
              If you didn’t place this order, reply to this email and we’ll help immediately.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
