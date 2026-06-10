# Mineflayerbot

A simple hardcoded Minecraft bot built with Node.js, Mineflayer and mineflayer-pathfinder.

The bot can join a Minecraft LAN world or server, listen to chat commands, respond to public and private command inputs, and disconnect cleanly.

## Requirements

* Node.js 18 or newer
* npm
* Git
* Minecraft Java Edition
* Optional for LAN worlds: LAN World Plug-n-Play / mcwifipnp (fabric/forge)

Mineflayer requires Node.js 18 or newer.

## Quick Install

Run this in the folder where you want to download the project:

```bash
git clone https://github.com/itsflipper/Mineflayerbot.git Mineflayerbot && cd Mineflayerbot && npm install
```

This downloads the GitHub repository, enters the project folder, and installs the required Node.js dependencies.

## LAN World Dependency

For local Minecraft LAN worlds, the recommended mod is:

```txt
LAN World Plug-n-Play / mcwifipnp
```

This mod is useful for setting a fixed LAN port and adjusting LAN connection options.

When opening your Minecraft world to LAN, note the displayed port, for example:

```txt
Local game hosted on port 33303
```

The bot must use exactly that port in `config.json`.

## Configuration

Before starting the bot, add a new File `config.json`:

```json
{
  "bot": {
    "host": "localhost/IP",
    "port": 69676,
    "username": "BotName",
    "auth": "offline/online",
    "version": "1.21.11"
  }
}
```

Use this when the bot and Minecraft world run on the same PC:

```txt
127.0.0.1   /   localhost
```

Use Server-IP when the Minecraft world is hosted on a Server:

```txt
<Server_IP>
```

Important config fields:

```txt
host      - localhost / 127.0.0.1 for same-PC hosting, or the host device IP
port      - must match the Minecraft LAN/server port exactly
username  - bot name
auth      - usually "offline" for local LAN testing
version   - must match the Minecraft version supported by your Mineflayer setup                     (latest support: 1.21.11)
```

## Start Bot

```bash
npm start   /   node start.js
```

## Bot Interaction

The bot supports three command input styles.

### Public Chat Commands

Use `!` in normal chat:

```txt
!bye
```

### Local Private-Style Commands

Use `#` in normal chat:

```txt
#ping
```

This is useful for local LAN testing when normal `/msg` behavior is not available and behaves differently.

### Private Message Commands

On servers, use Minecraft private messages:

```txt
/msg [@BotName] pos
```

## Current Commands

```txt
ping  - Bot replies with Pong!
pos   - Bot returns its current position
bye   - Bot says goodbye and disconnects cleanly
```

## License

This project is licensed under the GNU General Public License v2.0.
