import { KycQueueEntry } from './kyc-queue-entry.model';

export interface KycPage {
  entries: KycQueueEntry[];
  page: number;
  size: number;
  totalElements: number;
}
