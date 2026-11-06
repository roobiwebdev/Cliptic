# Hero product film

The landing hero shows a 30 s "product film": a code-drawn mock of the Cliptic
dashboard driven by one clock. It is not a video file. Code lives in
`src/components/global/product-film/`; timing lives in `script.ts`.

**One sentence:** Cliptic turns a long video (podcast, interview, talk) into
short, scored, captioned clips: paste a link or upload, and the AI transcribes it,
finds the best moments and cuts them.

## Feature ranking (want x how visual)

| # | Feature | Why it ranks here |
|---|---|---|
| 1 | Paste a link / upload (New clip job dialog) | The signature action, seen in the first 3 s |
| 2 | Live pipeline progress (Download, Transcribe, Analyze, Cut) | Proves it's real work, and shows speed |
| 3 | Word-level transcription | The thing the AI reasons over; easy to show streaming |
| 4 | AI moment selection with scores | The "magic"; highlighted transcript lines with score chips |
| 5 | Clips cut on natural pauses, with burned-in captions | The outcome's quality |
| 6 | Download all, ready for Reels / TikTok / Shorts (9:16) | The outcome the user came for |
| 7 | Bring your own AI | True and useful, but not visual; left out of the film |

**Aha flow:** Clips page, New clip, paste a YouTube link, Generate clips, watch
the stages run, clips appear with scores, Download all.

**UI vocabulary used:** Clips, New clip, New clip job, AI auto-detect, Manual,
Paste link, Upload, Video URL, Generate clips, Download / Transcribe / Analyze /
Cut, Downloading / Transcribing / Analyzing / Cutting / Ready, the stage hints
from `job-detail.tsx`, "Done in 2m 14s", Clips (3), Download all, Edit,
9:16 Reels / TikTok / Shorts. Theme tokens and `.glass` utilities only; Geist.

## Storyboard (30 s, one continuous session)

| # | Label | Caption | On screen and cursor | Payoff | Sound | Time |
|---|---|---|---|---|---|---|
| 1 | Paste a link | Paste a YouTube link, or upload a long video. | Clips page; click **New clip**; dialog opens with AI auto-detect; click Video URL, type `https://youtu.be/Qx7rT2mLp4E` | Link filled in | switch, key x N | 0-4.25 s |
| 2 | Generate | One click starts the whole pipeline. | Click **Generate clips**; dialog closes; job page opens, "Clip job started" toast, Downloading 0 to 15 % | Badge + live % | switch, sweep, start | 4.25-7.6 s |
| 3 | Transcribe | Every word is transcribed with a timestamp. | Transcribing 15 to 58 %; transcript panel streams lines word by word | Words land with timestamps | tick | 7.6-12.6 s |
| 4 | Find moments | AI reads the transcript and scores the best moments. | Analyzing 58 to 69 %; three lines highlight with score chips 94, 91, 87 | "3 moments found" | pop x 3 | 12.6-17.2 s |
| 5 | Cut clips | Clips are cut on natural pauses, never mid-sentence. | Cutting 69 to 100 %; clip cards pop in one by one with score, length, Edit, Download | Badge "Ready", "Done in 2m 14s" | pop x 3, chime | 17.2-21.6 s |
| 6 | Download & post | Download them, ready for Reels, TikTok and Shorts. | Click **Download all**; each card ticks; a 9:16 preview card plays clip 1 with karaoke captions | "3 clips downloaded" | switch, tick x 3, chime | 21.6-30 s |

**SETTLED (reduced-motion still):** 25.2 s, clip grid plus the 9:16 preview card.

**Narration (aria-label):** A Cliptic product demo: a YouTube link is pasted into
a new clip job, the video is downloaded and transcribed word by word, AI scores
the best moments, three captioned clips are cut and scored, and they are
downloaded ready for Reels, TikTok and Shorts.
