export interface NetworkNode {
  address: string;
  parentAddress?: string;
  depth: number;
  level: number;
  lastActiveTime: number;
  children: NetworkNode[];
}

export interface UserInfoEntry {
  level: number;
  lastActiveTime: number;
}

export function buildNetworkHierarchy(
  rootAddress: string,
  childrenByAddress: Record<string, string[]>,
  maxDepth = 5,
  userInfoMap: Record<string, UserInfoEntry> = {},
): NetworkNode[] {
  const buildNode = (address: string, parentAddress?: string, depth = 1): NetworkNode => {
    const info = userInfoMap[address.toLowerCase()];
    return {
      address,
      parentAddress,
      depth,
      level: info?.level ?? 0,
      lastActiveTime: info?.lastActiveTime ?? 0,
      children: [],
    };
  };

  const rootNode = buildNode(rootAddress, undefined, 0);
  const queue: Array<{ node: NetworkNode; address: string; parentAddress?: string; depth: number }> = [
    { node: rootNode, address: rootAddress, parentAddress: undefined, depth: 0 },
  ];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;

    const children = (childrenByAddress[current.address] || []).filter(Boolean);
    for (const childAddress of children) {
      if (current.depth + 1 > maxDepth) continue;
      const childNode = buildNode(childAddress, current.address, current.depth + 1);
      current.node.children.push(childNode);
      queue.push({ node: childNode, address: childAddress, parentAddress: current.address, depth: current.depth + 1 });
    }
  }

  return rootNode.children;
}
