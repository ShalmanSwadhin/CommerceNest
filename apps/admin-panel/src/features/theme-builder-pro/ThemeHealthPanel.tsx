import { CheckCircle2, TriangleAlert } from 'lucide-react';
import { Modal } from '@commercenest/ui';
import type { ThemeDocument } from '@commercenest/types/schemas/theme';
import { runThemeHealthCheck } from './themeHealth';

type ThemeHealthPanelProps = {
  open: boolean;
  onClose: () => void;
  doc: ThemeDocument;
};

/**
 * Real, computed findings only — no invented "94/100" score. Every finding
 * here is derived from the actual theme document (contrast math, section
 * counts, content checks), so it stays true regardless of what the theme
 * looks like.
 */
export function ThemeHealthPanel({ open, onClose, doc }: ThemeHealthPanelProps) {
  const findings = open ? runThemeHealthCheck(doc) : [];
  const warnCount = findings.filter((f) => f.severity === 'warn').length;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Theme health"
      description={
        warnCount === 0
          ? 'All checks pass.'
          : `${warnCount} thing${warnCount === 1 ? '' : 's'} worth a look before publishing.`
      }
    >
      <div className="max-h-96 space-y-2 overflow-y-auto">
        {findings.map((finding) => (
          <div
            key={finding.id}
            className={`flex gap-3 rounded-xl border p-3 ${
              finding.severity === 'warn' ? 'border-amber-200 bg-amber-50' : 'border-line bg-surface-raised'
            }`}
          >
            {finding.severity === 'warn' ? (
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            ) : (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            )}
            <div>
              <p className="text-sm font-semibold text-ink">{finding.title}</p>
              <p className="mt-0.5 text-xs text-ink-secondary">{finding.detail}</p>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}
