import type { Addresses } from "../server/lan-address.ts";
import { encode, TooLongError } from "../core/qr.ts";
import { qrText } from "./qr-text.ts";

export type BannerInput = { lan: boolean; port: number; token: string; addresses: Addresses; tty: boolean; relay?: { url: string; ownerName: string } };

export const linkFor = (ip: string, port: number, token: string) => `http://${ip}:${port}/?token=${token}`;
export const WARNING = "Anyone with that link sees your agents, folders and file names. Share it only on networks you trust.";
export const NO_ADDRESS = "no network address found: connect to a network and open the Share dialog";
export const HINT_OFF = "to see it on a tablet or phone: deskmates serve --lan";
const QR_ON = "\x1b[30;107m";
const QR_OFF = "\x1b[0m";
export const TOO_LONG = "link too long for a QR: open it by hand";

/** The lines `serve` prints after its local link. Pure. */
export function lanBanner(i: BannerInput): string[] {
  const relay = i.relay ? [`relaying to ${i.relay.url} as ${i.relay.ownerName}`] : [];
  if (!i.lan) return [...relay, HINT_OFF];
  const { primary, alternatives } = i.addresses;
  if (!primary) return [NO_ADDRESS, WARNING, ...relay];
  const link = linkFor(primary, i.port, i.token);
  const lines = [`on your network: ${link}`];
  if (i.tty) {
    // Dark on light whatever the terminal's theme: a QR read on a dark background is inverted and many scanners refuse it.
    try { lines.push(...qrText(encode(link), 4).split("\n").map((l) => `${QR_ON}${l}${QR_OFF}`)); }
    catch (e) { if (!(e instanceof TooLongError)) throw e; lines.push(TOO_LONG); }
  }
  for (const ip of alternatives) lines.push(`also: ${linkFor(ip, i.port, i.token)}`);
  lines.push(WARNING, ...relay);
  return lines;
}
