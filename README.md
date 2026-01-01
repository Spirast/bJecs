# VIREX

A lightweight, high-performance Entity Component System (ECS) library for Roblox TypeScript (rbxts).

## Overview

Virex is a modern ECS implementation designed specifically for Roblox game development using TypeScript. It provides a clean, type-safe API for managing game entities, components, and systems with excellent performance characteristics.

## Features

- **Type-Safe Components**: Full TypeScript support with generic component types
- **Flexible Queries**: Powerful query system for finding entities with specific components
- **Event System**: Built-in events for entity lifecycle and component changes
- **Groups**: Organize entities into logical groups with shared components
- **Prefabs**: Reusable entity templates with component inheritance
- **Snapshots**: Save and restore world state for debugging or save/load functionality
- **Memory Efficient**: Optimized data structures for minimal memory overhead

## Installation

```bash
npm install @rbxts/Virex
```

## Quick Start

```typescript
import { createWorld, component } from "@rbxts/Virex";

// Define components
const Position = component<{ x: number; y: number; z: number }>("Position");
const Velocity = component<{ x: number; y: number; z: number }>("Velocity");

// Create world
const world = createWorld();

// Spawn entity with components
const entity = world.spawn();
world.set(entity, Position, { x: 0, y: 10, z: 0 });
world.set(entity, Velocity, { x: 5, y: 0, z: 0 });

// Query entities
world.query(Position, Velocity).each((entity, position, velocity) => {
    // Update position based on velocity
    position.x += velocity.x;
    position.y += velocity.y;
    position.z += velocity.z;
});
```

## Core Concepts

### Components

Components are data containers that define the properties of entities:

```typescript
// Define a component type
const Health = component<number>("Health");
const Name = component<string>("Name");
const Transform = component<{ position: Vector3; rotation: Vector3 }>("Transform");

// Set component values
world.set(entity, Health, 100);
world.set(entity, Name, "Player");
world.set(entity, Transform, { position: new Vector3(0, 0, 0), rotation: new Vector3(0, 0, 0) });

// Get component values
const health = world.get(entity, Health); // Returns number | undefined
const name = world.get(entity, Name); // Returns string | undefined

// Check if entity has component
if (world.has(entity, Health)) {
    print("Entity has health component");
}

// Remove component
world.remove(entity, Health);
```

### Entities

Entities are unique identifiers that represent game objects:

```typescript
// Spawn new entity
const entity = world.spawn();

// Check if entity is valid
if (world.valid(entity)) {
    print("Entity exists");
}

// Despawn entity
world.despawn(entity);
```

### Queries

Queries allow you to find entities with specific component combinations:

```typescript
// Find entities with Position component
world.query(Position).each((entity, position) => {
    print(`Entity ${entity} is at position ${position}`);
});

// Find entities with multiple components
world.query(Position, Velocity).each((entity, position, velocity) => {
    // Process entities that have both Position and Velocity
});

// Chain queries with additional requirements
world.query(Position)
    .with(Velocity) // Must also have Velocity
    .without(Health) // Must NOT have Health
    .each((entity, position, velocity) => {
        // Process matching entities
    });

// Collect results as array
const results = world.query(Position, Velocity).collect();
// results is Array<[EntityId, Position, Velocity]>

// Map and filter operations
const positions = world.query(Position).map(([entity, position]) => position);
const filtered = world.query(Position, Health).filter(([entity, position, health]) => health > 50);
```

### Events

Listen to world events for reactive programming:

```typescript
// Entity lifecycle events
world.onEntitySpawned.connect((entity) => {
    print(`Entity ${entity} was spawned`);
});

world.onEntityDespawned.connect((entity) => {
    print(`Entity ${entity} was despawned`);
});

// Component events
world.onComponentAdded.connect((entity, component) => {
    print(`Component ${component} added to entity ${entity}`);
});

world.onComponentRemoved.connect((entity, component) => {
    print(`Component ${component} removed from entity ${entity}`);
});
```

### Groups

Groups allow you to organize entities and share components:

```typescript
// Create a group
const enemyGroup = world.createGroup();

// Add shared components to group
enemyGroup.set(Team, "enemies");
enemyGroup.set(Faction, "orcs");

// Add entities to group
enemyGroup.addEntity(entity1);
enemyGroup.addEntity(entity2);

// Entities inherit group components
const team = world.get(entity1, Team); // Returns "enemies"

// Group events
enemyGroup.onEntityAdded.connect((entity) => {
    print(`Entity ${entity} joined the group`);
});

// Remove entity from group
enemyGroup.removeEntity(entity1);

// Remove group entirely
world.removeGroup(enemyGroup);
```

### Prefabs

Prefabs are reusable entity templates:

```typescript
// Create a prefab
const playerPrefab = world.prefab([
    [Health, 100],
    [Position, { x: 0, y: 0, z: 0 }],
    [Velocity, { x: 0, y: 0, z: 0 }],
]);

// Spawn entities from prefab
const player1 = playerPrefab.spawn();
const player2 = playerPrefab.spawn();

// Spawn with overrides
const player3 = playerPrefab.spawn([
    [Health, 150], // Override health
    [Position, { x: 10, y: 0, z: 5 }], // Override position
]);

// Extend prefabs
const armoredPlayer = playerPrefab.extend([
    [Armor, 50],
    [Shield, 25],
]);

const armoredPlayer1 = armoredPlayer.spawn();
```

