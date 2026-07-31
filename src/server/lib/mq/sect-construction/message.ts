import { z } from 'zod';
import { MQ_KEYS } from '../mqKeys';

export const SECT_FACILITY_CONSTRUCTION_MESSAGE_KEY =
  MQ_KEYS.messages.sectFacilityConstruction;

export const SectFacilityConstructionMessagePayloadSchema = z
  .object({
    sectId: z.string().min(1).max(64),
    facilityKey: z.string().min(1).max(32),
    constructionPoints: z.number().int().positive(),
  })
  .strict();

export type SectFacilityConstructionMessagePayload = z.infer<
  typeof SectFacilityConstructionMessagePayloadSchema
>;
