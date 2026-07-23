import { S3Client as AwsS3, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';

export interface S3Config {
  endpoint: string;
  accessKey: string;
  secretKey: string;
  bucket: string;
}

export class S3Client {
  private readonly client: AwsS3;

  constructor(private readonly config: S3Config) {
    this.client = new AwsS3({
      endpoint: config.endpoint,
      region: 'us-east-1',
      forcePathStyle: true, // MinIO
      credentials: { accessKeyId: config.accessKey, secretAccessKey: config.secretKey },
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
}
