"use client";

import React from "react";
import { trackCareerEvent } from "@/lib/analyticsClient";

type Props = {
  jobSlug: string;
  jobTitle?: string;
  location?: string;
  employmentType?: string;
  href: string; // mailto: or external link
  children?: React.ReactNode;
  className?: string;

  /** Optional overrides (useful for forcing same-tab external links, etc.) */
  target?: React.HTMLAttributeAnchorTarget;
  rel?: string;

  /** Optional explicit label (recommended if children is not readable text) */
  ariaLabel?: string;
};

function isExternalHref(href: string): boolean {
  // Treat absolute http(s) as external. mailto: / tel: are not "external new tab" candidates.
  return /^https?:\/\//i.test(href);
}

export default function ApplyButton({
  jobSlug,
  jobTitle,
  location,
  employmentType,
  href,
  children = "Apply now",
  className,
  target,
  rel,
  ariaLabel,
}: Props) {
  const external = isExternalHref(href);

  const resolvedTarget = target ?? (external ? "_blank" : undefined);
  const resolvedRel = rel ?? (external ? "noopener noreferrer" : undefined);

  const resolvedAriaLabel =
    ariaLabel ??
    (typeof children === "string"
      ? `Apply now${jobTitle ? ` for ${jobTitle}` : ""}`
      : undefined);

  const onClick: React.MouseEventHandler<HTMLAnchorElement> = () => {
    try {
      trackCareerEvent("apply_click", {
        jobSlug,
        jobTitle,
        location,
        employmentType,
      });
    } catch {
      // Never block navigation if analytics fails
    }
    // For mailto: and normal links, let navigation happen naturally.
  };

  return (
    <a
      href={href}
      onClick={onClick}
      className={className}
      target={resolvedTarget}
      rel={resolvedRel}
      aria-label={resolvedAriaLabel}
    >
      {children}
    </a>
  );
}
