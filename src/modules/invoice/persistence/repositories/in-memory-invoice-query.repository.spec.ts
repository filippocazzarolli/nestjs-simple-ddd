import { Invoice } from '../../domain/entities/invoice.entity';
import { InMemoryInvoiceQueryRepository } from './in-memory-invoice-query.repository';
import { InMemoryInvoiceStore } from './in-memory-invoice.store';

describe('InMemoryInvoiceQueryRepository', () => {
  let store: InMemoryInvoiceStore;
  let repository: InMemoryInvoiceQueryRepository;

  const given = (id: string, amount: number, customerName: string) => {
    const invoice = Invoice.create({ id, amount, customerName });
    store.invoices.set(invoice.id, invoice);
    return invoice;
  };

  beforeEach(() => {
    store = new InMemoryInvoiceStore();
    repository = new InMemoryInvoiceQueryRepository(store);
  });

  describe('findById', () => {
    it('returns a plain view, not the entity', async () => {
      given('inv-1', 100, 'ACME');

      const view = await repository.findById('inv-1');

      expect(view).toEqual({ id: 'inv-1', amount: 100, customerName: 'ACME' });
      expect(view).not.toBeInstanceOf(Invoice);
    });

    it('returns null when the id is unknown', async () => {
      await expect(repository.findById('inesistente')).resolves.toBeNull();
    });
  });

  describe('findAll', () => {
    it('returns an empty list on an empty store', async () => {
      await expect(repository.findAll()).resolves.toEqual([]);
    });

    it('maps every stored invoice to a view', async () => {
      given('inv-1', 100, 'ACME');
      given('inv-2', 50, 'Globex');

      await expect(repository.findAll()).resolves.toEqual([
        { id: 'inv-1', amount: 100, customerName: 'ACME' },
        { id: 'inv-2', amount: 50, customerName: 'Globex' },
      ]);
    });
  });

  describe('summarizeByCustomer', () => {
    it('returns an empty list on an empty store', async () => {
      await expect(repository.summarizeByCustomer({})).resolves.toEqual([]);
    });

    it('rolls up count, total, average and max per customer', async () => {
      given('inv-1', 100, 'ACME');
      given('inv-2', 50, 'ACME');
      given('inv-3', 50, 'Globex');

      await expect(repository.summarizeByCustomer({})).resolves.toEqual([
        {
          customerName: 'ACME',
          invoiceCount: 2,
          totalAmount: 150,
          averageAmount: 75,
          maxAmount: 100,
        },
        {
          customerName: 'Globex',
          invoiceCount: 1,
          totalAmount: 50,
          averageAmount: 50,
          maxAmount: 50,
        },
      ]);
    });

    it('orders by total desc, then by customer name asc', async () => {
      given('inv-1', 10, 'Zeta');
      given('inv-2', 50, 'Beta');
      given('inv-3', 50, 'Alpha');

      const summaries = await repository.summarizeByCustomer({});

      expect(summaries.map((summary) => summary.customerName)).toEqual([
        'Alpha',
        'Beta',
        'Zeta',
      ]);
    });

    it('rounds the average to two decimals', async () => {
      given('inv-1', 100, 'ACME');
      given('inv-2', 100, 'ACME');
      given('inv-3', 100.01, 'ACME');

      const [summary] = await repository.summarizeByCustomer({});

      expect(summary.averageAmount).toBe(100);
      expect(summary.totalAmount).toBe(300.01);
    });

    it('keeps only the requested customer', async () => {
      given('inv-1', 100, 'ACME');
      given('inv-2', 50, 'Globex');

      await expect(
        repository.summarizeByCustomer({ customerName: 'ACME' }),
      ).resolves.toEqual([
        {
          customerName: 'ACME',
          invoiceCount: 1,
          totalAmount: 100,
          averageAmount: 100,
          maxAmount: 100,
        },
      ]);
    });

    it('applies minAmount to individual invoices, before aggregation', async () => {
      given('inv-1', 100, 'ACME');
      given('inv-2', 10, 'ACME');

      // The 10 invoice is excluded, so ACME totals 100 and not 110: the filter
      // is on invoices, not on the roll-up.
      await expect(
        repository.summarizeByCustomer({ minAmount: 50 }),
      ).resolves.toEqual([
        {
          customerName: 'ACME',
          invoiceCount: 1,
          totalAmount: 100,
          averageAmount: 100,
          maxAmount: 100,
        },
      ]);
    });

    it('drops a customer left with no invoice after filtering', async () => {
      given('inv-1', 100, 'ACME');
      given('inv-2', 10, 'Globex');

      const summaries = await repository.summarizeByCustomer({ minAmount: 50 });

      expect(summaries.map((summary) => summary.customerName)).toEqual([
        'ACME',
      ]);
    });
  });
});
