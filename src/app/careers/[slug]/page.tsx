import "server-only";

import type { Metadata } from "next";
import { JOBS, jobToJsonLd, siteUrl, jobOgImageUrl } from "@/data/jobs";
import JobViewTracker from "@/components/analytics/JobViewTracker";
import ApplyButton from "@/components/analytics/ApplyButton";

type Params = { slug: string };

export async function generateStaticParams() {
  return JOBS.map((j) => ({ slug: j.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const job = JOBS.find((j) => j.slug === params.slug);

  if (!job) {
    return {
      title: "Role not found | Careers | American Design And Printing",
      robots: { index: false, follow: true },
    };
  }

  const canonical = `${siteUrl()}/careers/${job.slug}`;

  return {
    title: `${job.title} | Careers | American Design And Printing`,
    description: job.summary,
    alternates: { canonical },
    openGraph: {
      title: job.title,
      description: job.summary,
      url: canonical,
      type: "website",
      images: [{ url: jobOgImageUrl(job.slug) }],
    },
    robots: { index: true, follow: true },
  };
}

function mailtoForJob(job: (typeof JOBS)[number]) {
  const to = (job.applyEmail || "careers@adap.com").trim();
  const subject = `Application: ${job.title}`;
  return `mailto:${to}?subject=${encodeURIComponent(subject)}`;
}

export default function JobDetailPage({ params }: { params: Params }) {
  const job = JOBS.find((j) => j.slug === params.slug);

  if (!job) {
    return (
      <main className="container mx-auto max-w-3xl px-6 py-12 prose">
        <h1>Role not found</h1>
        <p>The position you’re looking for isn’t available.</p>
        <p>
          See all openings on the <a href="/careers">Careers page</a>.
        </p>
      </main>
    );
  }

  const jsonLd = jobToJsonLd(job);

  return (
    <main className="container mx-auto max-w-3xl px-6 py-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <JobViewTracker
        jobSlug={job.slug}
        jobTitle={job.title}
        location={job.location}
        employmentType={job.type}
      />

      <article className="prose">
        <p>
          <a href="/careers">← All Careers</a>
        </p>

        <h1 className="mb-2">{job.title}</h1>

        <p className="m-0 text-gray-600">
          {job.location} • {job.type}
        </p>

        <h2 className="mt-8">About the role</h2>
        <p>{job.summary}</p>

        <h3>Responsibilities</h3>
        <ul>
          {job.responsibilities.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>

        <h3>Requirements</h3>
        <ul>
          {job.requirements.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>

        {job.niceToHaves?.length ? (
          <>
            <h3>Nice to have</h3>
            <ul>
              {job.niceToHaves.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          </>
        ) : null}

        <p className="mt-8">
          Ready to apply?{" "}
          <ApplyButton
            jobSlug={job.slug}
            jobTitle={job.title}
            location={job.location}
            employmentType={job.type}
            href={mailtoForJob(job)}
            className="inline-flex items-center rounded-md border border-black px-3 py-1 no-underline hover:bg-black hover:text-white"
          >
            Email {(job.applyEmail || "careers@adap.com").trim()}
          </ApplyButton>{" "}
          with your resume/portfolio and a short intro.
        </p>
      </article>
    </main>
  );
}
