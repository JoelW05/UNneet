import { createApiClient } from '@unneet/api-client';

/**
 * The browser's API client. It talks to this site's own origin (Next proxies /v1/* to the API), so
 * there is no CORS and the session cookie is sent automatically.
 */
export const browserApi = createApiClient({ baseUrl: '' });
