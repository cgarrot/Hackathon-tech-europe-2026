from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Iterable


@dataclass(frozen=True)
class WerewolfCardSpec:
    role_id: str
    display_name_fr: str
    display_name_en: str
    prompt: str


WEREWOLF_CARD_SPECS: Dict[str, WerewolfCardSpec] = {
    "werewolf": WerewolfCardSpec(
        role_id="werewolf",
        display_name_fr="Loup-garou",
        display_name_en="Werewolf",
        prompt=(
            "role card illustration for a social deduction board game, the Werewolf, "
            "a cunning humanoid wolf hidden under a torn medieval cloak, moonlit forest behind him, "
            "dramatic rim light, dark fantasy, painterly concept art, ornate card frame, no text"
        ),
    ),
    "villager": WerewolfCardSpec(
        role_id="villager",
        display_name_fr="Villageois",
        display_name_en="Villager",
        prompt=(
            "role card illustration for a social deduction board game, the Villager, "
            "a worried medieval villager holding a lantern in a misty village square, "
            "warm torchlight, grounded human expression, painterly fantasy concept art, ornate card frame, no text"
        ),
    ),
    "seer": WerewolfCardSpec(
        role_id="seer",
        display_name_fr="Voyante",
        display_name_en="Seer",
        prompt=(
            "role card illustration for a social deduction board game, the Seer, "
            "a mysterious fortune teller with tarot cards and a glowing crystal, candlelit medieval room, "
            "enigmatic expression, violet and gold accents, painterly fantasy concept art, ornate card frame, no text"
        ),
    ),
    "witch": WerewolfCardSpec(
        role_id="witch",
        display_name_fr="Sorciere",
        display_name_en="Witch",
        prompt=(
            "role card illustration for a social deduction board game, the Witch, "
            "an herbalist sorceress holding two potion vials, one healing blue and one poison green, "
            "old wooden shelves, moonlit window, painterly fantasy concept art, ornate card frame, no text"
        ),
    ),
    "hunter": WerewolfCardSpec(
        role_id="hunter",
        display_name_fr="Chasseur",
        display_name_en="Hunter",
        prompt=(
            "role card illustration for a social deduction board game, the Hunter, "
            "a stern medieval hunter with a crossbow and wolf pelt cloak, standing at the forest edge, "
            "tense heroic pose, painterly fantasy concept art, ornate card frame, no text"
        ),
    ),
    "cupid": WerewolfCardSpec(
        role_id="cupid",
        display_name_fr="Cupidon",
        display_name_en="Cupid",
        prompt=(
            "role card illustration for a social deduction board game, Cupid, "
            "a mischievous medieval matchmaker with a small bow and red ribbon charms, candlelit village festival, "
            "romantic yet suspicious mood, painterly fantasy concept art, ornate card frame, no text"
        ),
    ),
}


DEFAULT_WEREWOLF_ROLES = ["werewolf", "villager", "seer", "witch"]


def get_werewolf_card_specs(role_ids: Iterable[str]) -> list[WerewolfCardSpec]:
    specs = []
    for role_id in role_ids:
        normalized = role_id.strip().lower().replace("_", "-")
        normalized = normalized.replace("loup-garou", "werewolf")
        normalized = normalized.replace("loup", "werewolf")
        normalized = normalized.replace("villageois", "villager")
        normalized = normalized.replace("voyante", "seer")
        normalized = normalized.replace("sorciere", "witch")
        normalized = normalized.replace("sorcière", "witch")
        normalized = normalized.replace("chasseur", "hunter")
        normalized = normalized.replace("cupidon", "cupid")
        normalized = normalized.replace("-", "_")
        if normalized not in WEREWOLF_CARD_SPECS:
            known = ", ".join(sorted(WEREWOLF_CARD_SPECS))
            raise ValueError(f"Unknown werewolf role `{role_id}`. Known roles: {known}.")
        specs.append(WEREWOLF_CARD_SPECS[normalized])
    return specs
