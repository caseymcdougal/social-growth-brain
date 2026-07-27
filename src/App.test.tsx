import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import analysisFixture from "../tests/fixtures/analysis-valid.json";
import snapshotFixture from "../tests/fixtures/manual-import-valid.json";
import { App } from "./App";
import { clearDashboardStateCacheForTests } from "./client/api";

afterEach(() => {
  cleanup();
  clearDashboardStateCacheForTests();
  try {
    window.localStorage.removeItem("social-audit-production-workflow-v1");
  } catch {
    // jsdom storage may be shimmed by the test runner.
  }
  vi.unstubAllGlobals();
});

function dashboardState({
  snapshot = null,
  history = [],
  analysis = null,
  generation = null,
  memory = null,
  proposal = null,
  exploration = null
}: {
  snapshot?: unknown;
  history?: unknown;
  analysis?: unknown;
  generation?: unknown;
  memory?: unknown;
  proposal?: unknown;
  exploration?: unknown;
} = {}) {
  return {
    snapshot,
    history,
    analysis,
    generation,
    strategyMemory: { memory, proposal },
    topicExploration: exploration
  };
}

const pendingMemoryProposal = {
  id: 12,
  createdAt: "2026-06-27T16:00:00.000Z",
  memory: {
    positioning: "Casey writes as a local-first AI tooling operator.",
    audience_segments: ["AI builders", "solo operators"],
    strongest_lanes: ["local dashboards", "agent workflow critique"],
    weak_lanes: ["generic AI news reactions"],
    voice_rules: ["make the claim before the explanation"],
    proof_points: ["Audit found specific product opinions performed better."],
    active_experiments: [
      {
        hypothesis: "Posts with a named workflow enemy create more replies.",
        status: "active",
        evidence: "The audit flagged stronger engagement on critique-led posts."
      }
    ]
  },
  updates: [
    {
      area: "strongest_lanes",
      proposed: "Add agent workflow critique as a core lane.",
      reason: "It appears in both winning posts and the positioning read.",
      evidence: "Top patterns mention direct product opinions and workflow pain."
    }
  ]
};

test("renders the dashboard shell", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/dashboard")) {
        return new Response(JSON.stringify(dashboardState()), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    })
  );

  render(<App />);

  expect(screen.getByText("Casey on X")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Social Audit Studio" })).toBeInTheDocument();
  expect(screen.getByRole("list", { name: "Audit sequence" })).toBeInTheDocument();
  expect(await screen.findByRole("button", { name: /Paste snapshot instead/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Run my audit/i })).toHaveClass("primary-button");
  expect(screen.getByRole("button", { name: /Scan my posts/i })).toHaveClass("secondary-button");
  expect(screen.queryByRole("button", { name: /Find what's working/i })).not.toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "Your next post, ready to go" })).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Creative direction")).not.toBeInTheDocument();
});

test("announces capture load failures as alerts", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ error: "nope" }), { status: 500 }))
  );

  render(<App />);

  expect(await screen.findByRole("alert")).toHaveTextContent("Failed to load latest snapshot");
});

test("shows generate today's ideas after an audit is available", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/dashboard")) {
        return new Response(JSON.stringify(dashboardState({ snapshot: snapshotFixture, analysis: analysisFixture })), {
          status: 200
        });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    })
  );

  render(<App />);

  expect(await screen.findByRole("button", { name: /Write draft ideas/i })).toBeInTheDocument();
  expect(await screen.findByRole("heading", { name: "Your angle for today" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Your strategy" })).toBeInTheDocument();
  expect(await screen.findByRole("heading", { name: "What resonated most" })).toBeInTheDocument();
  expect(screen.getByLabelText("Patterns found")).toBeInTheDocument();
  expect(within(screen.getByLabelText("Next move")).queryByLabelText("Current posting brief")).not.toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "Your next post, ready to go" })).not.toBeInTheDocument();
  const moreOptions = within(screen.getByLabelText("Next move")).getByLabelText("More options");
  fireEvent.click(within(moreOptions).getByText("More options"));
  expect(within(moreOptions).getByRole("button", { name: /Find patterns again/i })).toBeInTheDocument();
});

test("uses review draft queue as the primary command inside the generated command center", async () => {
  const generation = {
    posts: [
      {
        title: "Turn analytics into a strategist",
        angle: "Position the dashboard as an operating system, not a report.",
        why_this: "It continues the strongest contrast in the audit.",
        hook: "A social dashboard should end with a next move.",
        draft: "A social dashboard should end with a next move. Otherwise it is just prettier regret.",
        source_signal: "Specific product takes outperform broad claims."
      }
    ]
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/dashboard")) {
        return new Response(JSON.stringify(dashboardState({ snapshot: snapshotFixture, analysis: analysisFixture, generation })), {
          status: 200
        });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    })
  );

  render(<App />);

  const commandCenter = await screen.findByRole("region", { name: "Your next post, ready to go" });
  expect(commandCenter).toHaveAttribute("data-mode", "draft");
  expect(screen.queryByLabelText("Next move")).not.toBeInTheDocument();
  const reviewButton = within(commandCenter).getByRole("button", { name: /See my drafts/i });
  const draftQueueTitle = await screen.findByRole("heading", { name: "Drafts for today" });
  const scrollIntoView = vi.fn();
  Object.defineProperty(draftQueueTitle, "scrollIntoView", { configurable: true, value: scrollIntoView });

  expect(reviewButton).toHaveClass("primary-button");
  expect(within(commandCenter).getByRole("button", { name: /Write new ideas/i })).toHaveClass("secondary-button");
  expect(within(commandCenter).queryByRole("button", { name: /Write draft ideas/i })).not.toBeInTheDocument();
  const updateSource = within(commandCenter).getByLabelText("More options");
  expect(updateSource.tagName).toBe("DETAILS");
  expect(updateSource).not.toHaveAttribute("open");
  const directActionLabels = Array.from(commandCenter.querySelectorAll(".command-center-actions > button")).map((button) =>
    button.textContent?.replace(/\s+/g, " ").trim()
  );
  expect(directActionLabels).toEqual(["See my drafts", "Write new ideas"]);
  expect(within(commandCenter).getByRole("button", { name: /Find patterns again/i }).closest("details")).toBe(updateSource);
  expect(within(commandCenter).getByRole("button", { name: /Scan again/i }).closest("details")).toBe(updateSource);
  expect(within(commandCenter).getByRole("button", { name: /Paste snapshot/i }).closest("details")).toBe(updateSource);

  fireEvent.click(within(updateSource).getByText("More options"));
  expect(within(commandCenter).getByRole("button", { name: /Find patterns again/i })).toBeInTheDocument();
  expect(within(commandCenter).getByRole("button", { name: /Scan again/i })).toBeInTheDocument();
  expect(within(commandCenter).getByRole("button", { name: /Paste snapshot/i })).toBeInTheDocument();

  fireEvent.click(reviewButton);
  expect(scrollIntoView).toHaveBeenCalledWith({ block: "start", behavior: "smooth" });
});

test("shows only the generated command center without a duplicate next-move hero", async () => {
  const generation = {
    posts: [
      {
        title: "Turn analytics into a strategist",
        angle: "Position the dashboard as an operating system, not a report.",
        why_this: "It continues the strongest contrast in the audit.",
        hook: "A social dashboard should end with a next move.",
        draft: "A social dashboard should end with a next move. Otherwise it is just prettier regret.",
        source_signal: "Specific product takes outperform broad claims."
      }
    ]
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/dashboard")) {
        return new Response(JSON.stringify(dashboardState({ snapshot: snapshotFixture, analysis: analysisFixture, generation })), {
          status: 200
        });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    })
  );

  render(<App />);

  const commandCenter = await screen.findByRole("region", { name: "Your next post, ready to go" });
  const handoff = within(commandCenter).getByLabelText("Draft handoff priorities");
  expect(screen.queryByLabelText("Next move")).not.toBeInTheDocument();
  expect(within(handoff).getByText("1 draft staged")).toBeInTheDocument();
  expect(within(handoff).getByText("Pick one, copy it into X, or write fresh ideas.")).toBeInTheDocument();
  expect(within(commandCenter).getByRole("button", { name: /See my drafts/i })).toHaveClass("primary-button");
  expect(within(commandCenter).getByLabelText("More options")).not.toHaveAttribute("open");
});

