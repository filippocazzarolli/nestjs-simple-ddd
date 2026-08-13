import { Module, ValidationPipe } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { InvoiceModule } from './modules/invoice/invoice.module';

/**
 * Application root: registers the domain modules and the cross-cutting concerns.
 * The ValidationPipe lives here rather than in `main.ts` so that it applies to
 * the e2e tests too, which build the app straight from AppModule.
 */
@Module({
  imports: [InvoiceModule],
  providers: [
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    },
  ],
})
export class AppModule {}
