import time

from endstone.event import PlayerChatEvent, PlayerRespawnEvent, event_handler
from endstone.level import Location
from endstone.plugin import Plugin

from .policy import bot_number, is_teleport_trigger


class OwnerbotDemo(Plugin):
    api_version = "0.11"
    description = "OwnerBot video-demo chat controls"
    prefix = "OwnerbotDemo"

    def __init__(self) -> None:
        super().__init__()
        self._latest_target: tuple[object, float, float, float, float, float] | None = None
        self._latest_target_until = 0.0

    def on_enable(self) -> None:
        self.register_events(self)
        self.logger.info("Enabled exact chat trigger 'bots tp'; no commands or cheat settings are used")

    def _target(self) -> Location:
        source = self._latest_target
        if source is None:
            raise RuntimeError("teleport target is unavailable")
        dimension, x, y, z, pitch, yaw = source
        return Location(dimension, x, y, z, pitch, yaw)

    def _teleport_bot(self, player) -> bool:
        target = self._target()
        success = bool(player.teleport(target))
        self.logger.info(
            f"OwnerBot teleport name={player.name} success={success} "
            f"target=({target.x:.2f},{target.y:.2f},{target.z:.2f})"
        )
        return success

    @event_handler
    def on_player_chat(self, event: PlayerChatEvent) -> None:
        if not is_teleport_trigger(event.message):
            return
        if bot_number(event.player.name) is not None:
            return

        source = event.player.location
        self._latest_target = (
            source.dimension,
            source.x,
            source.y,
            source.z,
            source.pitch,
            source.yaw,
        )
        self._latest_target_until = time.monotonic() + 10.0

        connected = []
        succeeded = 0
        for player in self.server.online_players:
            number = bot_number(player.name)
            if number is None:
                continue
            connected.append((number, player))
        connected.sort(key=lambda item: item[0])

        for number, player in connected:
            if self._teleport_bot(player):
                succeeded += 1

        self.logger.info(
            f"bots tp requested by {event.player.name} at "
            f"({source.x:.2f},{source.y:.2f},{source.z:.2f}); "
            f"teleported {succeeded}/{len(connected)} connected OwnerBots"
        )
        event.player.send_message(f"{succeeded}/{len(connected)} OwnerBots arrived.")

    @event_handler
    def on_player_respawn(self, event: PlayerRespawnEvent) -> None:
        number = bot_number(event.player.name)
        if number is None or self._latest_target is None:
            return
        if time.monotonic() > self._latest_target_until:
            return

        # The respawn event fires while BDS is still settling the player. Run on
        # the next server tick so a bot that died during the chat trigger joins
        # the same ring after its normal client-driven respawn completes.
        self.server.scheduler.run_task(
            self,
            lambda player=event.player: self._teleport_bot(player),
            delay=1,
        )
