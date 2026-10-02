import type { Logger } from '../logger';

export interface OtpEmail {
  to: string;
  otp: string;
  /** Minutes until the code expires, shown in the message. */
  expiresInMinutes: number;
}

export interface EmailSender {
  sendOtp(message: OtpEmail): Promise<void>;
}

const SUBJECT = 'Your UnNEET sign-in code';

function textBody({ otp, expiresInMinutes }: OtpEmail): string {
  return [
    `Your UnNEET sign-in code is ${otp}`,
    '',
    `It works for ${expiresInMinutes} minutes and only once. If you did not ask for it, you can ignore this email: nobody can get into your account without the code.`,
    '',
    'UnNEET will never ask you to share this code with anyone.',
  ].join('\n');
}

function htmlBody({ otp, expiresInMinutes }: OtpEmail): string {
  // The OTP is digits only (validated by Better Auth), so there is nothing to escape in it.
  return `<!doctype html><html lang="en"><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#111">
<p>Your UnNEET sign-in code is</p>
<p style="font-size:32px;letter-spacing:6px;font-weight:700;margin:8px 0">${otp}</p>
<p>It works for ${expiresInMinutes} minutes and only once. If you did not ask for it, you can ignore this email: nobody can get into your account without the code.</p>
<p style="color:#555">UnNEET will never ask you to share this code with anyone.</p>
</body></html>`;
}

/** Development: prints the code to the API console so you can sign in without an email service. */
export function createConsoleEmailSender(logger: Logger): EmailSender {
  return {
    async sendOtp(message) {
      // Deliberately a plain console line, not a structured log: the logger redacts `otp` and `email`.
      console.info(`\n  [dev email] Sign-in code for ${message.to}: ${message.otp}\n`);
      logger.debug('dev sign-in code printed to console');
    },
  };
}

export interface ResendOptions {
  apiKey: string;
  from: string;
  fetchImpl?: typeof fetch;
}

/** Production: Resend's HTTP API (https://resend.com/docs/api-reference/emails/send-email). */
export function createResendEmailSender(options: ResendOptions): EmailSender {
  const doFetch = options.fetchImpl ?? fetch;
  return {
    async sendOtp(message) {
      const res = await doFetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${options.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          from: options.from,
          to: [message.to],
          subject: SUBJECT,
          text: textBody(message),
          html: htmlBody(message),
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`Resend responded ${res.status}`);
    },
  };
}

export interface CapturingEmailSender extends EmailSender {
  readonly sent: OtpEmail[];
  lastOtpFor(email: string): string | undefined;
}

/** Tests: records messages instead of sending them. */
export function createCapturingEmailSender(): CapturingEmailSender {
  const sent: OtpEmail[] = [];
  return {
    sent,
    async sendOtp(message) {
      sent.push(message);
    },
    lastOtpFor(email) {
      return [...sent].reverse().find((m) => m.to.toLowerCase() === email.toLowerCase())?.otp;
    },
  };
}
