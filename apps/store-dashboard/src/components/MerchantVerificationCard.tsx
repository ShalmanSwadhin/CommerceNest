import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Alert, Badge, Button, Card, FormField, Input, useToast } from '@commercenest/ui';
import { ApiClientError, storeApi } from '../lib/api';
import { useAuthStore } from '../stores/authStore';

/**
 * Optional merchant account-security add-on — never blocks running the
 * store. Email verification: send a link, confirmed on /verify-email.
 * Phone verification: an inline OTP flow reusing the same lib/otp.ts core
 * as storefront customer phone verification (see verification.service.ts)
 * — not a second OTP implementation.
 */
export function MerchantVerificationCard() {
  const { toast } = useToast();
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const setSession = useAuthStore((s) => s.setSession);

  const [emailSending, setEmailSending] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [devEmailLink, setDevEmailLink] = useState<string | null>(null);

  const [phoneInput, setPhoneInput] = useState(user?.phone || '');
  const [phoneStep, setPhoneStep] = useState<'idle' | 'code'>('idle');
  const [phoneCode, setPhoneCode] = useState('');
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [devPhoneCode, setDevPhoneCode] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  if (!user) return null;

  const refreshUser = async () => {
    if (!accessToken) return;
    const fresh = await storeApi.me();
    setSession(accessToken, fresh);
  };

  const sendEmailVerification = async () => {
    setEmailSending(true);
    try {
      const res = await storeApi.sendEmailVerification();
      if (res.alreadyVerified) {
        toast({ title: 'Email already verified', tone: 'success' });
        await refreshUser();
        return;
      }
      setEmailSent(true);
      setDevEmailLink(res.devLink || null);
      toast({ title: 'Verification email sent', description: 'Check your inbox.', tone: 'success' });
    } catch (err) {
      toast({
        title: 'Could not send verification email',
        description: err instanceof ApiClientError ? err.message : 'Unknown error',
        tone: 'danger',
      });
    } finally {
      setEmailSending(false);
    }
  };

  const sendPhoneOtp = async () => {
    setPhoneLoading(true);
    setPhoneError(null);
    try {
      const res = await storeApi.sendPhoneVerification(phoneInput.trim());
      setDevPhoneCode(res.devCode || null);
      setPhoneStep('code');
    } catch (err) {
      setPhoneError(err instanceof ApiClientError ? err.message : 'Something went wrong.');
    } finally {
      setPhoneLoading(false);
    }
  };

  const confirmPhoneOtp = async () => {
    setPhoneLoading(true);
    setPhoneError(null);
    try {
      await storeApi.confirmPhoneVerification(phoneInput.trim(), phoneCode.trim());
      toast({ title: 'Phone verified', tone: 'success' });
      setPhoneStep('idle');
      setPhoneCode('');
      await refreshUser();
    } catch (err) {
      setPhoneError(err instanceof ApiClientError ? err.message : 'Something went wrong.');
    } finally {
      setPhoneLoading(false);
    }
  };

  return (
    <Card elevated className="max-w-2xl space-y-3">
      <div>
        <h2 className="font-semibold">Account verification</h2>
        <p className="text-xs text-ink-secondary">
          Optional — your account and store work fully without it. Master Admin can approve your
          store independently of verification status.
        </p>
      </div>

      <div className="rounded-xl border border-line p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Email</p>
            <p className="text-xs text-ink-secondary">{user.email}</p>
          </div>
          {user.emailVerified ? (
            <Badge tone="success">
              <span className="flex items-center gap-1">
                <CheckCircle2 className="size-3.5" /> Verified
              </span>
            </Badge>
          ) : (
            <Button size="sm" variant="secondary" loading={emailSending} onClick={() => void sendEmailVerification()}>
              Verify email
            </Button>
          )}
        </div>
        {emailSent && (
          <div className="mt-2 space-y-1">
            <p className="text-xs text-ink-secondary">Verification email sent — check your inbox.</p>
            {import.meta.env.DEV && devEmailLink ? (
              <a href={devEmailLink} className="block break-all text-xs text-primary underline">
                {devEmailLink}
              </a>
            ) : null}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-line p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Phone</p>
            <p className="text-xs text-ink-secondary">{user.phone || 'No phone on file'}</p>
          </div>
          {user.phoneVerified ? (
            <Badge tone="success">
              <span className="flex items-center gap-1">
                <CheckCircle2 className="size-3.5" /> Verified
              </span>
            </Badge>
          ) : phoneStep === 'idle' ? (
            <Button size="sm" variant="secondary" onClick={() => setPhoneStep('code')}>
              {user.phone ? 'Verify phone' : 'Add & verify phone'}
            </Button>
          ) : null}
        </div>
        {phoneStep === 'code' && !user.phoneVerified && (
          <div className="mt-3 space-y-2">
            {phoneError && (
              <Alert tone="danger" title="Error">
                {phoneError}
              </Alert>
            )}
            <FormField label="Phone number" htmlFor="merchant-verify-phone">
              <Input
                id="merchant-verify-phone"
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                placeholder="01XXXXXXXXX"
                disabled={!!devPhoneCode}
              />
            </FormField>
            {!devPhoneCode ? (
              <Button size="sm" loading={phoneLoading} disabled={!phoneInput.trim()} onClick={() => void sendPhoneOtp()}>
                Send code
              </Button>
            ) : (
              <>
                <FormField label="OTP code" htmlFor="merchant-verify-phone-code">
                  <Input
                    id="merchant-verify-phone-code"
                    inputMode="numeric"
                    maxLength={6}
                    value={phoneCode}
                    onChange={(e) => setPhoneCode(e.target.value.replace(/\D/g, ''))}
                  />
                </FormField>
                {import.meta.env.DEV ? (
                  <Alert tone="info" title="Dev OTP">
                    {devPhoneCode}
                  </Alert>
                ) : null}
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    loading={phoneLoading}
                    disabled={phoneCode.trim().length !== 6}
                    onClick={() => void confirmPhoneOtp()}
                  >
                    Verify
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setPhoneStep('idle')}>
                    Cancel
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
