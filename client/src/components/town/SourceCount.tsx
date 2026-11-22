import type { ReactNode } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { Tooltip } from '../Tooltip';
import {
  CRAFT_SOURCE_ORDER, getCraftSources, getMaterialStock, type CraftSources,
} from '../../systems/craftQuestSystem';
import { CRAFT_SOURCE_LABEL } from './BlacksmithPrereqPicker';

/** 背包＋個人倉庫＋帳號倉庫（`06-equipment-acquire.md` § 6A.3「取用來源」） */
export function useCraftSources(): CraftSources {
  const bagItems = useGameStore(s => s.bagItems);
  const inventory = useGameStore(s => s.inventory);
  const personalStoredMaterials = useGameStore(s => s.personalStoredMaterials);
  const personalStoredEquipment = useGameStore(s => s.personalStoredEquipment);
  const storedMaterials = useGameStore(s => s.storedMaterials);
  const storedEquipment = useGameStore(s => s.storedEquipment);
  return getCraftSources({ bagItems, inventory, personalStoredMaterials, personalStoredEquipment, storedMaterials, storedEquipment });
}

/** 三處合計的數字；hover 顯示各處存量（多個道具時逐處加總） */
export function SourceCount({ sources, itemIds, className, children }: {
  sources: CraftSources; itemIds: number[]; className?: string; children: ReactNode;
}) {
  return (
    <Tooltip position="top" content={(
      <div className="bs-mat-source-tooltip">
        {CRAFT_SOURCE_ORDER.map(source => (
          <div key={source}>{CRAFT_SOURCE_LABEL[source]} {itemIds.reduce((sum, id) => sum + getMaterialStock(sources, id)[source], 0)}</div>
        ))}
      </div>
    )}>
      <span className={`source-count${className ? ` ${className}` : ''}`}>{children}</span>
    </Tooltip>
  );
}