test("describes generated handoff by staged drafts instead of repeating the review action", async () => {
  const generation = {
    posts: [
      {
        title: "Turn analytics into a strategist",
        angle: "Position the dashboard as an operating system, not a report.",
        why_this: "It continues the strongest contrast in the audit.",
        hook: "A social dashboard should end with a next move.",
        draft: "A social dashboard should end with a next move. Otherwise it is just prettier regret.",
        source_signal: "Specific product takes outperform broad claims."
      },
      {
        title: "Make the next move obvious",
        angle: "Show that beginner dashboards need a direct work surface.",
        why_this: "It turns audit insight into action.",
        hook: "The best audit screen is the one that tells you what to do next.",
        draft: "The best audit screen is the one that tells you what to do next. Everything else should support that move.",
        source_signal: "The command-center pass reduced repeated actions."
      }
    ]
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/dashboard")) {
        return new Response(JSON.stringify(dashboardState({ snapshot: snapshotFixture, analysis: analysisFixture, generation })), {
          status: 200
        });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    })
  );

  render(<App />);

  const commandCenter = await screen.findByRole("region", { name: "Your next post, ready to go" });
  const handoff = within(commandCenter).getByLabelText("Draft handoff priorities");
  expect(within(commandCenter).getByText("2 drafts · 100% of metrics captured")).toBeInTheDocument();
  expect(within(handoff).getByText("2 drafts staged")).toBeInTheDocument();
  expect(within(handoff).getByText("Pick one, copy it into X, or write fresh ideas.")).toBeInTheDocument();
  expect(within(handoff).queryByText("Review the draft queue")).not.toBeInTheDocument();
  expect(within(commandCenter).getByRole("button", { name: /See my drafts/i })).toBeInTheDocument();
});

test("keeps generated command signals behind a closed status disclosure", async () => {
  const generation = {
    posts: [
      {
        title: "Turn analytics into a strategist",
        angle: "Position the dashboard as an operating system, not a report.",
        why_this: "It continues the strongest contrast in the audit.",
        hook: "A social dashboard should end with a next move.",
        draft: "A social dashboard should end with a next move. Otherwise it is just prettier regret.",
        source_signal: "Specific product takes outperform broad claims."
      }
    ]
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/dashboard")) {
        return new Response(JSON.stringify(dashboardState({ snapshot: snapshotFixture, analysis: analysisFixture, generation })), {
          status: 200
        });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    })
  );

  render(<App />);

  const commandCenter = await screen.findByRole("region", { name: "Your next post, ready to go" });
  const signals = within(commandCenter).getByLabelText("Command signals");
  expect(signals.closest("details")).toBeNull();
  expect(within(signals).getByText("Your account health")).toBeInTheDocument();
  expect(within(signals).getByText("What to fix")).toBeInTheDocument();
  expect(within(signals).getByText("Your best next post")).toBeInTheDocument();
});

test("surfaces a single next-move hero before operational telemetry when audited", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/dashboard")) {
        return new Response(JSON.stringify(dashboardState({ snapshot: snapshotFixture, analysis: analysisFixture })), {
          status: 200
        });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    })
  );

  render(<App />);

  const nextMove = await screen.findByLabelText("Next move");
  expect(within(nextMove).getByRole("heading", { name: "Write your next post" })).toBeInTheDocument();
  expect(within(nextMove).getByRole("button", { name: /Write draft ideas/i })).toHaveClass("primary-button");
  expect(screen.queryByRole("region", { name: "Your next post, ready to go" })).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Creative direction")).not.toBeInTheDocument();

  const progressPanel = screen.getByLabelText("What's happening");
  expect(nextMove.compareDocumentPosition(progressPanel)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
});

test("keeps idle run log inline inside the closed evidence disclosure", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/dashboard")) {
        return new Response(JSON.stringify(dashboardState({ snapshot: snapshotFixture, analysis: analysisFixture })), {
          status: 200
        });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    })
  );

  render(<App />);

  const progressPanel = await screen.findByLabelText("What's happening");
  // Progress lives inside the About your data disclosure (collapsed by default when idle).
  expect(progressPanel.tagName).toBe("SECTION");
  const evidence = progressPanel.closest("details");
  expect(evidence).toHaveAttribute("aria-label", "How this was built");
  expect(evidence).not.toHaveAttribute("open");
  expect(within(progressPanel).getByText("What's happening")).toBeInTheDocument();
  expect(within(progressPanel).getByText("Nothing running right now")).toBeInTheDocument();
});

test("keeps operational evidence behind a closed details disclosure", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/dashboard")) {
        return new Response(JSON.stringify(dashboardState({ snapshot: snapshotFixture, analysis: analysisFixture })), {
          status: 200
        });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    })
  );

  render(<App />);

  const evidenceDetails = await screen.findByLabelText("How this was built");
  expect(evidenceDetails.tagName).toBe("DETAILS");
  expect(evidenceDetails).not.toHaveAttribute("open");
  expect(within(evidenceDetails).getByText("How this was built")).toBeInTheDocument();
  expect(within(evidenceDetails).getByLabelText("Scan history trend")).toBeInTheDocument();
  expect(within(evidenceDetails).getByLabelText("Data quality")).toBeInTheDocument();
  expect(within(evidenceDetails).getByLabelText("What's happening")).toBeInTheDocument();
});

test("shows progress feedback while a dashboard action is running", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/dashboard")) {
        return new Response(JSON.stringify(dashboardState({ snapshot: snapshotFixture, analysis: analysisFixture })), {
          status: 200
        });
      }
      if (url.endsWith("/api/generate/today")) {
        return new Promise<Response>(() => {});
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    })
  );

  render(<App />);

  fireEvent.click(await screen.findByRole("button", { name: /Write draft ideas/i }));

  const progressPanel = await screen.findByLabelText("What's happening");
  expect(progressPanel.tagName).toBe("SECTION");
  // The About your data disclosure auto-opens on activity so progress stays visible.
  expect(progressPanel.closest("details")).toHaveAttribute("open");
  expect(within(progressPanel).getByText("1 step running")).toBeInTheDocument();
  const generationRow = within(progressPanel).getByText("Writing draft ideas").closest("li");
  expect(generationRow).toHaveAttribute("data-state", "running");
  expect(within(generationRow as HTMLElement).getByText("Working")).toBeInTheDocument();
  expect(within(generationRow as HTMLElement).getByRole("progressbar", { name: /Writing draft ideas progress/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Writing…/i })).toHaveAttribute("aria-busy", "true");
});

test("gives recovery guidance when draft generation fails", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/dashboard")) {
        return new Response(JSON.stringify(dashboardState({ snapshot: snapshotFixture, analysis: analysisFixture })), {
          status: 200
        });
      }
      if (url.endsWith("/api/generate/today")) {
        return new Response(JSON.stringify({ errorMessage: "Model quota exhausted" }), { status: 500 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    })
  );

  render(<App />);

  fireEvent.click(await screen.findByRole("button", { name: /Write draft ideas/i }));

  const alert = await screen.findByRole("alert");
  expect(within(alert).getByRole("heading", { name: "We couldn't write your drafts" })).toBeInTheDocument();
  expect(within(alert).getByText("Model quota exhausted")).toBeInTheDocument();
  expect(within(alert).getByText(/try generating ideas again/i)).toBeInTheDocument();
});

