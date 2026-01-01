import { Event } from "./event";
import { type Group, GroupImpl } from "./group";
import { Prefab } from "./prefab";
import type { Query } from "./query";
import { createSnapshot } from "./snapshot";
import type { EntityId, Id, Snapshot } from "./types";
import { deepClone } from "./utils";

/**
 * Represents the main ECS world that manages entities, components, and systems.
 * The world is the central hub for all ECS operations and provides the primary API
 * for working with entities and their components.
 *
 * @example
 * ```typescript
 * const world = createWorld();
 *
 * // Create components
 * const Position = component<{x: number, y: number}>("Position");
 * const Velocity = component<{x: number, y: number}>("Velocity");
 *
 * // Spawn an entity and add components
 * const entity = world.spawn();
 * world.set(entity, Position, {x: 0, y: 0});
 * world.set(entity, Velocity, {x: 1, y: 1});
 *
 * // Query for entities
 * world.query(Position, Velocity).each((entity, position, velocity) => {
 *   position.x += velocity.x;
 *   position.y += velocity.y;
 * });
 * ```
 */
export interface World {
	/**
	 * Spawns a new entity in the world.
	 *
	 * @returns The newly created entity ID
	 */
	spawn(): EntityId;

	/**
	 * Despawns (removes) an entity from the world.
	 * This removes the entity and all its components, and removes it from any groups.
	 *
	 * @param entity - The entity ID to despawn
	 * @returns True if the entity was successfully despawned, false if it didn't exist
	 */
	despawn(entity: EntityId): boolean;

	/**
	 * Checks if an entity is valid (exists in the world).
	 *
	 * @param entity - The entity ID to check
	 * @returns True if the entity exists and is valid
	 */
	valid(entity: EntityId): boolean;

	/**
	 * Sets a component value on an entity.
	 *
	 * @template T - The component type
	 * @param entity - The entity ID to set the component on
	 * @param component - The component ID
	 * @param value - The component value to set
	 */
	set<T>(entity: EntityId, component: Id<T>, value: T): void;

	/**
	 * Gets a component value from an entity.
	 * Checks both entity components and group components.
	 *
	 * @template T - The component type
	 * @param entity - The entity ID to get the component from
	 * @param component - The component ID
	 * @returns The component value or undefined if not found
	 */
	get<T>(entity: EntityId, component: Id<T>): T | undefined;

	/**
	 * Checks if an entity has a specific component.
	 * Checks both entity components and group components.
	 *
	 * @param entity - The entity ID to check
	 * @param component - The component ID to check for
	 * @returns True if the entity has the component
	 */
	has(entity: EntityId, component: Id): boolean;

	/**
	 * Removes a component from an entity.
	 *
	 * @param entity - The entity ID to remove the component from
	 * @param component - The component ID to remove
	 * @returns True if the component was removed, false if it wasn't found
	 */
	remove(entity: EntityId, component: Id): boolean;

	/**
	 * Creates a query for entities with specific components.
	 *
	 * @template T - Component types to query for
	 * @param components - Component IDs that entities must have
	 * @returns A query object for further filtering and iteration
	 */
	query<T extends unknown[]>(
		...components: { [K in keyof T]: Id<T[K]> }
	): Query<T>;

	/**
	 * Creates a new group for organizing entities with shared components.
	 *
	 * @returns A new group instance
	 */
	createGroup(): Group;

	/**
	 * Removes a group from the world.
	 * This removes all entities from the group and cleans up the group.
	 *
	 * @param group - The group to remove
	 */
	removeGroup(group: Group): void;

	/**
	 * Gets all groups that contain a specific entity.
	 *
	 * @param entity - The entity ID to find groups for
	 * @returns Array of groups containing the entity
	 */
	getGroupsForEntity(entity: EntityId): Group[];

	/**
	 * Gets all groups that have a specific component set.
	 *
	 * @param component - The component ID to find groups for
	 * @returns Array of groups that have the component
	 */
	getGroupsWithComponent(component: Id): Group[];

