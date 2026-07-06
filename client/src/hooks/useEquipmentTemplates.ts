import { useState, useEffect } from 'react';
import { db } from '../db/database';
import type { EquipmentTemplate } from '../models/equipment';

let cachedTemplates: EquipmentTemplate[] | null = null;

export function useEquipmentTemplates(): EquipmentTemplate[] {
  const [templates, setTemplates] = useState<EquipmentTemplate[]>(cachedTemplates ?? []);

  useEffect(() => {
    if (cachedTemplates) return;
    db.equipmentTemplates.toArray().then(data => {
      cachedTemplates = data;
      setTemplates(data);
    });
  }, []);

  return templates;
}
