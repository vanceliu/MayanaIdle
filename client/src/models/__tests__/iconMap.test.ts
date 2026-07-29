import { describe, expect, it } from 'vitest';
import { getEquipIcon } from '../iconMap';

describe('getEquipIcon', () => {
  it('should use the book cover icon for magic books', () => {
    expect(getEquipIcon('magicBook')).toBe('equipment/book-cover');
  });
});
