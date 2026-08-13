# nestjs-simple-ddd

Un caso di studio minimale di **Domain-Driven Design e CQRS applicati a un'API REST con
NestJS**.

Il dominio è volutamente banale — una fattura con un importo e un cliente — perché l'oggetto
dello studio non è la complessità del business, ma **dove va ogni pezzo di codice e perché**.
L'obiettivo è avere un modulo abbastanza piccolo da leggere in dieci minuti e abbastanza
completo da mostrare tutte le decisioni strutturali che un progetto DDD deve prendere.

Endpoint esposti:

| Metodo | Rotta | Descrizione |
|---|---|---|
| `POST` | `/invoices` | Crea una fattura. L'id è generato dal server. |
| `GET` | `/invoices` | Elenca le fatture. |
| `GET` | `/invoices/summary` | Riepiloga le fatture per cliente. |
| `GET` | `/invoices/:id` | Restituisce una fattura, `404` se non esiste. |

L'ultimo arrivato è `GET /invoices/summary`, ed è il motivo per cui il progetto parla anche di
CQRS: è **la prima lettura che non è un aggregato**. Un riepilogo per cliente non ha identità,
non ha ciclo di vita e non ha invarianti da proteggere — non esiste un modo onesto di farlo
passare per l'entità. Vedi [Il giorno in cui una lettura non è più
un'entità](#il-giorno-in-cui-una-lettura-non-è-più-unentità).

Lo store è in memoria: i dati spariscono a ogni riavvio. È una scelta deliberata — serve a
dimostrare che la persistenza è un dettaglio sostituibile.

## Avvio

```bash
pnpm install
pnpm run start:dev          # watch mode su http://localhost:3000
```

```bash
curl -X POST localhost:3000/invoices \
  -H 'Content-Type: application/json' \
  -d '{"amount":100,"customerName":"ACME"}'

curl 'localhost:3000/invoices/summary?minAmount=50'
# [{"customerName":"ACME","invoiceCount":1,"totalAmount":100,
#   "averageAmount":100,"maxAmount":100}]
```

Gli altri comandi:

```bash
pnpm run build              # nest build -> dist/
pnpm run start:prod         # node dist/main
pnpm run lint               # eslint --fix
pnpm run format             # prettier su src/ e test/
```

## L'architettura

```
Users
  │
  ▼                        ┌─ commands/ ──> Domain
Presentation ──> Application ┤                 ▲
                          └─ queries/ ──┐      │
                                        │      │
                     Persistence ───────┴──────┘
                          │                    Infrastructure
                          ▼                          │
                      Database                       ▼
                                                    OS
```

C'è **una sola regola**, e tutto il resto ne discende: le frecce puntano verso l'interno.
`persistence/` e `infrastructure/` dipendono da `application/`, mai il contrario. Il `domain/`
non dipende da nessuno.

L'application layer è biforcato in due lati — scritture e letture — e il lato delle letture
**non punta al dominio**: è una freccia in meno, non una in più.

La conseguenza pratica è che le cose che cambiano spesso (il database, il protocollo HTTP, i
servizi esterni) dipendono da quelle che cambiano di rado (le regole di business), e non
viceversa. Sostituire lo store in-memory con Postgres non tocca una riga di dominio.

### La struttura delle cartelle

I layer stanno **dentro ogni modulo**, non al livello di `src/`:

```
src/
  main.ts                     bootstrap
  app.module.ts               root: moduli di dominio + cross-cutting concerns
  modules/
    invoice/
      domain/
        entities/invoice.entity.ts
        errors/invoice.error.ts
      application/
        commands/create-invoice.{command,handler}.ts    scritture
        queries/get-invoice.handler.ts                  letture
        queries/list-invoices.handler.ts
        queries/get-invoice-summary.{query,handler}.ts
        queries/read-models/invoice.view.ts             ciò che esce dal confine
        queries/read-models/invoice-summary.view.ts
        ports/invoice.repository.ts       driven port verso Persistence (write)
        ports/invoice-query.repository.ts driven port verso Persistence (read)
        ports/id-generator.ts             driven port verso Infrastructure
      persistence/
        repositories/in-memory-invoice.store.ts             la Map condivisa
        repositories/in-memory-invoice.repository.ts        write adapter
        repositories/in-memory-invoice-query.repository.ts  read adapter
      infrastructure/
        id/uuid-generator.ts
      presentation/
        dto/create-invoice.dto.ts
        dto/invoice-summary-query.dto.ts
        invoice.controller.ts
        invoice-exception.filter.ts
      invoice.module.ts                 composition root del modulo
      README.md                         riferimento sintetico del modulo
```

