import { CycleStatus } from './cycle.model';

// Mirrors backend/src/main/java/com/plotchain/cycle/CycleCloseResponse.java exactly. This is
// deliberately NOT a full "entries written per income type, total net amount" SettlementResult
// -- that richer shape was the domain-design spec's aspirational language for a future response;
// the merged CycleService.close() only ever returns these four fields. Do not add fields here
// that the backend doesn't send.
export interface CycleCloseResponse {
  cycleId: string;
  status: CycleStatus;
  legVolumeRowsWritten: number;
  newCycleId: string;
}
