# Caso di studio — Introdurre CQRS in un modulo DDD NestJS

Documento di approccio e piano di modifica per il modulo `src/modules/invoice/`.
**Nessuna riga di codice è stata modificata**: gli snippet qui riportati sono la forma
proposta, non lo stato attuale del repository.

Obiettivo didattico: usare l'aggiunta di **una nuova lettura** (`GET /invoices/summary`)
come pretesto per rendere visibile la separazione tra **command side** e **query side**,
mostrando *perché* la separazione emerge da sola quando il modello di lettura non coincide
più con l'aggregato.

---

## 1. Punto di partenza

Lo stato attuale è un DDD per-modulo pulito: `domain/` foglia del grafo, ports in
`application/ports/`, adapter in `persistence/` e `infrastructure/`, HTTP confinato in
`presentation/`, composizione in `invoice.module.ts`.

Il flusso di ogni richiesta oggi è simmetrico:

```
InvoiceController ──> InvoiceService ──> InvoiceRepository ──> Map<string, Invoice>
                                    └──> Invoice (entità)
```

`InvoiceService` (`src/modules/invoice/application/services/invoice.service.ts`) espone tre
metodi: `createInvoice`, `getInvoice`, `listInvoices`. Uno scrive, due leggono, tutti tre
condividono la stessa dipendenza e lo stesso tipo di ritorno (`Invoice`).

Finché il modello letto è identico al modello scritto, questa simmetria è comoda e va
lasciata così. Tre sintomi indicano che sta smettendo di esserlo:

1. **L'entità esce dal confine.** Il controller restituisce direttamente `Invoice`. La
   risposta HTTP è oggi il risultato della serializzazione JSON di un oggetto di dominio:
   aggiungere un campo interno all'entità (es. un flag di stato, una nota, un totale
   calcolato) cambia il contratto pubblico dell'API senza che nessuno lo abbia deciso.
2. **`findAll()` è una port che non scala.** Va bene su una `Map`; su Postgres significa
   "carica tutte le righe, istanzia tutte le entità, poi butta via quasi tutto". Una port
   aggregate-oriented è la forma sbagliata per le letture di lista.
3. **La prossima lettura non è una fattura.** Un riepilogo per cliente (conteggio, totale,
   media) non è un'`Invoice`, non è una lista di `Invoice`, e non ha alcuna invariante da
   proteggere. Non esiste un modo onesto di farla passare per l'entità.

Il punto 3 è il caso studio.

---

## 2. Che cosa si intende qui per CQRS

**Command Query Responsibility Segregation**: le operazioni che *cambiano* lo stato e quelle
che lo *osservano* usano modelli, port e tipi distinti, non lo stesso oggetto letto e scritto
da entrambe le parti.

Definizione operativa, con le quattro regole già presenti in `CLAUDE.md`:

| | Command side | Query side |
|---|---|---|
| Punto d'ingresso | `CreateInvoiceHandler` | `GetInvoiceSummaryHandler`, … |
| Modello | aggregato `Invoice` (entità sempre valida) | read model / view (DTO piatto, immutabile) |
| Port | `InvoiceRepository` (per id, salva aggregati) | `InvoiceQueryRepository` (ritorna view) |
| Invarianti | sì, nel dominio | nessuna: si legge ciò che è già valido |
| Errori | domain error (`InvoiceError`) | assenza / lista vuota |
| Pattern | carica → decidi → salva | proietta → ritorna |
| Ritorno | l'aggregato (o `void`) | il read model, mai l'entità |

Ciò che CQRS **non** è, e che questo caso studio non introduce:

- **Non è event sourcing.** Nessun event store, nessun replay. Sono ortogonali: CQRS si
  adotta benissimo su un modello di scrittura a stato corrente.
- **Non è "due database".** Nel piano seguente il read side e il write side leggono la
  *stessa* `Map`. Ciò che si separa è la **responsabilità** e il **contratto**, non lo
  storage. Separare lo storage è un passo successivo e facoltativo — ed è l'unico che
  introduce eventual consistency.
- **Non è un message bus obbligatorio.** `CommandBus`/`QueryBus` (`@nestjs/cqrs`) sono un
  meccanismo di dispatch, non il pattern. Vedi §10.

