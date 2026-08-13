import { Test, TestingModule } from '@nestjs/testing';
import { GetInvoiceSummaryHandler } from './get-invoice-summary.handler';
import { InvoiceSummaryView } from './read-models/invoice-summary.view';
import { InvoiceView } from './read-models/invoice.view';
import {
  INVOICE_QUERY_REPOSITORY,
  InvoiceQueryRepository,
  InvoiceSummaryFilter,
} from '../ports/invoice-query.repository';

/**
 * The handler is a pass-through, so this spec is short on purpose: it checks
 * the filter reaches the port untouched. The aggregation itself is tested where
 * it lives, in the adapter's spec.
 */
class FakeInvoiceQueryRepository implements InvoiceQueryRepository {
  lastFilter: InvoiceSummaryFilter | null = null;
  result: InvoiceSummaryView[] = [];

  findById(): Promise<InvoiceView | null> {
    return Promise.resolve(null);
  }

  findAll(): Promise<InvoiceView[]> {
    return Promise.resolve([]);
  }

  summarizeByCustomer(
    filter: InvoiceSummaryFilter,
  ): Promise<InvoiceSummaryView[]> {
    this.lastFilter = filter;
    return Promise.resolve(this.result);
  }
}

describe('GetInvoiceSummaryHandler', () => {
  let handler: GetInvoiceSummaryHandler;
  let repository: FakeInvoiceQueryRepository;

  beforeEach(async () => {
    repository = new FakeInvoiceQueryRepository();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GetInvoiceSummaryHandler,
        { provide: INVOICE_QUERY_REPOSITORY, useValue: repository },
      ],
    }).compile();

    handler = module.get(GetInvoiceSummaryHandler);
  });

  it('forwards the filter to the read port as is', async () => {
    await handler.execute({ customerName: 'ACME', minAmount: 50 });

    expect(repository.lastFilter).toEqual({
      customerName: 'ACME',
      minAmount: 50,
    });
  });

  it('returns whatever the read port projects, without touching it', async () => {
    repository.result = [
      {
        customerName: 'ACME',
        invoiceCount: 2,
        totalAmount: 150,
        averageAmount: 75,
        maxAmount: 100,
      },
    ];

    await expect(handler.execute({})).resolves.toBe(repository.result);
  });
});
