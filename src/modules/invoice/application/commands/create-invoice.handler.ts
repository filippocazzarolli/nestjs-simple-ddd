import { Inject, Injectable } from '@nestjs/common';
import { Invoice } from '../../domain/entities/invoice.entity';
import { ID_GENERATOR } from '../ports/id-generator';
import { INVOICE_REPOSITORY } from '../ports/invoice.repository';
import { CreateInvoiceCommand } from './create-invoice.command';
// `import type` is mandatory here: these are interfaces, and they would
// otherwise show up in the metadata emitted by the decorator
// (isolatedModules + emitDecoratorMetadata).
import type { IdGenerator } from '../ports/id-generator';
import type { InvoiceRepository } from '../ports/invoice.repository';

/**
 * Command side: the only place in the module where an aggregate is built and
 * persisted. Invariants live in `Invoice.create()`, not here — this handler
 * orchestrates I/O and nothing else.
 */
@Injectable()
export class CreateInvoiceHandler {
  constructor(
    @Inject(INVOICE_REPOSITORY)
    private readonly invoices: InvoiceRepository,
    @Inject(ID_GENERATOR)
    private readonly idGenerator: IdGenerator,
  ) {}

  async execute(command: CreateInvoiceCommand): Promise<Invoice> {
    const invoice = Invoice.create({
      // The identity is server-generated through a port, never accepted from
      // the client.
      id: this.idGenerator.generate(),
      amount: command.amount,
      customerName: command.customerName,
    });
    return this.invoices.save(invoice);
  }
}
