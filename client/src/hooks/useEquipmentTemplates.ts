import { useState, useEffect } from 'react';
import type { EquipmentTemplate } from '../models/equipment';
import { getCachedEquipmentTemplates, loadEquipmentTemplates } from '../db/equipmentTemplateCache';

export function useEquipmentTemplates(): EquipmentTemplate[] {
  const [templates, setTemplates] = useState<EquipmentTemplate[]>(getCachedEquipmentTemplates);

  useEffect(() => {
    let cancelled = false;
    loadEquipmentTemplates().then(data => {
      if (!cancelled) setTemplates(data);
    });
    return () => { cancelled = true; };
  }, []);

  return templates;
}
