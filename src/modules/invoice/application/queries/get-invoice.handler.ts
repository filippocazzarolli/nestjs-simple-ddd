import { Inject, Injectable } from '@nestjs/common';
import { InvoiceNotFoundError } from '../../domain/errors/invoice.error';
import { INVOICE_QUERY_REPOSITORY } from '../ports/invoice-query.repository';
import { InvoiceView } from './read-models/invoice.view';
import type { InvoiceQueryRepository } from '../ports/invoice-query.repository';

/**
 * The only query handler with a behaviour of its own: it turns absence into an
 * error.
 *
 * It imports a *domain* error, which is a deliberate exception to the read
 * side's independence: "this invoice does not exist" is a domain fact, and
 * InvoiceExceptionFilter already maps it to a 404. Worth revisiting if the read
 * model ever becomes a separate, asynchronously projected store: there "not
 * found" could mean "not projected yet", and a 404 would be a lie.
 *
 * Takes the id as a plain string: an input object would be pure ceremony for a
 * single parameter (see GetInvoiceSummaryQuery for when it earns its keep).
 */
@Injectable()
export class GetInvoiceHandler {
  constructor(
    @Inject(INVOICE_QUERY_REPOSITORY)
    private readonly invoices: InvoiceQueryRepository,
  ) {}

  async execute(id: string): Promise<InvoiceView> {
    const invoice = await this.invoices.findById(id);
    if (invoice === null) {
      throw new InvoiceNotFoundError(id);
    }
    return invoice;
  }
}
