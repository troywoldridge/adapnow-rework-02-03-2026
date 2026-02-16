import "server-only";

import type { Metadata } from "next";
import CareersListTracker from "@/components/analytics/CareersListTracker";
import ApplyButton from "@/components/analytics/ApplyButton";

// NOTE: Per project standards, fulfillment/pricing integrate via Sinalite.
// Image delivery: Cloudflare Images CDN
// https://imagedelivery.net/<ACCOUNT_HASH>/<IMAGE_ID>/<VARIANT_NAME>

export const metadata: Metadata = {
  title: "Careers | American Design And Printing",
  description:
    "Join American Design And Printing (ADAP). We’re building the best print & packaging experience online — designers, engineers, ops & support welcome!",
  openGraph: {
    title: "Careers at ADAP",
    description:
      "We’re hiring! Build premium print, packaging, and promo experiences with a modern web stack.",
    url: "/careers",
    type: "website",
    images: [
      {
        url: "https://imagedelivery.net/<ACCOUNT_HASH>/<GENERIC_OG_IMAGE_ID>/public",
      },
    ],
  },
  robots: { index: true, follow: true },
};

type Job = {
  id: string;
  title: string;
  location: string; // e.g. "Remote (US/CA)" or "Dallas, TX"
  type: "Full-time" | "Part-time" | "Contract";
  summary: string;
  responsibilities: string[];
  requirements: string[];
  niceToHaves?: string[];
  applyEmail?: string;
};

const ROLE_OG_IMAGE_ID: Record<string, string> = {
  "fe-engineer": "<IMAGE_ID_FE>",
  "ops-print": "<IMAGE_ID_OPS>",
  "outside-sales": "<IMAGE_ID_SALES>",
};

function siteUrl() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    "https://americandesignandprinting.com"
  );
}

function jobOgImageUrl(id: string) {
  const imgId = ROLE_OG_IMAGE_ID[id] || "<GENERIC_OG_IMAGE_ID>";
  return `https://imagedelivery.net/<ACCOUNT_HASH>/${imgId}/public`;
}

const OPEN_ROLES: Job[] = [
  {
    id: "fe-engineer",
    title: "Front-End Engineer (Next.js)",
    location: "Remote (US/CA)",
    type: "Full-time",
    summary:
      "Own delightful, performant product pages with dynamic pricing, image galleries, and checkout UX.",
    responsibilities: [
      "Ship accessible, responsive UI with Next.js + React.",
      "Integrate Cloudflare Images for lightning-fast galleries.",
      "Collaborate on product option flows and real-time pricing.",
    ],
    requirements: [
      "Strong React/Next.js experience.",
      "Modern JavaScript proficiency.",
      "API integration experience (REST/JSON).",
    ],
    niceToHaves: [
      "Tailwind CSS expertise.",
      "Experience with Drizzle ORM + Postgres.",
      "Familiarity with trade print workflows.",
    ],
    applyEmail: "careers@adap.com",
  },
  {
    id: "ops-print",
    title: "Print Operations Coordinator",
    location: "Remote / Hybrid",
    type: "Full-time",
    summary:
      "Coordinate order flows, proofs, and timelines with our trade print partners.",
    responsibilities: [
      "Review artworks & specs for print readiness.",
      "Track orders, shipping ETAs, and customer updates.",
      "Help refine SOPs for consistent quality and speed.",
    ],
    requirements: [
      "Detail-oriented and deadline-driven.",
      "Comfortable with spreadsheets and ticketing tools.",
      "Clear written and verbal communication.",
    ],
    niceToHaves: ["Hands-on print shop or trade print experience."],
    applyEmail: "careers@adap.com",
  },
  {
    id: "outside-sales",
    title: "Outside Sales Representative",
    location: "Remote (US/CA)",
    type: "Full-time",
    summary:
      "Drive new revenue by building relationships with SMB and enterprise buyers of print, packaging, and promo. You’ll prospect, demo, quote, and close — with strong ops support.",
    responsibilities: [
      "Prospect and qualify new accounts; build a healthy pipeline.",
      "Run discovery, present solutions, and deliver quotes on time.",
      "Own relationships post-sale and collaborate on reorders/upsells.",
      "Partner with ops to ensure accurate specs and deadlines.",
      "Maintain clean CRM hygiene and accurate forecasting.",
    ],
    requirements: [
      "2+ years in field/outside sales or B2B account management.",
      "Proficiency with CRM and email outreach tools.",
      "Strong written & verbal communication skills.",
      "Comfort discussing substrates, finishes, and turnarounds (or willingness to learn).",
    ],
    niceToHaves: [
      "Experience selling print, packaging, or promotional products.",
      "Existing book of business or established local network.",
    ],
    applyEmail: "careers@adap.com",
  },
];

// ———————————————————————————————————————————————————————————————
// JSON-LD helpers
// ———————————————————————————————————————————————————————————————

function orgLogoUrl() {
  return "https://imagedelivery.net/<ACCOUNT_HASH>/<ORG_LOGO_IMAGE_ID>/public";
}

