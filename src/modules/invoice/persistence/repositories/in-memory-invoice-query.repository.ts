import { Injectable } from '@nestjs/common';
import { Invoice } from '../../domain/entities/invoice.entity';
import {
  InvoiceQueryRepository,
  InvoiceSummaryFilter,
} from '../../application/ports/invoice-query.repository';
import { InvoiceSummaryView } from '../../application/queries/read-models/invoice-summary.view';
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

/** Running totals of the roll-up, private to this adapter. */
interface CustomerTotals {
  invoiceCount: number;
  totalAmount: number;
  maxAmount: number;
}

const round = (value: number): number => Math.round(value * 100) / 100;

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

  /**
   * The whole aggregation lives here: on a real database this method becomes
   *
   *   SELECT customer_name, COUNT(*), SUM(amount), AVG(amount), MAX(amount)
   *   FROM invoices [WHERE ...] GROUP BY customer_name ORDER BY ...
   *
   * and no other file changes. That is the freedom the read port buys.
   */
  summarizeByCustomer(
    filter: InvoiceSummaryFilter,
  ): Promise<InvoiceSummaryView[]> {
    const totals = new Map<string, CustomerTotals>();

    for (const invoice of this.store.invoices.values()) {
      // Both filters apply to individual invoices, before aggregation: a
      // customer left with no invoice simply does not appear in the result.
      if (
        filter.customerName !== undefined &&
        invoice.customerName !== filter.customerName
      ) {
        continue;
      }
      if (filter.minAmount !== undefined && invoice.amount < filter.minAmount) {
        continue;
      }

      const current = totals.get(invoice.customerName);
      if (current === undefined) {
        totals.set(invoice.customerName, {
          invoiceCount: 1,
          totalAmount: invoice.amount,
          maxAmount: invoice.amount,
        });
        continue;
      }
      current.invoiceCount += 1;
      current.totalAmount += invoice.amount;
      current.maxAmount = Math.max(current.maxAmount, invoice.amount);
    }

    const summaries = [...totals.entries()].map(([customerName, customer]) => ({
      customerName,
      invoiceCount: customer.invoiceCount,
      totalAmount: round(customer.totalAmount),
      // Rounding is decided here rather than left to the float that reaches
      // the client.
      averageAmount: round(customer.totalAmount / customer.invoiceCount),
      maxAmount: customer.maxAmount,
    }));

    // Deterministic order is part of the contract: without it the e2e
    // assertions would be flaky.
    summaries.sort(
      (a, b) =>
        b.totalAmount - a.totalAmount ||
        a.customerName.localeCompare(b.customerName),
    );

    return Promise.resolve(summaries);
  }
}
