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

interface SummaryBody {
  customerName: string;
  invoiceCount: number;
  totalAmount: number;
  averageAmount: number;
  maxAmount: number;
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

  describe('GET /invoices/summary', () => {
    const getSummary = (queryString = '') =>
      request(app.getHttpServer()).get(`/invoices/summary${queryString}`);

    const givenInvoices = async () => {
      await createInvoice({ amount: 100, customerName: 'ACME' });
      await createInvoice({ amount: 50, customerName: 'ACME' });
      await createInvoice({ amount: 60, customerName: 'Globex' });
    };

    it('responds 200 with an empty list when there is no invoice', async () => {
      const response = await getSummary();

      expect(response.status).toBe(200);
      expect(response.body as SummaryBody[]).toEqual([]);
    });

    it('rolls up per customer, ordered by total desc', async () => {
      await givenInvoices();

      const response = await getSummary();

      expect(response.status).toBe(200);
      expect(response.body as SummaryBody[]).toEqual([
        {
          customerName: 'ACME',
          invoiceCount: 2,
          totalAmount: 150,
          averageAmount: 75,
          maxAmount: 100,
        },
        {
          customerName: 'Globex',
          invoiceCount: 1,
          totalAmount: 60,
          averageAmount: 60,
          maxAmount: 60,
        },
      ]);
    });

    it('filters by customerName', async () => {
      await givenInvoices();

      const response = await getSummary('?customerName=Globex');

      expect(response.status).toBe(200);
      expect(
        (response.body as SummaryBody[]).map((s) => s.customerName),
      ).toEqual(['Globex']);
    });

    it('applies minAmount to individual invoices', async () => {
      await givenInvoices();

      const response = await getSummary('?minAmount=60');

      // ACME keeps only its 100 invoice; the 50 one is excluded before the
      // roll-up.
      expect(response.status).toBe(200);
      expect(response.body as SummaryBody[]).toEqual([
        {
          customerName: 'ACME',
          invoiceCount: 1,
          totalAmount: 100,
          averageAmount: 100,
          maxAmount: 100,
        },
        {
          customerName: 'Globex',
          invoiceCount: 1,
          totalAmount: 60,
          averageAmount: 60,
          maxAmount: 60,
        },
      ]);
    });

    it('rejects a non-numeric minAmount with 400', async () => {
      const response = await getSummary('?minAmount=abc');

      expect(response.status).toBe(400);
    });

    it('rejects an undeclared query param with 400', async () => {
      const response = await getSummary('?nonEsiste=1');

      expect(response.status).toBe(400);
    });

    it('is not swallowed by the :id route', async () => {
      // Guards the declaration order in the controller: were @Get('summary')
      // below @Get(':id'), this would answer 404 InvoiceNotFoundError.
      const response = await getSummary();

      expect(response.status).not.toBe(404);
      expect(response.body as Record<string, unknown>).not.toMatchObject({
        error: 'InvoiceNotFoundError',
      });
    });
  });
});
