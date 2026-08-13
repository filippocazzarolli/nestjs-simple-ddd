# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Comandi

Il package manager è **pnpm** (versione pinnata via `packageManager` in `package.json`).

```bash
pnpm install
pnpm run start:dev            # avvio in watch mode
pnpm run build                # nest build -> dist/
pnpm run lint                 # eslint con --fix
pnpm run format               # prettier su src/ e test/

pnpm run test                 # unit test (jest, rootDir=src, pattern *.spec.ts)
pnpm run test:e2e             # e2e (config test/jest-e2e.json, pattern *.e2e-spec.ts)
pnpm run test:cov             # coverage in ./coverage

pnpm run test -- invoice.entity.spec.ts            # singolo file
pnpm run test -- -t "nome del test"                # singolo test per nome
npx tsc --noEmit -p tsconfig.json                  # typecheck senza build
```

Nota: le due suite hanno config Jest separate — quella unit è inline in `package.json`
(`rootDir: "src"`, quindi non vede `test/`), quella e2e sta in `test/jest-e2e.json`.

## Architettura

Progetto NestJS 11 con struttura DDD per-modulo. Il boilerplate dello starter Nest
(`AppController`, `AppService` e i relativi test) è stato rimosso: alla radice restano solo
`main.ts` e `AppModule`, che registra i moduli di dominio e le cross-cutting concerns.
Tutto il codice vive in `src/modules/<dominio>/`.

I layer stanno **dentro** ogni modulo (modular monolith): aggiungere un dominio significa
aggiungere una cartella, senza toccare gli altri. `src/modules/invoice/` è il modulo di
riferimento — replicarne la struttura.

```
                          ┌─ commands/ ──> Domain (Invoice, InvoiceError)
Presentation ──> Application ┤                    ▲
                          └─ queries/ ───┐        │
                                         │        │
                     Persistence ────────┴────────┘
                     (write adapter + read adapter, stesso store)
                     Infrastructure ──> application/ports/
```

Regola unica da cui discende tutto: **le frecce puntano verso l'interno**. `persistence/` e
`infrastructure/` dipendono da `application/`, mai il contrario. L'application layer è
biforcato per **CQRS**: il query side non punta al dominio — è una freccia in meno, non una
in più.

- `domain/` — foglia del grafo: non importa nulla, né `@nestjs/*` né altri layer. Solo entità
  (`entities/`) ed errori di dominio (`errors/`). Non ha alcuna nozione di persistenza, nemmeno
  astratta.
- `application/` — orchestrazione, un handler per use case (una classe, un metodo `execute`).
  `commands/` per le scritture, `queries/` per le letture (con i read model in
  `queries/read-models/`). `ports/` contiene le **ports** (interfaccia + token DI `Symbol`)
  verso i layer esterni: una per il write side (`InvoiceRepository`), una per il read side
  (`InvoiceQueryRepository`). Le ports vivono qui perché è l'application layer a dichiarare di
  cosa ha bisogno.
- `persistence/repositories/` — adapter verso il database. Oggi `InMemoryInvoiceStore` (una
  `Map`) con sopra due adapter, uno per port: nessun DB reale.
- `infrastructure/` — adapter verso l'OS e i servizi esterni. Oggi `id/uuid-generator.ts`, che
  incapsula `randomUUID()`.
- `presentation/` — controller, DTO d'ingresso (`dto/`, decorati con `class-validator`) ed
  exception filter: l'unico layer che conosce HTTP.
- `<modulo>.module.ts` alla radice — unico punto in cui i layer si incontrano: lega ogni port
  al suo adapter con `useClass`. Sostituire l'in-memory con Postgres = cambiare una riga qui,
  e si può fare **una port alla volta**.

Sette regole che il modulo incarna e che vanno mantenute:

1. **Dependency inversion.** L'handler inietta l'interfaccia via token
   (`@Inject(INVOICE_REPOSITORY)`, `@Inject(INVOICE_QUERY_REPOSITORY)`, `@Inject(ID_GENERATOR)`),
   mai la classe concreta. Le ports dichiarano metodi `Promise` anche quando l'adapter è
   sincrono, per non far trapelare l'implementazione. Nei test si sostituiscono con fake via
   `{ provide: TOKEN, useValue: fake }` — nessuna libreria di mocking, nessun database.
