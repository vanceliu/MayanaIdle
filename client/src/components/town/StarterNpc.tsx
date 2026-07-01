import { useState } from 'react';
import { useGameStore } from '../../stores/gameStore';
import type { EquipmentInstance } from '../../models/equipment';
import type { ClassName } from '../../models/character';
import {
  claimStarterGear,
  canClaimStarterGear,
  canEnhanceStarterGear,
  enhanceStarterGear,
  persistStarterEnhance,
  getStarterEnhanceCost,
  getStarterEnhanceMax,
  getStarterGearNames,
} from '../../systems/starterNpc';
import { db } from '../../db/database';

type NpcTab = 'talk' | 'claim' | 'enhance';

export function StarterNpc() {
  const char = useGameStore(s => s.character);
  const equippedGear = useGameStore(s => s.equippedGear);
  const inventory = useGameStore(s => s.inventory);
  const [tab, setTab] = useState<NpcTab>('talk');
  const [msg, setMsg] = useState<string | null>(null);

  if (!char) return null;

  const allOwned = [
    ...Object.values(equippedGear).filter(Boolean) as EquipmentInstance[],
    ...inventory,
  ];

  const starterGearOnHand = allOwned.filter(e => e.isStarterGear);
  const canClaim = canClaimStarterGear(char.level);
  const allGearNames = getStarterGearNames(char.className as ClassName);
  const ownedNames = starterGearOnHand.map(e => e.name);
  const missingCount = allGearNames.filter(n => !ownedNames.includes(n)).length;

  async function handleClaim() {
    if (!char) return;
    const result = await claimStarterGear(
      char.id!,
      char.className as ClassName,
      char.level,
      allOwned,
    );
    if (result.claimed.length === 0) {
      setMsg('你已經擁有所有新手裝備了。');
      return;
    }
    const inv = useGameStore.getState().inventory;
    useGameStore.setState({ inventory: [...inv, ...result.claimed] });
    useGameStore.getState().saveState();
    setMsg(`獲得了 ${result.claimed.map(e => e.name).join('、')}！`);
  }

  async function handleEnhance(item: EquipmentInstance) {
    if (!char) return;
    const cost = getStarterEnhanceCost();
    if (char.gold < cost) {
      setMsg('金幣不足！');
      return;
    }
    if (!canEnhanceStarterGear(item)) {
      setMsg('此裝備已達強化上限。');
      return;
    }

    const enhanced = enhanceStarterGear(item);
    await persistStarterEnhance(enhanced);

    const newChar = { ...char, gold: char.gold - cost };
    await db.characters.update(char.id!, { gold: newChar.gold });

    const equip = useGameStore.getState().equippedGear;
    const inv = useGameStore.getState().inventory;

    const inEquipped = Object.entries(equip).find(([, v]) => v?.id === item.id);
    if (inEquipped) {
      useGameStore.setState({
        character: newChar,
        equippedGear: { ...equip, [inEquipped[0]]: enhanced },
      });
    } else {
      useGameStore.setState({
        character: newChar,
        inventory: inv.map(i => i.id === item.id ? enhanced : i),
      });
    }
    useGameStore.getState().saveState();
    setMsg(`${enhanced.name} 強化成功！(+${enhanced.enhancement})`);
  }

  function renderEnhanceList() {
    const enhanceable = starterGearOnHand.filter(e => canEnhanceStarterGear(e));
    const maxed = starterGearOnHand.filter(e => !canEnhanceStarterGear(e) && e.isStarterGear);
    const cost = getStarterEnhanceCost();

    return (
      <div className="starter-enhance-list">
        {starterGearOnHand.length === 0 && <p className="empty-text">你沒有任何新手裝備。</p>}
        {enhanceable.map(item => (
          <div key={item.id} className="starter-item-row">
            <span className="starter-item-name">
              {item.name} +{item.enhancement}/{getStarterEnhanceMax(item)}
            </span>
            <button
              onClick={() => handleEnhance(item)}
              disabled={char.gold < cost}
            >
              強化 ({cost}G)
            </button>
          </div>
        ))}
        {maxed.map(item => (
          <div key={item.id} className="starter-item-row maxed">
            <span className="starter-item-name">
              {item.name} +{item.enhancement}/{getStarterEnhanceMax(item)}
            </span>
            <span className="starter-maxed-label">已滿</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="starter-npc-panel">
      <p className="shop-greeting">「歡迎來到薄暮村！我是新手指導員，讓我來幫助你開始冒險吧。」</p>
      <div className="shop-gold">持有金幣: {char.gold.toLocaleString()}G</div>

      <div className="shop-tabs">
        <button className={tab === 'talk' ? 'active' : ''} onClick={() => { setTab('talk'); setMsg(null); }}>對話</button>
        <button className={tab === 'claim' ? 'active' : ''} onClick={() => { setTab('claim'); setMsg(null); }}>領取裝備</button>
        <button className={tab === 'enhance' ? 'active' : ''} onClick={() => { setTab('enhance'); setMsg(null); }}>強化裝備</button>
      </div>

      {msg && <p className="starter-msg">{msg}</p>}

      {tab === 'talk' && (
        <div className="starter-talk">
          <p>「身為一名{char.className === 'knight' ? '騎士' : char.className === 'elf' ? '妖精' : char.className === 'elementalist' ? '元素師' : char.className === 'priest' ? '牧師' : '盜賊'}，你需要合適的裝備才能踏上冒險之路。」</p>
          <p>「我可以提供你一套新手裝備，還能幫你強化它們。」</p>
          <p>「不過要注意，這些裝備是特製的，不能存入倉庫或販售，只能穿在身上或丟棄。」</p>
          {!canClaim && <p className="starter-warning">「你的等級已超過 30，無法再領取新手裝備了。」</p>}
        </div>
      )}

      {tab === 'claim' && (
        <div className="starter-claim">
          {!canClaim ? (
            <p className="starter-warning">等級超過 30，無法領取新手裝備。</p>
          ) : (
            <>
              <p>可領取裝備（{char.className === 'knight' ? '騎士' : char.className === 'elf' ? '妖精' : char.className === 'elementalist' ? '元素師' : char.className === 'priest' ? '牧師' : '盜賊'}套裝）：</p>
              <div className="starter-gear-list">
                {allGearNames.map(name => {
                  const owned = ownedNames.includes(name);
                  return (
                    <div key={name} className={`starter-item-row ${owned ? 'owned' : ''}`}>
                      <span className="starter-item-name">{name}</span>
                      <span className={owned ? 'starter-owned-label' : 'starter-missing-label'}>
                        {owned ? '已擁有' : '未擁有'}
                      </span>
                    </div>
                  );
                })}
              </div>
              <button
                className="starter-claim-btn"
                onClick={handleClaim}
                disabled={missingCount === 0}
              >
                {missingCount === 0 ? '已全部擁有' : `領取缺少的裝備 (${missingCount}件)`}
              </button>
            </>
          )}
        </div>
      )}

      {tab === 'enhance' && (
        <div className="starter-enhance">
          <p>強化費用：每次 {getStarterEnhanceCost()}G（不需要卷軸）</p>
          <p className="starter-note">強化上限為安定值（武器+6 / 防具+4），安定值內必定成功。</p>
          {renderEnhanceList()}
        </div>
      )}
    </div>
  );
}
