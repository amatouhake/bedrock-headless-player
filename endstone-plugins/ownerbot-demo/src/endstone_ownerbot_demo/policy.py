from __future__ import annotations

import re

BOT_NAME = re.compile(r"^OwnerBot(0[1-9]|10)$")
TELEPORT_TRIGGER = "bots tp"


def is_teleport_trigger(message: str) -> bool:
    return message.strip().casefold() == TELEPORT_TRIGGER


def bot_number(name: str) -> int | None:
    match = BOT_NAME.fullmatch(name)
    return int(match.group(1)) if match else None


def bot_names(names: list[str]) -> list[str]:
    return sorted((name for name in names if bot_number(name) is not None), key=bot_number)
