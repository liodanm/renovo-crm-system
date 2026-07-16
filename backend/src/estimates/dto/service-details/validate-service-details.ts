import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { RoofSoftWashDetailsDto, DrivewayCleaningDetailsDto, HouseWashDetailsDto } from './service-details.dto';

// Only service types with a real, known-today shape (see the DTO file's
// comment for why the rest are deliberately absent). serviceType values
// not in this map simply skip validation — whatever's provided in
// serviceDetails for those is stored as-is, since there's no known-correct
// shape yet to validate against.
const DETAIL_DTO_BY_SERVICE_TYPE: Record<string, new () => object> = {
  roof_soft_wash: RoofSoftWashDetailsDto,
  driveway_cleaning: DrivewayCleaningDetailsDto,
  house_wash: HouseWashDetailsDto,
};

/**
 * Explicit, manual validation rather than a class-validator discriminated
 * union on the outer DTO — this is deliberately called from inside
 * EstimatesService, not wired into the automatic ValidationPipe, so the
 * "which DTO applies" decision (driven by a sibling field, serviceType)
 * stays simple and readable instead of fighting class-validator's
 * conditional-validation decorators for a case they're not a great fit
 * for. Throws the same class of error (400, a real per-field message) a
 * failed automatic validation would have produced.
 */
export function validateServiceDetails(serviceType: string, details: unknown): void {
  const DtoClass = DETAIL_DTO_BY_SERVICE_TYPE[serviceType];
  if (!DtoClass || details === undefined || details === null) return;

  const instance = plainToInstance(DtoClass, details);
  const errors = validateSync(instance, { whitelist: true, forbidNonWhitelisted: true });

  if (errors.length > 0) {
    const messages = errors.flatMap((e) => Object.values(e.constraints ?? {}));
    throw new BadRequestException(`Invalid service details for '${serviceType}': ${messages.join(', ')}`);
  }
}
