import { Inject, Injectable } from '@nestjs/common';
import { INVOICE_QUERY_REPOSITORY } from '../ports/invoice-query.repository';
import { InvoiceView } from './read-models/invoice.view';
import type { InvoiceQueryRepository } from '../ports/invoice-query.repository';

/**
 * A query handler with nothing to orchestrate is a pass-through, and that is
 * the point: on the read side there are no invariants to enforce. Resist
 * filling it with logic to give it a purpose.
 */
@Injectable()
export class ListInvoicesHandler {
  constructor(
    @Inject(INVOICE_QUERY_REPOSITORY)
    private readonly invoices: InvoiceQueryRepository,
  ) {}

  execute(): Promise<InvoiceView[]> {
    return this.invoices.findAll();
  }
}
