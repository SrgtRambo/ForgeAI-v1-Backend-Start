// Storage abstraction for Forge AI.
// Production: Replit Object Storage (@replit/object-storage).
// Tests: in-memory Map adapter.

import { Client as ObjectStorageClient } from "@replit/object-storage";

let client = null;

function getClient() {
  if (!client) {
    client = new ObjectStorageClient();
  }
  return client;
}

export async function put(key, buffer, contentType) {
  const c = getClient();
  const result = await c.uploadFromBytes(key, buffer);
  if (!result.ok) {
    throw new Error(`Storage put failed for ${key}: ${result.error?.message}`);
  }
  return { key, contentType };
}

export async function get(key) {
  const c = getClient();
  const result = await c.downloadAsBytes(key);
  if (!result.ok) {
    if (result.error?.message?.includes("not found") || result.error?.statusCode === 404) {
      return null;
    }
    throw new Error(`Storage get failed for ${key}: ${result.error?.message}`);
  }
  const buffer = result.value[0];
  // Replit Object Storage doesn't return content-type on download; we track it separately.
  return { buffer, contentType: "application/octet-stream" };
}

export async function remove(key) {
  const c = getClient();
  const result = await c.delete(key, { ignoreNotFound: true });
  if (!result.ok) {
    throw new Error(`Storage remove failed for ${key}: ${result.error?.message}`);
  }
}

export function setClient(fakeClient) {
  client = fakeClient;
}

export function resetClient() {
  client = null;
}
