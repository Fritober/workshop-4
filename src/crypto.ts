import { webcrypto } from "crypto";
import * as crypto from "crypto";

// #############
// ### Utils ###
// #############

// Function to convert ArrayBuffer to Base64 string
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  return Buffer.from(buffer).toString("base64");
}

// Function to convert Base64 string to ArrayBuffer
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  var buff = Buffer.from(base64, "base64");
  return buff.buffer.slice(buff.byteOffset, buff.byteOffset + buff.byteLength);
}

// ################
// ### RSA keys ###
// ################

// Generates a pair of private / public RSA keys
type GenerateRsaKeyPair = {
  publicKey: webcrypto.CryptoKey;
  privateKey: webcrypto.CryptoKey;
};

export async function generateRsaKeyPair(): Promise<{ publicKey: crypto.KeyObject; privateKey: crypto.KeyObject }> {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    extractable: true,
  });

  return { publicKey, privateKey };
}

// Export a crypto public key to a base64 string format
export async function exportPubKey(key: crypto.KeyObject): Promise<string> {
  return key.export({ format: "spki", type: "spki" }).toString("base64");
}

// Export a crypto private key to a base64 string format
export async function exportPrvKey(key: crypto.KeyObject | null): Promise<string | null> {
  if (!key) return null;
  return key.export({ format: "pkcs8", type: "pkcs8" }).toString("base64");
}

// Import a base64 string public key to its native format
export async function importPubKey(strKey: string): Promise<crypto.KeyObject> {
  const keyBuffer = Buffer.from(strKey, "base64");
  return crypto.createPublicKey({ key: keyBuffer, format: "spki", type: "spki" });
}

// Import a base64 string private key to its native format
export async function importPrvKey(strKey: string): Promise<crypto.KeyObject> {
  const keyBuffer = Buffer.from(strKey, "base64");
  return crypto.createPrivateKey({ key: keyBuffer, format: "pkcs8", type: "pkcs8" });
}

// Encrypt a message using an RSA public key
export async function rsaEncrypt(b64Data: string, strPublicKey: string): Promise<string> {
  const publicKey = await importPubKey(strPublicKey);
  const bufferData = Buffer.from(b64Data, "base64");
  const encryptedBuffer = crypto.publicEncrypt({ key: publicKey, padding: crypto.constants.RSA_PKCS1_PADDING }, bufferData);
  return arrayBufferToBase64(encryptedBuffer);
}

// Decrypts a message using an RSA private key
export async function rsaDecrypt(data: string, privateKey: crypto.KeyObject): Promise<string> {
  const bufferData = base64ToArrayBuffer(data);
  const decryptedBuffer = crypto.privateDecrypt({ key: privateKey, padding: crypto.constants.RSA_PKCS1_PADDING }, bufferData);
  return decryptedBuffer.toString();
}

// ######################
// ### Symmetric keys ###
// ######################

// Generates a random symmetric key
export async function createRandomSymmetricKey(): Promise<crypto.KeyObject> {
  return crypto.generateKeySync("aes-256-cbc", { length: 32, extractable: true });
}

// Export a crypto symmetric key to a base64 string format
export async function exportSymKey(key: crypto.KeyObject): Promise<string> {
  return key.export({ format: "raw", type: "raw" }).toString("base64");
}

// Import a base64 string format to its crypto native format
export async function importSymKey(strKey: string): Promise<crypto.KeyObject> {
  const keyBuffer = Buffer.from(strKey, "base64");
  return crypto.createSecretKey(keyBuffer);
}

// Encrypt a message using a symmetric key
export async function symEncrypt(key: crypto.KeyObject, data: string): Promise<string> {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  const encryptedBuffer = Buffer.concat([cipher.update(data, "utf-8"), cipher.final()]);
  return arrayBufferToBase64(Buffer.concat([iv, encryptedBuffer]));
}

// Decrypt a message using a symmetric key
export async function symDecrypt(strKey: string, encryptedData: string): Promise<string> {
  const key = await importSymKey(strKey);
  const bufferData = base64ToArrayBuffer(encryptedData);
  const iv = bufferData.slice(0, 16);
  const encryptedBuffer = bufferData.slice(16);
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  const decryptedBuffer = Buffer.concat([decipher.update(encryptedBuffer), decipher.final()]);
  return decryptedBuffer.toString("utf-8");
}
