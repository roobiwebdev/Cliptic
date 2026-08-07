/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: storyFormatsKnowledge, storytelling playbook,
 *   story formats, hook beat, resolution beat, knowledge pack
 *
 * WHAT:  The 10 short-form story formats DISTILLED for clip selection — for each
 *        format: how to recognize it in a transcript, where the clip starts
 *        (hook beat) and where it ends (resolution beat).
 * WHY:   Distilled from docs/storytelling-playbook.md (the human-editable source
 *        of truth — edit knowledge THERE, then re-distill here). The full doc is
 *        ~5k tokens of script-WRITING templates; recognition needs only this
 *        ~400-token beat map, and the system prompt is paid on every job, so
 *        distillation is a ~10x recurring token saving with no recognition loss.
 *        Phrased language-agnostically: the arcs apply to Amharic (or any
 *        language) exactly as to English.
 * WHERE: Registered in knowledge/index.ts; injected by stages/analyze.ts.
 */
import type { AnalysisKnowledgeBlock } from '../types'

export const storyFormatsKnowledge: AnalysisKnowledgeBlock = {
  id: 'story-formats',
  title: 'STORY FORMATS (recognize the arc, cut hook-beat to resolution-beat)',
  promptText: [
    `A moment is far more clip-worthy when it maps onto one of these 10 arcs. Identify the arc, start the clip at its HOOK BEAT, end it at its RESOLUTION BEAT. These arcs appear in every language — recognize them by structure and emotion, not by specific English phrasing.`,
    `1. Hero's Journey (problem→solution): "I struggled with X… nothing worked… then I found Y." Hook = the problem or the transformation claim. Resolution = the result the solution delivered.`,
    `2. Personal Learning/Epiphany: leads with a result or proof, then teaches how. Hook = the impressive result/claim. Resolution = the final step or restated insight.`,
    `3. About Me (origin story): "I was a normal X until Y happened." Hook = the life-changing trigger. Resolution = the mission/identity today.`,
    `4. Before/After (transformation): built on the gap between two states. Hook = the tease or the "before". Resolution = the reveal of the "after" (+ short context). Bigger gap = stronger clip; keep it tight.`,
    `5. Goal/Dream Journey: an ambitious open-ended dream. Hook = the dream + why it matters. Resolution = the progress mark or the invitation to follow.`,
    `6. Challenge: a bounded mission with rules/deadline. Hook = the challenge + stakes. Resolution = the outcome — or the cliffhanger beat.`,
    `7. Win (victory announcement): "It finally happened." Hook = the win itself. Resolution = the emotional beat (what it cost / what it means). Not a how-to — keep it raw and short.`,
    `8. Day In The Life: identity + an unexpected reality. Hook = the identity/aspiration line. Resolution = the day's outcome or honest takeaway.`,
    `9. Personal Update: news with a why. Hook = the tease of the change. Resolution = the rationale ("why I did it").`,
    `10. Lesson From Others (mentor story): someone else's story as the lesson. Hook = the person + the promise of the lesson. Resolution = the quoted lesson landing, or the result of applying it.`,
  ].join('\n'),
}
