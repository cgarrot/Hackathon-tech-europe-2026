# GameForge Visual Runtime

La brique visuelle est independante de la brique voix. Le reste de GameForge peut importer `gameforge_visuals` pour les contrats et `gameforge_fal` pour le provider fal.

Cette version genere uniquement des images statiques. Elle n'appelle aucun modele video.

## Installation

```bash
uv pip install .
```

Configure la cle fal:

```bash
export FAL_KEY="your-fal-key-here"
```

Ou ajoute-la dans `.env`.

## Test de base: text-to-image

```bash
gameforge-visuals image \
  --prompt "A medieval village square at night, torches flickering, anxious villagers gathering to vote, cinematic fantasy concept art." \
  --image-size landscape_16_9 \
  --num-images 1 \
  --output-dir artifacts/fal/village
```

Autres formats utiles:

```bash
gameforge-visuals image \
  --prompt "A mysterious fortune teller portrait, candlelight, detailed fantasy character art." \
  --image-size portrait_4_3 \
  --format png \
  --output-dir artifacts/fal/characters
```

## Cartes Loup-garou

Pour tester le cas produit le plus concret, la CLI peut generer des cartes de role coherentes:

```bash
gameforge-visuals werewolf-cards \
  --roles werewolf villager seer witch \
  --output-dir artifacts/fal/werewolf-cards \
  --image-size portrait_4_3 \
  --seed 42
```

Aliases francais acceptes:

```bash
gameforge-visuals werewolf-cards \
  --roles loup-garou villageois voyante sorciere \
  --output-dir artifacts/fal/werewolf-cards-fr
```

Roles disponibles:

- `werewolf` / `loup-garou`
- `villager` / `villageois`
- `seer` / `voyante`
- `witch` / `sorciere`
- `hunter` / `chasseur`
- `cupid` / `cupidon`

La commande ecrit aussi un `manifest.json` avec les URLs, chemins locaux, noms de role et prompts utilises.

## Contrat Python minimal

```python
from pathlib import Path

from gameforge_fal import FalVisualGateway
from gameforge_visuals import ImageGenerationRequest

gateway = FalVisualGateway()

result = await gateway.generate_image(
    ImageGenerationRequest(
        prompt="A medieval village square at night.",
        image_size="landscape_16_9",
        num_images=1,
    ),
    output_dir=Path("artifacts/fal/village"),
)

print(result.asset.url)
print(result.asset.local_path)
```

## Contrat runtime pour les autres briques

Le reste de GameForge devrait utiliser `VisualRuntime` plutot que `FalVisualGateway` directement.

```python
from gameforge_visuals import VisualRuntime

visuals = VisualRuntime.from_game_schema(
    game_schema,
    provider="fal",
    output_dir="artifacts/fal/generated",
)

await visuals.start()
try:
    results = await visuals.generate_from_game_schema(game_schema)
finally:
    await visuals.stop()
```

Pendant l'integration OpenAI/Pioneer/UI, on peut utiliser le provider mock:

```python
visuals = VisualRuntime.from_game_schema(
    game_schema,
    provider="mock",
    output_dir="artifacts/mock/visuals",
)
```

Le mock ecrit des fichiers JSON et un manifest sans appeler fal.

CLI equivalente:

```bash
gameforge-visuals from-schema \
  --schema examples/game_schema_visuals.json \
  --provider mock \
  --output-dir artifacts/mock/visuals
```

Avec fal:

```bash
gameforge-visuals from-schema \
  --schema examples/game_schema_visuals.json \
  --provider fal \
  --output-dir artifacts/fal/generated
```

## Schema attendu

OpenAI peut produire une section `visuals.assets` explicite:

```json
{
  "visuals": {
    "assets": [
      {
        "asset_id": "village_square",
        "asset_type": "location",
        "prompt": "A medieval village square at night, torches flickering, anxious villagers gathering to vote, cinematic fantasy concept art, no text",
        "image_size": "landscape_16_9",
        "metadata": {
          "phase": "day_vote"
        }
      },
      {
        "asset_id": "seer_card",
        "asset_type": "role_card",
        "prompt": "Role card illustration for the Seer, mysterious fortune teller with tarot cards and a glowing crystal, ornate frame, no text",
        "image_size": "portrait_4_3",
        "metadata": {
          "role_id": "seer"
        }
      }
    ]
  }
}
```

Types d'assets actuels:

- `location`
- `character`
- `role_card`
- `ambience`
- `item`
- `ui`

Si `visuals.assets` est absent, le runtime sait aussi deriver des specs simples depuis `locations`, `characters` et `roles`.

## Parametres exposes

- `prompt`: description de l'image.
- `image_size`: `square_hd`, `square`, `portrait_4_3`, `portrait_16_9`, `landscape_4_3`, `landscape_16_9`.
- `num_images`: nombre d'images, limite locale 1 a 4.
- `num_inference_steps`: nombre d'etapes FLUX, 1 a 12.
- `output_format`: `jpeg` ou `png`.
- `seed`: reproductibilite approximative.
- `enable_safety_checker`: active le safety checker fal.

## Place dans GameForge

OpenAI produit le `game_schema`. fal consomme ensuite les scenes, personnages et evenements visuels pour generer:

- lieux: village, manoir, ile, bateau;
- portraits: personnages IA, suspects, roles;
- cartes: role, objet, indice;
- ambiances: nuit, vote, attaque, victoire.

La brique expose actuellement `fal-ai/flux/schnell` pour valider un flux image rapide et peu couteux. On pourra ensuite ajouter d'autres providers ou modeles image derriere le meme contrat.
