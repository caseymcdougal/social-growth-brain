import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { CreatorBaselineProposal } from "../domain";
import { proposeCreatorBaseline } from "./propose-baseline";

type TextWriter = { write(text: string): unknown };

const USAGE = "Usage: npm run brain:baseline:propose";

export interface BaselineProposalCliInput {
  args?: readonly string[];
  stdout?: TextWriter;
  propose?: () => Promise<CreatorBaselineProposal>;
}

export async function runBaselineProposalCli(input: BaselineProposalCliInput = {}): Promise<void> {
  const args = input.args ?? process.argv.slice(2);
  if (args.length !== 0) throw new Error(USAGE);
  const proposal = await (input.propose ?? proposeCreatorBaseline)();
  (input.stdout ?? process.stdout).write(
    `${proposal.id}\n${proposal.sourceArchiveFingerprint}\n${proposal.claims.length}\n`
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runBaselineProposalCli().catch(() => {
    process.stderr.write("Baseline proposal failed. No proposal was written.\n");
    process.exitCode = 1;
  });
}