test("surfaces copyable priority signals without repeating the top command", async () => {
  const generation = {
    posts: [
      {
        title: "Turn analytics into a strategist",
        angle: "Position the dashboard as an operating system, not a report.",
        why_this: "It continues the strongest contrast in the audit.",
        hook: "A social dashboard should end with a next move.",
        draft: "A social dashboard should end with a next move. Otherwise it is just prettier regret.",
        source_signal: "Specific product takes outperform broad claims."
      }
    ]
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/dashboard")) {
        return new Response(JSON.stringify(dashboardState({ snapshot: snapshotFixture, analysis: analysisFixture, generation })), {
          status: 200
        });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    })
  );

  render(<App />);

  const nextMoves = await screen.findByLabelText("What to do next");
  expect(nextMoves.tagName).toBe("DETAILS");
  expect(nextMoves).not.toHaveAttribute("open");
  fireEvent.click(nextMoves.querySelector("summary") as HTMLElement);
  expect(within(nextMoves).queryByText("Generate the next draft set")).not.toBeInTheDocument();
  expect(within(nextMoves).getByText("Repeat the winning mechanism")).toBeInTheDocument();
  expect(within(nextMoves).getByRole("button", { name: /Copy next moves/i })).toBeInTheDocument();
});

test("keeps generated-state priority signals behind a closed decision support disclosure", async () => {
  const generation = {
    posts: [
      {
        title: "Turn analytics into a strategist",
        angle: "Position the dashboard as an operating system, not a report.",
        why_this: "It continues the strongest contrast in the audit.",
        hook: "A social dashboard should end with a next move.",
        draft: "A social dashboard should end with a next move. Otherwise it is just prettier regret.",
        source_signal: "Specific product takes outperform broad claims."
      }
    ]
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/dashboard")) {
        return new Response(JSON.stringify(dashboardState({ snapshot: snapshotFixture, analysis: analysisFixture, generation })), {
          status: 200
        });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    })
  );

  render(<App />);

  const postLab = (await screen.findByRole("heading", { name: "Drafts for today" })).closest("section");
  const nextMoves = await screen.findByLabelText("What to do next");
  expect(postLab).not.toBeNull();
  expect(nextMoves.tagName).toBe("DETAILS");
  expect(nextMoves).not.toHaveAttribute("open");
  expect(within(nextMoves).getByText(/\d moves?/)).toBeInTheDocument();
  expect(within(nextMoves).getByText("Repeat the winning mechanism")).toBeInTheDocument();
  expect(within(nextMoves).getByRole("button", { name: /Copy next moves/i })).toBeInTheDocument();
  expect(postLab!.compareDocumentPosition(nextMoves)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
});

test("keeps generated-state strategy brief behind a closed strategy context disclosure", async () => {
  const generation = {
    posts: [
      {
        title: "Turn analytics into a strategist",
        angle: "Position the dashboard as an operating system, not a report.",
        why_this: "It continues the strongest contrast in the audit.",
        hook: "A social dashboard should end with a next move.",
        draft: "A social dashboard should end with a next move. Otherwise it is just prettier regret.",
        source_signal: "Specific product takes outperform broad claims."
      }
    ]
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/dashboard")) {
        return new Response(JSON.stringify(dashboardState({ snapshot: snapshotFixture, analysis: analysisFixture, generation })), {
          status: 200
        });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    })
  );

  render(<App />);

  const postLab = (await screen.findByRole("heading", { name: "Drafts for today" })).closest("section");
  const nextMoves = await screen.findByLabelText("What to do next");
  const strategyContext = await screen.findByLabelText("Why these suggestions");
  expect(postLab).not.toBeNull();
  expect(nextMoves).not.toBeNull();
  expect(strategyContext.tagName).toBe("DETAILS");
  expect(strategyContext).not.toHaveAttribute("open");
  expect(within(strategyContext).getByRole("heading", { name: "Your strategy" })).toBeInTheDocument();
  expect(document.querySelector(".audited-phase-layout .coach-report")).toBeNull();
  expect(postLab!.compareDocumentPosition(nextMoves)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  expect(nextMoves.compareDocumentPosition(strategyContext)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
});

test("keeps generated-state ranked review behind a closed source evidence disclosure", async () => {
  const generation = {
    posts: [
      {
        title: "Turn analytics into a strategist",
        angle: "Position the dashboard as an operating system, not a report.",
        why_this: "It continues the strongest contrast in the audit.",
        hook: "A social dashboard should end with a next move.",
        draft: "A social dashboard should end with a next move. Otherwise it is just prettier regret.",
        source_signal: "Specific product takes outperform broad claims."
      }
    ]
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/dashboard")) {
        return new Response(JSON.stringify(dashboardState({ snapshot: snapshotFixture, analysis: analysisFixture, generation })), {
          status: 200
        });
      }
      if (url.endsWith("/api/analysis/latest")) {
        return new Response(JSON.stringify({ analysis: analysisFixture }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    })
  );

  render(<App />);

  const strategyEngine = await screen.findByLabelText("Advanced tools");
  const sourceEvidence = await screen.findByLabelText("Your posts ranked");
  expect(sourceEvidence.tagName).toBe("DETAILS");
  expect(sourceEvidence).not.toHaveAttribute("open");
  expect(within(sourceEvidence).getByText(/\d+ ranked posts?/)).toBeInTheDocument();
  expect(within(sourceEvidence).getByRole("heading", { name: "What resonated most" })).toBeInTheDocument();
  expect(within(sourceEvidence).getByRole("button", { name: /Work this post/i })).toBeInTheDocument();
  expect(strategyEngine.compareDocumentPosition(sourceEvidence)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
});

test("hydrates the full generation set after dashboard bootstrap", async () => {
  const bootstrapGeneration = {
    posts: [
      {
        title: "Bootstrap draft",
        angle: "Dashboard may return a partial set before hydration.",
        why_this: "Deferred generation/latest should expand the queue.",
        hook: "The first draft is not the whole queue.",
        draft: "The first draft is not the whole queue. Hydrate the rest so operators can choose.",
        source_signal: "Dashboard bootstrap"
      }
    ]
  };
  const fullGeneration = {
    posts: [
      bootstrapGeneration.posts[0],
      {
        title: "Hydrated draft 2",
        angle: "Second option after hydration.",
        why_this: "Choice needs more than one draft.",
        hook: "One draft is a suggestion. Three drafts are a choice.",
        draft: "One draft is a suggestion. Three drafts are a choice. Keep the queue wide enough to pick a true angle.",
        source_signal: "Hydrated latest generation"
      },
      {
        title: "Hydrated draft 3",
        angle: "Third option after hydration.",
        why_this: "Alternates matter.",
        hook: "If the draft sounds like yesterday, it is not ready.",
        draft: "If the draft sounds like yesterday, it is not ready. Write a new claim in the same lane and cut the rest.",
        source_signal: "Hydrated latest generation"
      }
    ]
  };
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/api/dashboard")) {
      return new Response(
        JSON.stringify(dashboardState({ snapshot: snapshotFixture, analysis: analysisFixture, generation: bootstrapGeneration })),
        { status: 200 }
      );
    }
    if (url.endsWith("/api/generation/latest")) {
      return new Response(JSON.stringify({ generation: fullGeneration }), { status: 200 });
    }
    if (url.endsWith("/api/analysis/latest")) {
      return new Response(JSON.stringify({ analysis: analysisFixture }), { status: 200 });
    }
    if (url.endsWith("/api/strategy-memory/latest")) {
      return new Response(JSON.stringify({ memory: null, proposal: null }), { status: 200 });
    }
    if (url.endsWith("/api/topics/latest")) {
      return new Response(JSON.stringify({ exploration: null }), { status: 200 });
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);

  render(<App />);

  const postLab = (await screen.findByRole("heading", { name: "Drafts for today" })).closest("section");
  expect(postLab).not.toBeNull();
  expect(within(postLab as HTMLElement).getByText("1 draft")).toBeInTheDocument();

  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/generation/latest"));
  await waitFor(() => expect(within(postLab as HTMLElement).getByText("3 drafts")).toBeInTheDocument());
  expect(within(postLab as HTMLElement).getByLabelText("Draft library")).toBeInTheDocument();
  expect(within(postLab as HTMLElement).getByText("3 generated drafts")).toBeInTheDocument();
});