È un **modular monolith**: aggiungere un dominio significa aggiungere una cartella, senza
toccare le altre. L'alternativa — layer al livello di `src/`, con i domini dentro ciascuno —
è più fedele al diagramma ma sparpaglia un modulo su quattro cartelle lontane, e rende
faticoso estrarne uno in futuro.

## I layer, uno per uno

### `domain/` — le regole di business

È la **foglia del grafo**: non importa nulla. Né `@nestjs/*`, né gli altri layer, né librerie
di terze parti. Se domani cambiassi framework, questa cartella si sposterebbe intatta.

Contiene le entità (`entities/`) e gli errori di dominio (`errors/`). Non ha **alcuna nozione
di persistenza, nemmeno astratta**: qui non troverai interfacce di repository.

L'invariante di business vive nell'entità e nessuno può aggirarlo, perché il costruttore è
`private` e l'unica via di costruzione è la factory che valida:

```ts
export class Invoice {
  private constructor(
    public readonly id: string,
    public readonly amount: number,
    public readonly customerName: string,
  ) {}

  static create({ id, amount, customerName }: InvoiceProps): Invoice {
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
      throw new InvalidInvoiceAmountError(amount);
    }
    // ...
    return new Invoice(id, amount, customerName.trim());
  }
}
```

Non esiste un percorso che produca un `Invoice` invalido. È la differenza con un metodo
`validate()` separato, che il chiamante può dimenticarsi di invocare.

Gli errori sono sottoclassi di un `InvoiceError` astratto e **non conoscono i codici HTTP**:
il dominio non sa di vivere dentro un'API.

### `application/` — l'orchestrazione

Coordina, non decide. Un caso d'uso di scrittura segue sempre lo schema **carica → decidi →
salva**: l'I/O sta nell'handler, il dominio riceve dati già in memoria, decide e restituisce.
Un'entità non deve mai raggiungere un repository.

C'è **un handler per use case** — una classe, un metodo `execute` — diviso tra `commands/` e
`queries/`. Gli handler sono iniettati direttamente nel controller: nessun `CommandBus`,
nessuna libreria. La separazione sta nel design, non in un dispatcher, e il compilatore
verifica chi gestisce cosa. Il costruttore del controller diventa così l'indice degli use case
del modulo.

`ports/` contiene le **ports**: le interfacce verso il mondo esterno, più un token di
dependency injection. Vivono qui, e non nel dominio, perché è l'application layer a dichiarare
di cosa ha bisogno — ed è questo che permette a `persistence/` di dipendere da `application/`
invece del contrario.

Nel lessico di *Ports & Adapters* quelle presenti qui sono **driven ports** (dette anche
*secondary* o *outbound*): è l'applicazione a chiamare il mondo esterno attraverso di esse. Le
**driving ports** — quelle in cui è l'esterno a chiamare l'applicazione — qui non servono,
perché il controller invoca gli handler direttamente; comparirebbero se il modulo dovesse
essere guidato anche da una CLI o da un consumer di code, e alcuni progetti le separano in
`ports/in/` e `ports/out/`.

```ts
export interface InvoiceRepository {
  save(invoice: Invoice): Promise<Invoice>;
  findById(id: string): Promise<Invoice | null>;
}

export const INVOICE_REPOSITORY = Symbol('InvoiceRepository');
```

Due dettagli non casuali. I metodi sono `Promise` anche se l'implementazione attuale è
sincrona: se la firma fosse sincrona, la port rivelerebbe che oggi i dati stanno in RAM, e
l'arrivo di un database cambierebbe il contratto di tutti i chiamanti. E il token è un `Symbol`
perché le interfacce TypeScript spariscono alla compilazione, mentre il container di Nest
lavora a runtime e ha bisogno di una chiave che esista davvero.