Il valore per il progetto, ordinato per rilevanza: **contratto API disaccoppiato
dall'entità** > **letture ottimizzabili indipendentemente** > **use case leggibili uno per
file** > eventuale scalabilità separata (irrilevante a questa dimensione).

---

## 3. Architettura target

Il diagramma di `CLAUDE.md` resta valido — le frecce puntano verso l'interno — ma
l'application layer si biforca:

```
                         ┌─ commands/ ──> Domain (Invoice, InvoiceError)
Presentation ──> Application ┤                  ▲
                         └─ queries/ ───┐       │
                                        │       │
                    Persistence ────────┴───────┘
                    (write adapter + read adapter, stesso store)
                    Infrastructure ──> application/ports/
```

Nota strutturale: il **query side non punta al dominio**. È una freccia in meno, non una in
più. Un read model non importa `Invoice`; se lo importasse, la separazione sarebbe solo
nominale.

Albero dei file proposto (in **grassetto** i nuovi):

```
src/modules/invoice/
├── domain/                                  (invariato)
│   ├── entities/invoice.entity.ts
│   └── errors/invoice.error.ts
├── application/
│   ├── commands/
│   │   ├── **create-invoice.command.ts**            (input del comando, ex CreateInvoiceDto)
│   │   └── **create-invoice.handler.ts**
│   ├── queries/
│   │   ├── **get-invoice.handler.ts**
│   │   ├── **list-invoices.handler.ts**
│   │   ├── **get-invoice-summary.query.ts**         (input della query)
│   │   ├── **get-invoice-summary.handler.ts**
│   │   └── read-models/
│   │       ├── **invoice.view.ts**
│   │       └── **invoice-summary.view.ts**
│   ├── ports/
│   │   ├── invoice.repository.ts                    (write side, dimagrisce)
│   │   ├── **invoice-query.repository.ts**          (read side)
│   │   └── id-generator.ts
│   └── dto/create-invoice.dto.ts                    (resta HTTP-facing, vedi §5.1)
├── persistence/repositories/
│   ├── **in-memory-invoice.store.ts**               (la Map, unica sorgente)
│   ├── in-memory-invoice.repository.ts              (write adapter)
│   └── **in-memory-invoice-query.repository.ts**    (read adapter)
├── presentation/
│   ├── invoice.controller.ts                        (inietta gli handler)
│   ├── **dto/invoice-summary-query.dto.ts**         (query string validata)
│   └── invoice-exception.filter.ts                  (invariato)
└── invoice.module.ts                                (registra store + 2 adapter + 4 handler)
```

`application/services/invoice.service.ts` e il suo spec **sparirebbero**, sostituiti da un
handler per use case. Un handler = una classe = un metodo `execute`.

---

## 4. Il caso studio: `GET /invoices/summary`

### 4.1 Il requisito

> Dato l'insieme delle fatture, restituire per ciascun cliente: numero di fatture, importo
> totale, importo medio, importo massimo. Facoltativamente filtrare per cliente e imporre un
> importo minimo.

### 4.2 Perché è il caso giusto per mostrare CQRS

Provando a servirlo con il modello attuale si sbatte contro un muro, e il muro è istruttivo:

- **Non è un aggregato.** "Il riepilogo del cliente ACME" non ha identità, non ha ciclo di
  vita, non ha invarianti. Modellarlo come entità sarebbe un'entità anemica per definizione.
