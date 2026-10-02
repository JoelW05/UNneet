/**
 * Feeds give us bare hosts ("www.x.ac.uk"), http:// links and the odd junk string. Outbound links
 * on UnNEET must be https, so: add the scheme if missing, upgrade http, and reject anything else.
 */
export function websiteUrl(raw: string | null | undefined): string | null {
  const t = (raw ?? '').trim();
  if (!t) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(t) ? t : `https://${t}`;
  const upgraded = withScheme.replace(/^http:\/\//i, 'https://');
  try {
    const u = new URL(upgraded);
    if (u.protocol !== 'https:' || !u.hostname.includes('.')) return null;
    return u.toString();
  } catch {
    return null;
  }
}