test("keeps the priority copy action stable when clipboard permission is denied", async () => {
  const generation = {
    posts: [
      {
        title: "Turn analytics into a strategist",
        angle: "Position the dashboard as an operating system, not a report.",
        why_this: "It continues the strongest contrast in the audit.",
        hook: "A social dashboard should end with a next move.",
        draft: "A social dashboard should end with a next move. Otherwise it is just prettier regret.",
        source_signal: "Specific product takes outperform broad claims."
      }
    ]
  };
  const writeText = vi.fn().mockRejectedValue(new DOMException("Document is not focused", "NotAllowedError"));
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText }
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/dashboard")) {
        return new Response(JSON.stringify(dashboardState({ snapshot: snapshotFixture, analysis: analysisFixture, generation })), {
          status: 200
        });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    })
  );

  render(<App />);

  const nextMoves = await screen.findByLabelText("What to do next");
  fireEvent.click(nextMoves.querySelector("summary") as HTMLElement);
  const copyButton = within(nextMoves).getByRole("button", { name: /Copy next moves/i });
  fireEvent.click(copyButton);

  await waitFor(() => expect(writeText).toHaveBeenCalled());
  await waitFor(() => expect(copyButton).toHaveTextContent("Copy unavailable"));
});

test("keeps a single enabled generation command after an audit is available", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/dashboard")) {
        return new Response(JSON.stringify(dashboardState({ snapshot: snapshotFixture, analysis: analysisFixture })), {
          status: 200
        });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    })
  );

  render(<App />);

  await screen.findByRole("heading", { name: "Your angle for today" });
  const enabledGenerationCommands = screen
    .getAllByRole("button")
    .filter((button) => /Write draft ideas|Create draft set|Writing…/i.test(button.textContent ?? ""))
    .filter((button) => !button.hasAttribute("disabled"));

  expect(enabledGenerationCommands).toHaveLength(1);
});

test("shows the ready audit shell from one consolidated dashboard request", async () => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/api/dashboard")) {
      return new Response(JSON.stringify(dashboardState({ snapshot: snapshotFixture, analysis: analysisFixture })), {
        status: 200
      });
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);

  render(<App />);

  const coachReport = (await screen.findByRole("heading", { name: "Your strategy" })).closest("section");
  expect(coachReport).not.toBeNull();
  const coachBrief = within(coachReport as HTMLElement).getByLabelText("Strategy highlights");
  expect(within(coachBrief).getByText("What's working")).toBeInTheDocument();
  expect(within(coachBrief).getByText("What to fix")).toBeInTheDocument();
  expect(within(coachBrief).getByText("Your content lane")).toBeInTheDocument();
  const coachDetails = screen.getByLabelText("Full coach read");
  expect(coachDetails.tagName).toBe("DETAILS");
  expect(coachDetails).not.toHaveAttribute("open");
  expect(screen.getByText("1 post loaded")).toBeInTheDocument();
  expect(screen.queryByText("Loading")).not.toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock).toHaveBeenCalledWith("/api/dashboard");
});

test("shows scan history trend intelligence from dashboard history", async () => {
  const previousSnapshot = {
    ...snapshotFixture,
    profile: { ...snapshotFixture.profile, capturedAt: "2026-06-20T18:00:00.000Z", followersCount: 1200 },
    posts: [
      {
        ...snapshotFixture.posts[0],
        xPostId: "older-winner",
        text: "A useful dashboard tells you what to do next.",
        capturedAt: "2026-06-20T18:00:00.000Z",
        viewsCount: 1000,
        likesCount: 10,
        repostsCount: 2,
        repliesCount: 1,
        bookmarksCount: 0
      },
      {
        ...snapshotFixture.posts[0],
        xPostId: "quiet",
        text: "Quiet post.",
        capturedAt: "2026-06-20T18:00:00.000Z",
        viewsCount: 500,
        likesCount: 2,
        repostsCount: 0,
        repliesCount: 0,
        bookmarksCount: 0
      }
    ]
  };
  const currentSnapshot = {
    ...snapshotFixture,
    profile: { ...snapshotFixture.profile, capturedAt: "2026-06-26T18:00:00.000Z", followersCount: 1250 },
    posts: [
      {
        ...snapshotFixture.posts[0],
        xPostId: "new-winner",
        text: "The best social audit tools should turn a scan into a next move.",
        capturedAt: "2026-06-26T18:00:00.000Z",
        viewsCount: 3000,
        likesCount: 20,
        repostsCount: 4,
        repliesCount: 8,
        bookmarksCount: 3
      },
      {
        ...snapshotFixture.posts[0],
        xPostId: "older-winner",
        text: "A useful dashboard tells you what to do next.",
        capturedAt: "2026-06-26T18:00:00.000Z",
        viewsCount: 1200,
        likesCount: 12,
        repostsCount: 2,
        repliesCount: 2,
        bookmarksCount: 1
      }
    ]
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/dashboard")) {
        return new Response(
          JSON.stringify(
            dashboardState({
              snapshot: currentSnapshot,
              history: [currentSnapshot, previousSnapshot],
              analysis: analysisFixture
            })
          ),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    })
  );

  render(<App />);

  const trendPanel = await screen.findByLabelText("Scan history trend");
  expect(within(trendPanel).getByRole("heading", { name: "Trendline" })).toBeInTheDocument();
  expect(within(trendPanel).getByText("Median visible signal up by 68 since previous scan.")).toBeInTheDocument();
  expect(within(trendPanel).getByText("+68 vs last")).toBeInTheDocument();
  expect(within(trendPanel).getByText("+50 vs last")).toBeInTheDocument();
  expect(within(trendPanel).getByText("New top post took over")).toBeInTheDocument();
  expect(within(trendPanel).getByText("Double down on the new winner, then scan again after the next post lands.")).toBeInTheDocument();
});

