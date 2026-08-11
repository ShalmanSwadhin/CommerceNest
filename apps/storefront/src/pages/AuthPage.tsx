import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Alert, Button, Card, FormField, Input } from '@commercenest/ui';
import { ApiClientError, storefrontApi } from '../lib/api';
import { useStoreSlug } from '../lib/storeSlug';
import { t } from '../i18n/dictionary';
import { useAuthStore } from '../stores/authStore';
import { useLocaleStore } from '../stores/localeStore';

export function AuthPage({ mode }: { mode: 'login' | 'register' | 'forgot' }) {
  const { slug } = useStoreSlug();
  const locale = useLocaleStore((s) => s.locale);
  const setSession = useAuthStore((s) => s.setSession);
  const navigate = useNavigate();
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const title =
    mode === 'register' ? t(locale, 'register') : mode === 'forgot' ? 'Forgot password' : t(locale, 'login');

  const requestOtp = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await storefrontApi.otpRequest(slug, phone);
      setDevCode(res.devCode || null);
      setStep('otp');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'OTP request failed');
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await storefrontApi.otpVerify(slug, phone, code);
      if (res.accessToken && res.customer) {
        setSession(res.accessToken, {
          id: res.customer.id,
          name: res.customer.name || name || undefined,
          phone: res.customer.phone,
        });
        navigate('/account');
      } else {
        setError('Verification succeeded but no session was returned.');
      }
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'OTP verify failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <Card elevated>
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="mt-1 text-sm text-ink-secondary">Phone OTP authentication</p>
        {error && (
          <Alert tone="danger" title="Auth error" className="mt-4">
            {error}
          </Alert>
        )}
        <div className="mt-4 space-y-3">
          {mode === 'register' && step === 'phone' && (
            <FormField label="Name" htmlFor="name">
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
            </FormField>
          )}
          <FormField label="Phone" htmlFor="phone" required>
            <Input
              id="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={step === 'otp'}
              placeholder="01XXXXXXXXX"
            />
          </FormField>
          {step === 'otp' && (
            <FormField label="OTP code" htmlFor="code" required>
              <Input id="code" value={code} onChange={(e) => setCode(e.target.value)} />
            </FormField>
          )}
          {import.meta.env.DEV && devCode ? (
            <Alert tone="info" title="Dev OTP">
              {devCode}
            </Alert>
          ) : null}
          <Button
            className="w-full"
            loading={loading}
            onClick={() => (step === 'phone' ? void requestOtp() : void verifyOtp())}
          >
            {step === 'phone' ? 'Send OTP' : 'Verify & continue'}
          </Button>
        </div>
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <Link to="/login" className="text-[var(--store-primary)]">
            {t(locale, 'login')}
          </Link>
          <Link to="/register" className="text-[var(--store-primary)]">
            {t(locale, 'register')}
          </Link>
          <Link to="/forgot" className="text-[var(--store-primary)]">
            Forgot
          </Link>
        </div>
      </Card>
    </div>
  );
}
