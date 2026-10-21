/**
 * Names for agents that have neither a name of their own nor a role: drawn from a bank that suits the character they
 * were dealt, so the office reads as people rather than as folder names like "Documents".
 */
export type Bank = "f" | "m";

export const NAMES: Record<Bank, readonly string[]> = {
  f: ["Sofía", "Camila", "Valeria", "Lucía", "Martina", "Renata", "Isabel", "Paula", "Elena", "Inés",
    "Julia", "Clara", "Daniela", "Paz", "Ana", "Mika", "Lina", "Nora", "Rosa", "Ada"],
  m: ["Mateo", "Diego", "Tomás", "Joaquín", "Bruno", "Lucas", "Andrés", "Pablo", "Nico", "Felipe",
    "Hugo", "Iván", "Rafa", "Simón", "Omar", "Theo", "Max", "Sol", "Gus", "Leo"],
};

/**
 * Which bank each bundled character draws from, by the Pixel Agents body it is drawn on (scripts/draw-characters.py),
 * not by its description: body 1 wears a dress and body 5 a bob, the others shirt and trousers.
 */
export const BANK_OF: Record<string, Bank> = {
  dm0: "m", dm1: "m", dm2: "f", dm3: "m", dm4: "f", dm5: "f", dm6: "m", dm7: "m",
  pa0: "m", pa1: "f", pa2: "m", pa3: "m", pa4: "m", pa5: "f",
};

/** FNV-1a: a stable starting point in the bank for each session. */
function seedOf(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/**
 * Hands out names and remembers them, so an agent keeps its name while it is in the office. Each agent starts at a
 * point of its bank set by its session and takes the first name nobody present holds; only past the whole bank
 * (more than twenty agents from one bank) does a number follow, "Sofía 2".
 */
export class NameBook {
  private given = new Map<string, { bank: Bank; name: string }>();

  nameFor(key: string, session: string, bank: Bank): string {
    const had = this.given.get(key);
    if (had && had.bank === bank) return had.name;
    const taken = new Set([...this.given].filter(([k]) => k !== key).map(([, v]) => v.name));
    const list = NAMES[bank], start = seedOf(session) % list.length;
    let name: string | undefined;
    for (let round = 1; !name; round++) {
      for (let i = 0; i < list.length && !name; i++) {
        const n = round === 1 ? list[(start + i) % list.length] : `${list[(start + i) % list.length]} ${round}`;
        if (!taken.has(n)) name = n;
      }
    }
    this.given.set(key, { bank, name });
    return name;
  }

  /** Forgets agents that left, freeing their names. */
  keep(keys: Iterable<string>) {
    const live = new Set(keys);
    for (const k of this.given.keys()) if (!live.has(k)) this.given.delete(k);
  }
}