- **Non è un domain service.** Un domain service decide (es. "questa fattura può essere
  stornata?"). Qui non si decide nulla: si osserva. Metterci un domain service significa
  spostare logica di presentazione nel dominio.
- **Passare per `findAll()` è sbagliato di principio, non solo di performance.** Il calcolo
  in JavaScript su tutte le entità caricate funziona, ma congela una scelta di
  implementazione nel layer sbagliato: con un DB reale la risposta è
  `SELECT customer_name, COUNT(*), SUM(amount), AVG(amount), MAX(amount) FROM invoices GROUP BY customer_name`,
  e quella query non deve richiedere di riscrivere l'application layer.

Con una port di lettura dedicata, l'application layer chiede
`invoiceQueryRepository.summarizeByCustomer(filter)` e **non sa** se dietro c'è una
`Map`, un `GROUP BY`, una materialized view o una cache. È esattamente lo stesso argomento
della dependency inversion già usata per `IdGenerator` — applicato alle letture.

### 4.3 Contratto HTTP proposto

```
GET /invoices/summary
GET /invoices/summary?customerName=ACME
GET /invoices/summary?minAmount=50
```

```json
[
  { "customerName": "ACME",   "invoiceCount": 2, "totalAmount": 150, "averageAmount": 75, "maxAmount": 100 },
  { "customerName": "Globex", "invoiceCount": 1, "totalAmount": 50,  "averageAmount": 50, "maxAmount": 50  }
]
```

Decisioni da fissare adesso, perché sono contratto:

- **Ordinamento**: `totalAmount` decrescente, poi `customerName` crescente come tie-break.
  Un ordine deterministico è necessario perché i test e2e siano stabili.
- **Nessun risultato**: `200` con `[]`, mai `404`. Una query di lista che non trova nulla non
  è un errore.
- **`averageAmount`**: arrotondato a 2 decimali dall'adapter. Va deciso lì, non lasciato ai
  float che arrivano al client.
- **`minAmount`** filtra le *singole fatture* prima dell'aggregazione (non i totali).
  Ambiguità classica di questi endpoint: va scritta nel test, non solo nel documento.

### 4.4 Perché *non* `GET /invoices?groupBy=customer`

Sarebbe un endpoint polimorfo che ritorna due tipi diversi in base a un query param:
impossibile da tipizzare onestamente lato client e impossibile da documentare. Una lettura
diversa è una risorsa diversa. Questa è la stessa disciplina di CQRS applicata al livello
HTTP.

---

## 5. Modifiche proposte, file per file

Gli snippet sono indicativi ma scritti per compilare con la config di questo repo
(`strictNullChecks`, `nodenext`, `recommendedTypeChecked`). Commenti in inglese per coerenza
con quelli già presenti nel codice.

### 5.1 Read model — `application/queries/read-models/`

```ts
// invoice.view.ts
/**
 * Read model: the shape the presentation layer consumes. It deliberately does
 * not import Invoice — the entity must not cross this boundary, or the API
 * contract becomes a side effect of every change to the aggregate.
 */
export interface InvoiceView {
  readonly id: string;
  readonly amount: number;
  readonly customerName: string;
}
```

```ts
// invoice-summary.view.ts
export interface InvoiceSummaryView {
  readonly customerName: string;
  readonly invoiceCount: number;
  readonly totalAmount: number;
  readonly averageAmount: number;
  readonly maxAmount: number;
}
```

Oggi `InvoiceView` è strutturalmente identico a `Invoice`. **È il punto**: la duplicazione
apparente è ciò che permette ai due modelli di divergere senza rompere nulla. È il costo
esplicito e accettato di CQRS (vedi §9).

### 5.2 Port di lettura — `application/ports/invoice-query.repository.ts`

```ts
import { InvoiceSummaryView } from '../queries/read-models/invoice-summary.view';
import { InvoiceView } from '../queries/read-models/invoice.view';

export interface InvoiceSummaryFilter {
  readonly customerName?: string;
  readonly minAmount?: number;
}

/**
 * Driven port towards the read side. Separate from InvoiceRepository because
 * reads and writes have different shapes: this one returns views, never
 * aggregates, and its methods mirror use cases rather than table rows.
 */
export interface InvoiceQueryRepository {
  findById(id: string): Promise<InvoiceView | null>;
  findAll(): Promise<InvoiceView[]>;
  summarizeByCustomer(
    filter: InvoiceSummaryFilter,
  ): Promise<InvoiceSummaryView[]>;
}

export const INVOICE_QUERY_REPOSITORY = Symbol('InvoiceQueryRepository');
```

### 5.3 Port di scrittura — `application/ports/invoice.repository.ts` (dimagrisce)

```ts
export interface InvoiceRepository {
  save(invoice: Invoice): Promise<Invoice>;
  findById(id: string): Promise<Invoice | null>; // needed by future commands
}
```

`findAll(): Promise<Invoice[]>` **va rimosso**: nessun comando ha motivo di caricare tutte le
fatture, e lasciarlo è l'invito a scrivere la prossima lettura dal lato sbagliato. `findById`
resta perché i comandi futuri (`payInvoice`, `voidInvoice`) devono caricare l'aggregato per
decidere — è "carica → decidi → salva", regola 3.

Da qui la regola di lettura che vale come check di review:
**il write side carica per id, il read side interroga.**

### 5.4 Store condiviso — `persistence/repositories/in-memory-invoice.store.ts`

```ts
import { Injectable } from '@nestjs/common';
import { Invoice } from '../../domain/entities/invoice.entity';

/**
 * The single in-memory store, shared by the write and the read adapter. Two
 * ports do not imply two databases: what CQRS separates here is responsibility,
 * not storage. Because both sides hit the same Map, reads are strongly
 * consistent — see the eventual-consistency note in the design document.
 */
@Injectable()
export class InMemoryInvoiceStore {
  readonly invoices = new Map<string, Invoice>();
}
```

### 5.5 Adapter di lettura — `in-memory-invoice-query.repository.ts`

```ts
@Injectable()
export class InMemoryInvoiceQueryRepository implements InvoiceQueryRepository {
  constructor(private readonly store: InMemoryInvoiceStore) {}

  findById(id: string): Promise<InvoiceView | null> {
    const invoice = this.store.invoices.get(id);
    return Promise.resolve(invoice ? toView(invoice) : null);
  }

  findAll(): Promise<InvoiceView[]> {
    return Promise.resolve([...this.store.invoices.values()].map(toView));
  }

  summarizeByCustomer(
    filter: InvoiceSummaryFilter,
  ): Promise<InvoiceSummaryView[]> {
    // The whole aggregation lives in the adapter: on a real database this
    // method becomes a single GROUP BY, and no other file changes.
    ...
  }
}
```

**La traduzione entità → view sta qui, nell'adapter, non nell'handler.** È l'adapter che sa
da dove viene il dato: da una `Map` di entità oggi, da una `row` SQL domani. Se la
mappatura stesse nell'handler, l'handler dovrebbe conoscere `Invoice` e la separazione
sarebbe finta.

Sull'implementazione: raggruppare per `customerName`, applicare `minAmount` **prima**
dell'aggregazione, arrotondare la media a 2 decimali, ordinare per `totalAmount` desc +
`customerName` asc. Restare metodo sincrono con `Promise.resolve(...)`: `require-await` di
`recommendedTypeChecked` rifiuta un `async` senza `await` (trappola già documentata in
`CLAUDE.md`).

### 5.6 Handler — un file per use case

```ts
// application/queries/get-invoice-summary.handler.ts
@Injectable()
export class GetInvoiceSummaryHandler {
  constructor(
    @Inject(INVOICE_QUERY_REPOSITORY)
    private readonly invoices: InvoiceQueryRepository,
  ) {}

  execute(query: GetInvoiceSummaryQuery): Promise<InvoiceSummaryView[]> {
    return this.invoices.summarizeByCustomer(query);
  }
}
```

Un handler di query così è **giustamente** un pass-through, e va lasciato tale: è il punto in
cui si vede che sul read side non c'è nulla da orchestrare. La tentazione da evitare è
riempirlo di logica di aggregazione "per dargli un senso".

`GetInvoiceHandler` è l'unico con un comportamento proprio: traduce l'assenza in errore.

```ts
// application/queries/get-invoice.handler.ts
async execute(id: string): Promise<InvoiceView> {
  const invoice = await this.invoices.findById(id);
  if (invoice === null) {
    throw new InvoiceNotFoundError(id);
  }
  return invoice;
}
```

**Decisione da prendere consapevolmente**: qui una query importa un errore di *dominio*.
Motivazione per tenerlo: "questa fattura non esiste" è un fatto di dominio, e
`InvoiceExceptionFilter` già lo mappa in 404 — cambiarlo aggiungerebbe un secondo canale
d'errore senza guadagno. Da rivedere solo se il read side diventerà un modello separato e
asincrono: allora "non trovata" può voler dire "non ancora proiettata", e un 404 sarebbe una
bugia. Vale la pena scriverlo in un commento nel file.

Il command handler è la vecchia `createInvoice` spostata, invariata nella sostanza:

```ts
// application/commands/create-invoice.handler.ts
async execute(command: CreateInvoiceCommand): Promise<InvoiceView> {
  const invoice = Invoice.create({
    id: this.idGenerator.generate(),
    amount: command.amount,
    customerName: command.customerName,
  });
  await this.invoices.save(invoice);
  return { id: invoice.id, amount: invoice.amount, customerName: invoice.customerName };
}
```

Nota su cosa ritorna un comando. Tre opzioni, in ordine di purezza CQRS: `void`
(l'`id` generato dal server sarebbe però irrecuperabile dal client), solo l'`id` con `201` +
header `Location`, o la view completa. **Raccomandazione: la view completa**, per non
rompere il contratto attuale (`POST` restituisce oggi la fattura, e c'è un test e2e che lo
verifica) e per non introdurre un round-trip. La versione `id` + `Location` è quella
"corretta da manuale" e vale come esercizio: cambia il test e2e, non l'architettura.

### 5.7 Command / Query object — `create-invoice.command.ts`, `get-invoice-summary.query.ts`

```ts
// The application-layer input, decoupled from HTTP: plain readonly data, no
// class-validator decorators. Those belong to the DTO in presentation/.
export interface CreateInvoiceCommand {
  readonly customerName: string;
  readonly amount: number;
}
```

Qui c'è una scelta da fare, e va fatta una volta per tutte:

- **Opzione A (raccomandata): DTO in `presentation/dto/`, command/query in `application/`.**
  Il DTO decorato con `class-validator` è un dettaglio HTTP; il controller lo mappa nel
  command. Costo: una mappatura banale per endpoint. Beneficio: l'application layer non
  dipende da `class-validator`, ed è invocabile da una CLI o da un consumer di coda senza
  trascinarsi dietro la validazione HTTP.
- **Opzione B (status quo): il DTO decorato *è* l'input dell'application layer**, come oggi
  con `CreateInvoiceDto` in `application/dto/`. Meno file, ma l'application layer resta
  legato a una libreria di validazione web.

Se si sceglie A, `application/dto/` va spostato in `presentation/dto/` in modo coerente per
tutti gli endpoint. **Un ibrido è peggio di entrambe le opzioni**: chi legge non sa più dove
guardare. Se si vuole tenere il diff piccolo in questa iterazione, scegliere B ed
esplicitarlo in `CLAUDE.md`.

### 5.8 Presentation — `invoice.controller.ts`

```ts
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
  create(@Body() dto: CreateInvoiceDto): Promise<InvoiceView> { ... }

  @Get()
  findAll(): Promise<InvoiceView[]> { ... }

  // MUST stay above @Get(':id'): route order is declaration order, otherwise
  // 'summary' is matched as an :id and the request 404s.
  @Get('summary')
  summary(@Query() query: InvoiceSummaryQueryDto): Promise<InvoiceSummaryView[]> { ... }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<InvoiceView> { ... }
}
```

Due dettagli concreti, entrambi fonte di bug reali:

**a) Ordine delle route.** In Express le route si registrano nell'ordine di dichiarazione dei
metodi. `@Get('summary')` **dopo** `@Get(':id')` produce un 404 con messaggio
`Invoice not found: summary` — sintomo che sembra un bug di dominio ed è un bug di routing.
Serve un test e2e dedicato, altrimenti un domani un riordino "estetico" dei metodi rompe
l'endpoint in silenzio.

**b) Query string e `ValidationPipe`.** I query param arrivano **sempre come stringhe**. Il
pipe globale in `app.module.ts` è configurato con `transform: true` ma senza
`transformOptions.enableImplicitConversion`, quindi `@IsNumber()` su `minAmount=50`
fallirebbe con 400. Inoltre `forbidNonWhitelisted: true` vale anche per `@Query()`: un param
non dichiarato nel DTO fa 400 (comportamento desiderabile, ma va conosciuto).

