import { Test, TestingModule } from '@nestjs/testing';
import { InvoiceService } from './invoice.service';
import { Invoice } from '../../domain/entities/invoice.entity';
import {
  InvalidInvoiceAmountError,
  InvoiceNotFoundError,
} from '../../domain/errors/invoice.error';
import { ID_GENERATOR, IdGenerator } from '../ports/id-generator';
import {
  INVOICE_REPOSITORY,
  InvoiceRepository,
} from '../ports/invoice.repository';

/** Test adapter standing in for `persistence/`: no database, no mocking library. */
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

/** Test adapter standing in for `infrastructure/`: predictable ids. */
class SequentialIdGenerator implements IdGenerator {
  private next = 0;

  generate(): string {
    this.next += 1;
    return `inv-${this.next}`;
  }
}

describe('InvoiceService', () => {
  let service: InvoiceService;
  let repository: FakeInvoiceRepository;

  beforeEach(async () => {
    repository = new FakeInvoiceRepository();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvoiceService,
        { provide: INVOICE_REPOSITORY, useValue: repository },
        { provide: ID_GENERATOR, useValue: new SequentialIdGenerator() },
      ],
    }).compile();

    service = module.get(InvoiceService);
  });

  describe('createInvoice', () => {
    it('assigns the id obtained from the generator and stores the invoice', async () => {
      const invoice = await service.createInvoice({
        amount: 100,
        customerName: 'ACME',
      });

      expect(invoice.id).toBe('inv-1');
      expect(repository.invoices.get('inv-1')).toBe(invoice);
    });

    it('never reuses the same id across invoices', async () => {
      const first = await service.createInvoice({
        amount: 100,
        customerName: 'ACME',
      });
      const second = await service.createInvoice({
        amount: 100,
        customerName: 'ACME',
      });

      expect([first.id, second.id]).toEqual(['inv-1', 'inv-2']);
      expect(repository.invoices.size).toBe(2);
    });

    it('stores nothing when the domain invariant is violated', async () => {
      await expect(
        service.createInvoice({ amount: -5, customerName: 'ACME' }),
      ).rejects.toThrow(InvalidInvoiceAmountError);

      expect(repository.invoices.size).toBe(0);
    });
  });

  describe('getInvoice', () => {
    it('returns the stored invoice', async () => {
      const created = await service.createInvoice({
        amount: 100,
        customerName: 'ACME',
      });

      await expect(service.getInvoice(created.id)).resolves.toBe(created);
    });

    it('throws InvoiceNotFoundError when the id is unknown', async () => {
      await expect(service.getInvoice('inesistente')).rejects.toThrow(
        InvoiceNotFoundError,
      );
    });
  });

  describe('listInvoices', () => {
    it('returns an empty list when no invoice exists', async () => {
      await expect(service.listInvoices()).resolves.toEqual([]);
    });

    it('returns every created invoice', async () => {
      const first = await service.createInvoice({
        amount: 100,
        customerName: 'ACME',
      });
      const second = await service.createInvoice({
        amount: 50,
        customerName: 'Globex',
      });

      await expect(service.listInvoices()).resolves.toEqual([first, second]);
    });
  });
});
