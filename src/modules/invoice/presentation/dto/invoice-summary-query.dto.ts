import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';

/**
 * Query params always arrive as strings, so `minAmount` needs an explicit
 * conversion before validation. It is declared per-field rather than by turning
 * on `enableImplicitConversion` in the global pipe: that would be action at a
 * distance, changing every DTO — including CreateInvoiceDto, where it would
 * start accepting `amount: "100"` in a body that is rejected today.
 *
 * `forbidNonWhitelisted` applies here too: an undeclared query param is a 400.
 */
export class InvoiceSummaryQueryDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  customerName?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  minAmount?: number;
}