	/**
	 * Creates a snapshot of the current world state.
	 *
	 * @param components - Optional array of specific components to include. If not provided, all components are included.
	 * @returns A snapshot of the world state or undefined if no entities exist
	 */
	snapshot(components?: Id[]): Snapshot | undefined;

	/**
	 * Restores the world to a previous snapshot state.
	 *
	 * @param snapshot - The snapshot to restore
	 */
	revert(snapshot: Snapshot): void;

	/**
	 * Creates a prefab template for spawning entities with predefined components.
	 *
	 * @param components - Array of component-value pairs for the prefab
	 * @returns A new prefab instance
	 */
	prefab(components: Array<[Id, unknown]>): Prefab;

	// Events
	onEntitySpawned: Event<[EntityId]>;
	onEntityDespawned: Event<[EntityId]>;
	onComponentAdded: Event<[EntityId, Id]>;
	onComponentRemoved: Event<[EntityId, Id]>;
	onEntityAddedToGroup: Event<[EntityId, Group]>;
	onEntityRemovedFromGroup: Event<[EntityId, Group]>;
}

/**
 * Implementation of the World interface.
 * Manages entities, components, groups, and provides the core ECS functionality.
 */
export class WorldImpl implements World {
	private nextEntityId = 1;
	private entities = new Set<EntityId>();
	private components = new Map<EntityId, Map<Id, unknown>>();
	private groups = new Set<GroupImpl>();
	private entityToGroups = new Map<EntityId, Set<GroupImpl>>();
	private archetypeToEntities = new Map<string, Set<EntityId>>();
	private entityToArchetype = new Map<EntityId, string>();
	public onEntitySpawned = new Event<[EntityId]>();
	public onEntityDespawned = new Event<[EntityId]>();
	public onComponentAdded = new Event<[EntityId, Id]>();
	public onComponentRemoved = new Event<[EntityId, Id]>();
	public onEntityAddedToGroup = new Event<[EntityId, Group]>();
	public onEntityRemovedFromGroup = new Event<[EntityId, Group]>();

	/**
	 * Generates a signature string for an entity's component set
	 */
	private generateArchetypeSignature(components: Set<Id>): string {
		const componentArray: Id[] = [];
		for (const comp of components) {
			componentArray.push(comp);
		}
		// manual sort
		const len = componentArray.size();
		for (let i = 0; i < len - 1; i++) {
			for (let j = i + 1; j < len; j++) {
				if (componentArray[i] > componentArray[j]) {
					const temp = componentArray[i];
					componentArray[i] = componentArray[j];
					componentArray[j] = temp;
				}
			}
		}
		return componentArray.join('|');
	}

	/**
	 * Updates an entity's archetype when its components change
	 */
	private updateEntityArchetype(entity: EntityId): void {
		const oldArchetype = this.entityToArchetype.get(entity);
		const comps = this.components.get(entity);
		
		if (!comps || comps.size() === 0) {
			// Remove from archetype tracking if entity has no components
			if (oldArchetype) {
				this.archetypeToEntities.get(oldArchetype)?.delete(entity);
				if (this.archetypeToEntities.get(oldArchetype)?.size() === 0) {
					this.archetypeToEntities.delete(oldArchetype);
				}
				this.entityToArchetype.delete(entity);
			}
			return;
		}

		const componentKeys: Id[] = [];
		for (const [key] of comps) {
			componentKeys.push(key);
		}
		const newArchetype = this.generateArchetypeSignature(new Set(componentKeys));
		
		if (oldArchetype !== newArchetype) {
			// Remove from old archetype
			if (oldArchetype) {
				this.archetypeToEntities.get(oldArchetype)?.delete(entity);
				if (this.archetypeToEntities.get(oldArchetype)?.size() === 0) {
					this.archetypeToEntities.delete(oldArchetype);
				}
			}
			
			// Add to new archetype
			if (!this.archetypeToEntities.has(newArchetype)) {
				this.archetypeToEntities.set(newArchetype, new Set());
			}
			this.archetypeToEntities.get(newArchetype)?.add(entity);
			this.entityToArchetype.set(entity, newArchetype);
		}
	}

