import {
  asVisitorId,
  type BrowserFingerprint,
  type ValidEvent,
  type VisitorId,
  asFingerprint,
} from "../domain/model";

/**
 * Signals the page hashed with seed 256. Server stores the number, not the canvas.
 * If that hash threw, the page sent cyrb53 of a random string instead.
 */
export type IdentitySignals = {
  canvas: string;
  userAgent: string;
  platform: string;
  cores: number;
  language: string;
  languages: string;
  deviceMemory: number;
  screen: string;
  timezoneOffsetMinutes: number;
  plugins: string;
  webgl: string;
  mimeTypes: string;
};

/** 53 bits, so the value fits in a JS number and a numeric column. Not a secret. */
export function cyrb53(value: string, seed = 256): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < value.length; i++) {
    const ch = value.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

export function browserFingerprint(signals: IdentitySignals): BrowserFingerprint {
  const navigator = [
    signals.userAgent,
    signals.platform,
    signals.cores,
    signals.language,
    signals.languages,
    signals.deviceMemory,
    signals.screen,
    signals.timezoneOffsetMinutes,
  ].join(";");
  const material = signals.canvas + navigator + signals.plugins + signals.webgl + signals.mimeTypes;
  return asFingerprint(cyrb53(material));
}

/**
 * Different inputs, same output. About a 50% chance some pair collides
 * near sqrt(2 * ln(2) * 2^bits): ~77k at 32 bits, ~112M at 53, ~5.1B at 64.
 */
export function birthdayBound(bits: 32 | 53 | 64): number {
  return Math.sqrt(2 * Math.log(2) * 2 ** bits);
}

export type Collision =
  | { kind: "hash"; detail: "different inputs, same 53-bit output" }
  | { kind: "identity"; detail: "same fingerprint, IP, and project" };

/**
 * IP is an input and a stored column. The hash is not an anonymizer.
 * A missing fingerprint is new random material, hashed with the IP and the project.
 */
export class IdentityResolver {
  resolve(event: ValidEvent): VisitorId {
    const fp = event.fingerprint === undefined ? randomMaterial() : String(event.fingerprint);
    return asVisitorId(cyrb53(fp + event.ip + event.projectId));
  }
}

function randomMaterial(): string {
  return Math.random().toString(36).slice(2);
}
