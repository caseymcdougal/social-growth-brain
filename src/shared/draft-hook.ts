function normalize(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/["'“”‘’]/g, "")
    .replace(/[.,!?…]+$/, "");
}

/** True when a draft already opens with its hook, so rendering the hook separately would just repeat the first line. */
export function draftLeadsWithHook(draft: string, hook: string | null | undefined): boolean {
  if (!hook) return false;
  const normalizedHook = normalize(hook);
  if (normalizedHook.length === 0) return false;
  return normalize(draft).startsWith(normalizedHook);
}
