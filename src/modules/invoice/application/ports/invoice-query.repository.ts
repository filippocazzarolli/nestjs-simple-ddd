import { InvoiceView } from '../queries/read-models/invoice.view';

/**
 * Driven port towards the read side. Separate from InvoiceRepository because
 * reads and writes have different shapes: this one returns views, never
 * aggregates, and its methods mirror use cases rather than table rows.
 *
 * The rule this split encodes: the write side loads by id, the read side
 * queries.
 */
export interface InvoiceQueryRepository {
  findById(id: string): Promise<InvoiceView | null>;
  findAll(): Promise<InvoiceView[]>;
}

export const INVOICE_QUERY_REPOSITORY = Symbol('InvoiceQueryRepository');
