import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { ENCRYPTION_KEY_PATTERN } from '@/shared/env'

/**
 * El chequeo de largo solo no alcanza: `Buffer.from(x, 'hex')` NO falla ante
 * caracteres inválidos, los descarta en silencio y devuelve un buffer más
 * corto. Una clave de 64 caracteres con una `z` adentro pasaba el guard viejo
 * (`key.length !== 64`) y moría después, adentro de `createCipheriv`, con
 * "Invalid key length" — un mensaje que no señala a la variable culpable.
 */
function getKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY
  if (!key || !ENCRYPTION_KEY_PATTERN.test(key)) {
    throw new Error('ENCRYPTION_KEY must be exactly 64 hex chars (32 bytes)')
  }
  return Buffer.from(key, 'hex')
}

export function encrypt(plaintext: string): string {
  const key = getKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${tag.toString('hex')}:${ciphertext.toString('hex')}`
}

export function decrypt(combined: string): string {
  const key = getKey()
  const parts = combined.split(':')
  if (parts.length !== 3) throw new Error('Invalid ciphertext format')
  const [ivHex, tagHex, cipherHex] = parts
  const iv = Buffer.from(ivHex, 'hex')
  const tag = Buffer.from(tagHex, 'hex')
  const ciphertext = Buffer.from(cipherHex, 'hex')
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return decipher.update(ciphertext).toString('utf8') + decipher.final('utf8')
}
