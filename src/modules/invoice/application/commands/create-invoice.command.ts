/**
 * The application-layer input of the command, decoupled from HTTP: plain
 * readonly data, no class-validator decorators. Those belong to the DTO in
 * `presentation/dto/`, because they describe a well-formed *request*, not a
 * business intent. Keeping them apart is what makes this command invocable
 * from a CLI or a queue consumer without dragging in web validation.
 */
export interface CreateInvoiceCommand {
  readonly customerName: string;
  readonly amount: number;
}
