import { Test, TestingModule } from '@nestjs/testing';
import { ListInvoicesHandler } from './list-invoices.handler';
import { Invoice } from '../../domain/entities/invoice.entity';
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

describe('ListInvoicesHandler', () => {
  let handler: ListInvoicesHandler;
  let repository: FakeInvoiceRepository;

  beforeEach(async () => {
    repository = new FakeInvoiceRepository();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ListInvoicesHandler,
        { provide: INVOICE_REPOSITORY, useValue: repository },
      ],
    }).compile();

    handler = module.get(ListInvoicesHandler);
  });

  it('returns an empty list when no invoice exists', async () => {
    await expect(handler.execute()).resolves.toEqual([]);
  });

  it('returns every stored invoice', async () => {
    const first = await repository.save(
      Invoice.create({ id: 'inv-1', amount: 100, customerName: 'ACME' }),
    );
    const second = await repository.save(
      Invoice.create({ id: 'inv-2', amount: 50, customerName: 'Globex' }),
    );

    await expect(handler.execute()).resolves.toEqual([first, second]);
  });
});