```ts
// presentation/dto/invoice-summary-query.dto.ts
export class InvoiceSummaryQueryDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  customerName?: string;

  @IsOptional()
  @Type(() => Number) // query params are strings; convert before validating
  @IsNumber()
  @IsPositive()
  minAmount?: number;
}
```

**Raccomandazione: `@Type(() => Number)` sul singolo campo, non
`enableImplicitConversion: true` sul pipe globale.** La conversione implicita globale è
azione a distanza: cambierebbe il comportamento di *tutti* i DTO, incluso
`CreateInvoiceDto`, dove trasformerebbe `amount: "100"` in `100` e farebbe passare un body
oggi rifiutato — con un test e2e esistente che ne dipende.

### 5.9 Composition root — `invoice.module.ts`

```ts
@Module({
  controllers: [InvoiceController],
  providers: [
    // command side
    CreateInvoiceHandler,
    // query side
    GetInvoiceHandler,
    ListInvoicesHandler,
    GetInvoiceSummaryHandler,
    // adapters: one store, two ports over it
    InMemoryInvoiceStore,
    { provide: INVOICE_REPOSITORY, useClass: InMemoryInvoiceRepository },
    { provide: INVOICE_QUERY_REPOSITORY, useClass: InMemoryInvoiceQueryRepository },
    { provide: ID_GENERATOR, useClass: UuidGenerator },
  ],
})
export class InvoiceModule {}
```

