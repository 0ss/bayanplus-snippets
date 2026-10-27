/** Browser signals the tracker hashes with seed 256. */
export type BrowserSignals = {
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

/** Runs in the browser. Returns a 53-bit fingerprint. */
export function fingerprint(signals: BrowserSignals): number {
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
  const material =
    signals.canvas + navigator + signals.plugins + signals.webgl + signals.mimeTypes;
  return cyrb53(material);
}

/** Runs on the server: fingerprint + IP + project → visitor id. */
export function visitorId(
  browserFingerprint: number | undefined,
  ip: string,
  projectId: string,
): number {
  const fp =
    browserFingerprint === undefined
      ? Math.random().toString(36).slice(2)
      : String(browserFingerprint);
  return cyrb53(fp + ip + projectId);
}
