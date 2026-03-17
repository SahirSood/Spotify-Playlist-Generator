/**
 * Encrypted token storage for Spotify OAuth tokens.
 * Uses AWS KMS envelope encryption before writing to DynamoDB UserMeta table.
 * Falls back to plaintext if KMS_KEY_ARN is not set (local dev only).
 */
const crypto = require('crypto');
const { KMSClient, GenerateDataKeyCommand, DecryptCommand } = require('@aws-sdk/client-kms');
const { getItem, putItem, updateItem } = require('./dynamodb');

const TABLE = 'UserMeta';
const kmsClient = new KMSClient({ region: process.env.DYNAMODB_REGION || 'us-east-1' });
const KMS_KEY_ARN = process.env.KMS_KEY_ARN;

async function encrypt(plaintext) {
  if (!KMS_KEY_ARN) return plaintext; // local dev fallback
  const result = await kmsClient.send(new GenerateDataKeyCommand({
    KeyId: KMS_KEY_ARN,
    KeySpec: 'AES_256',
  }));
  const dataKey = Buffer.from(result.Plaintext);
  const encryptedKey = Buffer.from(result.CiphertextBlob).toString('base64');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', dataKey, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  dataKey.fill(0);

  return JSON.stringify({
    encryptedKey,
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    encryptedValue: encrypted.toString('base64'),
  });
}

async function decrypt(ciphertext) {
  if (!KMS_KEY_ARN) return ciphertext; // local dev fallback
  let parsed;
  try {
    parsed = JSON.parse(ciphertext);
  } catch {
    return ciphertext; // already plaintext (migration path)
  }
  const { encryptedKey, encryptedValue, iv, authTag } = parsed;
  const result = await kmsClient.send(new DecryptCommand({
    CiphertextBlob: Buffer.from(encryptedKey, 'base64'),
  }));
  const dataKey = Buffer.from(result.Plaintext);
  const encrypted = Buffer.from(encryptedValue, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', dataKey, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(authTag, 'base64'));
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  dataKey.fill(0);
  return decrypted.toString('utf8');
}

async function saveUserTokens(userId, { accessToken, refreshToken, locationLat, locationLon }) {
  const encAccessToken = await encrypt(accessToken);
  const encRefreshToken = await encrypt(refreshToken);
  await putItem(TABLE, {
    userId,
    accessToken: encAccessToken,
    refreshToken: encRefreshToken,
    locationLat: locationLat || 49.25,
    locationLon: locationLon || -123.1,
    updatedAt: new Date().toISOString(),
  });
}

async function getUserTokens(userId) {
  const item = await getItem(TABLE, { userId });
  if (!item) return null;
  return {
    accessToken: await decrypt(item.accessToken),
    refreshToken: await decrypt(item.refreshToken),
    locationLat: item.locationLat,
    locationLon: item.locationLon,
    lastSyncCursor: item.lastSyncCursor || null,
    lastSyncAt: item.lastSyncAt || null,
    isProcessing: item.isProcessing || false,
  };
}

async function updateSyncCursor(userId, cursor) {
  await updateItem(
    TABLE,
    { userId },
    'SET lastSyncCursor = :cursor, lastSyncAt = :now',
    { ':cursor': cursor, ':now': new Date().toISOString() }
  );
}

async function setProcessing(userId, processing) {
  await updateItem(
    TABLE,
    { userId },
    'SET isProcessing = :val',
    { ':val': processing }
  );
}

module.exports = { saveUserTokens, getUserTokens, updateSyncCursor, setProcessing };
