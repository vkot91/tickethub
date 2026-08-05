// ponytail: deliberately not react-email — a three-line transactional email doesn't justify
// adding react + @react-email/*. Reach for react-email when a designer owns this template.

export interface TicketEmailData {
  orderId: string;
}

export function renderTicketEmail({ orderId }: TicketEmailData): string {
  return `<html>
  <body>
    <h1>Your TicketHub ticket</h1>
    <p>Order: ${orderId}</p>
    <p>Your ticket PDF is attached to this email.</p>
  </body>
</html>`;
}