	/**
	 * Gets all entities that have all required components and none of the excluded components
	 * using archetype-based optimization
	 */
	private getMatchingEntities(required: Id[], excluded: Id[]): Set<EntityId> {
		if (required.size() === 0) {
			// If no required components, filter all entities
			const result = new Set<EntityId>();
			for (const entity of this.entities) {
				const comps = this.components.get(entity);
				if (!comps) continue;
				
				const hasExcluded = excluded.some(comp => comps.has(comp));
				if (!hasExcluded) {
					result.add(entity);
				}
			}
			return result;
		}

		// Find archetypes that contain all required components
		const matchingArchetypes: string[] = [];
		
		for (const archetype of this.archetypeToEntities) {
			const archetypeComponents = archetype[0].split('|').map((id: string) => tonumber(id) || 0).filter((id: number) => id > 0);
			
			// Check if archetype contains all required components
			const hasAllRequired = required.every(req => archetypeComponents.includes(req));
			if (!hasAllRequired) continue;
			
			// Check if archetype contains any excluded components
			const hasExcluded = excluded.some(ex => archetypeComponents.includes(ex));
			if (hasExcluded) continue;
			
			matchingArchetypes.push(archetype[0]);
		}

		// Collect all entities from matching archetypes
		const result = new Set<EntityId>();
		for (const archetype of matchingArchetypes) {
			const entities = this.archetypeToEntities.get(archetype);
			if (entities) {
				for (const entity of entities) {
					result.add(entity);
				}
			}
		}

		return result;
	}

	/**
	 * Spawns a new entity in the world.
	 *
	 * @returns The newly created entity ID
	 */
	spawn(): EntityId {
		const entity = this.nextEntityId++ as EntityId;
		this.entities.add(entity);
		this.components.set(entity, new Map());
		this.onEntitySpawned.fire(entity);
		return entity;
	}

	/**
	 * Despawns an entity from the world.
	 * Removes the entity, all its components, and removes it from any groups.
	 *
	 * @param entity - The entity ID to despawn
	 * @returns True if the entity was successfully despawned
	 */
	despawn(entity: EntityId): boolean {
		if (!this.valid(entity)) return false;

		// Remove entity from all groups
		const groups = this.entityToGroups.get(entity);
		if (groups) {
			for (const group of groups) {
				group.removeEntity(entity);
				this.onEntityRemovedFromGroup.fire(entity, group);
			}
			this.entityToGroups.delete(entity);
		}

		// Fire component removal events for all components
		const comps = this.components.get(entity);
		if (!comps) return false;

		for (const [comp] of comps) {
			this.onComponentRemoved.fire(entity, comp);
		}

		// Remove the entity
		this.entities.delete(entity);
		this.components.delete(entity);
		this.onEntityDespawned.fire(entity);
		return true;
	}

	/**
	 * Checks if an entity is valid (exists in the world).
	 *
	 * @param entity - The entity ID to check
	 * @returns True if the entity exists and is valid
	 */
	valid(entity: EntityId): boolean {
		return this.entities.has(entity);
	}

	/**
	 * Sets a component value on an entity.
	 * Fires onComponentAdded event if this is a new component.
	 *
	 * @template T - The component type
	 * @param entity - The entity ID to set the component on
	 * @param component - The component ID
	 * @param value - The component value to set
	 */
	set<T>(entity: EntityId, component: Id<T>, value: T): void {
		if (!this.valid(entity)) error(`Entity ${entity} does not exist`);
		const comps = this.components.get(entity);
		if (!comps) return;

		const had = comps.has(component);
		comps.set(component, value);

		this.updateEntityArchetype(entity);
		if (!had) this.onComponentAdded.fire(entity, component);
	}

