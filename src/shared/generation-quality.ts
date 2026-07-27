import {
  formatRepairNotes,
  gateGeneratedPosts,
  selectDraftsAfterGate,
  type DraftGateResult
} from "./draft-novelty";
import type { GenerationOutput } from "./generation-schema";
import type { CapturedAccountSnapshot } from "./types";

export interface QualityGatedGenerationInput {
  snapshot: CapturedAccountSnapshot;
  priorDrafts: string[];
  generate: (repairNotes: string | null) => Promise<GenerationOutput>;
}

export interface QualityGatedGenerationResult {
  generation: GenerationOutput;
  firstPass: DraftGateResult;
  repairPass: DraftGateResult | null;
  repaired: boolean;
}

export async function runQualityGatedGeneration(
  input: QualityGatedGenerationInput
): Promise<QualityGatedGenerationResult> {
  const publishedTexts = input.snapshot.posts.map((post) => post.text).filter(Boolean);
  const firstOutput = await input.generate(null);
  const firstPass = gateGeneratedPosts({
    posts: firstOutput.posts,
    publishedTexts,
    priorDrafts: input.priorDrafts
  });

  if (firstPass.accepted.length >= 3 || firstPass.rejected.length === 0) {
    return {
      generation: selectDraftsAfterGate(firstPass, 3),
      firstPass,
      repairPass: null,
      repaired: false
    };
  }

  const repairNotes = formatRepairNotes(firstPass.rejected);
  const repairOutput = await input.generate(repairNotes);
  const repairPass = gateGeneratedPosts({
    posts: repairOutput.posts,
    publishedTexts,
    priorDrafts: [...input.priorDrafts, ...firstPass.accepted.map((post) => `${post.hook}\n${post.draft}`)]
  });

  const mergedAccepted = [...firstPass.accepted];
  for (const post of repairPass.accepted) {
    const probe = gateGeneratedPosts({
      posts: [post],
      publishedTexts,
      priorDrafts: [
        ...input.priorDrafts,
        ...mergedAccepted.map((item) => `${item.hook}\n${item.draft}`)
      ]
    });
    if (probe.accepted.length > 0) mergedAccepted.push(post);
  }

  const merged: DraftGateResult = {
    accepted: mergedAccepted,
    rejected: [...firstPass.rejected, ...repairPass.rejected]
  };

  return {
    generation: selectDraftsAfterGate(merged, 3),
    firstPass,
    repairPass,
    repaired: true
  };
}
