export type ProductionWorkflowStatus = "open" | "planned" | "used" | "skipped";
export type PersistedProductionWorkflowStatus = Exclude<ProductionWorkflowStatus, "open">;
export type ProductionWorkflowState = Record<string, PersistedProductionWorkflowStatus>;

export interface ProductionWorkflowSummary {
  open: number;
  planned: number;
  used: number;
  skipped: number;
  total: number;
}

function isPersistedStatus(status: ProductionWorkflowStatus): status is PersistedProductionWorkflowStatus {
  return status !== "open";
}

export function getSlotWorkflowStatus(
  state: ProductionWorkflowState,
  slotId: string
): ProductionWorkflowStatus {
  return state[slotId] ?? "open";
}

export function setSlotWorkflowStatus(
  state: ProductionWorkflowState,
  slotId: string,
  status: ProductionWorkflowStatus
): ProductionWorkflowState {
  const nextState = { ...state };
  if (isPersistedStatus(status)) {
    nextState[slotId] = status;
  } else {
    delete nextState[slotId];
  }
  return nextState;
}

export function getProductionWorkflowSummary(
  slotIds: string[],
  state: ProductionWorkflowState
): ProductionWorkflowSummary {
  return slotIds.reduce<ProductionWorkflowSummary>(
    (summary, slotId) => {
      const status = getSlotWorkflowStatus(state, slotId);
      summary[status] += 1;
      summary.total += 1;
      return summary;
    },
    { open: 0, planned: 0, used: 0, skipped: 0, total: 0 }
  );
}

export function pruneProductionWorkflowState(
  activeSlotIds: string[],
  state: ProductionWorkflowState
): ProductionWorkflowState {
  const active = new Set(activeSlotIds);
  return Object.fromEntries(Object.entries(state).filter(([slotId]) => active.has(slotId)));
}
