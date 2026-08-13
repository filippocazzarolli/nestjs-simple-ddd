import { Inject, Injectable } from '@nestjs/common';
import { Invoice } from '../../domain/entities/invoice.entity';
import { InvoiceNotFoundError } from '../../domain/errors/invoice.error';
import { INVOICE_REPOSITORY } from '../ports/invoice.repository';
import type { InvoiceRepository } from '../ports/invoice.repository';

/**
 * Query side. Takes the id as a plain string: an input object would be pure
 * ceremony for a single parameter — it earns its keep only from two fields on
 * (see GetInvoiceSummaryQuery).
 */
@Injectable()
export class GetInvoiceHandler {
  constructor(
    @Inject(INVOICE_REPOSITORY)
    private readonly invoices: InvoiceRepository,
  ) {}

  async execute(id: string): Promise<Invoice> {
    const invoice = await this.invoices.findById(id);
    if (invoice === null) {
      throw new InvoiceNotFoundError(id);
    }
    return invoice;
  }
}
