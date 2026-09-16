import { GameMode, system, world } from "@minecraft/server";
import { spawnSimulatedPlayer } from "@minecraft/server-gametest";

const bots = new Map();
const walking = new Map();
const namespace = "ownerbot";

function validBots() {
  for (const [name, bot] of bots) {
    if (!bot.isValid) {
      bots.delete(name);
      walking.delete(name);
    }
  }
  return [...bots.values()];
}

function number(value, label) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be a number`);
  return parsed;
}

function spawn(args) {
  const name = args.shift() || "LocalOwnerBot";
  if (validBots().some((bot) => bot.name === name)) {
    throw new Error(`player ${name} already exists`);
  }

  const dimension = world.getDimension("overworld");
  const worldSpawn = world.getDefaultSpawnLocation();
  if (args.length !== 0 && args.length !== 3) throw new Error("spawn syntax: ownerbot:spawn [name [x y z]]");
  const location = args.length === 0
    ? { x: worldSpawn.x + 0.5, y: 100, z: worldSpawn.z + 0.5 }
    : { x: number(args[0], "x"), y: number(args[1], "y"), z: number(args[2], "z") };

  const bot = spawnSimulatedPlayer({ dimension, ...location }, name, GameMode.survival);
  bots.set(name, bot);
  console.warn(`[OWNERBOT] spawned name=${bot.name} id=${bot.id} xuid=${bot.xuid || "<empty>"} at=${JSON.stringify(bot.location)}`);
}

function disconnect(args) {
  const name = args.shift();
  const selected = name ? validBots().filter((bot) => bot.name === name) : validBots();
  if (selected.length === 0) throw new Error(name ? `player ${name} is not active` : "no simulated players are active");
  for (const bot of selected) {
    const botName = bot.name;
    bot.disconnect();
    bots.delete(botName);
    walking.delete(botName);
    console.warn(`[OWNERBOT] disconnected name=${botName}`);
  }
}

function walk(args) {
  const [name, speedValue = "1"] = args;
  if (args.length < 1 || args.length > 2) throw new Error("walk syntax: ownerbot:walk <name> [speed]");
  const bot = validBots().find((candidate) => candidate.name === name);
  if (!bot) throw new Error(`player ${name} is not active`);
  const speed = number(speedValue, "speed");
  if (speed < 0 || speed > 1) throw new Error("speed must be between 0 and 1");
  walking.set(name, speed);
  console.warn(`[OWNERBOT] walking name=${name} speed=${speed} from=${JSON.stringify(bot.location)}`);
}

function stop(args) {
  const [name] = args;
  if (args.length !== 1) throw new Error("stop syntax: ownerbot:stop <name>");
  const bot = validBots().find((candidate) => candidate.name === name);
  if (!bot) throw new Error(`player ${name} is not active`);
  walking.delete(name);
  bot.stopMoving();
  console.warn(`[OWNERBOT] stopped name=${name} at=${JSON.stringify(bot.location)}`);
}

function teleport(args) {
  const [name, x, y, z] = args;
  if (args.length !== 4) throw new Error("teleport syntax: ownerbot:teleport <name> <x> <y> <z>");
  const bot = validBots().find((candidate) => candidate.name === name);
  if (!bot) throw new Error(`player ${name} is not active`);
  bot.teleport({ x: number(x, "x"), y: number(y, "y"), z: number(z, "z") });
  console.warn(`[OWNERBOT] teleported name=${name} at=${JSON.stringify(bot.location)}`);
}

function status() {
  const active = validBots().map((bot) => ({ name: bot.name, id: bot.id, location: bot.location }));
  console.warn(`[OWNERBOT] status count=${active.length} players=${JSON.stringify(active)}`);
}

system.afterEvents.scriptEventReceive.subscribe((event) => {
  const separator = event.id.indexOf(":");
  if (separator < 0 || event.id.slice(0, separator) !== namespace) return;
  const command = event.id.slice(separator + 1);
  const args = event.message.trim() ? event.message.trim().split(/\s+/) : [];
  system.run(() => {
    try {
      if (command === "spawn") spawn(args);
      else if (command === "disconnect") disconnect(args);
      else if (command === "teleport") teleport(args);
      else if (command === "walk") walk(args);
      else if (command === "stop") stop(args);
      else if (command === "status") status();
      else throw new Error(`unknown command ${event.id}`);
    } catch (error) {
      console.error(`[OWNERBOT] command=${event.id} rejected: ${error.message}`);
    }
  });
});

system.runInterval(() => {
  for (const [name, speed] of walking) {
    const bot = bots.get(name);
    if (!bot?.isValid) {
      walking.delete(name);
      bots.delete(name);
      continue;
    }
    bot.moveRelative(0, 1, speed);
  }
}, 1);

console.warn("[OWNERBOT] ready commands=spawn,disconnect,teleport,walk,stop,status");
