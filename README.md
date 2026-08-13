# nestjs-simple-ddd

Un caso di studio minimale di **Domain-Driven Design applicato a un'API REST con NestJS**.

Il dominio è volutamente banale — una fattura con un importo e un cliente — perché l'oggetto
dello studio non è la complessità del business, ma **dove va ogni pezzo di codice e perché**.
L'obiettivo è avere un modulo abbastanza piccolo da leggere in dieci minuti e abbastanza
completo da mostrare tutte le decisioni strutturali che un progetto DDD deve prendere.

Endpoint esposti:

| Metodo | Rotta | Descrizione |
|---|---|---|
| `POST` | `/invoices` | Crea una fattura. L'id è generato dal server. |
| `GET` | `/invoices` | Elenca le fatture. |
| `GET` | `/invoices/:id` | Restituisce una fattura, `404` se non esiste. |

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
  ▼
Presentation ──> Application ──> Domain
                     ▲   ▲
        Persistence ─┘   └─ Infrastructure
             │                    │
             ▼                    ▼
         Database                OS
```

C'è **una sola regola**, e tutto il resto ne discende: le frecce puntano verso l'interno.
`persistence/` e `infrastructure/` dipendono da `application/`, mai il contrario. Il `domain/`
non dipende da nessuno.

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
        ports/invoice.repository.ts     driven port verso Persistence
        ports/id-generator.ts           driven port verso Infrastructure
        dto/create-invoice.dto.ts
        services/invoice.service.ts
      persistence/
        repositories/in-memory-invoice.repository.ts
      infrastructure/
        id/uuid-generator.ts
      presentation/
        invoice.controller.ts
        invoice-exception.filter.ts
      invoice.module.ts                 composition root del modulo
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

Coordina, non decide. Un caso d'uso qui dentro segue sempre lo schema **carica → decidi →
salva**: l'I/O sta nel service, il dominio riceve dati già in memoria, decide e restituisce.
Un'entità non deve mai raggiungere un repository.

`ports/` contiene le **ports**: le interfacce verso il mondo esterno, più un token di
dependency injection. Vivono qui, e non nel dominio, perché è l'application layer a dichiarare
di cosa ha bisogno — ed è questo che permette a `persistence/` di dipendere da `application/`
invece del contrario.

Nel lessico di *Ports & Adapters* quelle presenti qui sono **driven ports** (dette anche
*secondary* o *outbound*): è l'applicazione a chiamare il mondo esterno attraverso di esse. Le
**driving ports** — quelle in cui è l'esterno a chiamare l'applicazione — qui non servono,
perché il controller invoca il service direttamente; comparirebbero se il modulo dovesse essere
guidato anche da una CLI o da un consumer di code, e alcuni progetti le separano in `ports/in/`
e `ports/out/`.

```ts
export interface InvoiceRepository {
  save(invoice: Invoice): Promise<Invoice>;
  findById(id: string): Promise<Invoice | null>;
  findAll(): Promise<Invoice[]>;
}

