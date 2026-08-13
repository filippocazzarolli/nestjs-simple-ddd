import { Injectable } from '@nestjs/common';
import { Invoice } from '../../domain/entities/invoice.entity';
import { InvoiceQueryRepository } from '../../application/ports/invoice-query.repository';
import { InvoiceView } from '../../application/queries/read-models/invoice.view';
import { InMemoryInvoiceStore } from './in-memory-invoice.store';

/**
 * Entity -> view translation lives in the adapter, not in the handler: it is
 * the adapter that knows where the data comes from — a Map of entities today, a
 * SQL row tomorrow. Were this mapping in the handler, the handler would have to
 * know Invoice and the separation would be nominal.
 */
const toView = (invoice: Invoice): InvoiceView => ({
  id: invoice.id,
  amount: invoice.amount,
  customerName: invoice.customerName,
});

/** Read-side adapter over the same store used by the write side. */
@Injectable()
export class InMemoryInvoiceQueryRepository implements InvoiceQueryRepository {
  constructor(private readonly store: InMemoryInvoiceStore) {}

  findById(id: string): Promise<InvoiceView | null> {
    const invoice = this.store.invoices.get(id);
    return Promise.resolve(invoice === undefined ? null : toView(invoice));
  }

  findAll(): Promise<InvoiceView[]> {
    return Promise.resolve([...this.store.invoices.values()].map(toView));
  }
}
