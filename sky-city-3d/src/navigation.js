import { AREAS, EDGES, WAYPOINTS } from './world-layout.js';

const pointById = new Map(WAYPOINTS.map((point) => [point.id, point]));
const adjacency = new Map(WAYPOINTS.map((point) => [point.id, new Set()]));

for (const [from, to] of EDGES) {
  adjacency.get(from)?.add(to);
  adjacency.get(to)?.add(from);
}

function xyz(value) {
  if (Array.isArray(value) || ArrayBuffer.isView(value)) {
    if (value.length < 3) throw new TypeError('A position needs x, y and z.');
    return [Number(value[0]), Number(value[1]), Number(value[2])];
  }
  if (value && typeof value === 'object') {
    return [Number(value.x), Number(value.y), Number(value.z)];
  }
  throw new TypeError('Position must be an [x, y, z] array or an object with x, y and z.');
}

function squaredDistance(a, b) {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return dx * dx + dy * dy + dz * dz;
}

function distance(a, b) {
  return Math.sqrt(squaredDistance(a, b));
}

export function getWaypoint(id) {
  return pointById.get(id) ?? null;
}

export function getNeighbors(id) {
  return [...(adjacency.get(id) ?? [])];
}

export function areConnected(from, to) {
  return adjacency.get(from)?.has(to) ?? false;
}

/**
 * Dijkstra over the walking graph.  Physical segment length is the edge cost,
 * so the chosen route respects stairs and bends instead of merely using the
 * fewest number of hops.
 */
export function shortestPath(startId, endId) {
  if (!pointById.has(startId) || !pointById.has(endId)) return [];
  if (startId === endId) return [startId];

  const costs = new Map(WAYPOINTS.map((point) => [point.id, Number.POSITIVE_INFINITY]));
  const previous = new Map();
  const unvisited = new Set(pointById.keys());
  costs.set(startId, 0);

  while (unvisited.size > 0) {
    let current = null;
    let best = Number.POSITIVE_INFINITY;
    for (const id of unvisited) {
      const candidate = costs.get(id);
      if (candidate < best) {
        best = candidate;
        current = id;
      }
    }

    if (current === null || !Number.isFinite(best)) break;
    if (current === endId) break;
    unvisited.delete(current);

    for (const neighbor of adjacency.get(current) ?? []) {
      if (!unvisited.has(neighbor)) continue;
      const nextCost = best + distance(pointById.get(current).position, pointById.get(neighbor).position);
      if (nextCost < costs.get(neighbor)) {
        costs.set(neighbor, nextCost);
        previous.set(neighbor, current);
      }
    }
  }

  if (!previous.has(endId)) return [];
  const result = [endId];
  while (result[0] !== startId) {
    result.unshift(previous.get(result[0]));
  }
  return result;
}

export function routePositions(ids) {
  return ids.map((id) => getWaypoint(id)?.position).filter(Boolean).map((position) => [...position]);
}

/**
 * Region display is based on the nearest authored zone centre.  Vertical
 * distance is included, which keeps the lower hall distinct from the arcade
 * directly above it.
 */
export function classifyArea(position) {
  const value = xyz(position);
  let closest = 'A';
  let closestDistance = Number.POSITIVE_INFINITY;
  for (const area of Object.values(AREAS)) {
    const candidate = squaredDistance(value, area.center);
    if (candidate < closestDistance) {
      closestDistance = candidate;
      closest = area.id;
    }
  }
  return closest;
}

function closestPointOnSegment(position, start, end) {
  const ab = [end[0] - start[0], end[1] - start[1], end[2] - start[2]];
  const ap = [position[0] - start[0], position[1] - start[1], position[2] - start[2]];
  const denominator = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2;
  const rawT = denominator === 0 ? 0 : (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / denominator;
  const t = Math.max(0, Math.min(1, rawT));
  return {
    t,
    position: [start[0] + ab[0] * t, start[1] + ab[1] * t, start[2] + ab[2] * t],
  };
}

/** Return the closest legal point on any authored walking segment. */
export function projectToNavigable(position) {
  const value = xyz(position);
  let closest = null;

  for (const edge of EDGES) {
    const from = pointById.get(edge[0]);
    const to = pointById.get(edge[1]);
    const projected = closestPointOnSegment(value, from.position, to.position);
    const candidateDistance = distance(value, projected.position);
    if (!closest || candidateDistance < closest.distance) {
      closest = {
        position: projected.position,
        distance: candidateDistance,
        edge: [...edge],
        from: edge[0],
        to: edge[1],
        t: projected.t,
      };
    }
  }

  const width = Math.min(pointById.get(closest.from).width, pointById.get(closest.to).width);
  const radius = width * 0.5;
  const dx = value[0] - closest.position[0];
  const dz = value[2] - closest.position[2];
  const lateral = Math.hypot(dx, dz);
  const scale = lateral > radius ? radius / lateral : 1;
  const legalPosition = [
    closest.position[0] + dx * scale,
    closest.position[1],
    closest.position[2] + dz * scale,
  ];
  const correction = distance(value, legalPosition);
  return {
    ...closest,
    centerlinePosition: closest.position,
    position: legalPosition,
    distance: correction,
    lateralDistance: lateral,
    area: classifyArea(legalPosition),
    width,
  };
}

/** Find the authored point nearest a world position. */
export function nearestWaypoint(position, predicate = () => true) {
  const value = xyz(position);
  let result = null;
  let best = Number.POSITIVE_INFINITY;
  for (const point of WAYPOINTS) {
    if (!predicate(point)) continue;
    const candidate = squaredDistance(value, point.position);
    if (candidate < best) {
      best = candidate;
      result = point;
    }
  }
  return result ? { waypoint: result, distance: Math.sqrt(best) } : null;
}

export function pathLength(ids) {
  let total = 0;
  for (let index = 1; index < ids.length; index += 1) {
    const previous = getWaypoint(ids[index - 1]);
    const current = getWaypoint(ids[index]);
    if (!previous || !current || !areConnected(previous.id, current.id)) return Number.POSITIVE_INFINITY;
    total += distance(previous.position, current.position);
  }
  return total;
}