2. **Entità sempre valide.** Costruttore `private` + factory statica `Invoice.create()` che valida
   prima di costruire: non esiste un percorso che produca un'entità invalida. Niente metodi
   `validate*()` che il chiamante deve ricordarsi di invocare.
3. **Carica → decidi → salva.** L'I/O sta nell'handler; il dominio riceve dati già in memoria,
   decide e restituisce. Un'entità o un domain service non devono mai raggiungere un repository.
4. **Due livelli di validazione, distinti.** Il `ValidationPipe` (registrato come `APP_PIPE` in
   `AppModule`, non in `main.ts`, così vale anche negli e2e) rifiuta ciò che non è una richiesta
   ben formata; l'invariante di business vive nell'entità e vale anche fuori da HTTP. Il dominio
   lancia sottoclassi di `InvoiceError`; `InvoiceExceptionFilter` le mappa in 404/400. Il dominio
   non conosce i codici HTTP.
5. **L'entità non attraversa il confine dell'application layer.** Ciò che esce è un read model
   (`InvoiceView`, `InvoiceSummaryView`): il contratto HTTP non deve essere un effetto
   collaterale della forma dell'aggregato. `InvoiceView` è oggi identico a `Invoice` campo per
   campo, ed è voluto — sono due contratti con due ragioni diverse di cambiare.
6. **Il write side carica per id, il read side interroga.** `InvoiceRepository` ha solo `save`
   e `findById`; ogni lettura passa da `InvoiceQueryRepository`. Un `findAll()` su un
   repository di aggregati è un odore, non una comodità.
7. **La mappatura entità → view sta nell'adapter**, che è l'unico a sapere da dove viene il
   dato (una `Map` oggi, una riga SQL domani). Le query non hanno invarianti: nessun
   `Invoice.create()` sul read side, e lista vuota invece di errore.

Due port non sono due database: write e read adapter condividono `InMemoryInvoiceStore`,
quindi le letture sono fortemente consistenti. Separare fisicamente i due store è il passo
successivo, facoltativo, ed è l'unico che introdurrebbe eventual consistency.

L'identità è generata dal server tramite la port `IdGenerator`, mai accettata dal client: con
`forbidNonWhitelisted` un `id` nel body produce 400.

Endpoint attivi: `POST /invoices`, `GET /invoices`, `GET /invoices/summary`,
`GET /invoices/:id`. **`@Get('summary')` deve restare dichiarato sopra `@Get(':id')`**: le
route si registrano nell'ordine dei metodi, e invertirle fa matchare `summary` come `:id`
(404 `InvoiceNotFoundError`). C'è un e2e che lo presidia. Lo store è in-memory, i dati
spariscono a ogni restart.

Il razionale completo della separazione CQRS, con i trade-off e il piano seguito, sta in
`docs/cqrs-case-study.md`.

## Convenzioni

- TypeScript con `strictNullChecks: true` ma `noImplicitAny: false` e `strictBindCallApply: false`;
  `module`/`moduleResolution` sono `nodenext`. Non sono configurati path alias: gli import
  interni sono relativi.
- ESLint usa `recommendedTypeChecked` + Prettier come regola (`prettier/prettier: error`),
  quindi un file non formattato fa fallire il lint. `no-explicit-any` è disattivato;
  `no-floating-promises` e `no-unsafe-argument` sono warning. `main.ts` ha un warning
  `no-floating-promises` preesistente su `bootstrap()`.
- I query param arrivano **sempre come stringhe**: un campo numerico in un DTO di `@Query()`
  ha bisogno di `@Type(() => Number)`. Non attivare `enableImplicitConversion` sul
  `ValidationPipe` globale: cambierebbe anche `CreateInvoiceDto`, facendo passare un
  `amount: "100"` che oggi è respinto (c'è un e2e che ne dipende).
- Due trappole ricorrenti con questa config:
  - `isolatedModules` + `emitDecoratorMetadata` impongono `import type` per ogni **interfaccia**
    usata come tipo di parametro in un costruttore decorato, altrimenti si prende un `TS1272`
    (vedi i query handler in `application/queries/`).
  - `recommendedTypeChecked` include `require-await`: un metodo `async` senza `await` è un errore.
    Negli adapter sincroni usare `Promise.resolve(...)` invece di `async`.
