import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Alert, Button, Card, FormField, Input } from '@commercenest/ui';
import { ApiClientError, storefrontApi } from '../lib/api';
import { useStoreSlug } from '../lib/storeSlug';
import { t } from '../i18n/dictionary';
import { useAuthStore } from '../stores/authStore';
import { useLocaleStore } from '../stores/localeStore';

const RESEND_COOLDOWN_SECONDS = 60;

/** Zod field-level messages (e.g. the exact phone-format rule) are more
 * actionable than the generic "Validation failed" top-level message, and
 * are already customer-safe (they're the same messages shown in every
 * form's inline validation) — prefer them when present. */
function describeAuthError(err: unknown): string {
  if (err instanceof ApiClientError) {
    if (err.code === 'VALIDATION_ERROR' && Array.isArray(err.details) && err.details[0]) {
      const detail = err.details[0] as { message?: string };
      if (detail.message) return detail.message;
    }
    return err.message;
  }
  return 'Something went wrong. Please try again.';
}

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
  const [cooldown, setCooldown] = useState(0);
  const cooldownTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const title =
    mode === 'register' ? t(locale, 'register') : mode === 'forgot' ? 'Forgot password' : t(locale, 'login');

  useEffect(() => {
    return () => {
      if (cooldownTimer.current) clearInterval(cooldownTimer.current);
    };
  }, []);

  const startCooldown = (seconds: number) => {
    setCooldown(seconds);
    if (cooldownTimer.current) clearInterval(cooldownTimer.current);
    cooldownTimer.current = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          if (cooldownTimer.current) clearInterval(cooldownTimer.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const requestOtp = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await storefrontApi.otpRequest(slug, phone.trim());
      setDevCode(res.devCode || null);
      setStep('otp');
      startCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      setError(describeAuthError(err));
      // The server enforces the real cooldown; if we're blocked because
      // one is already active (e.g. after a page reload), reflect it
      // in the UI too instead of leaving the button falsely enabled.
      if (err instanceof ApiClientError && err.code === 'RATE_LIMITED') {
        startCooldown(RESEND_COOLDOWN_SECONDS);
      }
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await storefrontApi.otpVerify(slug, phone.trim(), code.trim());
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
      setError(describeAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const changePhoneNumber = () => {
    setStep('phone');
    setCode('');
    setDevCode(null);
    setError(null);
    if (cooldownTimer.current) clearInterval(cooldownTimer.current);
    setCooldown(0);
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
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={step === 'otp'}
              placeholder="01XXXXXXXXX"
            />
          </FormField>
          {step === 'otp' && (
            <>
              <FormField label="OTP code" htmlFor="code" required>
                <Input
                  id="code"
                  inputMode="numeric"
                  maxLength={6}
                  autoFocus
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="6-digit code"
                />
              </FormField>
              <p className="text-xs text-ink-secondary">
                We sent a 6-digit code to {phone}. It expires in 5 minutes.
              </p>
            </>
          )}
          {import.meta.env.DEV && devCode ? (
            <Alert tone="info" title="Dev OTP">
              {devCode}
            </Alert>
          ) : null}
          <Button
            className="w-full"
            loading={loading}
            disabled={step === 'phone' ? !phone.trim() : code.trim().length !== 6}
            onClick={() => (step === 'phone' ? void requestOtp() : void verifyOtp())}
          >
            {step === 'phone' ? 'Send OTP' : 'Verify & continue'}
          </Button>
          {step === 'otp' && (
            <div className="flex items-center justify-between text-sm">
              <button
                type="button"
                className="text-[var(--store-primary)] disabled:cursor-not-allowed disabled:text-ink-secondary disabled:opacity-60"
                disabled={cooldown > 0 || loading}
                onClick={() => void requestOtp()}
              >
                {cooldown > 0 ? `Resend OTP in ${cooldown}s` : 'Resend OTP'}
              </button>
              <button
                type="button"
                className="text-ink-secondary hover:text-[var(--store-text)]"
                onClick={changePhoneNumber}
              >
                Change phone number
              </button>
            </div>
          )}
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
