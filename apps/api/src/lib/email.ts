import nodemailer, { type Transporter } from 'nodemailer';
import { env, hasSmtp } from './env.js';
import { logger } from './logger.js';

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
    });
  }
  return transporter;
}

/**
 * Generic SMTP sender — deliberately provider-agnostic (works with a
 * merchant's own mailbox, a self-hosted mail server, or any transactional
 * email service) rather than integrating one specific paid vendor's API.
 * Falls back to a structured log line — never throws, never blocks the
 * caller's actual business logic — when SMTP isn't configured (dev) or a
 * send fails (prod): a notification email is never allowed to be the
 * reason an order/payment/return operation fails.
 */
export async function sendEmail(params: {
  to: string;
  subject: string;
  body: string;
  templateKey: string;
}): Promise<{ sent: boolean }> {
  if (!hasSmtp) {
    logger.info(
      {
        channel: 'email',
        provider: 'local-stub',
        to: params.to,
        subject: params.subject,
        templateKey: params.templateKey,
        body: params.body,
      },
      'Email notification (local log — SMTP not configured)',
    );
    return { sent: false };
  }

  try {
    await getTransporter().sendMail({
      from: env.SMTP_FROM,
      to: params.to,
      subject: params.subject,
      text: params.body,
    });
    logger.info(
      { channel: 'email', provider: 'smtp', to: params.to, templateKey: params.templateKey },
      'Email sent',
    );
    return { sent: true };
  } catch (err) {
    logger.error(
      { err, channel: 'email', to: params.to, templateKey: params.templateKey },
      'Email send failed — notification dropped, business operation unaffected',
    );
    return { sent: false };
  }
}
