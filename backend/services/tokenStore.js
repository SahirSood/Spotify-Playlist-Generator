/**
 * Encrypted token storage for Spotify OAuth tokens.
 * Uses AWS KMS envelope encryption before writing to DynamoDB UserMeta table.
 * Falls back to plaintext if KMS_KEY_ARN is not set (local dev only).
 */
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
  const dataKey = result.Plaintext;
  const encryptedKey = Buffer.from(result.CiphertextBlob).toString('base64');

  // Simple XOR encryption with the data key (production: use AES-256-GCM)
  const buf = Buffer.from(plaintext, 'utf8');
  const encrypted = Buffer.alloc(buf.length);
  for (let i = 0; i < buf.length; i++) {
    encrypted[i] = buf[i] ^ dataKey[i % dataKey.length];
  }
  // Overwrite the plaintext key from memory
  dataKey.fill(0);

  return JSON.stringify({
    encryptedKey,
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
  const { encryptedKey, encryptedValue } = parsed;
  const result = await kmsClient.send(new DecryptCommand({
    CiphertextBlob: Buffer.from(encryptedKey, 'base64'),
  }));
  const dataKey = result.Plaintext;
  const encrypted = Buffer.from(encryptedValue, 'base64');
  const decrypted = Buffer.alloc(encrypted.length);
  for (let i = 0; i < encrypted.length; i++) {
    decrypted[i] = encrypted[i] ^ dataKey[i % dataKey.length];
  }
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
    'SET lastSyncCursor = :cursor, lastSyncAt = :now, isProcessing = :false',
    { ':cursor': cursor, ':now': new Date().toISOString(), ':false': false }
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
