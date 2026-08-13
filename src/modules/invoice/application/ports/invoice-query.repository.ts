import { InvoiceSummaryView } from '../queries/read-models/invoice-summary.view';
import { InvoiceView } from '../queries/read-models/invoice.view';

export interface InvoiceSummaryFilter {
  readonly customerName?: string;
  readonly minAmount?: number;
}

/**
 * Driven port towards the read side. Separate from InvoiceRepository because
 * reads and writes have different shapes: this one returns views, never
 * aggregates, and its methods mirror use cases rather than table rows.
 *
 * The rule this split encodes: the write side loads by id, the read side
 * queries. `summarizeByCustomer` is the reason the split exists — the
 * application layer asks for the roll-up and stays unaware of whether a Map, a
 * GROUP BY, a materialized view or a cache answers it.
 */
export interface InvoiceQueryRepository {
  findById(id: string): Promise<InvoiceView | null>;
  findAll(): Promise<InvoiceView[]>;
  summarizeByCustomer(
    filter: InvoiceSummaryFilter,
  ): Promise<InvoiceSummaryView[]>;
}

export const INVOICE_QUERY_REPOSITORY = Symbol('InvoiceQueryRepository');
