/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: getAnalysisKnowledge, knowledge pack, knowledge
 *   registry, virality knowledge, analysis knowledge blocks
 *
 * WHAT:  The knowledge-pack registry — the ONE place expert knowledge blocks
 *        are assembled into prompt text for the clip-selection AI.
 * WHY:   Knowledge is pluggable data, not prose hardcoded in the prompt: to add
 *        expertise later (niche rulebooks, platform norms), create a block file
 *        and register it here — analyze picks it up automatically. Keeps prompt
 *        knowledge reviewable, versioned, and token-budgeted per block.
 * WHERE: stages/analyze.ts injects getAnalysisKnowledge() into the system prompt.
 */
import type { AnalysisKnowledgeBlock } from '../types'
import { storyFormatsKnowledge } from './story-formats'

/** Ordered registry — every block ships in the analyze system prompt. */
const blocks: AnalysisKnowledgeBlock[] = [storyFormatsKnowledge]

export function getAnalysisKnowledge(): string {
  return blocks.map((b) => `## ${b.title}\n${b.promptText}`).join('\n\n')
}

export { storyFormatsKnowledge }
