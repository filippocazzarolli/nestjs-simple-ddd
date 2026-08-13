import { Test, TestingModule } from '@nestjs/testing';
import { GetInvoiceHandler } from './get-invoice.handler';
import { Invoice } from '../../domain/entities/invoice.entity';
import { InvoiceNotFoundError } from '../../domain/errors/invoice.error';
import {
  INVOICE_REPOSITORY,
  InvoiceRepository,
} from '../ports/invoice.repository';

class FakeInvoiceRepository implements InvoiceRepository {
  readonly invoices = new Map<string, Invoice>();

  save(invoice: Invoice): Promise<Invoice> {
    this.invoices.set(invoice.id, invoice);
    return Promise.resolve(invoice);
  }

  findById(id: string): Promise<Invoice | null> {
    return Promise.resolve(this.invoices.get(id) ?? null);
  }

  findAll(): Promise<Invoice[]> {
    return Promise.resolve([...this.invoices.values()]);
  }
}

describe('GetInvoiceHandler', () => {
  let handler: GetInvoiceHandler;
  let repository: FakeInvoiceRepository;

  beforeEach(async () => {
    repository = new FakeInvoiceRepository();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GetInvoiceHandler,
        { provide: INVOICE_REPOSITORY, useValue: repository },
      ],
    }).compile();

    handler = module.get(GetInvoiceHandler);
  });

  it('returns the stored invoice', async () => {
    const stored = await repository.save(
      Invoice.create({ id: 'inv-1', amount: 100, customerName: 'ACME' }),
    );

    await expect(handler.execute('inv-1')).resolves.toBe(stored);
  });

  it('throws InvoiceNotFoundError when the id is unknown', async () => {
    await expect(handler.execute('inesistente')).rejects.toThrow(
      InvoiceNotFoundError,
    );
  });
});
