import { Invoice } from '../../domain/entities/invoice.entity';

/**
 * Driven port towards the Persistence layer, write side only. It lives in
 * `application/` because it is the application layer that declares what it
 * needs: `persistence/` depends on this file, never the other way around. The
 * domain never sees it.
 *
 * There is no `findAll()` here on purpose: no command has a reason to load
 * every invoice, and leaving it would be an invitation to write the next read
 * from the wrong side. Reads go through InvoiceQueryRepository. `findById`
 * stays because future commands (pay, void) must load the aggregate to decide
 * — load, decide, save.
 */
export interface InvoiceRepository {
  save(invoice: Invoice): Promise<Invoice>;
  findById(id: string): Promise<Invoice | null>;
}

export const INVOICE_REPOSITORY = Symbol('InvoiceRepository');
