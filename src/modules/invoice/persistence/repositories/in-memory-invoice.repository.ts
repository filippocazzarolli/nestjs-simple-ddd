import { Injectable } from '@nestjs/common';
import { Invoice } from '../../domain/entities/invoice.entity';
import { InvoiceRepository } from '../../application/ports/invoice.repository';
import { InMemoryInvoiceStore } from './in-memory-invoice.store';

/** Write-side adapter: stores and loads aggregates by identity. */
@Injectable()
export class InMemoryInvoiceRepository implements InvoiceRepository {
  constructor(private readonly store: InMemoryInvoiceStore) {}

  save(invoice: Invoice): Promise<Invoice> {
    this.store.invoices.set(invoice.id, invoice);
    return Promise.resolve(invoice);
  }

  findById(id: string): Promise<Invoice | null> {
    return Promise.resolve(this.store.invoices.get(id) ?? null);
  }
}
