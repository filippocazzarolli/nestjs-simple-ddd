import { Inject, Injectable } from '@nestjs/common';
import { CreateInvoiceDto } from '../dto/create-invoice.dto';
import { Invoice } from '../../domain/entities/invoice.entity';
import { InvoiceNotFoundError } from '../../domain/errors/invoice.error';
import { ID_GENERATOR } from '../ports/id-generator';
import { INVOICE_REPOSITORY } from '../ports/invoice.repository';
// `import type` is mandatory here: these are interfaces, and they would
// otherwise show up in the metadata emitted by the decorator
// (isolatedModules + emitDecoratorMetadata).
import type { IdGenerator } from '../ports/id-generator';
import type { InvoiceRepository } from '../ports/invoice.repository';

@Injectable()
export class InvoiceService {
  constructor(
    @Inject(INVOICE_REPOSITORY)
    private readonly invoiceRepository: InvoiceRepository,
    @Inject(ID_GENERATOR)
    private readonly idGenerator: IdGenerator,
  ) {}

  async createInvoice(createInvoiceDto: CreateInvoiceDto): Promise<Invoice> {
    const invoice = Invoice.create({
      id: this.idGenerator.generate(),
      amount: createInvoiceDto.amount,
      customerName: createInvoiceDto.customerName,
    });
    return this.invoiceRepository.save(invoice);
  }

  async getInvoice(id: string): Promise<Invoice> {
    const invoice = await this.invoiceRepository.findById(id);
    if (invoice === null) {
      throw new InvoiceNotFoundError(id);
    }
    return invoice;
  }

  async listInvoices(): Promise<Invoice[]> {
    return this.invoiceRepository.findAll();
  }
}
