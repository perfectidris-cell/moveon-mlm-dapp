import { describe, expect, it } from 'vitest';
import { buildNetworkHierarchy } from '../utils/networkTree';

describe('buildNetworkHierarchy', () => {
  it('builds a hierarchy up to five levels deep and keeps parent links', () => {
    const childrenByAddress: Record<string, string[]> = {
      root: ['a', 'b'],
      a: ['a1', 'a2'],
      b: ['b1'],
      a1: ['a1x'],
      a2: ['a2x'],
      b1: ['b1x'],
      a1x: ['a1x1'],
      a2x: ['a2x1'],
      b1x: ['b1x1'],
      a1x1: ['a1x1x'],
    };

    const hierarchy = buildNetworkHierarchy('root', childrenByAddress, 5);

    expect(hierarchy).toHaveLength(2);
    expect(hierarchy[0].depth).toBe(1);

    const firstBranch = hierarchy[0];
    expect(firstBranch.children[0].depth).toBe(2);

    const secondLevel = firstBranch.children[0];
    expect(secondLevel.children[0].depth).toBe(3);

    const thirdLevel = secondLevel.children[0];
    expect(thirdLevel.children[0]?.depth).toBe(4);

    const fourthLevel = thirdLevel.children[0];
    expect(fourthLevel?.children[0]?.depth).toBe(5);
    expect(fourthLevel?.children[0]?.parentAddress).toBe('a1x1');
  });
});
