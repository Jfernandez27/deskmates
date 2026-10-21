import { test, expect } from "vitest";
import { rankAddresses } from "../../src/server/lan-address.ts";

const v4 = (address: string, internal = false) => ({ address, family: "IPv4", internal });
const v6 = (address: string) => ({ address, family: "IPv6", internal: false });

test("a Linux box with Docker and k3s: the wired address wins, the bridges are dropped", () => {
  expect(rankAddresses({
    lo: [v4("127.0.0.1", true)], enp44s0: [v4("192.168.1.99"), v6("fe80::1")],
    "docker0": [v4("172.17.0.1")], "br-abc": [v4("172.18.0.1")], "cni0": [v4("10.42.0.1")], "flannel.1": [v4("10.42.0.0")],
  })).toEqual({ primary: "192.168.1.99", alternatives: [] });
});

test("wifi and ethernet both up: a stable order, both kept", () => {
  const r = rankAddresses({ wlp3s0: [v4("192.168.1.50")], eth0: [v4("192.168.1.51")] });
  expect(r.primary).toBe("192.168.1.51");           // "eth0" sorts before "wlp3s0" within the same rank
  expect(r.alternatives).toEqual(["192.168.1.50"]);
});

test("a Mac: en0 over utun and a public-range address", () => {
  expect(rankAddresses({ en0: [v4("10.0.0.7")], utun3: [v4("100.64.0.2")], awdl0: [v4("169.254.3.4")] }))
    .toEqual({ primary: "10.0.0.7", alternatives: ["169.254.3.4"] });
});

test("Windows virtual switches are dropped by prefix, case-insensitive", () => {
  // The prefixes are matched against the lower-cased name: "VMware Network Adapter" -> "vmware network adapter" starts with "vmware".
  expect(rankAddresses({ "vEthernet (WSL)": [v4("172.29.0.1")], "VMware Network Adapter": [v4("192.168.56.1")], "Wi-Fi": [v4("192.168.0.12")] }))
    .toEqual({ primary: "192.168.0.12", alternatives: [] });
});

test("nothing usable: loopback only, or IPv6 only", () => {
  expect(rankAddresses({ lo: [v4("127.0.0.1", true)] })).toEqual({ primary: null, alternatives: [] });
  expect(rankAddresses({ eth0: [v6("2001:db8::1")] })).toEqual({ primary: null, alternatives: [] });
  expect(rankAddresses({})).toEqual({ primary: null, alternatives: [] });
});

test("an adapter whose name merely starts with \"lo\" is kept; loopback names lo and lo0 are not", () => {
  expect(rankAddresses({ "Local Area Connection": [v4("192.168.0.20")], lo0: [v4("127.0.0.1")] })).toEqual({ primary: "192.168.0.20", alternatives: [] });
});
