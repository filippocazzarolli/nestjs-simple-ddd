import { Invoice } from '../../domain/entities/invoice.entity';

/**
 * Driven port towards the Persistence layer. It lives in `application/` because
 * it is the application layer that declares what it needs: `persistence/`
 * depends on this file, never the other way around. The domain never sees it.
 */
export interface InvoiceRepository {
  save(invoice: Invoice): Promise<Invoice>;
  findById(id: string): Promise<Invoice | null>;
  findAll(): Promise<Invoice[]>;
}

export const INVOICE_REPOSITORY = Symbol('InvoiceRepository');
