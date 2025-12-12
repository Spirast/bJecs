import { Snapshot, EntityId, Id } from "./types";
import { deepClone, generateId } from "./utils";

export function createSnapshot(
    entities: Set<EntityId>,
    componentsMap: Map<EntityId, Map<Id, unknown>>,
    components?: Id[]
): Snapshot {
    const entityStates = new Map<EntityId, Map<Id, unknown>>();

    for (const entity of entities) {
        const comps = componentsMap.get(entity)!;
        const cloned = new Map<Id, unknown>();

        if (components && components.size() > 0) {
            for (const id of components) {
                if (comps.has(id)) {
                    cloned.set(id, deepClone(comps.get(id)));
                }
            }
            if (cloned.size() > 0) {
                entityStates.set(entity, cloned);
            }
        } else {
            for (const [id, val] of comps) {
                cloned.set(id, deepClone(val));
            }
            entityStates.set(entity, cloned);
        }
    }

    return {
        id: generateId(),
        timestamp: os.clock(),
        entityStates,
        components: components ? [...components] : undefined
    };
}
