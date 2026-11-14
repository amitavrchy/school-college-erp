import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { config } from './config';
/** Key used before DOCUMENT_ENCRYPTION_KEY became mandatory in production; kept only for reading. */
let legacy: Buffer | undefined;
const legacyKey = () =>
  (legacy ??= scryptSync(config.JWT_ACCESS_SECRET, 'campus-one-documents-v1', 32));
/** Production always has DOCUMENT_ENCRYPTION_KEY (enforced in config); development derives one. */
export const dataKey = () =>
  config.DOCUMENT_ENCRYPTION_KEY ? Buffer.from(config.DOCUMENT_ENCRYPTION_KEY, 'hex') : legacyKey();
/** AES-256-GCM: nonce(12) | tag(16) | ciphertext. */
export function encrypt(bytes: Buffer) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', dataKey(), nonce);
  const body = Buffer.concat([cipher.update(bytes), cipher.final()]);
  return Buffer.concat([nonce, cipher.getAuthTag(), body]);
}
function open(data: Buffer, key: Buffer) {
  const decipher = createDecipheriv('aes-256-gcm', key, data.subarray(0, 12));
  decipher.setAuthTag(data.subarray(12, 28));
  return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]);
}
/** Decrypts with the current key, falling back to the legacy derived key for rows written before. */
export function decrypt(data: Buffer) {
  try {
    return open(data, dataKey());
  } catch (error) {
    if (!config.DOCUMENT_ENCRYPTION_KEY) throw error;
    return open(data, legacyKey());
  }
}
export const encryptText = (text: string) => encrypt(Buffer.from(text, 'utf8')).toString('base64');
export const decryptText = (value: string) =>
  decrypt(Buffer.from(value, 'base64')).toString('utf8');
