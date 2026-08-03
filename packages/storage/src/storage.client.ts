import {
  S3Client as AwsS3,
  GetObjectCommand,
  PutObjectCommand,
  type S3ClientConfig,
} from '@aws-sdk/client-s3';
import { getSignedUrl as presign } from '@aws-sdk/s3-request-presigner';

export interface StorageConfig {
  /** In-cluster endpoint used for server-side put/get (e.g. http://minio:9000). */
  endpoint: string;
  /**
   * Browser-reachable endpoint used **only** for presigning. SigV4 covers the `host` header, so a
   * URL signed against the in-cluster hostname cannot be rewritten afterwards — it must be signed
   * against the host the browser will actually resolve. Defaults to `endpoint` (fine in prod,
   * where both are the same public host).
   */
  publicEndpoint?: string;
  accessKey: string;
  secretKey: string;
  bucket: string;
}

export interface SignedUrlOptions {
  /** Seconds the URL stays valid. Keep it short — an issued URL cannot be revoked. */
  ttl: number;
  /** Sets `Content-Disposition: attachment`, so the browser downloads under a real name. */
  filename?: string;
}

export interface SignedUploadOptions {
  /** Seconds the URL stays valid. Keep it short — an issued URL cannot be revoked. */
  ttl: number;
  /**
   * Pinned into the signature, so the URL stores one kind of object and nothing else. Required:
   * an unsigned content type turns "upload a PNG" into "upload anything under this key".
   */
  contentType: string;
}

export class StorageClient {
  private readonly client: AwsS3;
  // Presigning is a local HMAC against this client's endpoint — it never opens a socket, so a
  // second client costs nothing and keeps the signing host separate from the transfer host.
  private readonly signingClient: AwsS3;

  constructor(private readonly config: StorageConfig) {
    const base: Omit<S3ClientConfig, 'endpoint'> = {
      region: 'us-east-1',
      forcePathStyle: true, // MinIO
      credentials: { accessKeyId: config.accessKey, secretAccessKey: config.secretKey },
    };

    this.client = new AwsS3({ ...base, endpoint: config.endpoint });
    this.signingClient = new AwsS3({
      ...base,
      endpoint: config.publicEndpoint ?? config.endpoint,
    });
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  async get(key: string): Promise<Buffer> {
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: this.config.bucket, Key: key }),
    );

    if (!result.Body) throw new Error(`Empty S3 object: ${key}`);

    return Buffer.from(await result.Body.transformToByteArray());
  }

  /**
   * Mints a time-boxed capability to GET one object. Whoever holds the string is authorized until
   * it expires and there is no way to revoke it early, so mint at click time with a short ttl —
   * never store one in a response cache that outlives it.
   */
  getSignedUrl(key: string, { ttl, filename }: SignedUrlOptions): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.config.bucket,
      Key: key,
      ResponseContentDisposition: filename ? `attachment; filename="${filename}"` : undefined,
    });

    return presign(this.signingClient, command, { expiresIn: ttl });
  }

  /**
   * The plain, unsigned URL of an object. Only meaningful on a public-read bucket (`posters`);
   * on a private one (`tickets`) it resolves to a 403 and you want `getSignedUrl` instead.
   */
  publicUrl(key: string): string {
    const base = this.config.publicEndpoint ?? this.config.endpoint;

    return `${base.replace(/\/$/, '')}/${this.config.bucket}/${key}`;
  }

  /**
   * Mints a time-boxed capability to PUT one object. Same caveats as `getSignedUrl` — unrevocable
   * once issued — plus one of its own: the caller must send exactly this `Content-Type`, or the
   * signature will not match.
   */
  getSignedUploadUrl(key: string, { ttl, contentType }: SignedUploadOptions): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: key,
      ContentType: contentType,
    });

    // signableHeaders: the presigner hoists headers into the query string by default and would
    // leave content-type unsigned otherwise — naming it forces it into X-Amz-SignedHeaders.
    return presign(this.signingClient, command, {
      expiresIn: ttl,
      signableHeaders: new Set(['content-type']),
    });
  }
}
