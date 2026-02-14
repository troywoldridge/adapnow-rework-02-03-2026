import {
  Html,
  Head,
  Preview,
  Body,
  Container,
  Section,
  Text,
  Hr,
} from "@react-email/components";

type Line = { label: string; value: string };

export default function CustomOrderReceivedEmail(props: {
  company: string;
  requestId: string;
  quoteNumber: string;
  lines?: Line[];
  instructions?: string;
  supportEmail?: string;
  supportPhone?: string;
  brandName?: string;
  brandTagline?: string;
}) {
  const brandName = props.brandName || "ADAP";
  const brandTagline = props.brandTagline || "Custom Print Experts";

  const previewText = `Custom order submitted — Quote #${props.quoteNumber}`;

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>

      <Body style={{ background: "#f6f7fb", color: "#0f172a", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif" }}>
        <Container style={{ maxWidth: 640, margin: "24px auto", background: "#ffffff", borderRadius: 14, padding: 24, border: "1px solid #e5e7eb" }}>
          <Section>
            <Text style={{ fontSize: 12, color: "#64748b", margin: 0 }}>
              {brandName} • {brandTagline}
            </Text>

            <Text style={{ fontSize: 22, fontWeight: 800, margin: "10px 0 6px" }}>
              Custom order submitted ✅
            </Text>

            <Text style={{ fontSize: 16, margin: "0 0 12px", color: "#334155" }}>
              We received your custom order submission for <b>{props.company}</b>.
              We’ll confirm the next steps by email.
            </Text>

            <Text style={{ fontSize: 13, margin: "0 0 10px", color: "#64748b" }}>
              Request ID: <b>{props.requestId}</b>
            </Text>

            <Section style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: 14 }}>
              <Text style={{ fontSize: 14, margin: "6px 0" }}>
                <b>Quote #:</b> {props.quoteNumber}
              </Text>
              {props.lines?.map((l) => (
                <Text key={l.label} style={{ fontSize: 14, margin: "6px 0" }}>
                  <b>{l.label}:</b> {l.value}
                </Text>
              ))}
            </Section>

            {props.instructions ? (
              <>
                <Text style={{ fontSize: 14, margin: "14px 0 6px", fontWeight: 700 }}>Additional Notes</Text>
                <Text style={{ fontSize: 14, margin: 0, color: "#334155" }}>{props.instructions}</Text>
              </>
            ) : null}

            <Hr style={{ margin: "18px 0", borderColor: "#e5e7eb" }} />

            <Text style={{ fontSize: 13, color: "#64748b", margin: 0 }}>
              Questions? Email {props.supportEmail || "support@adapnow.com"}
              {props.supportPhone ? ` or call ${props.supportPhone}` : ""}.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
