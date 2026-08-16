import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Alert, Button, Card } from '@commercenest/ui';
import { ApiClientError, storeApi } from '../lib/api';

/** Lands here from the emailed verification link (?token=...). Public —
 * the token itself authorizes the action, no session required. */
export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [status, setStatus] = useState<'checking' | 'success' | 'error'>('checking');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setError('This link is missing its verification token.');
      return;
    }
    storeApi
      .confirmEmailVerification(token)
      .then(() => setStatus('success'))
      .catch((err) => {
        setStatus('error');
        setError(err instanceof ApiClientError ? err.message : 'Something went wrong.');
      });
  }, [token]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-raised px-4">
      <Card elevated className="w-full max-w-md text-center">
        <h1 className="text-2xl font-semibold">Email verification</h1>
        <div className="mt-4">
          {status === 'checking' && <p className="text-sm text-ink-secondary">Verifying your email…</p>}
          {status === 'success' && (
            <Alert tone="success" title="Email verified">
              Your email address has been verified.
            </Alert>
          )}
          {status === 'error' && (
            <Alert tone="danger" title="Verification failed">
              {error}
            </Alert>
          )}
        </div>
        <Link to="/" className="mt-6 inline-block">
          <Button variant="secondary">Go to dashboard</Button>
        </Link>
      </Card>
    </div>
  );
}