Un terzo dettaglio, aggiunto con CQRS: **non c'è `findAll()`**. Nessun comando ha motivo di
caricare tutte le fatture, e lasciarcelo sarebbe l'invito a scrivere la prossima lettura dal
lato sbagliato. La regola, che vale come check in code review: *il write side carica per id,
il read side interroga*.

### Il giorno in cui una lettura non è più un'entità

Finché il modello letto coincide con quello scritto, un solo repository è la scelta giusta e
CQRS è cerimonia. Il segnale per separarli è arrivato con il riepilogo per cliente, che si
scontra con tre muri istruttivi:

- **non è un aggregato** — nessuna identità, nessun ciclo di vita, nessuna invariante;
  modellarlo come entità produrrebbe un'entità anemica per costruzione;
- **non è un domain service** — un domain service *decide* ("questa fattura è stornabile?"),
  qui non si decide nulla, si osserva;
- **passare da `findAll()` è sbagliato di principio**, non solo di performance: calcolare in
  JavaScript su tutte le entità caricate funziona, ma congela una scelta di implementazione
  nel layer sbagliato. Su un database quella risposta è una `GROUP BY`.

Da qui una seconda port, speculare alla prima ma con un vocabolario diverso — restituisce
**view**, mai aggregati:

```ts
export interface InvoiceQueryRepository {
  findById(id: string): Promise<InvoiceView | null>;
  findAll(): Promise<InvoiceView[]>;
  summarizeByCustomer(filter: InvoiceSummaryFilter): Promise<InvoiceSummaryView[]>;
}
```

I **read model** (`queries/read-models/`) sono la forma che esce dal confine
dell'application layer. `InvoiceView` è oggi identico a `Invoice`, campo per campo, e non è
una violazione di DRY: sono due contratti con due ragioni diverse di cambiare — uno protegge
invarianti, l'altro serve un client HTTP. Se restassero uno solo, aggiungere un campo interno
all'entità cambierebbe il contratto pubblico dell'API senza che nessuno lo abbia deciso.

Attenzione a ciò che questo **non** è: non è event sourcing, non è un message bus, e
soprattutto non sono due database. Le due port stanno sopra la stessa `Map`, quindi le letture
restano fortemente consistenti — una fattura appena creata compare subito nel riepilogo.
Separare fisicamente i due store è il passo successivo, facoltativo, ed è l'unico che
introdurrebbe eventual consistency, con il suo prezzo: `404` ambigui, test da riscrivere,
riconciliazione.

### `persistence/` — gli adapter verso il database

Implementa le ports dei repository. Oggi c'è `InMemoryInvoiceStore` — una `Map` — con sopra
due adapter, uno per port. Quando arriverà un database vero, qui vivranno anche i mapper
riga → entità e le migration.

Due cose vale la pena notare. La prima: la traduzione **entità → view sta qui**, non
nell'handler, perché è l'adapter a sapere da dove viene il dato — una `Map` di entità oggi,
una riga SQL domani. Se la mappatura stesse nell'handler, l'handler dovrebbe conoscere
`Invoice` e la separazione sarebbe finta.

La seconda: **anche l'aggregazione del riepilogo sta qui**, non nell'handler. È il pezzo che
su Postgres diventa

```sql
SELECT customer_name, COUNT(*), SUM(amount), AVG(amount), MAX(amount)
FROM invoices WHERE ... GROUP BY customer_name ORDER BY ...
```

senza che nessun altro file cambi. È la libertà concreta che la port di lettura compra.

### `infrastructure/` — gli adapter verso l'OS e i servizi esterni

Tutto ciò che è ambiente e non business: orologio, filesystem, email, client HTTP verso terzi.
Oggi contiene `UuidGenerator`, che incapsula `randomUUID()`.