test("shows an experiment ledger that ties memory hypotheses to scan movement", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText }
  });
  const previousSnapshot = {
    ...snapshotFixture,
    profile: { ...snapshotFixture.profile, capturedAt: "2026-06-20T18:00:00.000Z", followersCount: 1200 },
    posts: [
      {
        ...snapshotFixture.posts[0],
        xPostId: "older-winner",
        text: "A useful dashboard tells you what to do next.",
        capturedAt: "2026-06-20T18:00:00.000Z",
        viewsCount: 1000,
        likesCount: 10,
        repostsCount: 2,
        repliesCount: 1,
        bookmarksCount: 0
      },
      {
        ...snapshotFixture.posts[0],
        xPostId: "quiet",
        text: "Quiet post.",
        capturedAt: "2026-06-20T18:00:00.000Z",
        viewsCount: 500,
        likesCount: 2,
        repostsCount: 0,
        repliesCount: 0,
        bookmarksCount: 0
      }
    ]
  };
  const currentSnapshot = {
    ...snapshotFixture,
    profile: { ...snapshotFixture.profile, capturedAt: "2026-06-26T18:00:00.000Z", followersCount: 1250 },
    posts: [
      {
        ...snapshotFixture.posts[0],
        xPostId: "new-winner",
        text: "The best social audit tools should turn a scan into a next move.",
        capturedAt: "2026-06-26T18:00:00.000Z",
        viewsCount: 3000,
        likesCount: 20,
        repostsCount: 4,
        repliesCount: 8,
        bookmarksCount: 3
      },
      {
        ...snapshotFixture.posts[0],
        xPostId: "older-winner",
        text: "A useful dashboard tells you what to do next.",
        capturedAt: "2026-06-26T18:00:00.000Z",
        viewsCount: 1200,
        likesCount: 12,
        repostsCount: 2,
        repliesCount: 2,
        bookmarksCount: 1
      }
    ]
  };
  const memory = {
    positioning: "Casey writes as a product-minded AI tooling operator.",
    audience_segments: ["builders shipping with AI"],
    strongest_lanes: ["creator workflow tools"],
    weak_lanes: ["generic AI commentary"],
    voice_rules: ["make the product opinion first"],
    proof_points: ["Specific product opinions outperform generic takes."],
    active_experiments: [
      {
        hypothesis: "Named workflow enemies increase replies.",
        status: "active",
        evidence: "The audit flagged clear enemy framing as a strong pattern."
      }
    ]
  };

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/dashboard")) {
        return new Response(
          JSON.stringify(
            dashboardState({
              snapshot: currentSnapshot,
              history: [currentSnapshot, previousSnapshot],
              analysis: analysisFixture,
              memory
            })
          ),
          { status: 200 }
        );
      }
      if (url.endsWith("/api/strategy-memory/latest")) {
        return new Response(JSON.stringify({ memory, proposal: null }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    })
  );

  render(<App />);

  const ledger = await screen.findByLabelText("Experiment ledger");
  expect(within(ledger).getByRole("heading", { name: "Ideas you're testing" })).toBeInTheDocument();
  expect(within(ledger).getByText("1 experiment looks validated by the latest scan.")).toBeInTheDocument();
  expect(within(ledger).getByText("Named workflow enemies increase replies.")).toBeInTheDocument();
  expect(within(ledger).getByText("Winning")).toBeInTheDocument();
  expect(within(ledger).getByText("+68 median signal")).toBeInTheDocument();

  fireEvent.click(within(ledger).getByRole("button", { name: /Copy experiment brief/i }));
  await waitFor(() => expect(writeText).toHaveBeenCalled());
  expect(writeText.mock.calls[0]?.[0]).toContain("Experiment ledger: 1 experiment looks validated by the latest scan.");
  expect(writeText.mock.calls[0]?.[0]).toContain("- [Winning] Named workflow enemies increase replies.");
});

test("keeps creator score details inside the compact generated command center", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText }
  });
  const previousSnapshot = {
    ...snapshotFixture,
    profile: { ...snapshotFixture.profile, capturedAt: "2026-06-20T18:00:00.000Z", followersCount: 1200 },
    posts: [
      {
        ...snapshotFixture.posts[0],
        xPostId: "older-winner",
        text: "A useful dashboard tells you what to do next.",
        capturedAt: "2026-06-20T18:00:00.000Z",
        viewsCount: 1000,
        likesCount: 10,
        repostsCount: 2,
        repliesCount: 1,
        bookmarksCount: 0
      }
    ]
  };
  const currentSnapshot = {
    ...snapshotFixture,
    profile: { ...snapshotFixture.profile, capturedAt: "2026-06-26T18:00:00.000Z", followersCount: 1250 },
    posts: [
      {
        ...snapshotFixture.posts[0],
        xPostId: "new-winner",
        text: "The best social audit tools should turn a scan into a next move.",
        capturedAt: "2026-06-26T18:00:00.000Z",
        viewsCount: 3000,
        likesCount: 20,
        repostsCount: 4,
        repliesCount: 8,
        bookmarksCount: 3
      }
    ]
  };
  const generation = {
    posts: [
      {
        title: "Turn analytics into a strategist",
        angle: "Position the dashboard as an operating system, not a report.",
        why_this: "It continues the strongest contrast in the audit.",
        hook: "A social dashboard should end with a next move.",
        draft: "A social dashboard should end with a next move. Otherwise it is just prettier regret.",
        source_signal: "Specific product takes outperform broad claims."
      }
    ]
  };
  const memory = {
    positioning: "Casey writes as a product-minded AI tooling operator.",
    audience_segments: ["builders shipping with AI"],
    strongest_lanes: ["creator workflow tools"],
    weak_lanes: ["generic AI commentary"],
    voice_rules: ["make the product opinion first"],
    proof_points: ["Specific product opinions outperform generic takes."],
    active_experiments: [
      {
        hypothesis: "Named workflow enemies increase replies.",
        status: "active",
        evidence: "The audit flagged clear enemy framing as a strong pattern."
      }
    ]
  };

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/dashboard")) {
        return new Response(
          JSON.stringify(
            dashboardState({
              snapshot: currentSnapshot,
              history: [currentSnapshot, previousSnapshot],
              analysis: analysisFixture,
              generation,
              memory
            })
          ),
          { status: 200 }
        );
      }
      if (url.endsWith("/api/generation/latest")) {
        return new Response(JSON.stringify({ generation }), { status: 200 });
      }
      if (url.endsWith("/api/strategy-memory/latest")) {
        return new Response(JSON.stringify({ memory, proposal: null }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    })
  );

  render(<App />);

  const commandCenter = await screen.findByRole("region", { name: "Your next post, ready to go" });
  expect(commandCenter).toHaveAttribute("data-mode", "draft");
  expect(commandCenter).toHaveClass("is-generated");
  expect(screen.queryByLabelText("Creator operating scorecard")).not.toBeInTheDocument();
  expect(within(commandCenter).queryByRole("heading", { name: "Creator health brief" })).not.toBeInTheDocument();
  expect(within(commandCenter).getByText("Ready to write")).toBeInTheDocument();
  expect(within(commandCenter).getByRole("heading", { name: "Your next post, ready to go" })).toBeInTheDocument();
  expect(commandCenter.querySelector(".command-center-grid")).not.toBeInTheDocument();
  expect(within(commandCenter).getByText("Growing strong · 88")).toBeInTheDocument();
  expect(within(commandCenter).getByText("You're on a good roll — keep doing what's working.")).toBeInTheDocument();
  const handoff = within(commandCenter).getByLabelText("Draft handoff priorities");
  expect(within(handoff).getByText("Your drafts")).toBeInTheDocument();
  expect(within(handoff).getByText("1 draft staged")).toBeInTheDocument();
  expect(within(handoff).getByText("Pick one, copy it into X, or write fresh ideas.")).toBeInTheDocument();
  const constraintSignal = Array.from(handoff.querySelectorAll(".command-center-signal")).find((signal) =>
    signal.textContent?.includes("What to fix")
  );
  expect(constraintSignal).not.toBeUndefined();
  expect(within(constraintSignal as HTMLElement).getByText("Ready to post")).toBeInTheDocument();
  expect(within(constraintSignal as HTMLElement).getByText(/Pick a draft, post it on X/i)).toBeInTheDocument();
  const breakdown = within(commandCenter).getByLabelText("Score breakdown");
  expect(breakdown.tagName).toBe("SECTION");
  expect(within(breakdown).getByText("4 things we measure")).toBeInTheDocument();

  fireEvent.click(within(breakdown).getByRole("button", { name: /Copy my summary/i }));
  await waitFor(() => expect(writeText).toHaveBeenCalled());
  expect(writeText.mock.calls[0]?.[0]).toContain("Creator scorecard:");
  expect(writeText.mock.calls[0]?.[0]).toContain("What to fix first: Ready to post");
});

