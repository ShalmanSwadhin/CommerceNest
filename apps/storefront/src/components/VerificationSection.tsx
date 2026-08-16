import { useState } from 'react';
import { CheckCircle2, TriangleAlert } from 'lucide-react';
import { Alert, Badge, Button, FormField, Input, useToast } from '@commercenest/ui';
import { ApiClientError, storefrontApi } from '../lib/api';

/**
 * Optional account-security add-on — never required to browse, cart, or
 * check out. Email verification: send a link, confirm on /verify-email.
 * Phone verification: an inline OTP flow reusing the same lib/otp.ts core
 * as phone-OTP login, just scoped to "flip a flag" instead of "start a
 * session" — see verification.service.ts.
 */
export function VerificationSection({
  slug,
  email,
  phone,
  emailVerified,
  phoneVerified,
  onVerifiedChange,
}: {
  slug: string;
  email?: string | null;
  phone?: string | null;
  emailVerified?: boolean;
  phoneVerified?: boolean;
  onVerifiedChange: () => void;
}) {
  const { toast } = useToast();
  const [emailSending, setEmailSending] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [devEmailLink, setDevEmailLink] = useState<string | null>(null);

  const [phoneInput, setPhoneInput] = useState(phone || '');
  const [phoneStep, setPhoneStep] = useState<'idle' | 'code'>('idle');
  const [phoneCode, setPhoneCode] = useState('');
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [devPhoneCode, setDevPhoneCode] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  const sendEmailVerification = async () => {
    setEmailSending(true);
    try {
      const res = await storefrontApi.sendEmailVerification(slug);
      if (res.alreadyVerified) {
        toast({ title: 'Email already verified', tone: 'success' });
        onVerifiedChange();
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
      const res = await storefrontApi.sendPhoneVerification(slug, phoneInput.trim());
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
      await storefrontApi.confirmPhoneVerification(slug, phoneInput.trim(), phoneCode.trim());
      toast({ title: 'Phone verified', tone: 'success' });
      setPhoneStep('idle');
      setPhoneCode('');
      onVerifiedChange();
    } catch (err) {
      setPhoneError(err instanceof ApiClientError ? err.message : 'Something went wrong.');
    } finally {
      setPhoneLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <h2 className="font-semibold">Security &amp; verification</h2>
      <p className="text-xs text-ink-secondary">
        Verifying your email and phone is optional — your account works fully without it.
      </p>

      <div className="rounded-xl border border-line p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Email</p>
            <p className="text-xs text-ink-secondary">{email || 'No email on file'}</p>
          </div>
          {emailVerified ? (
            <Badge tone="success">
              <span className="flex items-center gap-1">
                <CheckCircle2 className="size-3.5" /> Verified
              </span>
            </Badge>
          ) : email ? (
            <Button size="sm" variant="secondary" loading={emailSending} onClick={() => void sendEmailVerification()}>
              Verify email
            </Button>
          ) : (
            <Badge tone="neutral">
              <span className="flex items-center gap-1">
                <TriangleAlert className="size-3.5" /> Not verified
              </span>
            </Badge>
          )}
        </div>
        {emailSent && (
          <div className="mt-2 space-y-1">
            <p className="text-xs text-ink-secondary">Verification email sent — check your inbox.</p>
            {import.meta.env.DEV && devEmailLink ? (
              <a href={devEmailLink} className="block break-all text-xs text-[var(--store-primary)] underline">
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
            <p className="text-xs text-ink-secondary">{phone || 'No phone on file'}</p>
          </div>
          {phoneVerified ? (
            <Badge tone="success">
              <span className="flex items-center gap-1">
                <CheckCircle2 className="size-3.5" /> Verified
              </span>
            </Badge>
          ) : phoneStep === 'idle' ? (
            <Button size="sm" variant="secondary" onClick={() => setPhoneStep('code')}>
              {phone ? 'Verify phone' : 'Add & verify phone'}
            </Button>
          ) : null}
        </div>
        {phoneStep === 'code' && !phoneVerified && (
          <div className="mt-3 space-y-2">
            {phoneError && (
              <Alert tone="danger" title="Error">
                {phoneError}
              </Alert>
            )}
            <FormField label="Phone number" htmlFor="verify-phone">
              <Input
                id="verify-phone"
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
                <FormField label="OTP code" htmlFor="verify-phone-code">
                  <Input
                    id="verify-phone-code"
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
    </div>
  );
}