export const INVOICE_REPOSITORY = Symbol('InvoiceRepository');
```

Due dettagli non casuali. I metodi sono `Promise` anche se l'implementazione attuale è
sincrona: se la firma fosse sincrona, la port rivelerebbe che oggi i dati stanno in RAM, e
l'arrivo di un database cambierebbe il contratto di tutti i chiamanti. E il token è un `Symbol`
perché le interfacce TypeScript spariscono alla compilazione, mentre il container di Nest
lavora a runtime e ha bisogno di una chiave che esista davvero.

### `persistence/` — gli adapter verso il database

Implementa le ports dei repository. Oggi c'è solo `InMemoryInvoiceRepository`, una `Map`.
Quando arriverà un database vero, qui vivranno anche i mapper riga → entità e le migration.

### `infrastructure/` — gli adapter verso l'OS e i servizi esterni

Tutto ciò che è ambiente e non business: orologio, filesystem, email, client HTTP verso terzi.
Oggi contiene `UuidGenerator`, che incapsula `randomUUID()`.

Può sembrare eccessivo per una riga di codice, ma il punto è proprio quello: la generazione di
identificatori è una capacità dell'ambiente, non una regola di business. Isolarla dietro la
port `IdGenerator` rende i test dell'application layer deterministici — il fake genera
`inv-1`, `inv-2`, e le asserzioni diventano esatte invece di limitarsi a "è una stringa".

### `presentation/` — l'unico layer che conosce HTTP

Controller ed exception filter. Qui gli errori di dominio diventano codici di stato:
`InvoiceNotFoundError` → `404`, il resto della gerarchia → `400`. Il dominio resta ignaro.

### `invoice.module.ts` — la composition root

L'unico file in cui i layer si incontrano, e l'unico punto in cui si dichiara **chi implementa
cosa**:

```ts
@Module({
  controllers: [InvoiceController],
  providers: [
    InvoiceService,
    { provide: INVOICE_REPOSITORY, useClass: InMemoryInvoiceRepository },
    { provide: ID_GENERATOR, useClass: UuidGenerator },
  ],
})
export class InvoiceModule {}
```

Questo è il **binding** tra ports e adapter. Sostituire l'in-memory con Postgres significa
scrivere la nuova classe e cambiare un `useClass`: service, entità, controller e test non se
ne accorgono. È il ritorno dell'investimento fatto sulle ports.

## Il percorso di una richiesta

`POST /invoices` con `{"amount":100,"customerName":"ACME"}`:

1. **ValidationPipe** (cross-cutting, registrato come `APP_PIPE` in `AppModule`) verifica che il
   payload sia ben formato. `amount: "abc"` o un `id` non previsto nel body → `400`, senza mai
   toccare il dominio.
2. **`InvoiceController`** riceve il DTO e delega. Non contiene logica.
3. **`InvoiceService`** chiede un id alla port `IdGenerator`, costruisce l'entità con
   `Invoice.create(...)` e la passa alla port `InvoiceRepository`.
4. **`Invoice.create`** applica l'invariante di business. Se fallisce lancia un errore di
   dominio e non viene persistito nulla.
5. **`InMemoryInvoiceRepository`** salva nella `Map`.
6. In caso di errore, **`InvoiceExceptionFilter`** traduce l'eccezione di dominio in HTTP.

I passi 1 e 4 sono **due livelli di validazione distinti**, spesso confusi: il primo rifiuta ciò
che non è una richiesta ben formata ed è un problema di protocollo; il secondo protegge una
regola di business e vale anche fuori da HTTP, per esempio se un giorno le fatture arrivassero
da un import CSV.

## Test

```bash
pnpm run test        # 20 unit test
pnpm run test:e2e    # 6 test end-to-end
pnpm run test:cov    # coverage
```

I test unitari del service sostituiscono le ports con dei fake scritti a mano:

```ts
Test.createTestingModule({
  providers: [
    InvoiceService,
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

## I nomi delle cose

Se vuoi approfondire, questi sono i termini in cui è scritto quanto sopra:

- **Composition Root** — il posto unico dove si compone il grafo degli oggetti (`*.module.ts`).
- **Dependency Inversion Principle** — il principio: dipendi da astrazioni. La D di SOLID.
- **Dependency Injection** — la tecnica che lo realizza; qui in forma di constructor injection.
- **Inversion of Control** — il ribaltamento più generale: è il framework a istanziare, non tu.
- **Ports & Adapters** (architettura esagonale) — il vocabolario di `ports/` e degli adapter.
- **Functional core, imperative shell** — il pattern carica → decidi → salva.

## Limiti noti

Il progetto si ferma dove inizierebbe la complessità vera, di proposito:

- persistenza solo in memoria, nessun ORM, nessuna transazione;
- un solo aggregato, senza relazioni né regole di consistenza tra aggregati;
- nessun evento di dominio, nessun value object, nessun domain service;
- nessuna autenticazione né paginazione.

Sono tutte estensioni naturali: la struttura è pensata perché aggiungerle non richieda di
riorganizzare quello che c'è.