test("marks the workflow rail with completed and current steps", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/dashboard")) {
        return new Response(JSON.stringify(dashboardState({ snapshot: snapshotFixture, analysis: analysisFixture })), {
          status: 200
        });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    })
  );

  render(<App />);

  await screen.findByRole("heading", { name: "Your angle for today" });

  const stepRail = screen.getByRole("list", { name: "Audit sequence" });
  expect(within(stepRail).getByText("See your posts").closest(".step-row")).toHaveAttribute("data-state", "complete");
  expect(within(stepRail).getByText("Find what worked").closest(".step-row")).toHaveAttribute("data-state", "complete");
  expect(within(stepRail).getByText("Understand why").closest(".step-row")).toHaveAttribute("data-state", "complete");
  expect(within(stepRail).getByText("Write your next post").closest(".step-row")).toHaveAttribute("aria-current", "step");
});

test("does not block the ready shell on deferred panel hydration", async () => {
  const pendingSecondary = new Promise<Response>(() => {});
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/api/dashboard")) {
      return new Response(JSON.stringify(dashboardState({ snapshot: snapshotFixture, analysis: analysisFixture })), {
        status: 200
      });
    }
    if (
      url.endsWith("/api/analysis/latest") ||
      url.endsWith("/api/strategy-memory/latest") ||
      url.endsWith("/api/topics/latest")
    ) {
      return pendingSecondary;
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);

  render(<App />);

  expect(await screen.findByRole("heading", { name: "Your strategy" })).toBeInTheDocument();
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/dashboard"));
  expect(screen.getByText("1 post loaded")).toBeInTheDocument();
  expect(screen.queryByText("Loading")).not.toBeInTheDocument();
});

test("keeps advanced strategy tools behind a closed strategy engine disclosure", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/dashboard")) {
        return new Response(JSON.stringify(dashboardState({ snapshot: snapshotFixture, analysis: analysisFixture })), {
          status: 200
        });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    })
  );

  render(<App />);

  const strategyEngine = await screen.findByLabelText("Advanced tools");
  expect(strategyEngine.tagName).toBe("DETAILS");
  expect(strategyEngine).not.toHaveAttribute("open");
  expect(within(strategyEngine).getByText("Strategy tools")).toBeInTheDocument();
  expect(within(strategyEngine).getByText(/Test ideas, save memory/i)).toBeInTheDocument();

  fireEvent.click(within(strategyEngine).getByText("Strategy tools"));

  expect(await within(strategyEngine).findByRole("group", { name: "Strategy engine views" })).toBeInTheDocument();
  const experimentsTab = within(strategyEngine).getByRole("button", { name: /Experiments/i });
  expect(experimentsTab).toHaveAttribute("aria-pressed", "true");
  expect(within(strategyEngine).getByRole("heading", { name: "Ideas you're testing" })).toBeInTheDocument();
  expect(within(strategyEngine).queryByRole("button", { name: /Update strategy memory/i })).not.toBeInTheDocument();

  fireEvent.click(within(strategyEngine).getByRole("button", { name: /Memory/i }));
  expect(await within(strategyEngine).findByRole("button", { name: /Update strategy memory/i })).toBeInTheDocument();

  fireEvent.click(within(strategyEngine).getByRole("button", { name: /Topics/i }));
  expect(await within(strategyEngine).findByRole("button", { name: /Explore nearby topics/i })).toBeInTheDocument();
});

test("opens advanced strategy tools when a memory proposal needs review", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/dashboard")) {
        return new Response(
          JSON.stringify(dashboardState({ snapshot: snapshotFixture, analysis: analysisFixture, proposal: pendingMemoryProposal })),
          { status: 200 }
        );
      }
      if (url.endsWith("/api/strategy-memory/latest")) {
        return new Response(JSON.stringify({ memory: null, proposal: pendingMemoryProposal }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    })
  );

  render(<App />);

  const strategyEngine = await screen.findByLabelText("Advanced tools");
  await waitFor(() => expect(strategyEngine).toHaveAttribute("open"));
  await waitFor(() => expect(within(strategyEngine).getByText("Memory suggestion ready")).toBeInTheDocument());
});

test("lets the ranked review send a selected post into Post Lab", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/dashboard")) {
        return new Response(JSON.stringify(dashboardState({ snapshot: snapshotFixture, analysis: analysisFixture })), {
          status: 200
        });
      }
      if (url.endsWith("/api/analysis/latest")) {
        return new Response(JSON.stringify({ analysis: analysisFixture }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    })
  );

  render(<App />);

  await screen.findByText("Most creator dashboards are autopsies. I want one that works like a strategist.");
  fireEvent.click(await screen.findByRole("button", { name: /Work this post/i }));

  const selectedWorkspace = screen.getByLabelText("Selected post workspace");
  expect(screen.getByRole("heading", { name: "Selected post lab" })).toBeInTheDocument();
  expect(within(selectedWorkspace).getByText("Rewrite selected post")).toBeInTheDocument();
  expect(within(selectedWorkspace).getByText("Most creator dashboards are autopsies. I want one that works like a strategist.")).toBeInTheDocument();
  expect(within(selectedWorkspace).getByRole("button", { name: /Copy remix brief/i })).toBeInTheDocument();
});

