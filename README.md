# GameForge Integrations

Prototypes d'integration independants pour GameForge:

- `gameforge_voice` / `gameforge_gradium`: STT/TTS avec Gradium.
- `gameforge_visuals` / `gameforge_fal`: generation d'images avec fal.

## Voice: Gradium

Prototype minimal pour tester la couche voix avec Gradium:

- TTS: generer un fichier audio WAV a partir d'une replique de jeu.
- STT: transcrire un fichier audio existant.
- Demo: produire quelques voix de personnages pour valider le pipeline.

## Installation

Le SDK Gradium demande Python 3.10 ou plus. Sur cette machine, `python3` peut etre trop ancien, donc `uv` est le chemin le plus simple:

```bash
uv python install 3.12
uv venv --python 3.12
source .venv/bin/activate
uv pip install .
```

Pour contribuer et lancer les tests:

```bash
uv pip install ".[dev]"
pytest
```

Configure la cle API:

```bash
cp .env.example .env
export GRADIUM_API_KEY="gd_your_api_key_here"
```

Tu peux aussi regler la langue et les voix par defaut:

```bash
GRADIUM_LANGUAGE=fr
GRADIUM_FR_VOICE_ID=b35yykvVppLXyw_l
GRADIUM_EN_VOICE_ID=YTpq7expH9539ERJ
```

Par defaut, le PoC utilise `fr` avec une voix francaise Gradium. L'ancien ID `YTpq7expH9539ERJ` correspond a Emma, une voix anglaise US, donc elle produit naturellement un accent anglais sur du texte francais.

## Tests rapides

Generer une replique:

```bash
gameforge-voice tts \
  --text "La nuit tombe sur le village. Les loups ouvrent les yeux." \
  --language fr \
  --output artifacts/night.wav
```

Transcrire un fichier:

```bash
gameforge-voice stt --input artifacts/night.wav --format wav --language fr
```

Generer une mini scene GameForge:

```bash
gameforge-voice demo --language fr --output-dir artifacts/demo-fr
gameforge-voice demo --language en --output-dir artifacts/demo-en
```

Tester la sortie vocale en streaming vers les haut-parleurs:

```bash
gameforge-voice play \
  --language fr \
  --text "Bienvenue dans GameForge. La session vocale commence maintenant."
```

Tester une session joueur contre IA scenarisees:

```bash
gameforge-voice live-chat --turns 3 --language fr
gameforge-voice live-chat --turns 3 --language en
```

Le mode `live-chat` fonctionne en push-to-talk:

1. Appuie sur Entree pour commencer un tour.
2. Parle au micro.
3. Appuie de nouveau sur Entree pour envoyer.
4. Gradium transcrit, puis les IA repondent en TTS streaming.

Au premier lancement, macOS peut demander l'autorisation d'utiliser le micro pour le terminal.

## Notes d'integration

- Les autres briques GameForge doivent importer `gameforge_voice.VoiceRuntime`.
- `gameforge_gradium` reste la couche CLI/Gradium de bas niveau.
- Le live reste en push-to-talk pour eviter les boucles micro/haut-parleur.
- `provider="mock"` permet de tester OpenAI, Pioneer et fal sans micro ni cle Gradium.
- `provider="gradium"` utilise `client.stt_realtime(...)` pour le micro et `client.tts_stream(...)` pour la sortie haut-parleur.

Exemple d'integration:

```python
from gameforge_voice import VoiceRuntime

voice = VoiceRuntime.from_game_schema(game_schema, provider="gradium")

await voice.start()
try:
    player = await voice.listen_player_turn("human_1")
    await voice.speak_ai("seer", "J'ai vu une ombre pres du puits.")
finally:
    await voice.stop()
```

Voir aussi:

- [docs/voice-runtime.md](docs/voice-runtime.md)
- [examples/voice_runtime_mock.py](examples/voice_runtime_mock.py)

Docs Gradium utiles:

- [Documentation index](https://docs.gradium.ai/llms.txt)
- [Text-to-Speech](https://docs.gradium.ai/guides/text-to-speech)
- [Speech-to-Text](https://docs.gradium.ai/guides/speech-to-text)

## Visuals: fal

Prototype minimal pour tester la generation d'images avec fal.

Configure la cle:

```bash
export FAL_KEY="your-fal-key-here"
```

```bash
gameforge-visuals image \
  --prompt "A medieval village square at night, torches flickering, anxious villagers gathering to vote, cinematic fantasy concept art." \
  --image-size landscape_16_9 \
  --num-images 1 \
  --output-dir artifacts/fal/village
```

Generer des cartes de role Loup-garou:

```bash
gameforge-visuals werewolf-cards \
  --roles loup-garou villageois voyante sorciere \
  --output-dir artifacts/fal/werewolf-cards-fr \
  --image-size portrait_4_3
```

Generer les assets depuis un schema OpenAI/GameForge:

```bash
gameforge-visuals from-schema \
  --schema examples/game_schema_visuals.json \
  --provider mock \
  --output-dir artifacts/mock/visuals
```

Voir aussi:

- [docs/visual-runtime.md](docs/visual-runtime.md)
- [Flux Schnell API](https://fal.ai/docs/model-api-reference/image-generation-api/flux-schnell)
