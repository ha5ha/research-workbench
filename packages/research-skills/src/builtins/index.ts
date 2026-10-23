import type { SkillImplementation } from "../registry.js";
import { runDataProfile } from "./data-profile.js";

export const builtInSkills: Record<string, SkillImplementation> = {
  "data-profile": runDataProfile
};
