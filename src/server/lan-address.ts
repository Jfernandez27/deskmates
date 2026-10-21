export type Iface = { address: string; family: string | number; internal: boolean };
export type Addresses = { primary: string | null; alternatives: string[] };

/** Interface-name prefixes of virtual networks (Docker, k3s, VPNs, Hyper-V, VMware, VirtualBox). Matched lower-cased. */
export const VIRTUAL_PREFIXES: readonly string[] = [
  "docker", "br-", "veth", "cni", "flannel", "virbr", "tailscale", "tun", "tap", "wg", "lo",
  "vEthernet", "vmware", "vbox", "utun",
];

const PREFIXES = VIRTUAL_PREFIXES.map((p) => p.toLowerCase());
const PREFERRED_NAMES = ["wl", "en", "eth"];

/** Loopback is matched by whole name only (lo, lo0, lo1 ...), so "Local Area Connection" is not loopback. */
function isVirtual(lower: string): boolean {
  return PREFIXES.some((p) => (p === "lo" ? /^lo\d*$/.test(lower) : lower.startsWith(p)));
}

function ipv4Octets(address: string): number[] | null {
  const parts = address.split(".");
  if (parts.length !== 4) return null;
  const octets = parts.map(Number);
  return octets.every((o, i) => /^\d+$/.test(parts[i]) && o >= 0 && o <= 255) ? octets : null;
}

/** RFC 1918 private ranges: the ones a phone on the same wifi can reach. */
function isPrivate(o: number[]): boolean {
  if (o[0] === 192 && o[1] === 168) return true;
  if (o[0] === 10) return true;
  return o[0] === 172 && o[1] >= 16 && o[1] <= 31;
}

/** Ranks a machine's IPv4 addresses: the first is the one a phone on the wifi can reach. Pure. */
export function rankAddresses(ifaces: Record<string, Iface[] | undefined>): Addresses {
  const ranked: { address: string; name: string; rank: [number, number] }[] = [];
  for (const [name, list] of Object.entries(ifaces)) {
    const lower = name.toLowerCase();
    if (isVirtual(lower)) continue;
    for (const iface of list ?? []) {
      if (iface.internal) continue;
      if (iface.family !== "IPv4" && iface.family !== 4) continue;
      const octets = ipv4Octets(iface.address);
      if (!octets) continue;
      const privateRank = isPrivate(octets) ? 0 : 1;
      const nameRank = PREFERRED_NAMES.some((p) => lower.startsWith(p)) ? 0 : 1;
      ranked.push({ address: iface.address, name, rank: [privateRank, nameRank] });
    }
  }
  ranked.sort((a, b) =>
    a.rank[0] - b.rank[0] || a.rank[1] - b.rank[1] ||
    (a.name < b.name ? -1 : a.name > b.name ? 1 : 0) ||
    (a.address < b.address ? -1 : a.address > b.address ? 1 : 0));
  const addresses = ranked.map((r) => r.address);
  return { primary: addresses[0] ?? null, alternatives: addresses.slice(1) };
}