### Snapshots

Save and restore world state:

```typescript
// Create snapshot of entire world
const snapshot = world.snapshot();

// Create snapshot of specific components only
const positionSnapshot = world.snapshot([Position, Velocity]);

// Restore snapshot
world.revert(snapshot);

// Partial restore (only specific components)
world.revert(positionSnapshot);
```

## API Reference

### World

```typescript
interface World {
    // Entity management
    spawn(): EntityId;
    despawn(entity: EntityId): boolean;
    valid(entity: EntityId): boolean;

    // Component management
    set<T>(entity: EntityId, component: Id<T>, value: T): void;
    get<T>(entity: EntityId, component: Id<T>): T | undefined;
    has(entity: EntityId, component: Id): boolean;
    remove(entity: EntityId, component: Id): boolean;

    // Queries
    query<T extends unknown[]>(...components: { [K in keyof T]: Id<T[K]> }): Query<T>;

    // Groups
    createGroup(): Group;
    removeGroup(group: Group): void;
    getGroupsForEntity(entity: EntityId): Group[];
    getGroupsWithComponent(component: Id): Group[];

    // Snapshots
    snapshot(components?: Id[]): Snapshot | undefined;
    revert(snapshot: Snapshot): void;

    // Prefabs
    prefab(components: Array<[Id, unknown]>): Prefab;

    // Events
    onEntitySpawned: Event<[EntityId]>;
    onEntityDespawned: Event<[EntityId]>;
    onComponentAdded: Event<[EntityId, Id]>;
    onComponentRemoved: Event<[EntityId, Id]>;
    onEntityAddedToGroup: Event<[EntityId, Group]>;
    onEntityRemovedFromGroup: Event<[EntityId, Group]>;
}
```

### Query

```typescript
interface Query<T extends unknown[]> {
    with<U extends unknown[]>(...components: { [K in keyof U]: Id<U[K]> }): Query<[...T, ...U]>;
    without(...components: Id[]): Query<T>;
    each(callback: (entity: EntityId, ...components: T) => void): void;
    collect(): Array<[EntityId, ...T]>;
    map<U>(fn: (entry: [EntityId, ...T]) => U): U[];
    filter(fn: (entry: [EntityId, ...T]) => boolean): Array<[EntityId, ...T]>;
}
```

### Group

```typescript
interface Group {
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
```

### Event

```typescript
class Event<T extends unknown[] = []> {
    connect(callback: Callback<T>): IDisposable;
    fire(...args: T): this;
    wait(): Promise<T>;
    disconnectAll(): void;
    getConnectionCount(): number;
}
```

## Performance Considerations

- **Component Storage**: Components are stored in efficient Map structures for O(1) access
- **Query Optimization**: Queries iterate through entities once and check component availability
- **Memory Management**: Despawning entities automatically cleans up all associated data
- **Event System**: Events use lightweight callback storage with minimal overhead

## Examples

### Basic Game Loop

```typescript
import { createWorld, component } from "@rbxts/Virex";

const Position = component<{ x: number; y: number; z: number }>("Position");
const Velocity = component<{ x: number; y: number; z: number }>("Velocity");

const world = createWorld();

// Spawn some entities
for (let i = 0; i < 100; i++) {
    const entity = world.spawn();
    world.set(entity, Position, { x: math.random(-50, 50), y: 0, z: math.random(-50, 50) });
    world.set(entity, Velocity, { x: math.random(-5, 5), y: 0, z: math.random(-5, 5) });
}

// Game loop
game.GetService("RunService").Heartbeat.Connect((deltaTime) => {
    world.query(Position, Velocity).each((entity, position, velocity) => {
        position.x += velocity.x * deltaTime;
        position.y += velocity.y * deltaTime;
        position.z += velocity.z * deltaTime;
    });
});
```

### Enemy AI System

```typescript
const Health = component<number>("Health");
const Target = component<EntityId>("Target");
const Team = component<string>("Team");

// Find enemies and set targets
world.query(Team, Health).without(Target).each((enemy, team, health) => {
    if (team === "enemies" && health > 0) {
        // Find nearest player
        let nearestPlayer: EntityId | undefined;
        let nearestDistance = math.huge;

        world.query(Team, Health).each((entity, entityTeam, entityHealth) => {
            if (entityTeam === "players" && entityHealth > 0) {
                const distance = calculateDistance(enemy, entity);
                if (distance < nearestDistance) {
                    nearestDistance = distance;
                    nearestPlayer = entity;
                }
            }
        });

        if (nearestPlayer) {
            world.set(enemy, Target, nearestPlayer);
        }
    }
});
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the ISC License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Inspired by various ECS implementations in the game development community
- Built specifically for the Roblox TypeScript ecosystem
- Designed with performance and type safety in mind

---

*This documentation was generated with AI assistance*
