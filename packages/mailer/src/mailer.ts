import type { Transporter } from 'nodemailer';

export interface MailAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

export interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
  attachments?: MailAttachment[];
}

/**
 * A transport, not a delivery policy. Failures propagate deliberately — no try/catch — so the
 * caller's retry mechanism (BullMQ, an outbox, whatever) decides what a bounce means. Templates
 * live with the domain that owns the message, not here.
 */
export class Mailer {
  constructor(
    private readonly transporter: Transporter,
    private readonly from: string,
  ) {}

  async send({ to, subject, html, attachments }: SendMailOptions): Promise<void> {
    await this.transporter.sendMail({ from: this.from, to, subject, html, attachments });
  }
}
