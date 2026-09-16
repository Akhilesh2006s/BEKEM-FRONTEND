import { type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
  /** Show a back control. Pass a path, or true for browser history back. */
  onBack?: (() => void) | string | true;
  backLabel?: string;
}

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  action,
  onBack,
  backLabel = 'Go back',
}: PageHeaderProps) {
  const navigate = useNavigate();

  const handleBack =
    onBack === undefined
      ? undefined
      : typeof onBack === 'function'
        ? onBack
        : onBack === true
          ? () => {
              if (window.history.length > 1) navigate(-1);
              else navigate('/');
            }
          : () => navigate(onBack);

  return (
    <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-1.5 mb-2 lg:mb-3">
      <div className="flex items-start gap-2 min-w-0">
        {handleBack && (
          <button
            type="button"
            onClick={handleBack}
            className="mt-0.5 h-9 w-9 shrink-0 flex items-center justify-center rounded-xl hover:bg-gray-100"
            aria-label={backLabel}
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}
        <div className="min-w-0">
          {eyebrow && (
            <p className="text-[10px] font-semibold uppercase tracking-widest text-ink-muted mb-0.5">
              {eyebrow}
            </p>
          )}
          <h1 className="text-base lg:text-lg font-semibold text-ink tracking-tight">{title}</h1>
          {subtitle && (
            <p className="text-xs text-ink-secondary mt-0.5 max-w-xl">{subtitle}</p>
          )}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}
