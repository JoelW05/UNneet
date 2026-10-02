import { type OpportunityCard, type Profile, ProfileSchema } from '@unneet/domain';
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { Database } from '../client';
import {
  authAccount,
  authSession,
  authUser,
  opportunities,
  opportunitySkills,
  profiles,
  providers,
  quizResults,
  savedOpportunities,
  skills,
} from '../schema';
import { rowToCard } from './mappers';

export async function getProfile(db: Database, userId: string): Promise<Profile | null> {
  const [row] = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
  if (!row) return null;
  // Parse with the current schema so old rows pick up new defaults and corrupt rows fail loudly.
  return ProfileSchema.parse(row.data);
}

export async function putProfile(db: Database, userId: string, profile: Profile): Promise<void> {
  await db
    .insert(profiles)
    .values({ userId, data: profile })
    .onConflictDoUpdate({
      target: profiles.userId,
      set: { data: profile, updatedAt: new Date() },
    });
}

export async function savedOpportunityIds(db: Database, userId: string): Promise<string[]> {
  const rows = await db
    .select({ id: savedOpportunities.opportunityId })
    .from(savedOpportunities)
    .where(eq(savedOpportunities.userId, userId));
  return rows.map((r) => r.id);
}

export async function listSaved(db: Database, userId: string): Promise<OpportunityCard[]> {
  const rows = await db
    .select({
      o: opportunities,
      p: {
        id: providers.id,
        name: providers.name,
        licence: providers.licence,
        attribution: providers.attribution,
        attributionUrl: providers.attributionUrl,
        isSample: providers.isSample,
      },
    })
    .from(savedOpportunities)
    .innerJoin(opportunities, eq(opportunities.id, savedOpportunities.opportunityId))
    .innerJoin(providers, eq(providers.id, opportunities.providerId))
    .where(eq(savedOpportunities.userId, userId))
    .orderBy(desc(savedOpportunities.createdAt));

  const ids = rows.map((r) => r.o.id);
  const skillRows = ids.length
    ? await db
        .select({
          opportunityId: opportunitySkills.opportunityId,
          id: skills.id,
          label: skills.label,
        })
        .from(opportunitySkills)
        .innerJoin(skills, eq(skills.id, opportunitySkills.skillId))
        .where(inArray(opportunitySkills.opportunityId, ids))
    : [];
  const skillMap = new Map<string, Array<{ id: string; label: string }>>();
  for (const s of skillRows) {
    const list = skillMap.get(s.opportunityId) ?? [];
    list.push({ id: s.id, label: s.label });
    skillMap.set(s.opportunityId, list);
  }
  return rows.map((r) => rowToCard(r, skillMap.get(r.o.id) ?? []));
}

/** Returns false if the opportunity doesn't exist (so the API can 404 instead of a FK error). */
export async function saveOpportunity(
  db: Database,
  userId: string,
  opportunityId: string,
): Promise<boolean> {
  const [exists] = await db
    .select({ id: opportunities.id })
    .from(opportunities)
    .where(eq(opportunities.id, opportunityId))
    .limit(1);
  if (!exists) return false;
  await db.insert(savedOpportunities).values({ userId, opportunityId }).onConflictDoNothing();
  return true;
}

export async function unsaveOpportunity(
  db: Database,
  userId: string,
  opportunityId: string,
): Promise<void> {
  await db
    .delete(savedOpportunities)
    .where(
      and(
        eq(savedOpportunities.userId, userId),
        eq(savedOpportunities.opportunityId, opportunityId),
      ),
    );
}

export async function saveQuizResult(
  db: Database,
  userId: string,
  quizId: string,
  result: Record<string, unknown>,
): Promise<void> {
  await db.insert(quizResults).values({ userId, quizId, result });
}

export interface UserDataExport {
  exportedAt: string;
  account: { id: string; email: string; name: string; createdAt: string };
  profile: Profile | null;
  saved: Array<{ slug: string; title: string; savedAt: string }>;
  quizResults: Array<{ quizId: string; result: Record<string, unknown>; createdAt: string }>;
}

/** UK GDPR Art. 20 (portability): everything we hold about the person, machine-readable. */
export async function exportUserData(db: Database, userId: string): Promise<UserDataExport | null> {
  const [account] = await db.select().from(authUser).where(eq(authUser.id, userId)).limit(1);
  if (!account) return null;
  const [profile, saved, quizzes] = await Promise.all([
    getProfile(db, userId),
    db
      .select({
        slug: opportunities.slug,
        title: opportunities.title,
        savedAt: savedOpportunities.createdAt,
      })
      .from(savedOpportunities)
      .innerJoin(opportunities, eq(opportunities.id, savedOpportunities.opportunityId))
      .where(eq(savedOpportunities.userId, userId))
      .orderBy(desc(savedOpportunities.createdAt)),
    db
      .select()
      .from(quizResults)
      .where(eq(quizResults.userId, userId))
      .orderBy(desc(quizResults.createdAt)),
  ]);
  return {
    exportedAt: new Date().toISOString(),
    account: {
      id: account.id,
      email: account.email,
      name: account.name,
      createdAt: account.createdAt.toISOString(),
    },
    profile,
    saved: saved.map((s) => ({ slug: s.slug, title: s.title, savedAt: s.savedAt.toISOString() })),
    quizResults: quizzes.map((q) => ({
      quizId: q.quizId,
      result: q.result,
      createdAt: q.createdAt.toISOString(),
    })),
  };
}

/** UK GDPR Art. 17 (erasure). Profile, saved items, quiz results, sessions, accounts all cascade. */
export async function deleteUserData(db: Database, userId: string): Promise<boolean> {
  const rows = await db
    .delete(authUser)
    .where(eq(authUser.id, userId))
    .returning({ id: authUser.id });
  // Explicitly keep these imports honest: sessions/accounts are removed by ON DELETE CASCADE.
  void authSession;
  void authAccount;
  return rows.length > 0;
}
