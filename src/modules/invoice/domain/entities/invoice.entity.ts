import {
  EmptyCustomerNameError,
  InvalidInvoiceAmountError,
} from '../errors/invoice.error';

export interface InvoiceProps {
  id: string;
  amount: number;
  customerName: string;
}

export class Invoice {
  private constructor(
    public readonly id: string,
    public readonly amount: number,
    public readonly customerName: string,
  ) {}

  static create({ id, amount, customerName }: InvoiceProps): Invoice {
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
      throw new InvalidInvoiceAmountError(amount);
    }
    if (typeof customerName !== 'string' || customerName.trim().length === 0) {
      throw new EmptyCustomerNameError();
    }
    return new Invoice(id, amount, customerName.trim());
  }
}
