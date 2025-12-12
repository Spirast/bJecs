import { EntityId, Id, Snapshot } from "./types";
import { Event } from "./event";
import { Group, GroupImpl } from "./group";
import { Query } from "./query";
import { Prefab } from "./prefab";
import { createSnapshot } from "./snapshot";
import { deepClone } from "./utils";

export interface World {
    spawn(): EntityId;
    despawn(entity: EntityId): boolean;
    valid(entity: EntityId): boolean;

    set<T>(entity: EntityId, component: Id<T>, value: T): void;
    get<T>(entity: EntityId, component: Id<T>): T | undefined;
    has(entity: EntityId, component: Id): boolean;
    remove(entity: EntityId, component: Id): boolean;

    query<T extends unknown[]>(...components: { [K in keyof T]: Id<T[K]> }): Query<T>;

    createGroup(): Group;
    removeGroup(group: Group): void;
    getGroupsForEntity(entity: EntityId): Group[];
    getGroupsWithComponent(component: Id): Group[];

    snapshot(components?: Id[]): Snapshot;
    revert(snapshot: Snapshot): void;

    prefab(components: Array<[Id, any]>): Prefab;

    // Custom events
    onEntitySpawned: Event<[EntityId]>;
    onEntityDespawned: Event<[EntityId]>;
    onComponentAdded: Event<[EntityId, Id]>;
    onComponentRemoved: Event<[EntityId, Id]>;
    onEntityAddedToGroup: Event<[EntityId, Group]>;
    onEntityRemovedFromGroup: Event<[EntityId, Group]>;
}

export class WorldImpl implements World {
    private nextEntityId = 1;
    private entities = new Set<EntityId>();
    private components = new Map<EntityId, Map<Id, unknown>>();
    private groups = new Set<GroupImpl>();
    private entityToGroups = new Map<EntityId, Set<GroupImpl>>();

    public onEntitySpawned = new Event<[EntityId]>();
    public onEntityDespawned = new Event<[EntityId]>();
    public onComponentAdded = new Event<[EntityId, Id]>();
    public onComponentRemoved = new Event<[EntityId, Id]>();
    public onEntityAddedToGroup = new Event<[EntityId, Group]>();
    public onEntityRemovedFromGroup = new Event<[EntityId, Group]>();

    spawn(): EntityId {
        const entity = this.nextEntityId++ as EntityId;
        this.entities.add(entity);
        this.components.set(entity, new Map());
        this.onEntitySpawned.fire(entity);
        return entity;
    }

    despawn(entity: EntityId): boolean {
        if (!this.valid(entity)) return false;

        const groups = this.entityToGroups.get(entity);
        if (groups) {
            for (const group of groups) {
                group.removeEntity(entity);
                this.onEntityRemovedFromGroup.fire(entity, group);
            }
            this.entityToGroups.delete(entity);
        }

        const comps = this.components.get(entity)!;
        for (const [comp] of comps) {
            this.onComponentRemoved.fire(entity, comp);
        }
        this.entities.delete(entity);
        this.components.delete(entity);
        this.onEntityDespawned.fire(entity);
        return true;
    }

    valid(entity: EntityId): boolean {
        return this.entities.has(entity);
    }

    set<T>(entity: EntityId, component: Id<T>, value: T): void {
        if (!this.valid(entity)) error(`Entity ${entity} does not exist`);
        const comps = this.components.get(entity)!;
        const had = comps.has(component);
        comps.set(component, value);
        if (!had) this.onComponentAdded.fire(entity, component);
    }

    get<T>(entity: EntityId, component: Id<T>): T | undefined {
        if (!this.valid(entity)) return undefined;

        const entityComps = this.components.get(entity);
        if (entityComps?.has(component)) {
            return entityComps.get(component) as T;
        }

        const groups = this.entityToGroups.get(entity);
        if (groups) {
            for (const group of groups) {
                if (group.has(component)) {
                    return group.get(component);
                }
            }
        }

        return undefined;
    }

    has(entity: EntityId, component: Id): boolean {
        if (!this.valid(entity)) return false;

        const entityComps = this.components.get(entity);
        if (entityComps?.has(component)) {
            return true;
        }

        const groups = this.entityToGroups.get(entity);
        if (groups) {
            for (const group of groups) {
                if (group.has(component)) {
                    return true;
                }
            }
        }

        return false;
    }

    remove(entity: EntityId, component: Id): boolean {
        if (!this.valid(entity)) return false;

        const comps = this.components.get(entity)!;
        const had = comps.delete(component);
        if (had) {
            this.onComponentRemoved.fire(entity, component);
        }
        return had;
    }

