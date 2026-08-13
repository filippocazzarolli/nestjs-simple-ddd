import { Test, TestingModule } from '@nestjs/testing';
import { CreateInvoiceHandler } from './create-invoice.handler';
import { Invoice } from '../../domain/entities/invoice.entity';
import { InvalidInvoiceAmountError } from '../../domain/errors/invoice.error';
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
}

/** Test adapter standing in for `infrastructure/`: predictable ids. */
class SequentialIdGenerator implements IdGenerator {
  private next = 0;

  generate(): string {
    this.next += 1;
    return `inv-${this.next}`;
  }
}

describe('CreateInvoiceHandler', () => {
  let handler: CreateInvoiceHandler;
  let repository: FakeInvoiceRepository;

  beforeEach(async () => {
    repository = new FakeInvoiceRepository();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreateInvoiceHandler,
        { provide: INVOICE_REPOSITORY, useValue: repository },
        { provide: ID_GENERATOR, useValue: new SequentialIdGenerator() },
      ],
    }).compile();

    handler = module.get(CreateInvoiceHandler);
  });

  it('assigns the id obtained from the generator and stores the aggregate', async () => {
    const view = await handler.execute({ amount: 100, customerName: 'ACME' });

    expect(view).toEqual({ id: 'inv-1', amount: 100, customerName: 'ACME' });
    // What is stored is the entity; what is returned is the view.
    expect(repository.invoices.get('inv-1')).toBeInstanceOf(Invoice);
  });

  it('never reuses the same id across invoices', async () => {
    const first = await handler.execute({ amount: 100, customerName: 'ACME' });
    const second = await handler.execute({ amount: 100, customerName: 'ACME' });

    expect([first.id, second.id]).toEqual(['inv-1', 'inv-2']);
    expect(repository.invoices.size).toBe(2);
  });

  it('stores nothing when the domain invariant is violated', async () => {
    await expect(
      handler.execute({ amount: -5, customerName: 'ACME' }),
    ).rejects.toThrow(InvalidInvoiceAmountError);

    expect(repository.invoices.size).toBe(0);
  });
});
