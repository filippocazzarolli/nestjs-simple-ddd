import { Invoice } from './invoice.entity';
import {
  EmptyCustomerNameError,
  InvalidInvoiceAmountError,
} from '../errors/invoice.error';

describe('Invoice', () => {
  const validProps = { id: 'inv-1', amount: 100, customerName: 'ACME' };

  it('creates a valid invoice', () => {
    const invoice = Invoice.create(validProps);

    expect(invoice.id).toBe('inv-1');
    expect(invoice.amount).toBe(100);
    expect(invoice.customerName).toBe('ACME');
  });

  it('trims the surrounding whitespace from the customer name', () => {
    const invoice = Invoice.create({ ...validProps, customerName: '  ACME  ' });

    expect(invoice.customerName).toBe('ACME');
  });

  it.each([0, -1, -0.01])('rejects a non-positive amount (%p)', (amount) => {
    expect(() => Invoice.create({ ...validProps, amount })).toThrow(
      InvalidInvoiceAmountError,
    );
  });

  it.each([['abc'], [NaN], [Infinity], [null], [undefined]])(
    'rejects a non-numeric amount (%p)',
    (amount) => {
      expect(() =>
        Invoice.create({ ...validProps, amount: amount as number }),
      ).toThrow(InvalidInvoiceAmountError);
    },
  );

  it.each([[''], ['   '], [null]])(
    'rejects an empty customer name (%p)',
    (customerName) => {
      expect(() =>
        Invoice.create({ ...validProps, customerName: customerName as string }),
      ).toThrow(EmptyCustomerNameError);
    },
  );
});
