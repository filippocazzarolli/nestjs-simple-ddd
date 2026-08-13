import { Injectable } from '@nestjs/common';
import { Invoice } from '../../domain/entities/invoice.entity';
import { InvoiceRepository } from '../../application/ports/invoice.repository';

@Injectable()
export class InMemoryInvoiceRepository implements InvoiceRepository {
  private readonly invoices = new Map<string, Invoice>();

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
