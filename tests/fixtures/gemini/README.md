No Gemini CLI session existed on the machine these fixtures were captured on. `session.jsonl` is built field by field
from the Gemini CLI 0.59.0 sources (`chatRecordingTypes.ts`: header line, `user`/`gemini` records, `toolCalls`, `tokens`,
`$set` metadata lines, repeated ids). Replace it with a scrubbed real recording when one is available.
