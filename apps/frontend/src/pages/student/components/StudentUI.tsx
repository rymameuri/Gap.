import { ArrowRight, type LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import type { ReactNode } from "react";
import { evidenceLabels, type EvidenceStatus } from "../course-model";

export function PageHeading({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="s-page-heading">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function ActionLink({
  to,
  icon: Icon,
  title,
  description,
}: {
  to: string;
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <Link className="s-action" to={to}>
      <Icon size={22} aria-hidden="true" />
      <div>
        <strong>{title}</strong>
        <span>{description}</span>
      </div>
      <ArrowRight size={18} aria-hidden="true" />
    </Link>
  );
}

export function EvidenceBadge({ status }: { status: EvidenceStatus }) {
  return (
    <span className={`s-status s-status-${status}`}>
      <span aria-hidden="true" />
      {evidenceLabels[status]}
    </span>
  );
}

export function SectionHeading({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="s-section-heading">
      <h2>{title}</h2>
      {children}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="s-empty">
      <Icon size={26} aria-hidden="true" />
      <h2>{title}</h2>
      <div>{children}</div>
    </div>
  );
}
