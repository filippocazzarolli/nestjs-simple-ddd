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
Presentation ──> Application ──> Domain
                     ▲   ▲
        Persistence ─┘   └─ Infrastructure
```

Regola unica da cui discende tutto: **le frecce puntano verso l'interno**. `persistence/` e
`infrastructure/` dipendono da `application/`, mai il contrario.

- `domain/` — foglia del grafo: non importa nulla, né `@nestjs/*` né altri layer. Solo entità
  (`entities/`) ed errori di dominio (`errors/`). Non ha alcuna nozione di persistenza, nemmeno
  astratta.
- `application/` — orchestrazione. `ports/` contiene le **ports** (interfaccia + token DI
  `Symbol`) verso i layer esterni; `services/` i service `@Injectable`; `dto/` i DTO d'ingresso.
  Le ports vivono qui perché è l'application layer a dichiarare di cosa ha bisogno.
- `persistence/repositories/` — adapter verso il database. Oggi solo
  `InMemoryInvoiceRepository` (una `Map`), nessun DB reale.
- `infrastructure/` — adapter verso l'OS e i servizi esterni. Oggi `id/uuid-generator.ts`, che
  incapsula `randomUUID()`.
- `presentation/` — controller ed exception filter: l'unico layer che conosce HTTP.
- `<modulo>.module.ts` alla radice — unico punto in cui i layer si incontrano: lega ogni port
  al suo adapter con `useClass`. Sostituire l'in-memory con Postgres = cambiare una riga qui.

Quattro regole che il modulo incarna e che vanno mantenute:

1. **Dependency inversion.** Il service inietta l'interfaccia via token
   (`@Inject(INVOICE_REPOSITORY)`, `@Inject(ID_GENERATOR)`), mai la classe concreta. Le ports
   dichiarano metodi `Promise` anche quando l'adapter è sincrono, per non far trapelare
   l'implementazione. Nei test si sostituiscono con fake via `{ provide: TOKEN, useValue: fake }`
   — nessuna libreria di mocking, nessun database.
2. **Entità sempre valide.** Costruttore `private` + factory statica `Invoice.create()` che valida
   prima di costruire: non esiste un percorso che produca un'entità invalida. Niente metodi
   `validate*()` che il chiamante deve ricordarsi di invocare.
3. **Carica → decidi → salva.** L'I/O sta nel service; il dominio riceve dati già in memoria,
   decide e restituisce. Un'entità o un domain service non devono mai raggiungere un repository.
4. **Due livelli di validazione, distinti.** Il `ValidationPipe` (registrato come `APP_PIPE` in
   `AppModule`, non in `main.ts`, così vale anche negli e2e) rifiuta ciò che non è una richiesta
   ben formata; l'invariante di business vive nell'entità e vale anche fuori da HTTP. Il dominio
   lancia sottoclassi di `InvoiceError`; `InvoiceExceptionFilter` le mappa in 404/400. Il dominio
   non conosce i codici HTTP.

L'identità è generata dal server tramite la port `IdGenerator`, mai accettata dal client: con
`forbidNonWhitelisted` un `id` nel body produce 400.

Endpoint attivi: `POST /invoices`, `GET /invoices`, `GET /invoices/:id`. Lo store è in-memory,
i dati spariscono a ogni restart.

## Convenzioni

- TypeScript con `strictNullChecks: true` ma `noImplicitAny: false` e `strictBindCallApply: false`;
  `module`/`moduleResolution` sono `nodenext`. Non sono configurati path alias: gli import
  interni sono relativi.
- ESLint usa `recommendedTypeChecked` + Prettier come regola (`prettier/prettier: error`),
  quindi un file non formattato fa fallire il lint. `no-explicit-any` è disattivato;
  `no-floating-promises` e `no-unsafe-argument` sono warning. `main.ts` ha un warning
  `no-floating-promises` preesistente su `bootstrap()`.
- Due trappole ricorrenti con questa config:
  - `isolatedModules` + `emitDecoratorMetadata` impongono `import type` per ogni **interfaccia**
    usata come tipo di parametro in un costruttore decorato, altrimenti si prende un `TS1272`
    (vedi `invoice.service.ts`).
  - `recommendedTypeChecked` include `require-await`: un metodo `async` senza `await` è un errore.
    Negli adapter sincroni usare `Promise.resolve(...)` invece di `async`.
