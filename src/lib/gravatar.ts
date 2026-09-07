/**
 * Gravatar fills the gap between "has uploaded a picture here" and "has no
 * picture at all": lots of people already have a face attached to their email
 * address elsewhere, and this borrows it.
 *
 * Only a hash of the address leaves the browser, and only when the person has
 * not uploaded a picture of their own. The URL asks for `d=404` so Gravatar
 * refuses rather than inventing a placeholder — the image then fails to load
 * and the initials chip takes over, which is the behaviour we already had.
 */

const K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98,
  0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8,
  0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819,
  0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
  0xc67178f2,
];

function rotr(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}

/**
 * SHA-256, by hand. `crypto.subtle` is asynchronous and `node:crypto` is not in
 * the browser bundle, but avatars render in both server and client components
 * and need the hash while rendering, so a synchronous implementation it is.
 */
export function sha256Hex(message: string): string {
  const input = new TextEncoder().encode(message);
  const bitLength = input.length * 8;
  const blockCount = Math.ceil((input.length + 9) / 64);
  const padded = new Uint8Array(blockCount * 64);
  padded.set(input);
  padded[input.length] = 0x80;
  new DataView(padded.buffer).setUint32(padded.length - 4, bitLength >>> 0, false);

  const h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const w = new Uint32Array(64);
  const view = new DataView(padded.buffer);

  for (let block = 0; block < blockCount; block++) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(block * 64 + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (hh + s1 + ch + K[i] + w[i]) >>> 0;
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) >>> 0;
      hh = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    const next = [a, b, c, d, e, f, g, hh];
    for (let i = 0; i < 8; i++) h[i] = (h[i] + next[i]) >>> 0;
  }

  return h.map((word) => word.toString(16).padStart(8, '0')).join('');
}

/** Gravatar identifies an address by the SHA-256 of its trimmed, lowercased form. */
export function gravatarHash(email: string): string {
  return sha256Hex(email.trim().toLowerCase());
}

/** Rendered size of each avatar, in CSS pixels, keyed by `AvatarSize`. */
export const AVATAR_PIXELS = { xs: 20, sm: 24, md: 32, lg: 40, xl: 64, '2xl': 96 } as const;

/** The only sizes the proxy will fetch: twice each rendered size, for retina screens. */
export const AVATAR_PROXY_SIZES: number[] = Object.values(AVATAR_PIXELS).map((pixels) => pixels * 2);

/**
 * Where to find this address's Gravatar, through our own origin rather than
 * `gravatar.com` directly — see `app/api/avatar/[hash]`. `size` is the pixel
 * size we want back and must be one of `AVATAR_PROXY_SIZES`.
 */
export function gravatarUrl(email: string | null | undefined, size: number): string | null {
  if (!email || !email.includes('@')) return null;
  return `/api/avatar/${gravatarHash(email)}?s=${size}`;
}
