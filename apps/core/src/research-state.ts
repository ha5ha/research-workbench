import type {
  LoopOverview,
  ResearchStateView
} from "@research-workbench/contracts";

/** The same projection guards direct model tools and readable Skill artifacts. */
export function researchStateView(state: LoopOverview): ResearchStateView {
  return {
    ...state,
    runs: state.runs.map(({ jobToken: _token, ...run }) => run)
  };
}
