import { createHash, createHmac } from "crypto";
import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import path from "path";

export type StoredObject = {
  locator: string;
  bytes: number;
};

export interface ObjectStore {
  put(key: string, body: Buffer, contentType?: string): Promise<StoredObject>;
  get(locator: string): Promise<Buffer>;
  remove(locator: string): Promise<void>;
}

const LOCAL_PREFIX = "local:";
const S3_PREFIX = "s3://";

export function getUploadRoot() {
  return process.env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads");
}

export function storageDriver(): "local" | "s3" {
  const raw = (process.env.STORAGE_DRIVER ?? "local").trim().toLowerCase();
  return raw === "s3" ? "s3" : "local";
}

export function getObjectStore(): ObjectStore {
  return storageDriver() === "s3" ? new S3ObjectStore() : new LocalObjectStore();
}

export function objectKey(knowledgeBaseId: string, storedName: string): string {
  return `${knowledgeBaseId}/${storedName}`;
}

export class LocalObjectStore implements ObjectStore {
  constructor(private readonly root = getUploadRoot()) {}

  async put(key: string, body: Buffer): Promise<StoredObject> {
    const abs = path.join(this.root, key);
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, body);
    return { locator: `${LOCAL_PREFIX}${key}`, bytes: body.length };
  }

  async get(locator: string): Promise<Buffer> {
    return readFile(resolveLocalPath(locator, this.root));
  }

  async remove(locator: string): Promise<void> {
    try {
      await unlink(resolveLocalPath(locator, this.root));
    } catch {
      /* already gone */
    }
  }
}

function resolveLocalPath(locator: string, root: string): string {
  if (locator.startsWith(LOCAL_PREFIX)) {
    const rel = locator.slice(LOCAL_PREFIX.length).replace(/^\/+/, "");
    return path.join(root, rel);
  }
  if (locator.startsWith("file://")) {
    return locator.slice("file://".length);
  }
  if (path.isAbsolute(locator)) return locator;
  return path.join(process.cwd(), locator);
}

export class S3ObjectStore implements ObjectStore {
  private readonly endpoint: string;
  private readonly bucket: string;
  private readonly region: string;
  private readonly accessKey: string;
  private readonly secretKey: string;
  private readonly forcePathStyle: boolean;

  constructor() {
    this.bucket = requiredEnv("S3_BUCKET");
    this.region = process.env.S3_REGION?.trim() || "us-east-1";
    this.accessKey = requiredEnv("S3_ACCESS_KEY");
    this.secretKey = requiredEnv("S3_SECRET_KEY");
    this.forcePathStyle = process.env.S3_FORCE_PATH_STYLE !== "false";
    this.endpoint = (
      process.env.S3_ENDPOINT?.trim() ||
      `https://s3.${this.region}.amazonaws.com`
    ).replace(/\/+$/, "");
  }

  async put(
    key: string,
    body: Buffer,
    contentType = "application/octet-stream",
  ): Promise<StoredObject> {
    const res = await this.request("PUT", key, body, contentType);
    if (!res.ok) {
      throw new Error(`S3 PUT failed (${res.status}): ${await res.text()}`);
    }
    return { locator: `${S3_PREFIX}${this.bucket}/${key}`, bytes: body.length };
  }

  async get(locator: string): Promise<Buffer> {
    const { bucket, key } = parseS3Locator(locator, this.bucket);
    if (bucket !== this.bucket) {
      throw new Error(`S3 locator bucket mismatch: ${bucket}`);
    }
    const res = await this.request("GET", key);
    if (!res.ok) {
      throw new Error(`S3 GET failed (${res.status}): ${await res.text()}`);
    }
    return Buffer.from(await res.arrayBuffer());
  }

  async remove(locator: string): Promise<void> {
    const { bucket, key } = parseS3Locator(locator, this.bucket);
    if (bucket !== this.bucket) return;
    const res = await this.request("DELETE", key);
    if (!res.ok && res.status !== 404) {
      throw new Error(`S3 DELETE failed (${res.status}): ${await res.text()}`);
    }
  }

  private async request(
    method: "GET" | "PUT" | "DELETE",
    key: string,
    body?: Buffer,
    contentType?: string,
  ): Promise<Response> {
    const url = this.objectUrl(key);
    const headers = this.sign(method, url, body, contentType);
    const init: RequestInit = { method, headers };
    if (body) {
      init.body = new Uint8Array(body);
    }
    return fetch(url, init);
  }

  private objectUrl(key: string): string {
    const encoded = key
      .split("/")
      .map((p) => encodeURIComponent(p))
      .join("/");
    if (this.forcePathStyle) {
      return `${this.endpoint}/${this.bucket}/${encoded}`;
    }
    const host = new URL(this.endpoint).host;
    return `${new URL(this.endpoint).protocol}//${this.bucket}.${host}/${encoded}`;
  }

  private sign(
    method: string,
    urlStr: string,
    body?: Buffer,
    contentType?: string,
  ): Record<string, string> {
    const url = new URL(urlStr);
    const amzDate = compactDate(new Date());
    const dateStamp = amzDate.slice(0, 8);
    const payloadHash = sha256Hex(body ?? Buffer.alloc(0));
    const headers: Record<string, string> = {
      host: url.host,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
    };
    if (contentType) headers["content-type"] = contentType;

    const signedHeaderNames = Object.keys(headers)
      .map((k) => k.toLowerCase())
      .sort();
    const canonicalHeaders = signedHeaderNames
      .map((name) => `${name}:${headers[name]!.trim()}\n`)
      .join("");
    const signedHeaders = signedHeaderNames.join(";");
    const canonicalRequest = [
      method,
      url.pathname,
      url.searchParams.toString(),
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join("\n");

    const scope = `${dateStamp}/${this.region}/s3/aws4_request`;
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      amzDate,
      scope,
      sha256Hex(canonicalRequest),
    ].join("\n");
    const signingKey = hmac(
      hmac(hmac(hmac(`AWS4${this.secretKey}`, dateStamp), this.region), "s3"),
      "aws4_request",
    );
    const signature = hmac(signingKey, stringToSign).toString("hex");
    headers.authorization = `AWS4-HMAC-SHA256 Credential=${this.accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
    return headers;
  }
}

function parseS3Locator(
  locator: string,
  fallbackBucket: string,
): { bucket: string; key: string } {
  if (locator.startsWith(S3_PREFIX)) {
    const rest = locator.slice(S3_PREFIX.length);
    const slash = rest.indexOf("/");
    if (slash <= 0) throw new Error(`Invalid s3 locator: ${locator}`);
    return { bucket: rest.slice(0, slash), key: rest.slice(slash + 1) };
  }
  return { bucket: fallbackBucket, key: locator.replace(/^\/+/, "") };
}

function requiredEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`${name} is required when STORAGE_DRIVER=s3`);
  return v;
}

function sha256Hex(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

function hmac(key: string | Buffer, data: string): Buffer {
  return createHmac("sha256", key).update(data).digest();
}

function compactDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
}
