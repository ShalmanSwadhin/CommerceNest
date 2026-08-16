import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Alert, Button, Card } from '@commercenest/ui';
import { ApiClientError, storefrontApi } from '../lib/api';
import { useStoreSlug } from '../lib/storeSlug';

/** Lands here from the emailed verification link (?token=...). Public —
 * doesn't require an active session, since the token itself is what
 * authorizes the action (the same way password-reset-confirm works). */
export function VerifyEmailPage() {
  const { slug } = useStoreSlug();
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
    storefrontApi
      .confirmEmailVerification(slug, token)
      .then(() => setStatus('success'))
      .catch((err) => {
        setStatus('error');
        setError(err instanceof ApiClientError ? err.message : 'Something went wrong.');
      });
  }, [slug, token]);

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <Card elevated className="text-center">
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
        <Link to="/account" className="mt-6 inline-block">
          <Button variant="secondary">Go to your account</Button>
        </Link>
      </Card>
    </div>
  );
}
