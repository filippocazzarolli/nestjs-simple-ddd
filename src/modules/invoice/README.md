# Modulo `invoice`

Modulo DDD con application layer separato in **command side** e **query side** (CQRS senza
message bus: gli handler sono iniettati direttamente, la separazione è nel design).

Il razionale completo, i trade-off e il piano seguito stanno in `docs/cqrs-case-study.md`.

## Endpoint

| Metodo | Rotta | Handler | Ritorna |
|---|---|---|---|
| `POST` | `/invoices` | `CreateInvoiceHandler` | `InvoiceView` |
| `GET` | `/invoices` | `ListInvoicesHandler` | `InvoiceView[]` |
| `GET` | `/invoices/summary` | `GetInvoiceSummaryHandler` | `InvoiceSummaryView[]` |
| `GET` | `/invoices/:id` | `GetInvoiceHandler` | `InvoiceView` (404 se assente) |

`GET /invoices/summary` accetta `?customerName=` (match esatto) e `?minAmount=` (filtra le
singole fatture **prima** dell'aggregazione). Ordina per `totalAmount` desc, poi
`customerName` asc; media arrotondata a 2 decimali; nessun risultato → `200` con `[]`.

> `@Get('summary')` deve restare dichiarato **sopra** `@Get(':id')` nel controller: le route
> si registrano nell'ordine dei metodi. Invertendole, `summary` viene catturato come `:id` e
> l'endpoint risponde `404 InvoiceNotFoundError`. Un e2e presidia la cosa.

## Struttura

```
domain/                                   foglia: non importa nulla
├── entities/invoice.entity.ts            aggregato, sempre valido (factory create)
└── errors/invoice.error.ts               InvoiceError e sottoclassi

application/
├── commands/
│   ├── create-invoice.command.ts         input, senza decoratori HTTP
│   └── create-invoice.handler.ts         unico punto che costruisce e salva l'aggregato
├── queries/
│   ├── get-invoice.handler.ts            traduce l'assenza in InvoiceNotFoundError
│   ├── list-invoices.handler.ts          pass-through
│   ├── get-invoice-summary.query.ts      input della query (due campi opzionali)
│   ├── get-invoice-summary.handler.ts    pass-through: l'aggregazione sta nell'adapter
│   └── read-models/
│       ├── invoice.view.ts               ciò che esce dal confine, mai l'entità
│       └── invoice-summary.view.ts       projection senza aggregato dietro
└── ports/
    ├── invoice.repository.ts             write side: save + findById
    ├── invoice-query.repository.ts       read side: findById, findAll, summarizeByCustomer
    └── id-generator.ts                   identità generata dal server

persistence/repositories/
├── in-memory-invoice.store.ts            la Map: una sola, condivisa dalle due port
├── in-memory-invoice.repository.ts       write adapter
└── in-memory-invoice-query.repository.ts read adapter + mappatura entità → view

presentation/
├── dto/create-invoice.dto.ts             class-validator: richiesta HTTP ben formata
├── dto/invoice-summary-query.dto.ts      query string (@Type(() => Number) su minAmount)
├── invoice.controller.ts                 un handler iniettato per use case
└── invoice-exception.filter.ts           InvoiceError → 404/400

invoice.module.ts                         composition root: port → adapter
```

## Le regole in una riga ciascuna

1. L'entità non attraversa il confine dell'application layer: esce un read model.
2. Il write side carica per id, il read side interroga.
3. La mappatura entità → view sta nell'adapter, che sa da dove viene il dato.
4. Le query non hanno invarianti: nessun `Invoice.create()`, lista vuota invece di errore.
5. Due port non sono due database: lo store è uno, le letture sono fortemente consistenti.

## Sostituire l'in-memory con un DB reale

Cambiare `useClass` in `invoice.module.ts` e rimuovere `InMemoryInvoiceStore`. Si può fare
**una port alla volta**: `summarizeByCustomer` diventa una `GROUP BY` senza che l'application
layer cambi di una riga.
