import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import {
  InvoiceError,
  InvoiceNotFoundError,
} from '../domain/errors/invoice.error';

/**
 * Translates domain errors into HTTP status codes. Knowing about HTTP is the
 * Presentation layer's job: the domain only ever throws InvoiceError subclasses.
 */
@Catch(InvoiceError)
export class InvoiceExceptionFilter implements ExceptionFilter<InvoiceError> {
  catch(exception: InvoiceError, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const status =
      exception instanceof InvoiceNotFoundError
        ? HttpStatus.NOT_FOUND
        : HttpStatus.BAD_REQUEST;

    response.status(status).json({
      statusCode: status,
      error: exception.name,
      message: exception.message,
    });
  }
}
