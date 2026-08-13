/**
 * Input of the query, decoupled from HTTP. Unlike GetInvoiceHandler — which
 * takes a bare string — an object earns its keep here: two optional fields
 * today, more tomorrow, and positional parameters of the same type would be
 * silently swappable.
 *
 * `customerName` matches exactly (the entity already trims it on creation).
 * `minAmount` filters individual invoices *before* aggregation, not the totals.
 */
export interface GetInvoiceSummaryQuery {
  readonly customerName?: string;
  readonly minAmount?: number;
}
