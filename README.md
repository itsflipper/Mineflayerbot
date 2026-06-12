# Mineflayerbot

A small hardcoded Minecraft bot built with Node.js, Mineflayer and mineflayer-pathfinder.

The bot can join a LAN world or server, react to chat commands, move with pathfinder, register protected base areas, show its inventory and run a few simple survival tasks. It is not an AI planner, combat bot or full base-management system.

## Requirements

- Node.js 18 or newer
- npm
- Git
- Minecraft Java Edition
- Optional for LAN worlds: LAN World Plug-n-Play / mcwifipnp (Fabric/Forge)

Project dependencies:

- mineflayer
- mineflayer-pathfinder
- minecraft-data
- vec3

## Quick Install

Run this in the folder where you want to download the project:

```bash
git clone https://github.com/itsflipper/Mineflayerbot.git Mineflayerbot && cd Mineflayerbot && npm install
```

This downloads the repository, enters the project folder and installs the required Node.js dependencies.

## LAN World Dependency

For local Minecraft LAN worlds, the recommended mod is:

```txt
LAN World Plug-n-Play / mcwifipnp
```

This is useful for setting a fixed LAN port and adjusting LAN connection options.

## Configuration

There are two simple setup options:

1. Rename `config.example.json` to `config.json`, then edit `config.json`.
2. Start the bot once, let it create `config.json`, then edit the created file.

Editable config fields:

```txt
bot.host      - localhost / 127.0.0.1 for same-PC hosting, or the server IP
bot.port      - Minecraft LAN/server port
bot.username  - bot name
bot.auth      - usually "offline" for local LAN testing, "online" for online auth
bot.version   - Minecraft version used by Mineflayer
autoStart     - false by default; true allows startup recovery/basic task behavior
```

## Start Bot

```bash
npm start
```

or:

```bash
node start.js
```

## Command Input

Public chat command:

```txt
!ping
```

Local private-style command:

```txt
#ping
```

Server private message:

```txt
/msg <BotName> ping
```

## Commands

```txt
help / commands / h
  Lists all available commands.

ping
  Replies with Pong!

pos / position
  Shows the bot's current position.

bye / exit / quit / leave
  Disconnects the bot.

inventory / inv
  Shows the bot's inventory.

goto / g <player|baseName|x y z>
  Goes near a player, registered base or coordinate position.

togglefollow / tf
  Toggles follow mode for the command sender.

registerbase / rb start [player|x y z]
  Starts base registration at the first corner.

registerbase / rb end [player|x y z]
  Finishes base registration at the opposite corner and asks for a name.

registerbase / rb cancel
  Cancels the current base registration.

registerbase / rb list
  Lists registered protected bases.

registerbase / rb remove <name>
registerbase / rb delete <name>
registerbase / rb del <name>
  Removes a registered protected base.

task / t recoverdeathitems
  Tries to return to the last death position and collect dropped items.

task / t craftplacecraftingtable
  Collects wood if needed, crafts planks, crafts a crafting table and places it nearby.

task / t woodentools
  Creates basic wooden tools while keeping tool materials from one compatible wood package.
```

## Current Limits

- No natural-language planning.
- No LLM or neural-network control yet.
- No advanced combat behavior.
- No full mining, farming or storage automation.
- Base protection only applies to registered base areas known by the bot.
- The bot only runs the hardcoded commands and tasks listed above.

## License

This project is licensed under the GNU General Public License v2.0.