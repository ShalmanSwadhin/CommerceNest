import { Alert, Card } from '@commercenest/ui';
import { KeyRound } from 'lucide-react';
import { SoftEmpty } from '../components/QueryState';

export function LicensesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Licenses</h2>
        <p className="text-sm text-ink-secondary">Informational placeholder for V1</p>
      </div>
      <Alert tone="info" title="Licensing ships after V1 core commerce">
        CommerceNest V1 tracks plan tiers on each store. Seat-based license management, renewals,
        and entitlement enforcement are planned for a later release.
      </Alert>
      <Card elevated>
        <SoftEmpty
          icon={<KeyRound />}
          title="No license records"
          description="Plan tier is managed on the store record today. Dedicated license objects are not part of V1."
        />
      </Card>
    </div>
  );
}
