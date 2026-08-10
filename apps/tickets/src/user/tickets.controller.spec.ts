import { TicketsController } from './tickets.controller';

describe('TicketsController RPCs', () => {
  it('lists only the calling user’s tickets', async () => {
    const list = { items: [] };
    const service = { list: jest.fn().mockResolvedValue(list) };
    const controller = new TicketsController(service as never);

    await expect(controller.list({ userId: 'u1' })).resolves.toBe(list);
    expect(service.list).toHaveBeenCalledWith('u1');
  });

  // The userId must reach the service: it is what turns "any ticket id" into "your ticket".
  it('passes both the caller and the ticket to the pdf-url mint', async () => {
    const service = { pdfUrl: jest.fn().mockResolvedValue({ url: 'https://minio.test/x.pdf' }) };
    const controller = new TicketsController(service as never);

    await controller.pdfUrl({ userId: 'u1', ticketId: 't1' });

    expect(service.pdfUrl).toHaveBeenCalledWith('u1', 't1');
  });

  it('lets an unauthorized pdf-url request reject rather than returning a url', async () => {
    const service = { pdfUrl: jest.fn().mockRejectedValue(new Error('Ticket not found')) };
    const controller = new TicketsController(service as never);

    await expect(controller.pdfUrl({ userId: 'u2', ticketId: 't1' })).rejects.toThrow(
      'Ticket not found',
    );
  });
});