test("shows a production queue that prioritizes selected post remixes over generated drafts", async () => {
  const generation = {
    posts: [
      {
        title: "Turn analytics into a strategist",
        angle: "Position the dashboard as an operating system, not a report.",
        why_this: "It continues the strongest contrast in the audit.",
        hook: "A social dashboard should end with a next move.",
        draft: "A social dashboard should end with a next move. Otherwise it is just prettier regret.",
        source_signal: "Specific product takes outperform broad claims."
      }
    ]
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/dashboard")) {
        return new Response(JSON.stringify(dashboardState({ snapshot: snapshotFixture, analysis: analysisFixture, generation })), {
          status: 200
        });
      }
      if (url.endsWith("/api/analysis/latest")) {
        return new Response(JSON.stringify({ analysis: analysisFixture }), { status: 200 });
      }
      if (url.endsWith("/api/generation/latest")) {
        return new Response(JSON.stringify({ generation }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    })
  );

  render(<App />);

  await screen.findByText("Most creator dashboards are autopsies. I want one that works like a strategist.");
  fireEvent.click(await screen.findByRole("button", { name: /Work this post/i }));

  const productionQueue = await screen.findByLabelText("Today's drafts");
  expect(within(productionQueue).getByRole("heading", { name: "Draft queue" })).toBeInTheDocument();
  expect(within(productionQueue).getByText(/Selected remix first/i)).toBeInTheDocument();

  const slots = Array.from(productionQueue.querySelectorAll(".production-primary-slot-list > .production-slot"));
  expect(slots).toHaveLength(1);
  expect(slots[0]).toHaveTextContent("Remix selected post");
  expect(slots[0]).toHaveTextContent("Ready to copy");
  const backlog = within(productionQueue).getByLabelText("More drafts");
  expect(backlog.tagName).toBe("DETAILS");
  expect(backlog).not.toHaveAttribute("open");
  expect(within(backlog).getByText("1 alternate slot")).toBeInTheDocument();
  expect(within(backlog).getByText("Turn analytics into a strategist")).toBeInTheDocument();
  expect(within(productionQueue).getByRole("button", { name: /Copy today's plan/i })).toBeInTheDocument();
});

test("keeps raw generated drafts behind a closed draft library", async () => {
  const generation = {
    posts: [
      {
        title: "Turn analytics into a strategist",
        angle: "Position the dashboard as an operating system, not a report.",
        why_this: "It continues the strongest contrast in the audit.",
        hook: "A social dashboard should end with a next move.",
        draft: "A social dashboard should end with a next move. Otherwise it is just prettier regret.",
        source_signal: "Specific product takes outperform broad claims."
      },
      {
        title: "Audit the workflow",
        angle: "Make the audit useful for a beginner.",
        why_this: "It explains why the product matters.",
        hook: "A beginner should know what to do in five seconds.",
        draft: "A beginner should know what to do in five seconds. If the tool cannot say that, it is not a dashboard yet.",
        source_signal: "Clear next actions make the audit usable."
      }
    ]
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/dashboard")) {
        return new Response(JSON.stringify(dashboardState({ snapshot: snapshotFixture, analysis: analysisFixture, generation })), {
          status: 200
        });
      }
      if (url.endsWith("/api/generation/latest")) {
        return new Response(JSON.stringify({ generation }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    })
  );

  render(<App />);

  expect(await screen.findByLabelText("Today's drafts")).toBeInTheDocument();
  const draftLibrary = await screen.findByLabelText("Draft library");
  expect(draftLibrary.tagName).toBe("DETAILS");
  expect(draftLibrary).not.toHaveAttribute("open");
  expect(within(draftLibrary).getByText("2 generated drafts")).toBeInTheDocument();
  expect(within(draftLibrary).getByText(/Turn analytics into a strategist/)).toBeInTheDocument();
  expect(within(draftLibrary).getByText("Audit the workflow")).toBeInTheDocument();
});

test("puts the generated production queue before the posting brief support", async () => {
  const generation = {
    posts: [
      {
        title: "Turn analytics into a strategist",
        angle: "Position the dashboard as an operating system, not a report.",
        why_this: "It continues the strongest contrast in the audit.",
        hook: "A social dashboard should end with a next move.",
        draft: "A social dashboard should end with a next move. Otherwise it is just prettier regret.",
        source_signal: "Specific product takes outperform broad claims."
      }
    ]
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/dashboard")) {
        return new Response(JSON.stringify(dashboardState({ snapshot: snapshotFixture, analysis: analysisFixture, generation })), {
          status: 200
        });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    })
  );

  render(<App />);

  const postLab = (await screen.findByRole("heading", { name: "Drafts for today" })).closest("section");
  expect(postLab).not.toBeNull();
  const productionQueue = within(postLab as HTMLElement).getByLabelText("Today's drafts");
  const postingBrief = within(postLab as HTMLElement).getByLabelText("Recommended posting brief");
  expect(productionQueue.compareDocumentPosition(postingBrief)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  expect(postingBrief.tagName).toBe("DETAILS");
  expect(postingBrief).not.toHaveAttribute("open");
  expect(within(postingBrief).getByText("Posting brief")).toBeInTheDocument();
  expect(within(postingBrief).getAllByText("Position the dashboard as an operating system, not a report.").length).toBeGreaterThan(0);
});

test("hides idle production workflow telemetry until a slot is worked", async () => {
  const generation = {
    posts: [
      {
        title: "Turn analytics into a strategist",
        angle: "Position the dashboard as an operating system, not a report.",
        why_this: "It continues the strongest contrast in the audit.",
        hook: "A social dashboard should end with a next move.",
        draft: "A social dashboard should end with a next move. Otherwise it is just prettier regret.",
        source_signal: "Specific product takes outperform broad claims."
      }
    ]
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/dashboard")) {
        return new Response(JSON.stringify(dashboardState({ snapshot: snapshotFixture, analysis: analysisFixture, generation })), {
          status: 200
        });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    })
  );

  render(<App />);

  const productionQueue = await screen.findByLabelText("Today's drafts");
  const primarySlot = productionQueue.querySelector(".production-primary-slot-list > .production-slot");
  expect(primarySlot).not.toBeNull();
  expect(within(productionQueue).queryByLabelText("Draft status")).toBeNull();
});

test("keeps skipped-only production workflow history behind the tracker summary", async () => {
  const storage = new Map<string, string>([
    ["social-audit-production-workflow-v1", JSON.stringify({ "generated-1": "skipped" })]
  ]);
  vi.stubGlobal("localStorage", {
    getItem: vi.fn((key: string) => storage.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      storage.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      storage.delete(key);
    })
  });
  const generation = {
    posts: [
      {
        title: "Turn analytics into a strategist",
        angle: "Position the dashboard as an operating system, not a report.",
        why_this: "It continues the strongest contrast in the audit.",
        hook: "A social dashboard should end with a next move.",
        draft: "A social dashboard should end with a next move. Otherwise it is just prettier regret.",
        source_signal: "Specific product takes outperform broad claims."
      }
    ]
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/dashboard")) {
        return new Response(JSON.stringify(dashboardState({ snapshot: snapshotFixture, analysis: analysisFixture, generation })), {
          status: 200
        });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    })
  );

  render(<App />);

  const productionQueue = await screen.findByLabelText("Today's drafts");
  const workflowTracker = within(productionQueue).getByLabelText("Draft status");
  expect(workflowTracker).not.toHaveAttribute("open");
  expect(within(workflowTracker).getByText(/1 skipped/)).toBeInTheDocument();
  expect(within(workflowTracker).getByText("What happened to each draft.")).toBeInTheDocument();
});

test("promotes the next open production slot when the leading draft is skipped", async () => {
  const storage = new Map<string, string>([
    ["social-audit-production-workflow-v1", JSON.stringify({ "generated-1": "skipped" })]
  ]);
  vi.stubGlobal("localStorage", {
    getItem: vi.fn((key: string) => storage.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      storage.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      storage.delete(key);
    })
  });
  const generation = {
    posts: [
      {
        title: "Skipped first idea",
        angle: "This draft was already dismissed.",
        why_this: "It is no longer the next action.",
        hook: "A skipped draft should not block the queue.",
        draft: "A skipped draft should not block the queue. Move it behind the next live option.",
        source_signal: "Dismissed draft"
      },
      {
        title: "Live second idea",
        angle: "This is the next actionable draft.",
        why_this: "It keeps the writing workflow moving.",
        hook: "The next useful draft should move forward.",
        draft: "The next useful draft should move forward. A queue should not make you reopen old work before writing.",
        source_signal: "Actionable draft"
      }
    ]
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/dashboard")) {
        return new Response(JSON.stringify(dashboardState({ snapshot: snapshotFixture, analysis: analysisFixture, generation })), {
          status: 200
        });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    })
  );

  render(<App />);

  const productionQueue = await screen.findByLabelText("Today's drafts");
  const primarySlot = productionQueue.querySelector(".production-primary-slot-list > .production-slot");
  expect(primarySlot).not.toBeNull();
  expect(primarySlot).toHaveAttribute("data-workflow", "open");
  expect(primarySlot).toHaveTextContent("Live second idea");
  expect(primarySlot).toHaveTextContent("Next post");
  expect(primarySlot).not.toHaveTextContent("Skipped first idea");

  const backlog = within(productionQueue).getByLabelText("More drafts");
  expect(within(backlog).getByText("Skipped first idea")).toBeInTheDocument();
  expect(within(backlog).getByText("Skipped")).toBeInTheDocument();
});

test("persists production queue workflow state across refreshes", async () => {
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: vi.fn((key: string) => storage.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      storage.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      storage.delete(key);
    })
  });
  const generation = {
    posts: [
      {
        title: "Turn analytics into a strategist",
        angle: "Position the dashboard as an operating system, not a report.",
        why_this: "It continues the strongest contrast in the audit.",
        hook: "A social dashboard should end with a next move.",
        draft: "A social dashboard should end with a next move. Otherwise it is just prettier regret.",
        source_signal: "Specific product takes outperform broad claims."
      }
    ]
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/dashboard")) {
        return new Response(JSON.stringify(dashboardState({ snapshot: snapshotFixture, analysis: analysisFixture, generation })), {
          status: 200
        });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    })
  );

  const { unmount } = render(<App />);

  let productionQueue = await screen.findByLabelText("Today's drafts");
  fireEvent.click(within(productionQueue).getByRole("button", { name: /Plan slot/i }));

  expect(within(productionQueue).getByText(/1 planned/)).toBeInTheDocument();
  expect(within(productionQueue).getByText("Planned")).toBeInTheDocument();
  expect(window.localStorage.getItem("social-audit-production-workflow-v1")).toContain('"generated-1":"planned"');

  unmount();
  render(<App />);

  productionQueue = await screen.findByLabelText("Today's drafts");
  expect(within(productionQueue).getByText(/1 planned/)).toBeInTheDocument();
  expect(within(productionQueue).getByRole("button", { name: /Mark used/i })).toBeInTheDocument();
  expect(within(productionQueue).getByRole("button", { name: /Skip/i })).toBeInTheDocument();
});

