import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseFilters,
} from '@nestjs/common';
import { CreateInvoiceHandler } from '../application/commands/create-invoice.handler';
import { GetInvoiceHandler } from '../application/queries/get-invoice.handler';
import { GetInvoiceSummaryHandler } from '../application/queries/get-invoice-summary.handler';
import { ListInvoicesHandler } from '../application/queries/list-invoices.handler';
import { InvoiceSummaryView } from '../application/queries/read-models/invoice-summary.view';
import { InvoiceView } from '../application/queries/read-models/invoice.view';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { InvoiceSummaryQueryDto } from './dto/invoice-summary-query.dto';
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
    private readonly getInvoiceSummary: GetInvoiceSummaryHandler,
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

  /**
   * MUST stay above @Get(':id'): routes are registered in declaration order,
   * so moving it below would make 'summary' match as an :id and answer 404
   * with `Invoice not found: summary` — a routing bug that reads like a domain
   * one. There is an e2e test guarding this.
   */
  @Get('summary')
  summary(
    @Query() query: InvoiceSummaryQueryDto,
  ): Promise<InvoiceSummaryView[]> {
    return this.getInvoiceSummary.execute({
      customerName: query.customerName,
      minAmount: query.minAmount,
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<InvoiceView> {
    return this.getInvoice.execute(id);
  }
}
