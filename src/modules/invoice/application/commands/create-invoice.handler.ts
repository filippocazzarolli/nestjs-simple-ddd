import { Inject, Injectable } from '@nestjs/common';
import { Invoice } from '../../domain/entities/invoice.entity';
import { ID_GENERATOR } from '../ports/id-generator';
import { INVOICE_REPOSITORY } from '../ports/invoice.repository';
import { InvoiceView } from '../queries/read-models/invoice.view';
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

  async execute(command: CreateInvoiceCommand): Promise<InvoiceView> {
    const invoice = Invoice.create({
      // The identity is server-generated through a port, never accepted from
      // the client.
      id: this.idGenerator.generate(),
      amount: command.amount,
      customerName: command.customerName,
    });
    await this.invoices.save(invoice);

    // A command returning a view is a compromise, taken on purpose: the purist
    // option is `void` (or the id alone with a Location header), but the client
    // needs the server-generated id and a read-after-write round trip buys
    // nothing here. The mapping is inline rather than in the read adapter
    // because the write side already holds the aggregate: going through the
    // query port would mean re-reading what we just wrote.
    return {
      id: invoice.id,
      amount: invoice.amount,
      customerName: invoice.customerName,
    };
  }
}
