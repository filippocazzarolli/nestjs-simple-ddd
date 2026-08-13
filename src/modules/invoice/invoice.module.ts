import { Module } from '@nestjs/common';
import { InvoiceController } from './presentation/invoice.controller';
import { CreateInvoiceHandler } from './application/commands/create-invoice.handler';
import { GetInvoiceHandler } from './application/queries/get-invoice.handler';
import { ListInvoicesHandler } from './application/queries/list-invoices.handler';
import { ID_GENERATOR } from './application/ports/id-generator';
import { INVOICE_REPOSITORY } from './application/ports/invoice.repository';
import { UuidGenerator } from './infrastructure/id/uuid-generator';
import { InMemoryInvoiceRepository } from './persistence/repositories/in-memory-invoice.repository';

/**
 * Composition root of the module, and the only place where the layers meet:
 * binds the ports declared in `application/` to the adapters living in
 * `persistence/` and `infrastructure/`. Swapping an adapter for another one is
 * a single `useClass` away.
 */
@Module({
  controllers: [InvoiceController],
  providers: [
    // command side
    CreateInvoiceHandler,
    // query side
    GetInvoiceHandler,
    ListInvoicesHandler,
    // adapters
    {
      provide: INVOICE_REPOSITORY,
      useClass: InMemoryInvoiceRepository,
    },
    {
      provide: ID_GENERATOR,
      useClass: UuidGenerator,
    },
  ],
})
export class InvoiceModule {}
