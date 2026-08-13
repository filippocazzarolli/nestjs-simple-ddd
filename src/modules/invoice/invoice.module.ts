import { Module } from '@nestjs/common';
import { InvoiceController } from './presentation/invoice.controller';
import { CreateInvoiceHandler } from './application/commands/create-invoice.handler';
import { GetInvoiceHandler } from './application/queries/get-invoice.handler';
import { GetInvoiceSummaryHandler } from './application/queries/get-invoice-summary.handler';
import { ListInvoicesHandler } from './application/queries/list-invoices.handler';
import { ID_GENERATOR } from './application/ports/id-generator';
import { INVOICE_REPOSITORY } from './application/ports/invoice.repository';
import { INVOICE_QUERY_REPOSITORY } from './application/ports/invoice-query.repository';
import { UuidGenerator } from './infrastructure/id/uuid-generator';
import { InMemoryInvoiceStore } from './persistence/repositories/in-memory-invoice.store';
import { InMemoryInvoiceRepository } from './persistence/repositories/in-memory-invoice.repository';
import { InMemoryInvoiceQueryRepository } from './persistence/repositories/in-memory-invoice-query.repository';

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
    GetInvoiceSummaryHandler,
    // adapters: one store, two ports over it. Replacing the in-memory store
    // with Postgres can now be done one side at a time.
    InMemoryInvoiceStore,
    {
      provide: INVOICE_REPOSITORY,
      useClass: InMemoryInvoiceRepository,
    },
    {
      provide: INVOICE_QUERY_REPOSITORY,
      useClass: InMemoryInvoiceQueryRepository,
    },
    {
      provide: ID_GENERATOR,
      useClass: UuidGenerator,
    },
  ],
})
export class InvoiceModule {}
