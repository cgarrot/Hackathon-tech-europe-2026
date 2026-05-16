# GameForge Web Input

Cette brique est independante des integrations Gradium et fal. Elle sert uniquement a recueillir l'intention de jeu en langage naturel via un bouton vocal simule, simuler la compilation OpenAI, puis afficher une premiere page de jeu genere.

## Lancer l'interface

Depuis la racine du repo:

```bash
python3 -m http.server 4173 --directory web/gameforge-input
```

Ouvrir:

```text
http://127.0.0.1:4173/index.html
```

## Parcours

1. L'utilisateur appuie sur le bouton micro.
2. La page simule une transcription STT.
3. La page affiche une simulation de pipeline:
   - structuration des regles;
   - preparation des personas;
   - plan des assets visuels;
   - assemblage du runtime.
4. Le prototype stocke temporairement la representation du jeu dans `sessionStorage`.
5. L'utilisateur est redirige vers `result.html`, qui represente la future page de jeu effectif.

## Fichiers

- `web/gameforge-input/index.html`: page d'input.
- `web/gameforge-input/result.html`: page de jeu genere.
- `web/gameforge-input/app.js`: orchestration UI, capture vocale simulee, progression et redirection.
- `web/gameforge-input/compiler-adapter.js`: adapter du Game Compiler. C'est le seul endroit a remplacer par l'appel OpenAI reel.
- `web/gameforge-input/result.js`: rendu de la page resultat.
- `web/gameforge-input/styles.css`: design responsive.

## Contrat d'integration

La page appelle:

```js
compileGameRequest({ transcript })
```

et attend un objet compatible avec le contrat ci-dessous. Ce contrat reste technique: il sert a alimenter l'interface finale, mais il ne doit pas etre presente a l'utilisateur comme le resultat produit. Le resultat utilisateur attendu est le jeu jouable, avec ses personnages, ses assets et son runtime.

```json
{
  "schemaVersion": "gameforge.web-input.v1",
  "title": "Les Ombres de Valbrume",
  "genre": "Deduction sociale",
  "prompt": "Demande originale de l'utilisateur",
  "language": "fr",
  "players": 8,
  "aiPlayers": 2,
  "roles": [
    {
      "id": "loup_garou",
      "name": "Loup-garou",
      "controller": "IA ou humain",
      "rule": "Elimine un villageois chaque nuit.",
      "palette": ["#263a33", "#8a3a47"]
    }
  ],
  "phases": ["Nuit", "Reveil", "Debat", "Vote"],
  "integrations": [
    {
      "name": "Gradium",
      "description": "STT joueur, TTS des IA et effets audio.",
      "ready": false
    }
  ]
}
```

`sessionStorage["gameforge:lastGame"]` sert uniquement au prototype pour transmettre cette representation de jeu a `result.html`.

## Remplacement futur

Trois points seront remplaces plus tard:

- la capture simulee dans `micButton.addEventListener(...)`, par Gradium STT;
- `compileGameRequest(...)`, par l'appel OpenAI reel;
- `sessionStorage`, par l'etat applicatif ou le routeur du runtime final si une app plus large absorbe cette page.

La reponse OpenAI doit retourner une representation equivalente du jeu. Cette representation alimente ensuite la page de jeu effective et les briques Gradium, fal et Pioneer.
