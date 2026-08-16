import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Alert, Button, Card, FormField, Input } from '@commercenest/ui';
import { ApiClientError, storefrontApi } from '../lib/api';
import { useStoreSlug } from '../lib/storeSlug';

/** Lands here from the emailed password-reset link (?token=...). */
export function ResetPasswordPage() {
  const { slug } = useStoreSlug();
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const onSubmit = async () => {
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await storefrontApi.confirmPasswordReset(slug, token, password);
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <Card elevated>
        <h1 className="text-2xl font-semibold">Reset your password</h1>
        {!token ? (
          <Alert tone="danger" title="Invalid link" className="mt-4">
            This link is missing its reset token. Request a new one from the login page.
          </Alert>
        ) : done ? (
          <div className="mt-4 space-y-3">
            <Alert tone="success" title="Password updated">
              You can now log in with your new password.
            </Alert>
            <Link to="/login">
              <Button className="w-full">Go to login</Button>
            </Link>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {error && (
              <Alert tone="danger" title="Error">
                {error}
              </Alert>
            )}
            <FormField label="New password" htmlFor="password" required>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                minLength={8}
              />
            </FormField>
            <FormField label="Confirm new password" htmlFor="confirmPassword" required>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                minLength={8}
              />
            </FormField>
            <Button
              className="w-full"
              loading={loading}
              disabled={password.length < 8 || confirmPassword !== password}
              onClick={() => void onSubmit()}
            >
              Update password
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
