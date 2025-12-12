import { World } from "./world";
import { Query } from "./query";
import { EntityId, Id } from "./types";

export type ComponentType<T> = T extends Id<infer U> ? U : never;
export type System<Args extends unknown[] = []> = (world: World, ...args: Args) => void;

/**
 * @deprecated Not finished yet
 */
export function createSystem<T extends unknown[]>(
    query: Query<T>,
    callback: (entity: EntityId, ...components: T) => void
): System {
    return (_world: World) => {
        query.each(callback);
    };
}

/**
 * @deprecated Not finished yet
 */
export function runSystems(world: World, ...systems: System[]): () => void {
    return () => {
        for (const sys of systems) sys(world);
    };
}
