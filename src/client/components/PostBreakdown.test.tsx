import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import type { AnalysisOutput } from "../../shared/analysis-schema";
import type { RankedPost } from "../../shared/performance";
import { PostBreakdown } from "./PostBreakdown";

const rankedPosts: RankedPost[] = [
  {
    rank: 1,
    score: 25,
    post: {
      xPostId: "post-1",
      url: "https://x.com/caseymcdougal/status/1",
      text: "A source post",
      postedAt: "2026-06-23T12:00:00.000Z",
      capturedAt: "2026-06-23T13:00:00.000Z",
      source: "manual",
      viewsCount: 100,
      likesCount: 10,
      repostsCount: 1,
      repliesCount: 2,
      bookmarksCount: 3
    }
  }
];

const rankedReviewPosts: RankedPost[] = Array.from({ length: 6 }, (_, index) => ({
  rank: index + 1,
  score: 30 - index,
  post: {
    xPostId: `post-${index + 1}`,
    url: `https://x.com/caseymcdougal/status/${index + 1}`,
    text: index < 3 ? `Visible decision post ${index + 1}` : `Long tail post ${index + 1}`,
    postedAt: "2026-06-23T12:00:00.000Z",
    capturedAt: "2026-06-23T13:00:00.000Z",
    source: "manual",
    viewsCount: 100 - index,
    likesCount: 10 - index,
    repostsCount: 1,
    repliesCount: 2,
    bookmarksCount: 3
  }
}));

const analysis: AnalysisOutput = {
  executive_summary: "Summary",
  account_positioning_read: "Positioning",
  top_patterns: ["Pattern"],
  what_is_working: ["Working"],
  what_is_holding_back: ["Constraint"],
  recommended_content_pillars: ["Pillar"],
  next_post_ideas: [{ title: "Idea", reason: "Reason", hook: "Hook", draft: "Draft" }],
  post_analyses: [
    {
      post_id: "post-1",
      performance_read: "Performance",
      likely_reason: "Reason",
      hook_diagnosis: "Hook diagnosis",
      clarity_diagnosis: "Clarity",
      audience_fit: "Audience",
      recommended_change: "Change",
      rewrite: "Rewrite",
      variant_hooks: ["Variant"]
    }
  ]
};

test("keeps ranked rewrite copy stable when clipboard permission is denied", async () => {
  const writeText = vi.fn().mockRejectedValue(new DOMException("Document is not focused", "NotAllowedError"));
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText }
  });

  render(<PostBreakdown rankedPosts={rankedPosts} analysis={analysis} />);

  const details = screen.getByLabelText("Post analysis details for post #1");
  expect(details.tagName).toBe("DETAILS");
  expect(details).not.toHaveAttribute("open");
  expect(within(details).getByText("Rewrite and diagnosis")).toBeInTheDocument();

  const copyButton = within(details).getByRole("button", { name: /Copy rewrite/i });
  fireEvent.click(copyButton);

  await waitFor(() => expect(writeText).toHaveBeenCalledWith("Rewrite"));
  expect(copyButton).toHaveTextContent("Copy unavailable");
});

test("keeps the ranked long tail behind a closed full-review disclosure", () => {
  render(<PostBreakdown rankedPosts={rankedReviewPosts} analysis={null} />);

  expect(screen.getByRole("heading", { name: "What resonated most" })).toBeInTheDocument();
  expect(screen.getByText("6 ranked")).toBeInTheDocument();
  expect(screen.getByText(/Showing the strongest decision posts first/i)).toBeInTheDocument();
  expect(screen.getByText("Visible decision post 1")).toBeInTheDocument();
  expect(screen.getByText("Visible decision post 2")).toBeInTheDocument();
  expect(screen.getByText("Visible decision post 3")).toBeInTheDocument();

  const fullReview = screen.getByLabelText("Full ranked review");
  expect(fullReview.tagName).toBe("DETAILS");
  expect(fullReview).not.toHaveAttribute("open");
  expect(within(fullReview).getByText("Long tail post 4")).toBeInTheDocument();
  expect(within(fullReview).getByText("Long tail post 5")).toBeInTheDocument();
  expect(within(fullReview).getByText("Long tail post 6")).toBeInTheDocument();
  expect(within(fullReview).getByText("3 more posts")).toBeInTheDocument();
});

test("can keep ranked evidence behind a closed source-evidence disclosure", () => {
  render(<PostBreakdown rankedPosts={rankedReviewPosts} analysis={null} deferred />);

  const sourceEvidence = screen.getByLabelText("Your posts ranked");
  expect(sourceEvidence.tagName).toBe("DETAILS");
  expect(sourceEvidence).not.toHaveAttribute("open");
  expect(within(sourceEvidence).getByText("6 ranked posts")).toBeInTheDocument();
  expect(within(sourceEvidence).getByRole("heading", { name: "What resonated most" })).toBeInTheDocument();
  expect(within(sourceEvidence).getByText("Visible decision post 1")).toBeInTheDocument();
  expect(within(sourceEvidence).getByLabelText("Full ranked review")).not.toHaveAttribute("open");
});
