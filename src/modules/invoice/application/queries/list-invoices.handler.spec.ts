import { Test, TestingModule } from '@nestjs/testing';
import { ListInvoicesHandler } from './list-invoices.handler';
import { InvoiceView } from './read-models/invoice.view';
import {
  INVOICE_QUERY_REPOSITORY,
  InvoiceQueryRepository,
} from '../ports/invoice-query.repository';

class FakeInvoiceQueryRepository implements InvoiceQueryRepository {
  readonly views = new Map<string, InvoiceView>();

  findById(id: string): Promise<InvoiceView | null> {
    return Promise.resolve(this.views.get(id) ?? null);
  }

  findAll(): Promise<InvoiceView[]> {
    return Promise.resolve([...this.views.values()]);
  }
}

describe('ListInvoicesHandler', () => {
  let handler: ListInvoicesHandler;
  let repository: FakeInvoiceQueryRepository;

  beforeEach(async () => {
    repository = new FakeInvoiceQueryRepository();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ListInvoicesHandler,
        { provide: INVOICE_QUERY_REPOSITORY, useValue: repository },
      ],
    }).compile();

    handler = module.get(ListInvoicesHandler);
  });

  it('returns an empty list when no invoice exists', async () => {
    await expect(handler.execute()).resolves.toEqual([]);
  });

  it('returns every stored view', async () => {
    const first: InvoiceView = {
      id: 'inv-1',
      amount: 100,
      customerName: 'ACME',
    };
    const second: InvoiceView = {
      id: 'inv-2',
      amount: 50,
      customerName: 'Globex',
    };
    repository.views.set(first.id, first);
    repository.views.set(second.id, second);

    await expect(handler.execute()).resolves.toEqual([first, second]);
  });
});
