/**
 * Driven port towards the Infrastructure layer: generating identifiers is a
 * capability of the environment (the OS), not a business rule. Hiding it behind
 * an interface keeps the application layer deterministic under test.
 */
export interface IdGenerator {
  generate(): string;
}

export const ID_GENERATOR = Symbol('IdGenerator');
