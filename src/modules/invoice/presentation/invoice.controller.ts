import { Body, Controller, Get, Param, Post, UseFilters } from '@nestjs/common';
import { CreateInvoiceHandler } from '../application/commands/create-invoice.handler';
import { GetInvoiceHandler } from '../application/queries/get-invoice.handler';
import { ListInvoicesHandler } from '../application/queries/list-invoices.handler';
import { InvoiceView } from '../application/queries/read-models/invoice.view';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { InvoiceExceptionFilter } from './invoice-exception.filter';

/**
 * The injected handlers double as an index of the module's use cases: one
 * dependency per use case, resolved by the compiler rather than by a runtime
 * dispatcher. What leaves this layer is always a read model, never an entity.
 */
@Controller('invoices')
@UseFilters(InvoiceExceptionFilter)
export class InvoiceController {
  constructor(
    private readonly createInvoice: CreateInvoiceHandler,
    private readonly listInvoices: ListInvoicesHandler,
    private readonly getInvoice: GetInvoiceHandler,
  ) {}

  @Post()
  create(@Body() dto: CreateInvoiceDto): Promise<InvoiceView> {
    return this.createInvoice.execute({
      customerName: dto.customerName,
      amount: dto.amount,
    });
  }

  @Get()
  findAll(): Promise<InvoiceView[]> {
    return this.listInvoices.execute();
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<InvoiceView> {
    return this.getInvoice.execute(id);
  }
}
