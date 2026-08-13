import { Body, Controller, Get, Param, Post, UseFilters } from '@nestjs/common';
import { InvoiceService } from '../application/services/invoice.service';
import { CreateInvoiceDto } from '../application/dto/create-invoice.dto';
import { InvoiceExceptionFilter } from './invoice-exception.filter';

@Controller('invoices')
@UseFilters(InvoiceExceptionFilter)
export class InvoiceController {
  constructor(private readonly invoiceService: InvoiceService) {}

  @Post()
  async create(@Body() createInvoiceDto: CreateInvoiceDto) {
    return this.invoiceService.createInvoice(createInvoiceDto);
  }

  @Get()
  async findAll() {
    return this.invoiceService.listInvoices();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.invoiceService.getInvoice(id);
  }
}
