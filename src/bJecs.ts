/**
 * bootlegJecs - A lightweight ECS (Entity Component System) for roblox-ts
 * @spirast
 */

// ==============================================
// Core Types and Interfaces
// ==============================================

type Callback<T extends unknown[]> = (...args: T) => void;

export interface IDisposable {
    Disconnect(): void;
}

export interface Snapshot {
    id: number;
    timestamp: number;
    entityStates: Map<EntityId, Map<Id, unknown>>;
    components?: Id[]; // Optional array of component IDs that were snapshotted
}

export type EntityId = number & { readonly __brand: unique symbol };
export type Id<T = unknown> = number & { readonly __type?: T };

// ==============================================
// Helpers
// ==============================================

let nextId = 1;
function generateId(): number {
    return nextId++;
}

function deepClone<T>(obj: T): T {
    // returns deep copy by just decoding the encode instead of iterating thru everything
    return game.GetService("HttpService").JSONDecode(
        game.GetService("HttpService").JSONEncode(obj)
    ) as T;
}

export interface Query<T extends unknown[]> {
    with<U extends unknown[]>(...components: { [K in keyof U]: Id<U[K]> }): Query<[...T, ...U]>;
    without(...components: Id[]): Query<T>;
    each(callback: (entity: EntityId, ...components: T) => void): void;
    collect(): Array<[EntityId, ...T]>;
    map<U>(fn: (entry: [EntityId, ...T]) => U): U[];
    filter(fn: (entry: [EntityId, ...T]) => boolean): Array<[EntityId, ...T]>;
}

export interface Group {
    readonly id: number;
    addEntity(entity: EntityId): void;
    removeEntity(entity: EntityId): void;
    hasEntity(entity: EntityId): boolean;
    getEntities(): EntityId[];
    set<T>(component: Id<T>, value: T): void;
    get<T>(component: Id<T>): T | undefined;
    has(component: Id): boolean;
    remove(component: Id): boolean;
    onEntityAdded: Event<[EntityId]>;
    onEntityRemoved: Event<[EntityId]>;
}

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

    // SPIRASTS CUSTOM EVENTS
    onEntitySpawned: Event<[EntityId]>;
    onEntityDespawned: Event<[EntityId]>;
    onComponentAdded: Event<[EntityId, Id]>;
    onComponentRemoved: Event<[EntityId, Id]>;
    onEntityAddedToGroup: Event<[EntityId, Group]>;
    onEntityRemovedFromGroup: Event<[EntityId, Group]>;
}

export class Prefab {
    private components: Array<[Id, unknown]>;
    private world: World;

    constructor(world: World, components: Array<[Id, unknown]>) {
        this.world = world;
        this.components = components;
    }

    spawn(overrides: Array<[Id, unknown]> = []): EntityId {
        const entity = this.world.spawn();
        
        for (const [component, value] of this.components) {
            this.world.set(entity, component, value);
        }
        
        for (const [component, value] of overrides) {
            this.world.set(entity, component, value);
        }
        
        return entity;
    }

    extend(components: Array<[Id, unknown]>): Prefab {
        return new Prefab(this.world, [...this.components, ...components]);
    }
}

// ==============================================
// Component Registry
// ==============================================

const componentRegistry = new Map<string, Id>();
let nextComponentId = 1;

export function component<T = void>(name: string): Id<T> {
    if (componentRegistry.has(name)) {
        error(`Component '${name}' is already registered`);
    }
    const id = nextComponentId++ as Id<T>;
    componentRegistry.set(name, id);
    return id;
}

// ==============================================
// World Implementation
// ==============================================

class GroupImpl implements Group {
    private static nextId = 1;
    public readonly id: number;
    private entities = new Set<EntityId>();
    private components = new Map<Id, unknown>();
    
    public onEntityAdded = new Event<[EntityId]>();
    public onEntityRemoved = new Event<[EntityId]>();

    constructor() {
        this.id = GroupImpl.nextId++;
    }

    addEntity(entity: EntityId): void {
        if (!this.entities.has(entity)) {
            this.entities.add(entity);
            this.onEntityAdded.fire(entity);
        }
    }

    removeEntity(entity: EntityId): void {
        if (this.entities.delete(entity)) {
            this.onEntityRemoved.fire(entity);
        }
    }

    hasEntity(entity: EntityId): boolean {
        return this.entities.has(entity);
    }

    getEntities(): EntityId[] {
        return [...this.entities];
    }

    set<T>(component: Id<T>, value: T): void {
        this.components.set(component, value);
    }

    get<T>(component: Id<T>): T | undefined {
        return this.components.get(component) as T | undefined;
    }

    has(component: Id): boolean {
        return this.components.has(component);
    }

    remove(component: Id): boolean {
        return this.components.delete(component);
    }
}

class WorldImpl implements World {
    private nextEntityId = 1;
    private entities = new Set<EntityId>();
    private components = new Map<EntityId, Map<Id, unknown>>();
    private groups = new Set<GroupImpl>();
    private entityToGroups = new Map<EntityId, Set<GroupImpl>>();
    private componentToGroups = new Map<Id, Set<GroupImpl>>();

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
        
        // remove from groups
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
        
        // Check entity's own components
        const entityComps = this.components.get(entity);
        if (entityComps?.has(component)) {
            return true;
        }
        
        // Check groups the entity belongs to
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
        
        // Only remove from entity, not from groups
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

        const shit = this;

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
                for (const entity of shit.entities) {
                    const comps = shit.components.get(entity)!;
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
        const entityStates = new Map<EntityId, Map<Id, unknown>>();

        for (const entity of this.entities) {
            const comps = this.components.get(entity)!;
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

    createGroup(): Group {
        const group = new GroupImpl();
        this.groups.add(group);
        
        // event forwarding
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
        
        // remove all entities from the group b4 removing itself
        // will not remove entities from the world tho, ig i should create a method for that
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

// ==============================================
// Utility Types and Functions
// ==============================================

// NOT DONE YET 
// TODO: DO IT 

export type ComponentType<T> = T extends Id<infer U> ? U : never;
export type System<Args extends unknown[] = []> = (world: World, ...args: Args) => void;

/**
 * @deprecated Do not use this, it is not done yet
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
 * @deprecated Do not use this, it is not done yet
 */
export function runSystems(world: World, ...systems: System[]): () => void {
    return () => {
        for (const sys of systems) sys(world);
    };
}

// ==============================================
// Event System
// ==============================================

export class Event<T extends unknown[] = []> {
    private connections: Map<number, Callback<T>> = new Map();
    private nextId = 0;

    public connect(callback: Callback<T>): IDisposable {
        const id = this.nextId++;
        this.connections.set(id, callback);
        const connections = this.connections;
        return {
            Disconnect() {
                connections.delete(id);
            },
        };
    }

    public fire(...args: T): this {
        this.connections.forEach((cb) => cb(...args));
        return this;
    }

    public wait(): Promise<T> {
        return new Promise((resolve) => {
            const conn = this.connect((...args: T) => {
                conn.Disconnect();
                resolve(args);
            });
        });
    }

    public disconnectAll(): void {
        this.connections.clear();
    }

    public getConnectionCount(): number {
        return this.connections.size();
    }
}