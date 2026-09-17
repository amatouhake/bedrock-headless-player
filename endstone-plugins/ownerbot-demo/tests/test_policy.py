import pathlib
import sys
import unittest

SOURCE = pathlib.Path(__file__).parents[1] / "src"
sys.path.insert(0, str(SOURCE))

from endstone_ownerbot_demo.policy import bot_names, bot_number, is_teleport_trigger


class PolicyTests(unittest.TestCase):
    def test_trigger_is_trimmed_case_insensitive_and_exact(self):
        for value in ("bots tp", " BOTS TP ", "Bots Tp\n"):
            self.assertTrue(is_teleport_trigger(value))
        for value in ("bots", "bots tp now", "OwnerBot01: bots tp", ""):
            self.assertFalse(is_teleport_trigger(value))

    def test_only_the_ten_demo_bot_names_match(self):
        self.assertEqual(bot_number("OwnerBot01"), 1)
        self.assertEqual(bot_number("OwnerBot10"), 10)
        for value in ("OwnerBot00", "OwnerBot11", "OwnerBot1", "ownerbot01", "DemoDirector"):
            self.assertIsNone(bot_number(value))
        self.assertEqual(
            bot_names(["OwnerBot10", "Human", "OwnerBot02", "OwnerBot01"]),
            ["OwnerBot01", "OwnerBot02", "OwnerBot10"],
        )

if __name__ == "__main__":
    unittest.main()
