import {
  argon2Sync,
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

const ARGON_MEMORY = 19_456;
const ARGON_PASSES = 2;
const ARGON_PARALLELISM = 1;
const ARGON_TAG_LENGTH = 32;

export function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = argon2Sync('argon2id', {
    message: password,
    nonce: salt,
    parallelism: ARGON_PARALLELISM,
    tagLength: ARGON_TAG_LENGTH,
    memory: ARGON_MEMORY,
    passes: ARGON_PASSES,
  });
  return [
    'webos-argon2id',
    'v=1',
    `m=${ARGON_MEMORY},t=${ARGON_PASSES},p=${ARGON_PARALLELISM}`,
    salt.toString('base64url'),
    hash.toString('base64url'),
  ].join('$');
}

export function verifyPassword(password, encoded) {
  try {
    const [name, version, params, saltValue, hashValue] = encoded.split('$');
    if (name !== 'webos-argon2id' || version !== 'v=1') return false;
    const parsed = Object.fromEntries(
      params.split(',').map((part) => {
        const [key, value] = part.split('=');
        return [key, Number(value)];
      }),
    );
    const expected = Buffer.from(hashValue, 'base64url');
    const actual = argon2Sync('argon2id', {
      message: password,
      nonce: Buffer.from(saltValue, 'base64url'),
      parallelism: parsed.p,
      tagLength: expected.length,
      memory: parsed.m,
      passes: parsed.t,
    });
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export function createOpaqueToken(bytes = 32) {
  return randomBytes(bytes).toString('base64url');
}

export function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

export function safeEqualText(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && timingSafeEqual(a, b);
}
