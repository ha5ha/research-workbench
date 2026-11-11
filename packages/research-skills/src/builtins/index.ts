import type { SkillImplementation } from "../registry.js";
import { runDataProfile } from "./data-profile.js";
import { runResearchRecords } from "./research-records.js";

export const builtInSkills: Record<string, SkillImplementation> = {
  "data-profile": runDataProfile,
  "research-checkpoint":runResearchRecords,
  "research-evidence-ledger":runResearchRecords,
  "research-decision-log":runResearchRecords,
  "research-next-step":runResearchRecords
};
