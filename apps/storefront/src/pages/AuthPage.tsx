import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Alert, Button, Card, FormField, Input } from '@commercenest/ui';
import { ApiClientError, describeApiError, storefrontApi } from '../lib/api';
import { useStoreSlug } from '../lib/storeSlug';
import { t } from '../i18n/dictionary';
import { useAuthStore } from '../stores/authStore';
import { useLocaleStore } from '../stores/localeStore';

const RESEND_COOLDOWN_SECONDS = 60;

/**
 * Handles /login, /register, and /forgot — all three share this one
 * component (unchanged from before). Name/email/password is the PRIMARY
 * method (see AUTHENTICATION_ARCHITECTURE.md); phone OTP remains available
 * as an independent, equally-real second login method via the toggle
 * below — neither replaces the other, and nothing here forces OTP or email
 * verification just to create an account.
 */
export function AuthPage({ mode }: { mode: 'login' | 'register' | 'forgot' }) {
  const { slug } = useStoreSlug();
  const locale = useLocaleStore((s) => s.locale);
  const setSession = useAuthStore((s) => s.setSession);
  const navigate = useNavigate();

  const [method, setMethod] = useState<'password' | 'otp'>('password');

  // Password-method fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [optionalPhone, setOptionalPhone] = useState('');

  // OTP-method fields (unchanged behavior from before)
  const [otpPhone, setOtpPhone] = useState('');
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [otpStep, setOtpStep] = useState<'phone' | 'otp'>('phone');
  const [cooldown, setCooldown] = useState(0);
  const cooldownTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [devResetLink, setDevResetLink] = useState<string | null>(null);

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

  const onPasswordSubmit = async () => {
    setLoading(true);
    setError(null);
    try {
      const res =
        mode === 'register'
          ? await storefrontApi.register(slug, {
              name: name.trim(),
              email: email.trim(),
              password,
              confirmPassword,
              phone: optionalPhone.trim() || undefined,
            })
          : await storefrontApi.login(slug, email.trim(), password);
      setSession(res.accessToken, res.customer);
      navigate('/account');
    } catch (err) {
      setError(describeApiError(err));
    } finally {
      setLoading(false);
    }
  };

  const onForgotSubmit = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await storefrontApi.requestPasswordReset(slug, email.trim());
      setResetSent(true);
      setDevResetLink(
        res.devToken ? `${window.location.origin}/reset-password?token=${res.devToken}` : null,
      );
    } catch (err) {
      setError(describeApiError(err));
    } finally {
      setLoading(false);
    }
  };

  const requestOtp = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await storefrontApi.otpRequest(slug, otpPhone.trim());
      setDevCode(res.devCode || null);
      setOtpStep('otp');
      startCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      setError(describeApiError(err));
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
      const res = await storefrontApi.otpVerify(slug, otpPhone.trim(), code.trim());
      if (res.accessToken && res.customer) {
        setSession(res.accessToken, res.customer);
        navigate('/account');
      } else {
        setError('Verification succeeded but no session was returned.');
      }
    } catch (err) {
      setError(describeApiError(err));
    } finally {
      setLoading(false);
    }
  };

  const changePhoneNumber = () => {
    setOtpStep('phone');
    setCode('');
    setDevCode(null);
    setError(null);
    if (cooldownTimer.current) clearInterval(cooldownTimer.current);
    setCooldown(0);
  };

  const switchMethod = (next: 'password' | 'otp') => {
    setMethod(next);
    setError(null);
  };

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <Card elevated>
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="mt-1 text-sm text-ink-secondary">
          {mode === 'forgot'
            ? 'Reset your account password'
            : method === 'password'
              ? 'Sign in with your email and password'
              : 'Phone OTP authentication'}
        </p>
        {error && (
          <Alert tone="danger" title="Auth error" className="mt-4">
            {error}
          </Alert>
        )}

        {mode === 'forgot' ? (
          resetSent ? (
            <div className="mt-4 space-y-3">
              <Alert tone="success" title="Check your email">
                If an account exists for {email}, a password reset link was sent. It expires in 1 hour.
              </Alert>
              {import.meta.env.DEV && devResetLink ? (
                <Alert tone="info" title="Dev reset link">
                  <a href={devResetLink} className="break-all underline">
                    {devResetLink}
                  </a>
                </Alert>
              ) : null}
              <Link to="/login" className="text-sm font-medium text-[var(--store-primary)]">
                Back to login
              </Link>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <FormField label="Email" htmlFor="forgot-email" required>
                <Input
                  id="forgot-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </FormField>
              <Button
                className="w-full"
                loading={loading}
                disabled={!email.trim()}
                onClick={() => void onForgotSubmit()}
              >
                Send reset link
              </Button>
            </div>
          )
        ) : (
          <>
            <div className="mt-4 flex gap-1 rounded-lg bg-surface-muted p-1 text-sm">
              <button
                type="button"
                className={`flex-1 rounded-md py-1.5 font-medium transition ${
                  method === 'password' ? 'bg-white shadow-sm' : 'text-ink-secondary'
                }`}
                onClick={() => switchMethod('password')}
              >
                Email &amp; password
              </button>
              <button
                type="button"
                className={`flex-1 rounded-md py-1.5 font-medium transition ${
                  method === 'otp' ? 'bg-white shadow-sm' : 'text-ink-secondary'
                }`}
                onClick={() => switchMethod('otp')}
              >
                Phone OTP
              </button>
            </div>

            {method === 'password' ? (
              <div className="mt-4 space-y-3">
                {mode === 'register' && (
                  <FormField label="Name" htmlFor="name" required>
                    <Input id="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
                  </FormField>
                )}
                <FormField label="Email" htmlFor="email" required>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                  />
                </FormField>
                <FormField label="Password" htmlFor="password" required>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                    minLength={mode === 'register' ? 8 : undefined}
                  />
                </FormField>
                {mode === 'register' && (
                  <>
                    <FormField label="Confirm password" htmlFor="confirmPassword" required>
                      <Input
                        id="confirmPassword"
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        autoComplete="new-password"
                        minLength={8}
                      />
                    </FormField>
                    <FormField label="Phone (optional)" htmlFor="optionalPhone">
                      <Input
                        id="optionalPhone"
                        value={optionalPhone}
                        onChange={(e) => setOptionalPhone(e.target.value)}
                        placeholder="01XXXXXXXXX"
                      />
                    </FormField>
                  </>
                )}
                <Button
                  className="w-full"
                  loading={loading}
                  disabled={
                    mode === 'register'
                      ? !name.trim() || !email.trim() || password.length < 8 || confirmPassword !== password
                      : !email.trim() || !password
                  }
                  onClick={() => void onPasswordSubmit()}
                >
                  {mode === 'register' ? 'Create account' : 'Sign in'}
                </Button>
                {mode === 'login' && (
                  <Link to="/forgot" className="block text-center text-sm text-[var(--store-primary)]">
                    Forgot password?
                  </Link>
                )}
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                <FormField label="Phone" htmlFor="otp-phone" required>
                  <Input
                    id="otp-phone"
                    type="tel"
                    inputMode="tel"
                    value={otpPhone}
                    onChange={(e) => setOtpPhone(e.target.value)}
                    disabled={otpStep === 'otp'}
                    placeholder="01XXXXXXXXX"
                  />
                </FormField>
                {otpStep === 'otp' && (
                  <>
                    <FormField label="OTP code" htmlFor="otp-code" required>
                      <Input
                        id="otp-code"
                        inputMode="numeric"
                        maxLength={6}
                        autoFocus
                        value={code}
                        onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                        placeholder="6-digit code"
                      />
                    </FormField>
                    <p className="text-xs text-ink-secondary">
                      We sent a 6-digit code to {otpPhone}. It expires in 5 minutes.
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
                  disabled={otpStep === 'phone' ? !otpPhone.trim() : code.trim().length !== 6}
                  onClick={() => (otpStep === 'phone' ? void requestOtp() : void verifyOtp())}
                >
                  {otpStep === 'phone' ? 'Send OTP' : 'Verify & continue'}
                </Button>
                {otpStep === 'otp' && (
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
            )}
          </>
        )}

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
