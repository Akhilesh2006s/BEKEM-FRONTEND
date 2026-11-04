import { Link } from 'react-router-dom';

type DashboardAction = { label: string; description: string; to: string };

/** Navigation only: keep workflow decisions and permissions in their existing pages. */
export function RoleDashboardActions({ title, description, actions }: {
  title: string;
  description: string;
  actions: DashboardAction[];
}) {
  return (
    <section aria-label={title} className="section-gap rounded-lg border border-bekem-accent/20 bg-bekem-accent-soft/40 p-4 sm:p-5">
      <h2 className="text-base font-bold text-ink">{title}</h2>
      <p className="mt-1 text-sm text-ink-secondary">{description}</p>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {actions.map((action) => (
          <Link key={action.to} to={action.to} className="min-h-[56px] rounded-lg border border-bekem-accent/25 bg-white px-3 py-2 text-left transition-colors hover:bg-bekem-accent-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bekem-accent">
            <span className="block text-sm font-semibold text-bekem-accent">{action.label} <span aria-hidden="true">→</span></span>
            <span className="mt-0.5 block text-xs text-ink-secondary">{action.description}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
