import { encode, TooLongError } from "../src/core/qr.ts";
import { qrCanvas, moduleSize } from "./qr.ts";

export type LanInfo = { lan: boolean; port: number; primary: string | null; alternatives: string[]; token: string | null };

export const COPY = {
  off: "The office only listens on this machine. Start it with deskmates serve --lan to open it on a tablet or phone.",
  noAddress: "No network address found. Connect to a network and open this again.",
  hint: "Scan with the tablet. The link is a key: anyone who scans it sees your agents.",
  tooLong: "The link is too long for a QR. Copy it instead.",
  others: "Other addresses:",
};

const link = (host: string, info: LanInfo) => `http://${host}:${info.port}/?token=${info.token}`;
const p = (text: string) => { const e = document.createElement("p"); e.textContent = text; return e; };
const code = (text: string) => { const e = document.createElement("code"); e.className = "share-link"; e.textContent = text; return e; };

/** The "Open on another device" dialog. The link with the token is built only after a click, never on load. */
export class ShareDialog {
  private button: HTMLButtonElement;
  private dialog: HTMLDialogElement;
  private body: HTMLElement;
  private fetchInfo: () => Promise<LanInfo>;

  constructor(button: HTMLButtonElement, dialog: HTMLDialogElement, fetchInfo: () => Promise<LanInfo>) {
    this.button = button; this.dialog = dialog; this.fetchInfo = fetchInfo;
    this.body = dialog.querySelector(".share-body")!;
    button.addEventListener("click", () => void this.open());
    dialog.querySelector(".share-close")!.addEventListener("click", () => this.close());
    dialog.addEventListener("cancel", (e) => { e.preventDefault(); this.close(); });
    dialog.addEventListener("click", (e) => { if (e.target === dialog) this.close(); });
  }

  isOpen() { return this.dialog.open; }

  async open() {
    if (this.dialog.open) return;
    this.body.replaceChildren(p("Loading…"));
    this.dialog.showModal();
    (this.dialog.querySelector("h2") as HTMLElement).focus();
    let info: LanInfo;
    try { info = await this.fetchInfo(); } catch { this.body.replaceChildren(p("Offline.")); return; }
    if (this.dialog.open) this.render(info);
  }

  close() {
    this.body.replaceChildren(); // the link does not outlive the dialog
    if (this.dialog.open) this.dialog.close();
    this.button.focus();
  }

  private render(info: LanInfo) {
    const out: Node[] = [];
    if (!info.lan || !info.token) {
      const e = document.createElement("p");
      const [before, cmd, after] = COPY.off.split(/(deskmates serve --lan)/);
      const c = document.createElement("code"); c.textContent = cmd;
      e.append(before, c, after);
      out.push(e);
    } else if (!info.primary) {
      out.push(p(COPY.noAddress));
    } else {
      const main = link(info.primary, info);
      try {
        const m = encode(main);
        out.push(qrCanvas(m, moduleSize(m.length, Math.min(360, innerWidth - 64))), code(main), p(COPY.hint));
      } catch (e) {
        if (!(e instanceof TooLongError)) throw e;
        out.push(code(main), p(COPY.tooLong));
      }
      if (info.alternatives.length) {
        out.push(p(COPY.others));
        for (const a of info.alternatives) out.push(code(link(a, info)));
      }
    }
    this.body.replaceChildren(...out);
  }
}
