import {
  GetObjectCommand,
  PutObjectCommand,
  type GetObjectCommandInput,
  type PutObjectCommandInput,
  type S3ClientConfig,
} from '@aws-sdk/client-s3';

import { StorageClient } from './storage.client';

let capturedConfigs: S3ClientConfig[] = [];
let sendMock: jest.Mock;

jest.mock('@aws-sdk/client-s3', () => {
  const actual = jest.requireActual('@aws-sdk/client-s3');

  return {
    ...actual,
    S3Client: jest.fn().mockImplementation((config: S3ClientConfig) => {
      capturedConfigs.push(config);

      return { send: sendMock };
    }),
  };
});

describe('StorageClient', () => {
  const config = {
    endpoint: 'http://localhost:9000',
    accessKey: 'key',
    secretKey: 'secret',
    bucket: 'tickets',
  };

  beforeEach(() => {
    capturedConfigs = [];
    sendMock = jest.fn();
  });

  it('configures the underlying AWS client for path-style access (required by MinIO)', () => {
    new StorageClient(config);

    expect(capturedConfigs[0]?.forcePathStyle).toBe(true);
  });

  it('signs against the public endpoint while transferring over the in-cluster one', () => {
    new StorageClient({ ...config, publicEndpoint: 'http://localhost:9000' });

    const [transfer, signing] = capturedConfigs;

    expect(transfer.endpoint).toBe('http://localhost:9000');
    expect(signing.endpoint).toBe('http://localhost:9000');
  });

  it('falls back to the in-cluster endpoint for signing when no public one is configured', () => {
    new StorageClient(config);

    const [transfer, signing] = capturedConfigs;

    expect(signing.endpoint).toBe(transfer.endpoint);
  });

  describe('put', () => {
    it('uploads the body to the configured bucket under the given key with its content type', async () => {
      sendMock.mockResolvedValue({});

      const client = new StorageClient(config);
      const body = Buffer.from('pdf-bytes');

      await client.put('tickets/ticket-123.pdf', body, 'application/pdf');

      expect(sendMock).toHaveBeenCalledTimes(1);

      const command = sendMock.mock.calls[0][0] as PutObjectCommand;

      expect(command).toBeInstanceOf(PutObjectCommand);

      const input = command.input as PutObjectCommandInput;

      expect(input.Bucket).toBe('tickets');
      expect(input.Key).toBe('tickets/ticket-123.pdf');
      expect(input.Body).toBe(body);
      expect(input.ContentType).toBe('application/pdf');
    });
  });

  describe('get', () => {
    it('downloads the object from the configured bucket by key and returns it as a Buffer', async () => {
      const transformToByteArray = jest.fn().mockResolvedValue(new Uint8Array([1, 2, 3]));

      sendMock.mockResolvedValue({ Body: { transformToByteArray } });

      const client = new StorageClient(config);

      const result = await client.get('tickets/ticket-123.pdf');

      expect(sendMock).toHaveBeenCalledTimes(1);

      const command = sendMock.mock.calls[0][0] as GetObjectCommand;

      expect(command).toBeInstanceOf(GetObjectCommand);

      const input = command.input as GetObjectCommandInput;

      expect(input.Bucket).toBe('tickets');
      expect(input.Key).toBe('tickets/ticket-123.pdf');
      expect(result).toEqual(Buffer.from([1, 2, 3]));
    });

    it('throws when the returned object has an empty body', async () => {
      sendMock.mockResolvedValue({ Body: undefined });

      const client = new StorageClient(config);

      await expect(client.get('tickets/missing.pdf')).rejects.toThrow(
        'Empty S3 object: tickets/missing.pdf',
      );
    });
  });
});
