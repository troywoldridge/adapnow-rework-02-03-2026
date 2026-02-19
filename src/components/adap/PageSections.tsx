import Link from "next/link";
import type { ReactNode } from "react";

type HeroAction = {
  href: string;
  label: string;
  className: string;
};

type HeroChecklistItem = {
  text: ReactNode;
};

type AdapHeroProps = {
  kicker: string;
  title: string;
  subtitle: ReactNode;
  actions: HeroAction[];
  checklistLabel?: string;
  checklistItems?: HeroChecklistItem[];
  className?: string;
};

export function AdapHero({
  kicker,
  title,
  subtitle,
  actions,
  checklistLabel,
  checklistItems,
  className,
}: AdapHeroProps) {
  return (
    <section className={className ? `adap-hero ${className}` : "adap-hero"}>
      <div className="adap-row">
        <div>
          <div className="adap-kicker">{kicker}</div>
          <h1 className="adap-title">{title}</h1>
          <p className="adap-subtitle">{subtitle}</p>
        </div>
        <div className="adap-actions">
          {actions.map((action) => (
            <Link key={action.href + action.label} href={action.href} className={action.className}>
              {action.label}
            </Link>
          ))}
        </div>
      </div>

      {checklistItems?.length ? (
        <div className="adap-softbox" style={{ marginTop: 14 }}>
          <ul className="adap-checklist" aria-label={checklistLabel}>
            {checklistItems.map((item, idx) => (
              <li key={idx} className="adap-checklist__item">
                <span className="adap-check" aria-hidden>
                  ✓
                </span>
                <span>{item.text}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
