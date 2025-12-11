# bJecs (bootlegJecs)

A lightweight **Entity Component System (ECS)** for [roblox-ts](https://roblox-ts.com), designed to be simple, fast, and flexible.  
Built by Spirast ✨

---

## 📦 Installation

```sh
npm install @rbxts/bjecs
```

---

## 🧩 Features

- Lightweight ECS implementation for Roblox
- Entity lifecycle management (`spawn`, `despawn`, `valid`)
- Component registry with type safety
- Query system (`with`, `without`, `each`, `collect`, `map`, `filter`)
- Snapshots & state reversion
- Event system for entity/component changes

---

## 🚀 Quick Start

```ts
import { createWorld, component } from "@rbxts/bjecs";

// Create a new world
const world = createWorld();

// Define your own component
const Health = component<number>("health");

// Spawn an entity
const enemy = world.spawn();

// Add a component
world.set(enemy, Health, 100);

// Query entities with Health
world.query(Health).each((entity, health) => {
    print(`Entity ${entity} has ${health} HP`);
});
```

---

## 📚 API Overview

### World
- `spawn(): EntityId` – create a new entity  
- `despawn(entity: EntityId): boolean` – remove an entity  
- `set<T>(entity, component, value)` – attach/update a component  
- `get<T>(entity, component): T | undefined` – retrieve a component  
- `remove(entity, component): boolean` – remove a component  
- `query(...components): Query<T>` – build queries  
- `snapshot(): Snapshot` – capture world state  
- `revert(snapshot: Snapshot)` – restore world state  

### Query
- `with(...components)` – require additional components  
- `without(...components)` – exclude components  
- `each(callback)` – iterate over matching entities  
- `collect()` – return array of `[EntityId, ...components]`  
- `map(fn)` – transform query results  
- `filter(fn)` – filter query results  

### Events
- `onEntitySpawned`  
- `onEntityDespawned`  
- `onComponentAdded`  
- `onComponentRemoved`  

---

## 🧪 Example: Custom Component System

```ts
import { createWorld, component } from "@rbxts/bjecs";

const world = createWorld();

// Define components
const Position = component<{ x: number; y: number; z: number }>("position");
const Velocity = component<{ x: number; y: number; z: number }>("velocity");

const player = world.spawn();
world.set(player, Position, { x: 0, y: 0, z: 0 });
world.set(player, Velocity, { x: 1, y: 0, z: 0 });

world.query(Position, Velocity).each((entity, pos, vel) => {
    print(`Entity ${entity} at (${pos.x}, ${pos.y}, ${pos.z}) moving (${vel.x}, ${vel.y}, ${vel.z})`);
});
```

---

## 🤝 Contributing

Contributions are welcome!  
- Fork the repo  
- Create a feature branch  
- Submit a PR  

Feel free to add new systems, utilities, or improve docs.  

---

## 📄 License

MIT License © 2025 [@spirast](https://github.com/spirast)

---

## ⭐ Support

If you like this project, consider giving it a star on GitHub!  