test("surfaces readiness checks for production queue drafts", async () => {
  const generation = {
    posts: [
      {
        title: "Vague AI motivation",
        angle: "A weak broad claim that should not be treated as ready.",
        why_this: "It shows why the queue needs a readiness layer.",
        hook: "This is honestly really motivating.",
        draft: "This is honestly really motivating. AI tools are changing everything and creators need to pay attention.",
        source_signal: "Visible signal"
      }
    ]
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/dashboard")) {
        return new Response(JSON.stringify(dashboardState({ snapshot: snapshotFixture, analysis: analysisFixture, generation })), {
          status: 200
        });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    })
  );

  render(<App />);

  const productionQueue = await screen.findByLabelText("Today's drafts");
  const draftSupport = within(productionQueue).getByLabelText("Draft support for Vague AI motivation");
  expect(within(draftSupport).getByText(/^Readiness 0$/i)).toBeInTheDocument();
  expect(within(draftSupport).getAllByText(/Needs work/i)).toHaveLength(2);
  expect(within(draftSupport).getByText(/Add concrete proof/i)).toBeInTheDocument();
  expect(within(draftSupport).getByText(/Give the reader a clear next action/i)).toBeInTheDocument();
});

test("keeps production slot rationale and readiness checks behind draft support", async () => {
  const generation = {
    posts: [
      {
        title: "Vague AI motivation",
        angle: "A weak broad claim that should not be treated as ready.",
        why_this: "It shows why the queue needs a readiness layer.",
        hook: "This is honestly really motivating.",
        draft: "This is honestly really motivating. AI tools are changing everything and creators need to pay attention.",
        source_signal: "Visible signal"
      }
    ]
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/dashboard")) {
        return new Response(JSON.stringify(dashboardState({ snapshot: snapshotFixture, analysis: analysisFixture, generation })), {
          status: 200
        });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    })
  );

  render(<App />);

  const productionQueue = await screen.findByLabelText("Today's drafts");
  const primarySlot = productionQueue.querySelector(".production-primary-slot-list > .production-slot");
  expect(primarySlot).not.toBeNull();
  expect(within(primarySlot as HTMLElement).getByText(/AI tools are changing everything/i)).toBeInTheDocument();

  const draftSupport = within(primarySlot as HTMLElement).getByLabelText("Draft support for Vague AI motivation");
  expect(draftSupport.tagName).toBe("DETAILS");
  expect(draftSupport).not.toHaveAttribute("open");
  expect(within(draftSupport).getByText("Draft support")).toBeInTheDocument();
  expect(within(draftSupport).getByText(/Readiness 0 · Needs work/i)).toBeInTheDocument();
  expect(within(draftSupport).getByText(/Add concrete proof/i)).toBeInTheDocument();
});

test("closes the production loop by matching used drafts to captured posts", async () => {
  const draft = "A social dashboard should end with a next move. Otherwise it is just prettier regret.";
  const generation = {
    posts: [
      {
        title: "Turn analytics into a strategist",
        angle: "Position the dashboard as an operating system, not a report.",
        why_this: "It continues the strongest contrast in the audit.",
        hook: "A social dashboard should end with a next move.",
        draft,
        source_signal: "Specific product takes outperform broad claims."
      }
    ]
  };
  const snapshotWithPostedDraft = {
    ...snapshotFixture,
    posts: [
      {
        ...snapshotFixture.posts[0],
        xPostId: "posted-generated-1",
        url: "https://x.com/caseymcdougal/status/posted-generated-1",
        text: draft,
        viewsCount: 1400,
        likesCount: 22,
        repostsCount: 5,
        repliesCount: 3,
        bookmarksCount: 1
      }
    ]
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/dashboard")) {
        return new Response(JSON.stringify(dashboardState({ snapshot: snapshotWithPostedDraft, analysis: analysisFixture, generation })), {
          status: 200
        });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    })
  );

  render(<App />);

  const productionQueue = await screen.findByLabelText("Today's drafts");
  fireEvent.click(within(productionQueue).getByRole("button", { name: /Plan slot/i }));
  fireEvent.click(within(productionQueue).getByRole("button", { name: /Mark used/i }));

  const outcomeLoop = within(productionQueue).getByLabelText("What happened after posting");
  expect(within(outcomeLoop).getByText("1 used slot matched in the latest scan.")).toBeInTheDocument();
  expect(within(outcomeLoop).getByText("Matched captured post")).toBeInTheDocument();
  expect(within(outcomeLoop).getByText("1,400 views · 22 likes · 3 replies · 5 reposts · 1 bookmark")).toBeInTheDocument();
  expect(within(outcomeLoop).getByRole("link", { name: /Open post/i })).toHaveAttribute(
    "href",
    "https://x.com/caseymcdougal/status/posted-generated-1"
  );
});

test("run my audit chains scan, analysis, and drafting in order", async () => {
  const calls: string[] = [];
  const generation = {
    posts: [
      {
        title: "Pipeline post",
        angle: "One button.",
        why_this: "Chained run.",
        hook: "One click should do the whole audit.",
        draft: "One click should do the whole audit. Everything else is busywork.",
        source_signal: "Specific product takes outperform broad claims."
      }
    ]
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/dashboard")) {
        return new Response(JSON.stringify(dashboardState()), { status: 200 });
      }
      if (url.endsWith("/api/capture")) {
        calls.push("capture");
        return new Response(JSON.stringify({ ok: true, snapshot: snapshotFixture }), { status: 200 });
      }
      if (url.endsWith("/api/analyze")) {
        calls.push("analyze");
        return new Response(JSON.stringify({ ok: true, output: analysisFixture }), { status: 200 });
      }
      if (url.endsWith("/api/generate/today")) {
        calls.push("generate");
        return new Response(JSON.stringify({ ok: true, generation }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    })
  );

  render(<App />);

  fireEvent.click(await screen.findByRole("button", { name: /Run my audit/i }));

  await screen.findByRole("region", { name: "Your next post, ready to go" });
  expect(calls).toEqual(["capture", "analyze", "generate"]);
});

test("run my audit stops the chain when analysis fails", async () => {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/dashboard")) {
        return new Response(JSON.stringify(dashboardState()), { status: 200 });
      }
      if (url.endsWith("/api/capture")) {
        calls.push("capture");
        return new Response(JSON.stringify({ ok: true, snapshot: snapshotFixture }), { status: 200 });
      }
      if (url.endsWith("/api/analyze")) {
        calls.push("analyze");
        return new Response(JSON.stringify({ errorMessage: "Model quota exhausted" }), { status: 500 });
      }
      if (url.endsWith("/api/generate/today")) {
        calls.push("generate");
        return new Response(JSON.stringify({ ok: true, generation: { posts: [] } }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    })
  );

  render(<App />);

  fireEvent.click(await screen.findByRole("button", { name: /Run my audit/i }));

  const alert = await screen.findByRole("alert");
  expect(within(alert).getByText("Model quota exhausted")).toBeInTheDocument();
  expect(calls).toEqual(["capture", "analyze"]);
});