    query<T extends unknown[]>(...components: { [K in keyof T]: Id<T[K]> }): Query<T> {
        const required: Id[] = [];
        const excluded: Id[] = [];

        for (const c of components) {
            required.push(c);
        }

        const world = this;

        const query: Query<T> = {
            with<U extends unknown[]>(...newComps: { [K in keyof U]: Id<U[K]> }): Query<[...T, ...U]> {
                for (const comp of newComps) {
                    required.push(comp);
                }
                return query as unknown as Query<[...T, ...U]>;
            },

            without(...ex: Id[]): Query<T> {
                for (const comp of ex) {
                    excluded.push(comp);
                }
                return query;
            },

            each(cb: (entity: EntityId, ...components: T) => void): void {
                for (const entity of world.entities) {
                    const comps = world.components.get(entity)!;
                    const hasAll = required.every((c) => comps.has(c));
                    const hasEx = excluded.some((c) => comps.has(c));
                    if (hasAll && !hasEx) {
                        const values = required.map(c => comps.get(c)) as T;
                        cb(entity, ...values);
                    }
                }
            },

            collect(): Array<[EntityId, ...T]> {
                const results: Array<[EntityId, ...T]> = [];
                query.each((entity: EntityId, ...vals: T) => {
                    results.push([entity, ...vals] as [EntityId, ...T]);
                });
                return results;
            },

            map<U>(fn: (entry: [EntityId, ...T]) => U): U[] {
                return query.collect().map(fn);
            },
            filter(fn: (entry: [EntityId, ...T]) => boolean): Array<[EntityId, ...T]> {
                return query.collect().filter(fn);
            }
        };

        return query;
    }

    snapshot(components?: Id[]): Snapshot {
        return createSnapshot(this.entities, this.components, components);
    }

    createGroup(): Group {
        const group = new GroupImpl();
        this.groups.add(group);

        group.onEntityAdded.connect((entity) => {
            if (!this.entityToGroups.has(entity)) {
                this.entityToGroups.set(entity, new Set());
            }
            this.entityToGroups.get(entity)?.add(group);
            this.onEntityAddedToGroup.fire(entity, group);
        });

        group.onEntityRemoved.connect((entity) => {
            this.entityToGroups.get(entity)?.delete(group);
            if (this.entityToGroups.get(entity)?.size() === 0) {
                this.entityToGroups.delete(entity);
            }
            this.onEntityRemovedFromGroup.fire(entity, group);
        });

        return group;
    }

    removeGroup(group: Group): void {
        if (!(group instanceof GroupImpl) || !this.groups.has(group)) return;

        for (const entity of group.getEntities()) {
            group.removeEntity(entity);
        }

        this.groups.delete(group);
    }

    prefab(components: Array<[Id, unknown]>): Prefab {
        return new Prefab(this, components);
    }

    getGroupsForEntity(entity: EntityId): Group[] {
        const groups = this.entityToGroups.get(entity);
        return groups ? [...groups] : [];
    }

    getGroupsWithComponent(component: Id): Group[] {
        const result: Group[] = [];
        for (const group of this.groups) {
            if (group.has(component)) {
                result.push(group);
            }
        }
        return result;
    }

    revert(snapshot: Snapshot): void {
        const isPartial = snapshot.components && snapshot.components.size() > 0;

        if (!isPartial) {
            for (const entity of [...this.entities]) {
                if (!snapshot.entityStates.has(entity)) this.despawn(entity);
            }
        }

        for (const [entity, snapshotComps] of snapshot.entityStates) {
            if (!this.entities.has(entity)) {
                if (snapshotComps.size() > 0) {
                    this.entities.add(entity);
                    this.components.set(entity, new Map());
                    this.onEntitySpawned.fire(entity);
                } else {
                    continue;
                }
            }

            const currentComps = this.components.get(entity)!;

            if (!isPartial) {
                for (const [id] of currentComps) {
                    if (!snapshotComps.has(id)) {
                        currentComps.delete(id);
                        this.onComponentRemoved.fire(entity, id);
                    }
                }
            }

            for (const [id, val] of snapshotComps) {
                if (!isPartial || !snapshot.components || snapshot.components.includes(id)) {
                    currentComps.set(id, deepClone(val));
                    this.onComponentAdded.fire(entity, id);
                }
            }
        }
    }
}

// ==============================================
// Public API
// ==============================================

export function createWorld(): World {
    return new WorldImpl();
}