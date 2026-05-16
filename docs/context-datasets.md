# GameForge Context Datasets

Ces datasets sont des graines de contexte pour aider les briques IA a rester coherentes quand GameForge genere un jeu. Ils ne remplacent pas le Game Compiler OpenAI, Pioneer ou fal: ils leur donnent des exemples de ton, de structure et d'univers.

Les listes sont volontairement courtes, autour de dix entrees chacune, pour rester faciles a relire et a corriger a la main pendant le hackathon.

## Fichiers

- `data/context/ai_player_lines.jsonl`: repliques et intentions de personnages IA, en francais et en anglais.
- `data/context/visual_asset_prompts.jsonl`: prompts d'assets visuels en francais et en anglais pour fal ou tout generateur d'images.

Chaque ligne est un objet JSON autonome. Le format JSONL permet d'ajouter des exemples sans modifier une grosse structure globale.

## Repliques IA

Champs principaux:

- `game_family`: famille de jeu (`werewolf`, `mystery_mansion`, `survival_island`, etc.).
- `role_archetype`: role ou persona generique.
- `phase`: moment de jeu ou la replique est utile.
- `intent`: fonction de la replique pour le runtime ou Pioneer.
- `emotion` et `delivery`: indications exploitables par Gradium TTS.
- `text`: replique directement utilisable ou exemple few-shot, avec des marqueurs humains comme humour, ironie, colere, fatigue ou hesitation.
- `tags`: filtres rapides pour OpenAI/Pioneer.

Utilisation typique:

1. OpenAI selectionne les lignes proches du jeu demande.
2. Pioneer les utilise comme exemples de style et de strategie pour les personas.
3. Gradium peut lire `emotion` et `delivery` pour choisir une intonation.

## Prompts visuels

Champs principaux:

- `asset_type`: `background`, `role_card`, `action_illustration`, `state_illustration`, `item_card`.
- `title`: nom humain de l'asset attendu.
- `prompt`: prompt pret a envoyer a fal.
- `negative_prompt`: garde-fous visuels.
- `aspect_ratio`: cadrage cible.
- `mood` et `tags`: selection par ambiance et usage.

Les prompts melangent francais et anglais. Pour la production, l'orchestrateur pourra traduire ou normaliser vers la langue qui donne les meilleurs resultats avec le modele d'image choisi.

## Regle produit importante

Ces datasets decrivent des ingredients internes. Le resultat final pour l'utilisateur n'est pas une liste, un schema ou un prompt: c'est une page de jeu effective, avec personnages, assets, voix et runtime.
