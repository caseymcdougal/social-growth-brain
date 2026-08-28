import type { CreatorArchive } from "../domain";
import type { BrainEventStore } from "../storage/event-store";

export interface CaseyContext { creatorId: "casey-mcdougal"; version: string; archiveId: string; importedAt: string; profile: CreatorArchive["profile"]; ownedPosts: CreatorArchive["posts"]; voiceProfile: CreatorArchive["voiceProfile"]; voiceOverrides: string; strategyMemory: CreatorArchive["strategyMemory"]; creativeDirections: string[]; }
export function buildCaseyContext(archive: CreatorArchive): CaseyContext { return { creatorId: "casey-mcdougal", version: archive.sourceFingerprint, archiveId: archive.id, importedAt: archive.importedAt, profile: archive.profile, ownedPosts: archive.posts, voiceProfile: archive.voiceProfile, voiceOverrides: archive.voiceOverrides, strategyMemory: archive.strategyMemory, creativeDirections: archive.creativeDirections }; }
export async function loadLatestCaseyContext(store: BrainEventStore): Promise<CaseyContext | null> { const archive = await store.getLatestCreatorArchive(); return archive ? buildCaseyContext(archive) : null; }
