import type { Transporter } from 'nodemailer';
import { Mailer } from './mailer';

describe('Mailer', () => {
  const transporterWith = (sendMail: jest.Mock) => ({ sendMail }) as unknown as Transporter;

  it('sends from the configured address', async () => {
    const sendMail = jest.fn().mockResolvedValue({});

    await new Mailer(transporterWith(sendMail), 'tickets@tickethub.test').send({
      to: 'buyer@example.com',
      subject: 'Your TicketHub ticket',
      html: '<p>hi</p>',
    });

    expect(sendMail).toHaveBeenCalledWith({
      from: 'tickets@tickethub.test',
      to: 'buyer@example.com',
      subject: 'Your TicketHub ticket',
      html: '<p>hi</p>',
      attachments: undefined,
    });
  });

  it('passes attachments straight through', async () => {
    const sendMail = jest.fn().mockResolvedValue({});
    const attachment = {
      filename: 'ticket.pdf',
      content: Buffer.from('pdf'),
      contentType: 'application/pdf',
    };

    await new Mailer(transporterWith(sendMail), 'tickets@tickethub.test').send({
      to: 'buyer@example.com',
      subject: 'Your TicketHub ticket',
      html: '<p>hi</p>',
      attachments: [attachment],
    });

    expect(sendMail.mock.calls[0][0].attachments).toEqual([attachment]);
  });

  it('propagates a transport failure so the caller’s retry policy sees it', async () => {
    const sendMail = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(
      new Mailer(transporterWith(sendMail), 'tickets@tickethub.test').send({
        to: 'buyer@example.com',
        subject: 'subject',
        html: '<p>hi</p>',
      }),
    ).rejects.toThrow('ECONNREFUSED');
  });
});