Resta vero che sostituire l'in-memory con Postgres è cambiare due `useClass` e rimuovere lo
store — e ora si può farlo **una port alla volta**: read side su una view SQL, write side
ancora in memoria, o viceversa. Questa è la libertà concreta che CQRS compra.

---

## 6. Test da aggiungere / modificare

Nessuna libreria di mocking, nessun database: fake adapter per token, come già si fa in
`invoice.service.spec.ts`.

**Unit (`src/`, pattern `*.spec.ts`)**

- `create-invoice.handler.spec.ts` — porting dei casi esistenti di `createInvoice`
  (id dal generatore, id mai riusati, nulla salvato se l'invariante è violata).
- `get-invoice.handler.spec.ts` — view restituita; `InvoiceNotFoundError` su id ignoto.
- `get-invoice-summary.handler.spec.ts` — con `FakeInvoiceQueryRepository`: verifica che il
  filtro venga passato alla port così com'è. Test breve, perché l'handler è un pass-through.
- `in-memory-invoice-query.repository.spec.ts` — **è qui che va testata l'aggregazione**, ed
  è il file più importante del lotto: raggruppamento per cliente, `minAmount` applicato alle
  singole fatture, media arrotondata, ordinamento deterministico, `[]` su store vuoto,
  cliente senza fatture residue dopo il filtro assente dal risultato.
- `invoice.entity.spec.ts` — invariato. Il dominio non è toccato da questo refactor, ed è la
  prova che i confini erano già al posto giusto.

**E2E (`test/`, pattern `*.e2e-spec.ts`)**

- `GET /invoices/summary` su store vuoto → `200` + `[]`.
- Due fatture ACME + una Globex → aggregati e ordinamento attesi.
- `?customerName=ACME` → solo ACME.
- `?minAmount=…` → esclusione a livello di singola fattura.
- `?minAmount=abc` → `400`; `?nonEsiste=1` → `400` (`forbidNonWhitelisted`).
- **Regressione di routing**: `GET /invoices/summary` non deve mai rispondere `404` con
  `error: 'InvoiceNotFoundError'`. Questo test è il guardrail di §5.8a.
- I sei test e2e esistenti devono restare verdi **senza modifiche**: è il criterio che
  dimostra che il refactor è a contratto invariato (a meno che non si scelga la variante
  `201` + `Location` di §5.6, che ne cambia uno per scelta esplicita).

Comandi: `pnpm run test`, `pnpm run test:e2e`, `npx tsc --noEmit -p tsconfig.json`,
`pnpm run lint` (il lint fallisce su file non formattati: `pnpm run format` prima).

---

## 7. Trappole specifiche di questo repo

Già documentate in `CLAUDE.md`, ma con nuove occasioni di scattare in questo refactor:

1. **`import type` obbligatorio** per ogni interfaccia usata come tipo di parametro in un
   costruttore decorato (`isolatedModules` + `emitDecoratorMetadata`, altrimenti `TS1272`).
   Vale per `InvoiceQueryRepository` in **tutti** i nuovi query handler, esattamente come per
   `InvoiceRepository` oggi. Il token `Symbol` invece è un valore: import normale. Quattro
   nuovi file → quattro occasioni di sbagliare.
2. **`require-await`**: metodo `async` senza `await` = errore. Il nuovo adapter di lettura e
   `GetInvoiceSummaryHandler.execute` sono sincroni: usare `Promise.resolve(...)` /
   restituire la promise senza `async`.
3. **Le due suite Jest sono separate** (unit inline in `package.json` con `rootDir: "src"`,
   e2e in `test/jest-e2e.json`): `pnpm run test` non vede `test/`. Vanno lanciate entrambe.
4. **`strictNullChecks`**: `findById` ritorna `InvoiceView | null`. Mantenere `=== null`
   esplicito come già fa il service, non un truthy check.
5. **Store condiviso e isolamento dei test**: l'e2e attuale ricostruisce l'app in
   `beforeEach`, quindi la `Map` è nuova a ogni test. Introducendo `InMemoryInvoiceStore` non
   cambia nulla — purché resti provider del modulo e non un singleton a livello di file
   (`const store = new Map()` fuori dalla classe): quello sì perderebbe l'isolamento e
   renderebbe i test dipendenti dall'ordine.

---

## 8. Piano di adozione

Quattro commit, ognuno con la suite verde. L'ordine è scelto perché i passi rischiosi
arrivino quando i test già coprono il nuovo confine.

**Commit 1 — Split command/query, contratto invariato (nessuna nuova feature)**
Spezza `InvoiceService` in `CreateInvoiceHandler`, `GetInvoiceHandler`,
`ListInvoicesHandler`. Elimina `invoice.service.ts` e il suo spec, distribuendone i test
sui nuovi spec. Il controller inietta gli handler. Ancora nessun read model: gli handler
ritornano `Invoice`.
*Solo movimento di codice.* Verifica: i sei e2e passano senza toccarli.

**Commit 2 — Introduce il read model e la port di lettura**
`InvoiceView`, `InvoiceQueryRepository`, `InMemoryInvoiceStore`,
`InMemoryInvoiceQueryRepository`. `GetInvoiceHandler` e `ListInvoicesHandler` passano alla
port di lettura; `findAll()` esce da `InvoiceRepository`. Il compilatore fa da guida: ogni
`Invoice` che tenta di attraversare il confine diventa un errore di tipo.
*È il commit che porta il valore architetturale*, ancora a contratto HTTP invariato.

**Commit 3 — La nuova lettura (il caso studio)**
`summarizeByCustomer` sulla port, aggregazione nell'adapter, `InvoiceSummaryView`,
`GetInvoiceSummaryQuery` + handler, `InvoiceSummaryQueryDto`, rotta `@Get('summary')` sopra
`@Get(':id')`, spec dell'adapter, e2e inclusa la regressione di routing.
Dopo i commit 1–2 questo è un **vertical slice**: si aggiunge un metodo alla port, uno
all'adapter, un handler, una rotta. Nessun file esistente cambia semantica. **Che sia così
poco invasivo è la dimostrazione che il caso studio vuole ottenere.**

**Commit 4 — Documentazione**
Aggiorna `CLAUDE.md`: diagramma biforcato, la tabella command/query di §2, la regola "il
write side carica per id, il read side interroga", la nota sull'ordine delle route, il nuovo
endpoint nell'elenco. Aggiunge un `README` di modulo con la tabella dei file di §3.

Percorso alternativo, se si vuole rischio minimo: **fare solo il Commit 3** aggiungendo port
di lettura + summary e lasciando `InvoiceService` in vita per gli endpoint esistenti. Si
ottiene la feature e un esempio funzionante di query side, al prezzo di uno stato ibrido —
accettabile solo se il commit 1 è già schedulato. Uno stato ibrido permanente insegna la
cosa sbagliata, e per un caso di studio questo è il difetto peggiore.

---

## 9. Trade-off, dichiarati

Cosa si paga:

- **Più file per lo stesso comportamento.** Il conteggio dei file del modulo circa raddoppia
  in `application/`. Su tre endpoint è un rapporto sfavorevole; su venti si inverte. Va detto
  ad alta voce in un documento didattico, altrimenti CQRS sembra gratis.
- **Duplicazione apparente** tra `Invoice` e `InvoiceView`, oggi identici campo per campo.
  Non è violazione di DRY: sono due contratti con due ragioni diverse di cambiare (uno
  protegge invarianti, l'altro serve un client HTTP). Comprimerli in uno è precisamente il
  problema da cui si parte.
- **Un salto in più da seguire leggendo il codice**: controller → handler → port → adapter.
- **Nessun guadagno di performance oggi.** Con una `Map` da poche entry l'aggregazione in JS
  è identica a qualsiasi alternativa. Il guadagno è di *opzionalità futura*.

Quando **non** farlo: un modulo CRUD puro dove il modello letto sarà per sempre uguale a
quello scritto (una tabella di lookup, una anagrafica di configurazione). Lì il repository
unico è la scelta giusta e CQRS è cerimonia. Il segnale per adottarlo è quello di §1.3: **la
prima lettura che non è un aggregato.**

Cosa **non** si sta pagando, e va detto per non spaventare: eventual consistency. Read e
write condividono lo store, quindi dopo un `POST` la fattura è immediatamente visibile in
`GET /invoices/summary` — un e2e può asserirlo nella stessa richiesta successiva. Quel costo
arriva solo separando fisicamente i due store (proiezioni asincrone, eventi), che è
esplicitamente **fuori scope**. Da citare come "passo 5 che non faremo", con il suo prezzo:
`404` ambigui, test da riscrivere in stile eventualmente-consistente, riconciliazione.

---

## 10. Variante: `@nestjs/cqrs`

`CommandBus` / `QueryBus` con `@CommandHandler(CreateInvoiceCommand)`,
`@QueryHandler(GetInvoiceSummaryQuery)` e un controller che fa
`this.queryBus.execute(new GetInvoiceSummaryQuery(...))`.

**Raccomandazione: non adottarlo in questo caso di studio.** Motivi:

- Aggiunge una dipendenza e un livello di indirezione (dispatch per tipo, risoluzione a
  runtime) che **oscura** ciò che il documento vuole mostrare: chi dipende da chi. Il valore
  didattico sta nelle port e nei modelli separati, non nel bus.
- Il progetto ha finora zero dipendenze non necessarie e usa la DI nativa di Nest: la
  coerenza di stile vale più della vicinanza a un pattern da manuale.
- Con l'iniezione diretta degli handler, "chi gestisce questo comando" è una definizione di
  tipo; con il bus è una convenzione risolta a runtime, che il compilatore non verifica.

Il bus diventa la scelta giusta quando serve ciò che porta con sé: `EventBus` per gli eventi
di dominio, saga, middleware trasversali (logging/retry/transazioni per ogni comando), più
handler per lo stesso evento. Il punto architetturale utile: **avendo fatto lo split di §5,
passare al bus è un cambio di dispatch, non di architettura** — gli handler restano identici,
si aggiungono i decoratori. Questa è la prova che la separazione è nel design, non nella
libreria. Vale una sezione finale del caso studio, non un'implementazione.

---

## 11. Take-away del caso studio

Cinque frasi da difendere in code review:

1. **L'entità non attraversa il confine dell'application layer.** Ciò che esce è un read
   model. Il contratto API non è un effetto collaterale della forma dell'aggregato.
2. **Il write side carica per id, il read side interroga.** `findAll()` su un repository di
   aggregati è un odore, non una comodità.
3. **La mappatura sta nell'adapter**, perché è l'adapter a sapere da dove viene il dato.
4. **Le query non hanno invarianti**: nessuna validazione di dominio sul read side, nessun
   `Invoice.create()`, e lista vuota invece di errore.
5. **Due port non sono due database.** La separazione è di responsabilità; separare lo
   storage è un passo successivo, opzionale, ed è l'unico che introduce eventual consistency.

Il diff che dimostra tutto questo è il Commit 3: **una lettura non banale aggiunta senza
toccare la semantica di alcun file esistente.**
