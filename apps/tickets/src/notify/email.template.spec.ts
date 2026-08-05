import { renderTicketEmail } from './email.template';

describe('renderTicketEmail', () => {
  it('includes the orderId and returns HTML', () => {
    const html = renderTicketEmail({ orderId: 'order-123' });

    expect(html).toContain('order-123');
    expect(html).toMatch(/<html[\s>]/i);
    expect(html).toMatch(/<\/html>/i);
  });

  it('renders a different orderId when given a different order', () => {
    const html = renderTicketEmail({ orderId: 'order-456' });

    expect(html).toContain('order-456');
    expect(html).not.toContain('order-123');
  });
});
