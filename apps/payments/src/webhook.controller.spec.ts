import { BadRequestException } from '@nestjs/common';
import { WebhookController } from './webhook.controller';

describe('WebhookController', () => {
  it('returns received on a valid webhook and decodes the base64 body', async () => {
    const service = { handleWebhook: jest.fn().mockResolvedValue(undefined) };
    const ctrl = new WebhookController(service as never);
    const res = await ctrl.handle({
      rawBody: Buffer.from('{}').toString('base64'),
      signature: 'sig',
    });
    expect(res).toEqual({ received: true });
    expect(service.handleWebhook).toHaveBeenCalledWith(Buffer.from('{}'), 'sig');
  });

  it('maps a verification failure to 400', async () => {
    const service = { handleWebhook: jest.fn().mockRejectedValue(new Error('bad sig')) };
    const ctrl = new WebhookController(service as never);
    await expect(ctrl.handle({ rawBody: '', signature: 'sig' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
