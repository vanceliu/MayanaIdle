import type { EquipmentInstance, EquipmentTemplate } from '../../models/equipment';
import { getEquipmentInstanceTierColor } from '../../models/equipmentTier';
import { getEquipIcon } from '../../models/iconMap';
import type { CraftPrerequisiteCandidate, CraftSourceKind } from '../../systems/craftQuestSystem';
import { GameIcon } from '../GameIcon';
import { Tooltip } from '../Tooltip';
import { EquipmentDetail } from '../EquipmentInfo';

/** 製作來源的顯示名稱（`06-equipment-acquire.md` § 6A.3「取用來源」） */
export const CRAFT_SOURCE_LABEL: Record<CraftSourceKind, string> = { bag: '背包', personal: '個人倉庫', shared: '帳號倉庫' };

/** 前置裝備名稱，hover 顯示完整裝備 */
export function PrereqName({ item, templates }: { item: EquipmentInstance; templates: EquipmentTemplate[] }) {
  const color = getEquipmentInstanceTierColor(item, templates);
  return (
    <Tooltip position="right" content={<EquipmentDetail item={item} />}>
      <span className="bs-prereq-name" style={{ color }}>
        <GameIcon name={getEquipIcon(item.type === 'armor' ? item.slot : item.type)} size={14} color={color} />
        {item.name}{item.enhancement > 0 ? ` +${item.enhancement}` : ''}
      </span>
    </Tooltip>
  );
}

/** 前置裝備挑選視窗：背包＋個人／帳號倉庫的候選，點一列即選定並關閉 */
export function BlacksmithPrereqPicker({ prerequisiteName, candidates, chosenId, templates, onChoose, onClose }: {
  prerequisiteName: string;
  candidates: CraftPrerequisiteCandidate[];
  chosenId: number | undefined;
  templates: EquipmentTemplate[];
  onChoose: (id: number) => void;
  onClose: () => void;
}) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content bs-prereq-modal" role="dialog" aria-label="選擇前置裝備" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">選擇前置裝備：{prerequisiteName}（{candidates.length} 件）</span>
          <button className="modal-close" aria-label="關閉" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body bs-prereq-list" role="radiogroup">
          {candidates.map(({ source, item }) => (
            <span
              key={item.id}
              role="radio"
              aria-checked={chosenId === item.id}
              className={`bs-prereq-option ${chosenId === item.id ? 'selected' : ''}`}
              onClick={() => { onChoose(item.id!); onClose(); }}
            >
              <span className="bs-prereq-radio" />
              <PrereqName item={item} templates={templates} />
              <span className="bs-prereq-meta">詞綴 {item.affixes.length} 條</span>
              <span className="bs-source-tag">{CRAFT_SOURCE_LABEL[source]}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
