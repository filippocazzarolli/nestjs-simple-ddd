/**
 * Read model: the shape the presentation layer consumes. It deliberately does
 * not import Invoice — the entity must not cross this boundary, or the API
 * contract becomes a side effect of every change to the aggregate.
 *
 * Today it is structurally identical to Invoice, and that is the point: the
 * apparent duplication is what lets the two models diverge without breaking
 * anything. They are two contracts with two different reasons to change.
 */
export interface InvoiceView {
  readonly id: string;
  readonly amount: number;
  readonly customerName: string;
}
