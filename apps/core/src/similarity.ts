/**
 * Lightweight similarity for "have we already tried this?" lookups.
 *
 * No embeddings and no index: the corpus is a single workspace (dozens to
 * hundreds of facts/runs), so a token-overlap score is enough and has no
 * dependency or migration cost. Chinese text is tokenised into character
 * bigrams, latin text into words.
 *
 * Practice reference: R&D deduplication tools surface prior art at the moment a
 * decision is made rather than silently blocking it — so this only ranks and
 * reports; the human still confirms the task book.
 */

export interface SimilarCandidate {
  id: string;
  text: string;
  kind?: string;
}

export interface SimilarMatch {
  id: string;
  text: string;
  kind?: string;
  score: number;
}

const MIN_SCORE = 0.1;
const DEFAULT_LIMIT = 3;

export function tokenize(text: string): string[] {
  const lower = text.toLowerCase();
  const tokens: string[] = [];
  const latin = lower.match(/[a-z0-9][a-z0-9_.-]*/g) ?? [];
  tokens.push(...latin);
  const cjkRuns = lower.match(/[\u4e00-\u9fff]+/g) ?? [];
  for (const run of cjkRuns) {
    if (run.length === 1) {
      tokens.push(run);
      continue;
    }
    for (let index = 0; index < run.length - 1; index += 1) {
      tokens.push(run.slice(index, index + 2));
    }
  }
  return tokens;
}

function tokenSet(text: string): Set<string> {
  return new Set(tokenize(text));
}

/** Cosine similarity over binary token vectors. */
export function similarity(a: string, b: string): number {
  const left = tokenSet(a);
  const right = tokenSet(b);
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const token of left) {
    if (right.has(token)) shared += 1;
  }
  return shared / Math.sqrt(left.size * right.size);
}

export function rankSimilar(
  target: string,
  candidates: SimilarCandidate[],
  options: { limit?: number; minScore?: number } = {}
): SimilarMatch[] {
  const limit = options.limit ?? DEFAULT_LIMIT;
  const minScore = options.minScore ?? MIN_SCORE;
  return candidates
    .map((candidate) => ({
      id: candidate.id,
      text: candidate.text,
      kind: candidate.kind,
      score: similarity(target, candidate.text)
    }))
    .filter((match) => match.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
