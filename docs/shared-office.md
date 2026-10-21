# Shared office

One deskmates on a machine in your network (the lab) shows everyone's agents. Each PC keeps its own local office as before and also relays what it sees to the lab. A wall screen or tablet opens the lab's page and watches the whole team.

## What it is

- The **lab** runs `deskmates serve --lan --shared`. It holds no agents of its own: it only shows what the PCs send. A Claude Code session started on the lab machine itself, with its hooks connected, still shows up there, without an owner (no PC colour and no PC name).
- Each **PC** runs `deskmates serve --relay <lab url>`. Its own office at `127.0.0.1` works exactly as before. If the lab is down, nothing changes for you: the relay never blocks an event and gives up quickly.
- Characters from one PC wear that PC's colour and carry its name on the label, and sit at that PC's own island of four desks. The lab opens on the **Headquarters** floor: six islands, one per PC, each tinted with its PC's colour.

## Install the lab

```bash
git clone https://github.com/Jfernandez27/deskmates.git && cd deskmates
npm install
npm run build
node bin/deskmates.ts serve --lan --shared
```

`--shared` implies `--no-transcripts`: the lab has no agents of its own to follow.

To keep it running on Linux, a user service (adjust `ExecStart` to where `deskmates` or the clone lives):

```ini
# ~/.config/systemd/user/deskmates-lab.service
[Unit]
Description=deskmates shared office

[Service]
ExecStart=/usr/bin/node %h/deskmates/bin/deskmates.ts serve --lan --shared
Restart=on-failure

[Install]
WantedBy=default.target
```

```bash
systemctl --user daemon-reload
systemctl --user enable --now deskmates-lab
loginctl enable-linger $USER     # keep it running without a login session
```

## The token

On the lab:

```bash
deskmates token
```

On each PC, put it in a file only you can read:

```bash
mkdir -p ~/.config/deskmates
echo '<the token>' > ~/.config/deskmates/relay-token
chmod 600 ~/.config/deskmates/relay-token
```

`--relay-token <token>` and `DESKMATES_RELAY_TOKEN` work too; the flag wins, then the variable, then the file. It is the same token as the LAN link of the lab: whoever has it sees the office, so keep it to the team.

## Connect a PC

```bash
deskmates serve --relay http://lab:47821 --name "Jesús"
```

A PC that only relays does not need `--lan`: its office stays on `127.0.0.1` and the relay goes out to the lab. Add `--lan` only if you also want to open your own office from a tablet. `DESKMATES_RELAY` works in place of `--relay`.

If you already run deskmates as a service ([getting-started.md](getting-started.md)), edit the `ExecStart` line of `~/.config/systemd/user/deskmates.service` to add `--relay http://lab:47821 --name "Jesús"`, then `systemctl --user daemon-reload && systemctl --user restart deskmates`.

- `--name` is how you are called on the label (default: `DESKMATES_NAME`, then your user name). Long names crowd the label. `DESKMATES_NAME` is also the name a Claude Code session gives its own agent ([usage.md](usage.md)), so when you use that variable for your agents, set your PC's name with `--name`.
- Your PC gets an id of its own, kept in `~/.config/deskmates/machine-id`. Delete the file and you become a new PC.
- Check it with `deskmates doctor --relay http://lab:47821` (or `DESKMATES_RELAY`).

## The wall screen

Open the lab's address on the screen's browser, or scan the QR that `serve --lan` prints, and press the kiosk button (see [usage.md](usage.md#kiosk-mode) and [lan-and-remote.md](lan-and-remote.md)).

The shared office is **quiet**: no bell, no waiting count, no notifications. People answer permission prompts on their own PC. Add `?alerts` to the address to hear them anyway, or `?quiet` to silence a page that is not shared.

When agents from different PCs wait for permission at the same time they walk over and chat, and a question mark gives way to the chat bubble only for those visitors.

To see all of this without a lab, run `deskmates demo --pcs 4 --waiting 2` against your own office: the simulated agents arrive as if relayed from four PCs.

## What is shared

Same as the ingest API: for each event, the tool name and a detail of at most 120 characters (a file name, the first line of a command), the working folder, the model, the session name and your PC's name and host name. File and folder names are visible to everyone with the token.

Prompts, file contents and tool output never leave your PC. The lab keeps no history per person.

## Islands and colours

The lab gives each PC a clothing colour (eight, in order of arrival; a ninth PC reuses the first) and an island of four desks. A shared office opens on the **Headquarters** floor (`serve --shared` without `--theme`): one floor of 24 desks in six islands, one per PC in order of arrival, the floor under each tinted with its PC's colour. A seventh PC shares the first PC's island (and wears its own colour, the seventh); a second floor opens only when all 24 desks are taken. The café in the middle is where waiting agents from different PCs meet; the lounge is for ordinary breaks. An agent whose island is full takes a free desk on an island no PC holds yet, and only when there is none the first free desk elsewhere; a subagent sits as close to its parent as those rules allow, so it never lands on another PC's island while its own or an unheld one has room. A lab started with a room theme (`serve --shared --theme day`) numbers desks as the personal office does: rooms of two rows of four, and while eight or fewer agents are seated the third and fourth PC share rows with the first two, so the shirt colour is what tells PCs apart. A room theme picked only on the page (`?theme=day`) keeps the lab's 24-desk numbering and lays it out as up to three rooms of eight, each PC on its own row. Only bundled themes set the lab's desk numbering: a theme of your own with a `layout` is drawn with its floor, but the lab numbers desks 8 to a room, islands of 4. A theme saved in the browser wins over the lab's (the page takes `?theme`, then the saved choice, then the server's theme), so a wall screen that once picked another theme keeps it; pick the lab's theme again in the selector. The order is kept in `$XDG_STATE_HOME/deskmates/shared.json` (default `~/.local/state/deskmates/shared.json`), so colours do not change when the lab restarts. Delete the file to start over.

## Troubleshooting

What `deskmates doctor --relay http://lab:47821` prints:

```
✓ shared office at http://lab:47821: 3 PC(s) connected
✗ shared office at http://lab:47821: token refused
✗ shared office at http://lab:47821 unreachable
✗ shared office at http://lab:47821: no token (--relay-token, DESKMATES_RELAY_TOKEN or ~/.config/deskmates/relay-token)
```

(one of them, depending on the case; the last means the PC has no token yet, see [The token](#the-token)). `serve --relay` without a token stops with "--relay needs the lab's token".

- `deskmates doctor --relay http://lab:47821` on a PC says whether the lab answers: `✓ ... N PC(s) connected`, `✗ ... token refused` (wrong token) or `✗ ... unreachable` (address, port, `--lan` missing on the lab, firewall). On the lab, `deskmates doctor` prints `· shared office: N PC(s) seen`.
- Each PC may send 600 events per minute; beyond that the lab answers 429 and the relay drops events. Drops are logged once a minute.
- A PC that goes off without closing its office leaves ghosts: the characters sit still until the 30-minute silence rule makes them leave. A clean shutdown of `serve` sends `end` for everyone.
- Characters show in the wrong colour after changing machines: delete `machine-id` on the PC, or `shared.json` on the lab.
