import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Alert, Button, Card, FormField, Input } from '@commercenest/ui';
import { adminApi, ApiClientError } from '../lib/api';
import { useAuthStore } from '../stores/authStore';

export function LoginPage() {
  const navigate = useNavigate();
  const accessToken = useAuthStore((s) => s.accessToken);
  const setSession = useAuthStore((s) => s.setSession);
  const [email, setEmail] = useState('admin@commercenest.com');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (accessToken) return <Navigate to="/" replace />;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await adminApi.login(email, password);
      if (res.user.role !== 'MASTER_ADMIN') {
        setError('This console is for Master Admin accounts only.');
        return;
      }
      setSession(res.accessToken, res.user);
      navigate('/');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_top,_#f3e8ff,_#f8fafc_42%,_#e2e8f0)] px-4">
      <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(108,29,179,0.12),transparent_55%)]" />
      <Card elevated className="relative w-full max-w-md shadow-lift">
        <div className="mb-6">
          <div className="mb-3 flex size-10 items-center justify-center rounded-lg bg-primary text-sm font-bold text-white">
            CN
          </div>
          <div className="text-2xl font-semibold tracking-tight text-ink">CommerceNest</div>
          <p className="mt-1 text-sm text-ink-secondary">Sign in to the Master Admin console</p>
        </div>
        {error && (
          <Alert tone="danger" title="Authentication failed" className="mb-4">
            {error}
          </Alert>
        )}
        <form className="space-y-4" onSubmit={onSubmit}>
          <FormField label="Email" htmlFor="email" required>
            <Input
              id="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </FormField>
          <FormField label="Password" htmlFor="password" required>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </FormField>
          <Button type="submit" className="w-full" loading={loading}>
            Sign in
          </Button>
        </form>
      </Card>
    </div>
  );
}
