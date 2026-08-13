import { Injectable } from '@nestjs/common';
import { Invoice } from '../../domain/entities/invoice.entity';

/**
 * The single in-memory store, shared by the write and the read adapter. Two
 * ports do not imply two databases: what CQRS separates here is
 * responsibility, not storage. Because both sides hit the same Map, reads are
 * strongly consistent — an invoice is visible to the summary query on the very
 * next request. Eventual consistency only shows up if the two stores are
 * physically split, which is out of scope.
 *
 * It is a provider rather than a module-level `const` so that every test gets
 * a fresh Map: a file-level singleton would make the suites order-dependent.
 */
@Injectable()
export class InMemoryInvoiceStore {
  readonly invoices = new Map<string, Invoice>();
}
