# Ingest API

Any tool or script can put an agent in the office by posting events to the deskmates service. Use it for agents deskmates has no adapter for: your own scripts, CI jobs on this machine, other CLIs.

## Endpoint

```
POST http://127.0.0.1:47821/v1/events
Authorization: Bearer <token>
Content-Type: application/json

<event> | [<event>, …]        (at most 100 per request)
```

The token is created on the first `deskmates serve` in `~/.config/deskmates/token` (owner-only). Print it with `deskmates token`.

Responses: `202 {"accepted": n}`; `400 {"error": "events[i].field …"}` naming the field that failed; `401` bad token; `413` body over 64 KB or more than 100 events; `429` over 600 events per minute.

## Event

| Field | Required | Notes |
|---|---|---|
| `source` | yes | tool name, `[a-z0-9._-]`, 1–40 chars. Shown on the label unless it is `claude` |
| `session` | yes | stable id of the session, 1–200 chars |
| `kind` | yes | `start`, `tool` (working), `waiting` (needs you), `idle` (done for now), `end` (leaves), `usage` |
| `agent` | | role name; matched against `roles.toml` for the outfit |
| `profile` | | to tell apart two configs of the same tool |
| `parent` | | session id of the parent: the character sits next to it as a subagent |
| `name` | | the name it goes by in the office, ≤ 40 chars; shown on the label instead of the role or folder, and the latest one wins |
| `model` | | the model it runs on, ≤ 80 chars, shown on the card; the latest one wins |
| `owner` | | id of the machine the event comes from; set by the relay of a [shared office](shared-office.md). lowercase `[a-z0-9._-]`, starting with a letter or digit, 1–64 chars; one owner per request |
| `ownerName` | | how that machine is called on the label, ≤ 40 chars |
| `ownerHost` | | its host name, `[a-zA-Z0-9.-]`, 1–64 chars |
| `cwd` | | working folder, shown on the card |
| `tool`, `detail` | | what it is doing, e.g. `"Edit"`, `"README.md"` (detail ≤ 120 chars) |
| `tokens` | | with `usage`: cumulative `{input, output, cacheRead?, cacheWrite?}` |
| `ts` | | ISO 8601; defaults to now, times in the future are clamped to now |

The 600 events per minute limit counts per owner on a shared office, so one busy PC does not use up the others' share. A request must carry a single `owner`.

Silence rules apply: no event for 10 minutes and the character falls asleep; 30 minutes and it leaves. Send `end` when the session finishes.

## curl

```bash
TOKEN=$(deskmates token)
curl -s -X POST http://127.0.0.1:47821/v1/events \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"source":"my-bot","session":"run-42","kind":"tool","agent":"reviewer","tool":"lint","detail":"src/"}'
```

## Node

```js
import { readFileSync } from "node:fs";
import { homedir } from "node:os";

const token = readFileSync(`${homedir()}/.config/deskmates/token`, "utf8").trim();
const post = (events) =>
  fetch("http://127.0.0.1:47821/v1/events", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(events),
  }).catch(() => {}); // deskmates not running: ignore

const me = { source: "my-bot", session: `run-${process.pid}`, agent: "reviewer", cwd: process.cwd() };
await post({ ...me, kind: "start" });
await post({ ...me, kind: "tool", tool: "lint", detail: "src/" });
await post({ ...me, kind: "usage", tokens: { input: 1200, output: 300 } });
await post({ ...me, kind: "end" });
```

`deskmates demo` fills the office with simulated agents through this API (see [getting-started.md](getting-started.md#demo-mode)).
