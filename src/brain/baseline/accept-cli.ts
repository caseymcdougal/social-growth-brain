import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { AcceptedCreatorBaseline } from "../domain";
import { acceptLocalCreatorBaseline, parseBaselineAcceptArgs } from "./accept-baseline";

type TextWriter = { write(text: string): unknown };

export interface BaselineAcceptCliInput {
  args?: readonly string[];
  stdout?: TextWriter;
  accept?: (input: { proposalId: string; sourceFingerprint: string }) => AcceptedCreatorBaseline;
}

export function runBaselineAcceptCli(input: BaselineAcceptCliInput = {}): void {
  const approved = parseBaselineAcceptArgs(input.args ?? process.argv.slice(2));
  const accepted = (input.accept ?? acceptLocalCreatorBaseline)(approved);
  (input.stdout ?? process.stdout).write(
    `${accepted.acceptedProposalId}\n${accepted.acceptedSourceArchiveFingerprint}\n${accepted.acceptedAt}\n`
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    runBaselineAcceptCli();
  } catch {
    process.stderr.write("Baseline acceptance failed. Accepted baseline was not changed.\n");
    process.exitCode = 1;
  }
}
