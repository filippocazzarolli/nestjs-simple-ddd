import { Inject, Injectable } from '@nestjs/common';
import { INVOICE_QUERY_REPOSITORY } from '../ports/invoice-query.repository';
import { GetInvoiceSummaryQuery } from './get-invoice-summary.query';
import { InvoiceSummaryView } from './read-models/invoice-summary.view';
import type { InvoiceQueryRepository } from '../ports/invoice-query.repository';

/**
 * The aggregation is not here on purpose: it belongs to the adapter, which is
 * the only layer that knows whether the data comes from a Map or from a
 * GROUP BY. This handler being a pass-through is the demonstration, not an
 * oversight — on the read side there is nothing to orchestrate.
 */
@Injectable()
export class GetInvoiceSummaryHandler {
  constructor(
    @Inject(INVOICE_QUERY_REPOSITORY)
    private readonly invoices: InvoiceQueryRepository,
  ) {}

  execute(query: GetInvoiceSummaryQuery): Promise<InvoiceSummaryView[]> {
    return this.invoices.summarizeByCustomer(query);
  }
}
