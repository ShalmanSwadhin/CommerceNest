import { Badge } from '@commercenest/ui';
import { AlertTriangle, ShieldAlert, ShieldCheck } from 'lucide-react';

export function RiskBadge({ level }: { level?: string }) {
  if (level === 'HIGH_RISK') {
    return (
      <Badge tone="danger" className="inline-flex items-center gap-1">
        <ShieldAlert className="size-3.5" /> High risk
      </Badge>
    );
  }
  if (level === 'CAUTION') {
    return (
      <Badge tone="caution" className="inline-flex items-center gap-1">
        <AlertTriangle className="size-3.5" /> Caution
      </Badge>
    );
  }
  return (
    <Badge tone="success" className="inline-flex items-center gap-1">
      <ShieldCheck className="size-3.5" /> Low risk
    </Badge>
  );
}