function jobToJsonLd(job: Job) {
  const isRemote = /remote/i.test(job.location);
  const todayISO = new Date().toISOString().split("T")[0];

  const description = [
    job.summary,
    "",
    "Responsibilities:",
    ...job.responsibilities.map((r) => `• ${r}`),
    "",
    "Requirements:",
    ...job.requirements.map((r) => `• ${r}`),
    ...(job.niceToHaves?.length
      ? ["", "Nice to have:", ...job.niceToHaves.map((n) => `• ${n}`)]
      : []),
  ].join("\n");

  const url = `${siteUrl()}/careers#${encodeURIComponent(job.id)}`;

  const json: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: job.title,
    description,
    datePosted: todayISO,
    employmentType:
      job.type === "Full-time"
        ? "FULL_TIME"
        : job.type === "Part-time"
          ? "PART_TIME"
          : "CONTRACTOR",
    hiringOrganization: {
      "@type": "Organization",
      name: "American Design And Printing",
      sameAs: siteUrl(),
      logo: orgLogoUrl(),
    },
    identifier: {
      "@type": "PropertyValue",
      name: "ADAP",
      value: job.id,
    },
    directApply: true,
    url,
    image: jobOgImageUrl(job.id),
  };

  if (isRemote) {
    Object.assign(json, {
      jobLocationType: "TELECOMMUTE",
      applicantLocationRequirements: {
        "@type": "Country",
        name: "US/CA",
      },
    });
  } else {
    Object.assign(json, {
      jobLocation: [
        {
          "@type": "Place",
          address: {
            "@type": "PostalAddress",
            streetAddress: "—",
            addressLocality: "—",
            addressRegion: "—",
            postalCode: "—",
            addressCountry: "US",
          },
        },
      ],
    });
  }

  return json;
}

function JobsJsonLd() {
  const items = OPEN_ROLES.map(jobToJsonLd);
  const json = items.length === 1 ? items[0] : items;
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(json) }}
    />
  );
}

function JobsItemListJsonLd() {
  const list = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: OPEN_ROLES.map((job, idx) => ({
      "@type": "ListItem",
      position: idx + 1,
      url: `${siteUrl()}/careers#${encodeURIComponent(job.id)}`,
      name: job.title,
    })),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(list) }}
    />
  );
}

// ———————————————————————————————————————————————————————————————
// UI Components
// ———————————————————————————————————————————————————————————————

function ApplyMailto({ job }: { job: Job }) {
  const to = job.applyEmail?.trim() || "careers@adap.com";
  const subject = `Application: ${job.title}`;
  return `mailto:${to}?subject=${encodeURIComponent(subject)}`;
}

function JobCard({ job }: { job: Job }) {
  return (
    <article
      id={job.id}
      className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
    >
      <header className="mb-2">
        <h3 className="m-0 text-xl font-semibold">{job.title}</h3>
        <p className="mt-1 text-sm text-gray-600">
          {job.location} • {job.type}
        </p>
      </header>

      <p className="mt-3">{job.summary}</p>

      <section className="mt-4">
        <h4 className="text-base font-semibold">Responsibilities</h4>
        <ul className="list-disc pl-5">
          {job.responsibilities.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      </section>

      <section className="mt-4">
        <h4 className="text-base font-semibold">Requirements</h4>
        <ul className="list-disc pl-5">
          {job.requirements.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      </section>

      {job.niceToHaves?.length ? (
        <section className="mt-4">
          <h4 className="text-base font-semibold">Nice to have</h4>
          <ul className="list-disc pl-5">
            {job.niceToHaves.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <footer className="mt-5 flex flex-wrap gap-3">
        <ApplyButton
          jobSlug={job.id}
          jobTitle={job.title}
          location={job.location}
          employmentType={job.type}
          href={ApplyMailto({ job })}
          className="inline-flex items-center rounded-md border border-black px-4 py-2 font-medium hover:bg-black hover:text-white"
        >
          Apply now
        </ApplyButton>
      </footer>
    </article>
  );
}

export default function CareersPage() {
  const heroUrl =
    "https://imagedelivery.net/pJ0fKvjCAbyoF8aD0BGu8Q/a90ba357-76ea-48ed-1c65-44fff4401600/productHero";

  return (
    <main className="container mx-auto max-w-4xl px-6 py-12">
      <img
        src={heroUrl}
        alt="Join ADAP — Careers"
        className="mb-10 h-80 w-full rounded-lg object-cover"
        loading="eager"
        decoding="async"
        fetchPriority="high"
      />

      <CareersListTracker />

      <JobsJsonLd />
      <JobsItemListJsonLd />

      <h1 className="mb-4 text-3xl font-bold">Careers at ADAP</h1>

      <div className="prose">
        <p>
          We’re building the most delightful way to buy premium print, packaging,
          and promotional products online — with fast Cloudflare-powered images,
          real-time option pricing, and streamlined fulfillment with trusted
          trade partners. If you thrive on shipping great experiences and solving
          real customer problems, come build with us!
        </p>
      </div>

      <section className="prose mt-8">
        <h2>Why ADAP</h2>
        <ul>
          <li>
            <strong>Impact</strong> — Ship features that customers use daily.
          </li>
          <li>
            <strong>Quality</strong> — From substrate to UI polish, details
            matter.
          </li>
          <li>
            <strong>Modern stack</strong> — Next.js, Postgres (Drizzle ORM),
            Cloudflare Images CDN, and API integrations with trade print partners.
          </li>
          <li>
            <strong>Flexibility</strong> — Remote-friendly, async collaboration.
          </li>
        </ul>
      </section>

      <section className="prose mt-10">
        <h2>Open Roles</h2>
        <div className="mt-4 grid gap-6 sm:grid-cols-1">
          {OPEN_ROLES.length ? (
            OPEN_ROLES.map((job) => <JobCard key={job.id} job={job} />)
          ) : (
            <p>
              We’re not hiring for specific roles today, but we love meeting great
              people. Send your resume to{" "}
              <a href="mailto:careers@adap.com">careers@adap.com</a>.
            </p>
          )}
        </div>
      </section>

      <section className="prose mt-10">
        <h2>How to Apply</h2>
        <p>
          Email <a href="mailto:careers@adap.com">careers@adap.com</a> with your
          resume/portfolio and a brief note about why you’d be a great fit.
          Include links (GitHub, portfolio, Dribbble, etc.).
        </p>
      </section>
    </main>
  );
}
