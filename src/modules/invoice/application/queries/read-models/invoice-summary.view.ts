/**
 * The read model that has no aggregate behind it: a per-customer roll-up has no
 * identity, no lifecycle and no invariant to protect. Modelling it as an entity
 * would produce an anemic one by construction; it is a projection, and it lives
 * on the query side only.
 */
export interface InvoiceSummaryView {
  readonly customerName: string;
  readonly invoiceCount: number;
  readonly totalAmount: number;
  readonly averageAmount: number;
  readonly maxAmount: number;
}
