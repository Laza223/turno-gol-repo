import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  createHmac,
} from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>

const KEY_LEN = 64
const SALT_LEN = 16

export const COOKIE_NAME = 'tg_pin_session'
export const COOKIE_TTL_MS = 30 * 60 * 1000

export async function hashPin(pin: string): Promise<string> {
  if (!/^\d{4,8}$/.test(pin)) {
    throw new Error('PIN must be 4-8 digits')
  }
  const salt = randomBytes(SALT_LEN)
  const derived = await scrypt(pin, salt, KEY_LEN)
  return `${salt.toString('base64')}:${derived.toString('base64')}`
}

export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  const [saltB64, hashB64] = stored.split(':')
  if (!saltB64 || !hashB64) return false
  const salt = Buffer.from(saltB64, 'base64')
  const expected = Buffer.from(hashB64, 'base64')
  const derived = await scrypt(pin, salt, expected.length)
  if (derived.length !== expected.length) return false
  return timingSafeEqual(derived, expected)
}

function getPinCookieSecret(): string {
  const s = process.env.PIN_COOKIE_SECRET
  if (!s || s.length < 16) throw new Error('PIN_COOKIE_SECRET missing or shorter than 16 chars')
  return s
}

function signCookiePayload(payload: string): string {
  return createHmac('sha256', getPinCookieSecret()).update(payload).digest('base64url')
}

export function buildPinCookie(): string {
  const payload = Buffer.from(String(Date.now()), 'utf8').toString('base64url')
  return `${payload}.${signCookiePayload(payload)}`
}

export function verifyPinCookie(value: string): boolean {
  const dot = value.indexOf('.')
  if (dot < 0) return false
  const payload = value.slice(0, dot)
  const sig = value.slice(dot + 1)
  const expected = signCookiePayload(payload)
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  if (!timingSafeEqual(a, b)) return false
  const ts = parseInt(Buffer.from(payload, 'base64url').toString('utf8'), 10)
  if (Number.isNaN(ts)) return false
  return Date.now() - ts < COOKIE_TTL_MS
}
