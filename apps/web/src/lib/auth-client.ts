'use client';

import { emailOTPClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

/**
 * Better Auth's browser client. Sign-in is passwordless (an e-mailed code); the code is REQUESTED
 * through our own `POST /v1/auth/otp` (which enforces the 16+ confirmation) and then verified here.
 */
export const authClient = createAuthClient({
  basePath: '/api/auth',
  plugins: [emailOTPClient()],
});
