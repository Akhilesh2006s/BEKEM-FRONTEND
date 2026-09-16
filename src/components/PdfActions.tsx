import { useState } from 'react';
import { Download, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { downloadExport, viewExport } from '@/lib/downloadExport';
import { cn } from '@/lib/utils';

interface PdfActionsProps {
  path: string;
  filename: string;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'ghost' | 'secondary';
  className?: string;
  viewLabel?: string;
  downloadLabel?: string;
}

export function PdfActions({
  path,
  filename,
  disabled,
  size = 'sm',
  variant = 'secondary',
  className,
  viewLabel = 'View',
  downloadLabel = 'Download',
}: PdfActionsProps) {
  const [busy, setBusy] = useState<'view' | 'download' | null>(null);

  const run = async (mode: 'view' | 'download') => {
    setBusy(mode);
    try {
      if (mode === 'view') await viewExport(path);
      else {
        await downloadExport(path, filename);
        toast.success('PDF downloaded');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'PDF failed');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      <Button
        type="button"
        variant={variant}
        size={size}
        disabled={disabled || busy !== null}
        onClick={() => run('view')}
      >
        <Eye className="h-4 w-4" />
        {busy === 'view' ? 'Opening…' : viewLabel}
      </Button>
      <Button
        type="button"
        variant={variant}
        size={size}
        disabled={disabled || busy !== null}
        onClick={() => run('download')}
      >
        <Download className="h-4 w-4" />
        {busy === 'download' ? '…' : downloadLabel}
      </Button>
    </div>
  );
}
