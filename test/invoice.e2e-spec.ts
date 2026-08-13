import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

interface InvoiceBody {
  id: string;
  amount: number;
  customerName: string;
}

describe('InvoiceController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  const createInvoice = (body: Record<string, unknown>) =>
    request(app.getHttpServer()).post('/invoices').send(body);

  it('POST /invoices creates the invoice and generates its id', async () => {
    const response = await createInvoice({ amount: 100, customerName: 'ACME' });
    const invoice = response.body as InvoiceBody;

    expect(response.status).toBe(201);
    expect(typeof invoice.id).toBe('string');
    expect(invoice.id.length).toBeGreaterThan(0);
    expect(invoice.amount).toBe(100);
    expect(invoice.customerName).toBe('ACME');
  });

  it('GET /invoices lists the created invoices', async () => {
    const created = await createInvoice({ amount: 100, customerName: 'ACME' });

    const response = await request(app.getHttpServer()).get('/invoices');

    expect(response.status).toBe(200);
    expect(response.body as InvoiceBody[]).toEqual([
      created.body as InvoiceBody,
    ]);
  });

  it('GET /invoices/:id returns a single invoice', async () => {
    const created = await createInvoice({ amount: 100, customerName: 'ACME' });
    const { id } = created.body as InvoiceBody;

    const response = await request(app.getHttpServer()).get(`/invoices/${id}`);

    expect(response.status).toBe(200);
    expect(response.body as InvoiceBody).toEqual(created.body as InvoiceBody);
  });

  it('GET /invoices/:id responds 404 when the invoice does not exist', async () => {
    const response = await request(app.getHttpServer()).get(
      '/invoices/inesistente',
    );

    expect(response.status).toBe(404);
    expect(response.body as Record<string, unknown>).toMatchObject({
      statusCode: 404,
      error: 'InvoiceNotFoundError',
    });
  });

  it('POST /invoices rejects a non-positive amount with 400', async () => {
    const response = await createInvoice({ amount: -5, customerName: 'ACME' });

    expect(response.status).toBe(400);
  });

  it('POST /invoices rejects a client-supplied id with 400', async () => {
    const response = await createInvoice({
      id: 'inv-1',
      amount: 100,
      customerName: 'ACME',
    });

    expect(response.status).toBe(400);
  });
});