	/**
	 * Gets a component value from an entity.
	 * Checks entity components first, then group components in order.
	 *
	 * @template T - The component type
	 * @param entity - The entity ID to get the component from
	 * @param component - The component ID
	 * @returns The component value or undefined if not found
	 */
	get<T>(entity: EntityId, component: Id<T>): T | undefined {
		if (!this.valid(entity)) return undefined;

		// Check entity components first
		const entityComps = this.components.get(entity);
		if (entityComps?.has(component)) {
			return entityComps.get(component) as T;
		}

		// Check group components
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

	/**
	 * Checks if an entity has a specific component.
	 * Checks both entity components and group components.
	 *
	 * @param entity - The entity ID to check
	 * @param component - The component ID to check for
	 * @returns True if the entity has the component
	 */
	has(entity: EntityId, component: Id): boolean {
		if (!this.valid(entity)) return false;

		// Check entity components first
		const entityComps = this.components.get(entity);
		if (entityComps?.has(component)) {
			return true;
		}

		// Check group components
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

	/**
	 * Removes a component from an entity.
	 * Fires onComponentRemoved event if the component was present.
	 *
	 * @param entity - The entity ID to remove the component from
	 * @param component - The component ID to remove
	 * @returns True if the component was removed
	 */
	remove(entity: EntityId, component: Id): boolean {
		if (!this.valid(entity)) return false;

		const comps = this.components.get(entity);
		if (!comps) return false;

		const had = comps.delete(component);
		if (had) {
			this.updateEntityArchetype(entity);
			this.onComponentRemoved.fire(entity, component);
		}
		return had;
	}

	/**
	 * Creates a query for entities with specific components.
	 * Returns a query object that can be further filtered and used to iterate over matching entities.
	 *
	 * @template T - Component types to query for
	 * @param components - Component IDs that entities must have
	 * @returns A query object for further filtering and iteration
	 */
	query<T extends unknown[]>(
		...components: { [K in keyof T]: Id<T[K]> }
	): Query<T> {
		const required: Id[] = [];
		const excluded: Id[] = [];

		// Add all initial components as required
		for (const c of components) {
			required.push(c);
		}

		const world = this;

		// Create the query object with chaining methods
		const query: Query<T> = {
			/**
			 * Adds additional required components to this query.
			 */
			with<U extends unknown[]>(
				...newComps: { [K in keyof U]: Id<U[K]> }
			): Query<[...T, ...U]> {
				for (const comp of newComps) {
					required.push(comp);
				}
				return query as unknown as Query<[...T, ...U]>;
			},

			/**
			 * Adds excluded components to this query.
			 */
			without(...ex: Id[]): Query<T> {
				for (const comp of ex) {
					excluded.push(comp);
				}
				return query;
			},

			/**
			 * Iterates over all matching entities and calls the callback.
			 */
			each(cb: (entity: EntityId, ...components: T) => void): void {
				const matchingEntities = world.getMatchingEntities(required, excluded);
				for (const entity of matchingEntities) {
					const comps = world.components.get(entity);
					if (!comps) continue;

					const values = required.map((c) => comps.get(c)) as T;
					cb(entity, ...values);
				}
			},

			/**
			 * Collects all matching entities and their components into an array.
			 */
			collect(): Array<[EntityId, ...T]> {
				const results: Array<[EntityId, ...T]> = [];
				query.each((entity: EntityId, ...vals: T) => {
					results.push([entity, ...vals] as [EntityId, ...T]);
				});
				return results;
			},

			/**
			 * Maps each query result to a new value.
			 */
			map<U>(fn: (entry: [EntityId, ...T]) => U): U[] {
				return query.collect().map(fn);
			},

			/**
			 * Filters query results using a predicate function.
			 */
			filter(
				fn: (entry: [EntityId, ...T]) => boolean,
			): Array<[EntityId, ...T]> {
				return query.collect().filter(fn);
			},
		};

		return query;
	}

	/**
	 * Creates a snapshot of the current world state.
	 *
	 * @param components - Optional array of specific components to include
	 * @returns A snapshot of the world state or undefined if no entities exist
	 */
	snapshot(components?: Id[]): Snapshot | undefined {
		return createSnapshot(this.entities, this.components, components);
	}

	/**
	 * Creates a new group and sets up event listeners for entity-group relationships.
	 *
	 * @returns A new group instance
	 */
	createGroup(): Group {
		const group = new GroupImpl();
		this.groups.add(group);

		// Listen for entity additions to the group
		group.onEntityAdded.connect((entity) => {
			if (!this.entityToGroups.has(entity)) {
				this.entityToGroups.set(entity, new Set());
			}
			this.entityToGroups.get(entity)?.add(group);
			this.onEntityAddedToGroup.fire(entity, group);
		});

		// Listen for entity removals from the group
		group.onEntityRemoved.connect((entity) => {
			this.entityToGroups.get(entity)?.delete(group);
			if (this.entityToGroups.get(entity)?.size() === 0) {
				this.entityToGroups.delete(entity);
			}
			this.onEntityRemovedFromGroup.fire(entity, group);
		});

		return group;
	}

	/**
	 * Removes a group from the world.
	 * Removes all entities from the group and cleans up the group.
	 *
	 * @param group - The group to remove
	 */
	removeGroup(group: Group): void {
		if (!(group instanceof GroupImpl) || !this.groups.has(group)) return;

		// Remove all entities from the group
		for (const entity of group.getEntities()) {
			group.removeEntity(entity);
		}

		// Remove the group from the world
		this.groups.delete(group);
	}

	/**
	 * Creates a prefab template for spawning entities with predefined components.
	 *
	 * @param components - Array of component-value pairs for the prefab
	 * @returns A new prefab instance
	 */
	prefab(components: Array<[Id, unknown]>): Prefab {
		return new Prefab(this, components);
	}

	/**
	 * Gets all groups that contain a specific entity.
	 *
	 * @param entity - The entity ID to find groups for
	 * @returns Array of groups containing the entity
	 */
	getGroupsForEntity(entity: EntityId): Group[] {
		const groups = this.entityToGroups.get(entity);
		return groups ? [...groups] : [];
	}

	/**
	 * Gets all groups that have a specific component set.
	 *
	 * @param component - The component ID to find groups for
	 * @returns Array of groups that have the component
	 */
	getGroupsWithComponent(component: Id): Group[] {
		const result: Group[] = [];
		for (const group of this.groups) {
			if (group.has(component)) {
				result.push(group);
			}
		}
		return result;
	}

	/**
	 * Restores the world to a previous snapshot state.
	 * Handles both full and partial snapshots appropriately.
	 *
	 * @param snapshot - The snapshot to restore
	 */
	revert(snapshot: Snapshot): void {
		const isPartial = snapshot.components && snapshot.components.size() > 0;

		// For full snapshots, remove entities not in the snapshot
		if (!isPartial) {
			for (const entity of [...this.entities]) {
				if (!snapshot.entityStates.has(entity)) this.despawn(entity);
			}
		}

		// Restore entities from the snapshot
		for (const [entity, snapshotComps] of snapshot.entityStates) {
			if (!this.entities.has(entity)) {
				if (snapshotComps.size() > 0) {
					// Recreate entity if it has components
					this.entities.add(entity);
					this.components.set(entity, new Map());
					this.onEntitySpawned.fire(entity);
				} else {
					continue; // Skip empty entities
				}
			}

			const currentComps = this.components.get(entity);
			if (!currentComps) return;

			// For full snapshots, remove components not in the snapshot
			if (!isPartial) {
				for (const [id] of currentComps) {
					if (!snapshotComps.has(id)) {
						currentComps.delete(id);
						this.onComponentRemoved.fire(entity, id);
					}
				}
			}

			// Restore components from the snapshot
			for (const [id, val] of snapshotComps) {
				if (
					!isPartial ||
					!snapshot.components ||
					snapshot.components.includes(id)
				) {
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

/**
 * Creates a new ECS world instance.
 * This is the main entry point for creating an ECS world.
 *
 * @returns A new world instance ready for use
 *
 * @example
 * ```typescript
 * const world = createWorld();
 *
 * // Start using the world
 * const entity = world.spawn();
 * // ... add components, create queries, etc.
 * ```
 */
export function createWorld(): World {
	return new WorldImpl();
}
