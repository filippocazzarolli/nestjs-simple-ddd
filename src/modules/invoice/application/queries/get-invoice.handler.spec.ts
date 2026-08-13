import { Test, TestingModule } from '@nestjs/testing';
import { GetInvoiceHandler } from './get-invoice.handler';
import { InvoiceSummaryView } from './read-models/invoice-summary.view';
import { InvoiceView } from './read-models/invoice.view';
import { InvoiceNotFoundError } from '../../domain/errors/invoice.error';
import {
  INVOICE_QUERY_REPOSITORY,
  InvoiceQueryRepository,
} from '../ports/invoice-query.repository';

/**
 * Test adapter standing in for the read side: it serves views straight away,
 * with no entity in sight — which is exactly what the port promises.
 */
class FakeInvoiceQueryRepository implements InvoiceQueryRepository {
  readonly views = new Map<string, InvoiceView>();

  findById(id: string): Promise<InvoiceView | null> {
    return Promise.resolve(this.views.get(id) ?? null);
  }

  findAll(): Promise<InvoiceView[]> {
    return Promise.resolve([...this.views.values()]);
  }

  summarizeByCustomer(): Promise<InvoiceSummaryView[]> {
    return Promise.resolve([]);
  }
}

describe('GetInvoiceHandler', () => {
  let handler: GetInvoiceHandler;
  let repository: FakeInvoiceQueryRepository;

  beforeEach(async () => {
    repository = new FakeInvoiceQueryRepository();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GetInvoiceHandler,
        { provide: INVOICE_QUERY_REPOSITORY, useValue: repository },
      ],
    }).compile();

    handler = module.get(GetInvoiceHandler);
  });

  it('returns the stored view', async () => {
    const view: InvoiceView = {
      id: 'inv-1',
      amount: 100,
      customerName: 'ACME',
    };
    repository.views.set(view.id, view);

    await expect(handler.execute('inv-1')).resolves.toBe(view);
  });

  it('throws InvoiceNotFoundError when the id is unknown', async () => {
    await expect(handler.execute('inesistente')).rejects.toThrow(
      InvoiceNotFoundError,
    );
  });
});
