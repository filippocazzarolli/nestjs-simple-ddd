export abstract class InvoiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class InvalidInvoiceAmountError extends InvoiceError {
  constructor(readonly amount: unknown) {
    super(`Invoice amount must be a positive number, got: ${String(amount)}`);
  }
}

export class EmptyCustomerNameError extends InvoiceError {
  constructor() {
    super('Invoice customer name must not be empty');
  }
}

export class InvoiceNotFoundError extends InvoiceError {
  constructor(readonly id: string) {
    super(`Invoice not found: ${id}`);
  }
}
