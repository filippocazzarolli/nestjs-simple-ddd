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
});
