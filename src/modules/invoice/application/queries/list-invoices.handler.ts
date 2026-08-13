import { Inject, Injectable } from '@nestjs/common';
import { Invoice } from '../../domain/entities/invoice.entity';
import { INVOICE_REPOSITORY } from '../ports/invoice.repository';
import type { InvoiceRepository } from '../ports/invoice.repository';

/**
 * A query handler with nothing to orchestrate is a pass-through, and that is
 * the point: on the read side there are no invariants to enforce. Resist
 * filling it with logic to give it a purpose.
 */
@Injectable()
export class ListInvoicesHandler {
  constructor(
    @Inject(INVOICE_REPOSITORY)
    private readonly invoices: InvoiceRepository,
  ) {}

  execute(): Promise<Invoice[]> {
    return this.invoices.findAll();
  }
}
