import { Global, Module } from '@nestjs/common';
import { IntegrationStatusService } from './integration-status.service';

// @Global so app.get(IntegrationStatusService) resolves from main.ts
// (which runs outside any specific module's scope) and so every module
// that needs integration status (Settings today, potentially others
// later) doesn't need to re-import this every time.
@Global()
@Module({
  providers: [IntegrationStatusService],
  exports: [IntegrationStatusService],
})
export class IntegrationsModule {}
