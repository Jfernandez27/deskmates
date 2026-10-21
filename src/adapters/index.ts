import type { TranscriptAdapter } from "./transcript.ts";
import { codex } from "./codex/transcript.ts";
import { copilot } from "./copilot/transcript.ts";
import { cursor } from "./cursor/transcript.ts";
import { gemini } from "./gemini/transcript.ts";

/** Tools followed through their transcripts. Claude Code uses hooks instead (see `deskmates connect`). */
export const TRANSCRIPT_ADAPTERS: TranscriptAdapter[] = [codex, copilot, cursor, gemini];