Può sembrare eccessivo per una riga di codice, ma il punto è proprio quello: la generazione di
identificatori è una capacità dell'ambiente, non una regola di business. Isolarla dietro la
port `IdGenerator` rende i test dell'application layer deterministici — il fake genera
`inv-1`, `inv-2`, e le asserzioni diventano esatte invece di limitarsi a "è una stringa".

### `presentation/` — l'unico layer che conosce HTTP

Controller, DTO d'ingresso ed exception filter. Qui gli errori di dominio diventano codici di
stato: `InvoiceNotFoundError` → `404`, il resto della gerarchia → `400`. Il dominio resta
ignaro.

I DTO decorati con `class-validator` vivono qui e non in `application/`: descrivono una
*richiesta HTTP ben formata*, che è una domanda diversa da "che cos'è una fattura valida". Il
controller li mappa nei command e query object, così l'application layer resta invocabile da
una CLI o da un consumer di code senza trascinarsi dietro la validazione web.

Due trappole concrete che questo layer nasconde, entrambe presidiate da un test:

- **`@Get('summary')` deve stare sopra `@Get(':id')`.** Le route si registrano nell'ordine di
  dichiarazione dei metodi: invertirle fa matchare `summary` come un `:id`, e la risposta
  diventa `404 Invoice not found: summary` — un bug di routing travestito da bug di dominio.
- **I query param arrivano sempre come stringhe.** `minAmount` ha un `@Type(() => Number)` sul
  campo. La conversione implicita globale sul `ValidationPipe` sarebbe azione a distanza:
  cambierebbe anche `CreateInvoiceDto`, facendo passare un `amount: "100"` oggi respinto.

### `invoice.module.ts` — la composition root

