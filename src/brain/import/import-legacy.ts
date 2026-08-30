import type { BrainEventStore } from "../storage/event-store";
import { readLegacyCreatorArchive } from "./legacy-sqlite-reader";
import type { CreatorArchive } from "../domain";

export type ImportLegacyResult = { status: "imported" | "already-imported"; archiveId: string; sourceFingerprint: string; importedPosts: number };
export function captureLegacyCreatorArchive(sqlitePath: string): CreatorArchive { return readLegacyCreatorArchive({ sqlitePath }); }
export async function persistLegacyCreatorArchive(store: BrainEventStore, candidate: CreatorArchive): Promise<ImportLegacyResult> {
  const present = await store.getCreatorArchiveByFingerprint(candidate.sourceFingerprint);
  if (present) return { status: "already-imported", archiveId: present.id, sourceFingerprint: present.sourceFingerprint, importedPosts: present.posts.length };
  await store.appendCreatorArchive(candidate);
  const observed = await store.getCreatorArchiveByFingerprint(candidate.sourceFingerprint);
  if (!observed) throw new Error("Legacy archive insert was not observable");
  return { status: observed.id === candidate.id ? "imported" : "already-imported", archiveId: observed.id, sourceFingerprint: observed.sourceFingerprint, importedPosts: observed.posts.length };
}
export async function importLegacyCreatorArchive(store: BrainEventStore, sqlitePath: string): Promise<ImportLegacyResult> { return persistLegacyCreatorArchive(store, captureLegacyCreatorArchive(sqlitePath)); }
