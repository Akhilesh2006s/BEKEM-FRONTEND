import type { MaterialRequestDto, PmStockDecisionDto, PmStockDecisionLineDto } from '@afios/shared';

function otherQtyByMaterial(
  crossProjectStock: MaterialRequestDto['crossProjectStock']
): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of crossProjectStock || []) {
    const total = (row.projects || []).reduce(
      (sum, p) => sum + Math.max(0, Number(p.availableQty || 0)),
      0
    );
    map.set(row.materialId, (map.get(row.materialId) || 0) + total);
  }
  return map;
}

export function evaluatePmBranchTransferDecision(
  lines: Array<{
    materialId: string;
    materialName?: string;
    unit?: string;
    requiredQty: number;
    currentProjectAvailableQty: number;
    otherProjectsAvailableQty: number;
    alreadyCoveredQty?: number;
  }>
): PmStockDecisionDto {
  const evaluated: PmStockDecisionLineDto[] = lines.map((s) => {
    const requiredQty = Number(s.requiredQty || 0);
    const currentProjectAvailableQty = Math.max(0, Number(s.currentProjectAvailableQty || 0));
    const otherProjectsAvailableQty = Math.max(0, Number(s.otherProjectsAvailableQty || 0));
    const alreadyCoveredQty = Math.max(0, Number(s.alreadyCoveredQty || 0));
    const remainingNeedQty = Math.max(0, requiredQty - alreadyCoveredQty);
    const combinedAvailableQty = currentProjectAvailableQty + otherProjectsAvailableQty;
    const shortfallAfterCurrent = Math.max(0, remainingNeedQty - currentProjectAvailableQty);
    const shortfallAfterCombined = Math.max(0, remainingNeedQty - combinedAvailableQty);
    return {
      materialId: s.materialId,
      materialName: s.materialName,
      unit: s.unit,
      requiredQty,
      currentProjectAvailableQty,
      otherProjectsAvailableQty,
      combinedAvailableQty,
      alreadyCoveredQty,
      remainingNeedQty,
      shortfallAfterCurrent,
      shortfallAfterCombined,
      branchTransferViable: shortfallAfterCurrent > 0 && shortfallAfterCombined <= 0,
    };
  });

  const shortLines = evaluated.filter((l) => l.shortfallAfterCurrent > 0);
  return {
    currentProjectInsufficient: shortLines.length > 0,
    branchTransferViable:
      shortLines.length > 0 && shortLines.every((l) => l.shortfallAfterCombined <= 0),
    lines: evaluated,
  };
}

const CLOSED_BT_STATUSES = new Set(['REJECTED', 'RAISE_PO_INSTEAD']);

function alreadyCoveredByMaterialFromIndent(
  request: MaterialRequestDto
): Record<string, number> {
  const map: Record<string, number> = {};
  for (const t of request.linkedBranchTransfers || []) {
    if (CLOSED_BT_STATUSES.has(t.status)) continue;
    for (const item of t.items || []) {
      const mid = item.materialId || '';
      if (!mid) continue;
      map[mid] = (map[mid] || 0) + Number(item.quantity || 0);
    }
  }
  return map;
}

/** Qty still needed from other projects after current site stock + existing BTs. */
export function remainingNeedAfterCurrentAndTransfers(
  decision: PmStockDecisionDto | null | undefined
): number {
  return (decision?.lines || []).reduce(
    (sum, line) => sum + Math.max(0, Number(line.shortfallAfterCurrent || 0)),
    0
  );
}

export function pmStockDecisionFromIndent(request: MaterialRequestDto): PmStockDecisionDto | null {
  if (request.pmStockDecision) return request.pmStockDecision;

  const items: Array<{
    materialId?: string;
    quantityRequested?: number;
    requestedQty?: number;
    availableQty?: number;
    unit?: string;
    material?: MaterialRequestDto['material'];
  }> = request.items?.length
    ? request.items
    : request.materialId
      ? [
          {
            materialId: request.materialId,
            quantityRequested: request.quantityRequested || 0,
            availableQty: 0,
            unit: request.material?.unit,
            material: request.material,
          },
        ]
      : [];
  if (!items.length) return null;

  const otherByMaterial = otherQtyByMaterial(request.crossProjectStock);
  const alreadyCovered = alreadyCoveredByMaterialFromIndent(request);
  return evaluatePmBranchTransferDecision(
    items.map((item) => {
      const materialId = item.materialId || '';
      return {
        materialId,
        materialName: item.material?.name,
        unit: item.unit || item.material?.unit,
        requiredQty: item.quantityRequested ?? item.requestedQty ?? 0,
        currentProjectAvailableQty: item.availableQty ?? 0,
        otherProjectsAvailableQty: otherByMaterial.get(materialId) || 0,
        alreadyCoveredQty: alreadyCovered[materialId] || 0,
      };
    })
  );
}