L'unico file in cui i layer si incontrano, e l'unico punto in cui si dichiara **chi implementa
cosa**:

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
    // adapter: uno store, due port sopra di esso
    InMemoryInvoiceStore,
    { provide: INVOICE_REPOSITORY, useClass: InMemoryInvoiceRepository },
    { provide: INVOICE_QUERY_REPOSITORY, useClass: InMemoryInvoiceQueryRepository },
    { provide: ID_GENERATOR, useClass: UuidGenerator },
  ],
})
export class InvoiceModule {}
```

Questo è il **binding** tra ports e adapter. Sostituire l'in-memory con Postgres significa
scrivere la nuova classe e cambiare un `useClass`: handler, entità, controller e test non se
ne accorgono. È il ritorno dell'investimento fatto sulle ports — e ora si può fare **una port
alla volta**, per esempio il read side su una view SQL mentre il write side resta in memoria.

## Il percorso di una richiesta

`POST /invoices` con `{"amount":100,"customerName":"ACME"}`:

1. **ValidationPipe** (cross-cutting, registrato come `APP_PIPE` in `AppModule`) verifica che il
   payload sia ben formato. `amount: "abc"` o un `id` non previsto nel body → `400`, senza mai
   toccare il dominio.
2. **`InvoiceController`** riceve il DTO, lo mappa nel `CreateInvoiceCommand` e delega. Non
   contiene logica.
3. **`CreateInvoiceHandler`** chiede un id alla port `IdGenerator`, costruisce l'entità con
   `Invoice.create(...)` e la passa alla port `InvoiceRepository`.
4. **`Invoice.create`** applica l'invariante di business. Se fallisce lancia un errore di
   dominio e non viene persistito nulla.
5. **`InMemoryInvoiceRepository`** salva nella `Map`.
6. L'handler restituisce una **`InvoiceView`**, non l'entità: ciò che attraversa il confine è
   sempre un read model.
7. In caso di errore, **`InvoiceExceptionFilter`** traduce l'eccezione di dominio in HTTP.

I passi 1 e 4 sono **due livelli di validazione distinti**, spesso confusi: il primo rifiuta ciò
che non è una richiesta ben formata ed è un problema di protocollo; il secondo protegge una
regola di business e vale anche fuori da HTTP, per esempio se un giorno le fatture arrivassero
da un import CSV.

Confronta ora `GET /invoices/summary`, che è deliberatamente più corto:

1. **ValidationPipe** valida la query string (`?customerName=`, `?minAmount=`).
2. **`InvoiceController`** delega a `GetInvoiceSummaryHandler`.
3. L'handler inoltra il filtro alla port `InvoiceQueryRepository`. **Nient'altro.**
4. **`InMemoryInvoiceQueryRepository`** aggrega e restituisce `InvoiceSummaryView[]`.

Non c'è `Invoice.create()`, non c'è alcuna invariante, non c'è un errore da lanciare: nessun
risultato è `200` con `[]`, non un `404`. Che l'handler sia un pass-through non è una svista —
è la dimostrazione che sul read side non c'è nulla da orchestrare. L'asimmetria tra i due
percorsi *è* CQRS.

## Test

```bash
pnpm run test        # 33 unit test
pnpm run test:e2e    # 13 test end-to-end
pnpm run test:cov    # coverage
```

I test unitari degli handler sostituiscono le ports con dei fake scritti a mano:

```ts
Test.createTestingModule({
  providers: [
    CreateInvoiceHandler,
    { provide: INVOICE_REPOSITORY, useValue: new FakeInvoiceRepository() },
    { provide: ID_GENERATOR, useValue: new SequentialIdGenerator() },
  ],
});
```

Nessuna libreria di mocking, nessun database, nessun server HTTP avviato. I fake dichiarano
`implements InvoiceRepository`, quindi il compilatore impedisce che divergano dal contratto
reale. Questa è la ricaduta più concreta dell'inversione delle dipendenze: la testabilità non è
un'aggiunta, è una conseguenza della struttura.

Gli e2e costruiscono l'app da `AppModule` con i provider veri, quindi verificano anche il
wiring della dependency injection.

Dove sta ogni test è a sua volta una decisione: **l'aggregazione del riepilogo è testata
nell'adapter**, non nell'handler, perché è lì che vive. Lo spec di
`GetInvoiceSummaryHandler` è corto di proposito — verifica solo che il filtro arrivi alla port
intatto. E un e2e presidia esplicitamente l'ordine delle rotte: spostando `@Get('summary')`
sotto `@Get(':id')` la suite diventa rossa invece di rompersi in silenzio.

## I nomi delle cose

Se vuoi approfondire, questi sono i termini in cui è scritto quanto sopra:

- **Composition Root** — il posto unico dove si compone il grafo degli oggetti (`*.module.ts`).
- **Dependency Inversion Principle** — il principio: dipendi da astrazioni. La D di SOLID.
- **Dependency Injection** — la tecnica che lo realizza; qui in forma di constructor injection.
- **Inversion of Control** — il ribaltamento più generale: è il framework a istanziare, non tu.
- **Ports & Adapters** (architettura esagonale) — il vocabolario di `ports/` e degli adapter.
- **Functional core, imperative shell** — il pattern carica → decidi → salva.
- **CQRS** — *Command Query Responsibility Segregation*: scritture e letture usano modelli,
  port e tipi distinti. Qui senza bus e senza store separati.
- **Read model** (o *projection*, o *view*) — la forma pensata per essere letta, indipendente
  dall'aggregato che la genera.

## Limiti noti

Il progetto si ferma dove inizierebbe la complessità vera, di proposito:

- persistenza solo in memoria, nessun ORM, nessuna transazione;
- un solo aggregato, senza relazioni né regole di consistenza tra aggregati;
- nessun evento di dominio, nessun value object, nessun domain service;
- CQRS fermo alla separazione logica: uno store solo, quindi nessuna proiezione asincrona e
  nessuna eventual consistency;
- nessun `CommandBus`/`QueryBus`. Con quattro use case, un dispatcher a runtime nasconderebbe
  proprio ciò che il progetto vuole mostrare — chi dipende da chi. Diventa conveniente verso
  gli 8–10 use case per controller, o al primo concern trasversale da agganciare in un punto
  solo, o quando servono davvero gli eventi;
- nessuna autenticazione né paginazione.

Sono tutte estensioni naturali: la struttura è pensata perché aggiungerle non richieda di
riorganizzare quello che c'è. Passare al bus, per dire, è un cambio di *dispatch*: gli handler
restano identici, si aggiungono i decoratori.
