import { IsNotEmpty, IsNumber, IsPositive, IsString } from 'class-validator';

/**
 * HTTP-facing shape: it says what a well-formed *request* looks like, which is
 * a different question from what a valid invoice is. The business invariant
 * lives in the entity and holds outside HTTP too.
 */
export class CreateInvoiceDto {
  @IsString()
  @IsNotEmpty()
  customerName: string;

  @IsNumber()
  @IsPositive()
  amount: number;
}
