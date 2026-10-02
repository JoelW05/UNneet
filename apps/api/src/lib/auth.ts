import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { type Database, schema } from '@unneet/db';
import { betterAuth } from 'better-auth';
import { emailOTP } from 'better-auth/plugins/email-otp';
import type { Env } from '../env';
import type { Logger } from '../logger';
import type { EmailSender } from './email';

/** Sign-in codes live for this long. Shown in the email so people know. */
export const OTP_EXPIRES_SECONDS = 600;

export interface AuthOptions {
  db: Database;
  env: Env;
  email: EmailSender;
  logger: Logger;
}

/**
 * Passwordless e-mail one-time codes.
 *
 * Why no passwords: nothing to leak, nothing to remember, and no cognitive-function test to
 * solve, which is what WCAG 2.2 SC 3.3.8 (Accessible Authentication) asks of a login. Codes can
 * be pasted from the email, so no transcription is needed either.
 * https://www.w3.org/WAI/WCAG22/Understanding/accessible-authentication-minimum.html
 *
 * The 16+ age gate is enforced in our own `POST /v1/auth/otp` route, so Better Auth's own
 * "send code" endpoint is disabled: there must be exactly one way to ask for a code.
 */
export function createAuth({ db, env, email, logger }: AuthOptions) {
  return betterAuth({
    appName: 'UnNEET',
    // Requests reach us through the website's origin (Next.js rewrites /api/auth/* to this API),
    // so cookies are first-party and there is no CORS or third-party-cookie problem.
    baseURL: env.webOrigin,
    basePath: '/api/auth',
    secret: env.authSecret,
    trustedOrigins: [env.webOrigin],
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: {
        user: schema.authUser,
        session: schema.authSession,
        account: schema.authAccount,
        verification: schema.authVerification,
      },
    }),
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
      // No cookie cache: a cached session keeps working after sign-out or account deletion until
      // it expires. Erasure and "sign out everywhere" must take effect immediately, and one
      // indexed lookup per signed-in request is cheap.
      cookieCache: { enabled: false },
    },
    advanced: {
      useSecureCookies: env.isProduction,
      defaultCookieAttributes: { httpOnly: true, sameSite: 'lax' },
      ipAddress: { ipAddressHeaders: env.trustProxy ? ['x-forwarded-for'] : [] },
    },
    rateLimit: {
      enabled: true,
      window: 60,
      max: 60,
      customRules: {
        '/sign-in/email-otp': { window: 600, max: 10 },
      },
    },
    disabledPaths: [
      '/email-otp/send-verification-otp',
      '/email-otp/check-verification-otp',
      '/email-otp/verify-email',
      '/email-otp/request-password-reset',
      '/email-otp/reset-password',
      '/forget-password/email-otp',
      '/email-otp/request-email-change',
      '/email-otp/change-email',
    ],
    telemetry: { enabled: false },
    plugins: [
      emailOTP({
        otpLength: 6,
        expiresIn: OTP_EXPIRES_SECONDS,
        allowedAttempts: 5,
        // Only a hash of the code is stored, so a database leak does not leak live codes.
        storeOTP: 'hashed',
        async sendVerificationOTP({ email: to, otp }) {
          // Not awaited: response time must not reveal whether the address already has an account.
          void email
            .sendOtp({ to, otp, expiresInMinutes: OTP_EXPIRES_SECONDS / 60 })
            .catch((error: unknown) => {
              logger.error(
                { err: error instanceof Error ? error.message : String(error) },
                'failed to send sign-in code',
              );
            });
        },
      }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
