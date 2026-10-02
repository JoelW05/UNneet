import type { TimelineAction } from '../schemas/timeline';

/**
 * Where a timeline action points. Internal searches become a site-relative `/search?…` URL;
 * official pages are returned as-is (already validated as https by the schema).
 */
export function actionHref(action: TimelineAction): { href: string; external: boolean } {
  if (action.href) return { href: action.href, external: true };
  if (action.path) return { href: action.path, external: false };
  const s = action.search ?? {};
  const p = new URLSearchParams();
  if (s.q) p.set('q', s.q);
  if (s.type?.length) p.set('type', s.type.join(','));
  if (s.pillar?.length) p.set('pillar', s.pillar.join(','));
  if (s.sector?.length) p.set('sector', s.sector.join(','));
  if (s.levelMin !== undefined) p.set('levelMin', String(s.levelMin));
  if (s.levelMax !== undefined) p.set('levelMax', String(s.levelMax));
  if (s.free) p.set('free', '1');
  if (s.workMode?.length) p.set('workMode', s.workMode.join(','));
  const qs = p.toString();
  return { href: qs ? `/search?${qs}` : '/search', external: false };
}
