# GameForge Web Input

Cette brique est independante des integrations Gradium et fal. Elle sert a recueillir l'intention de jeu en langage naturel via un bouton vocal simule, occuper l'utilisateur pendant la generation, puis afficher une premiere page de jeu genere.

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

1. `index.html` detecte la langue du navigateur et affiche l'interface en francais ou en anglais.
2. L'utilisateur appuie sur le bouton micro.
3. La page simule une transcription STT.
4. L'utilisateur peut corriger la transcription dans une zone de texte.
5. `index.html` stocke la demande dans `sessionStorage` et redirige vers `prepare.html`.
6. `prepare.html` affiche une attente immersive generique en plein ecran:
   - transformation de la demande en promesse de partie;
   - rythme des regles;
   - intentions des personnages;
   - premiere image du monde;
   - placement des voix;
   - ouverture de la scene.
7. Une seule etape est affichee a la fois en grand, puis remplacee par la suivante.
8. Le prototype stocke temporairement la representation du jeu dans `sessionStorage`.
9. L'utilisateur est redirige vers `result.html`, qui represente la future page de jeu effectif.

## Fichiers

- `web/gameforge-input/index.html`: page d'input.
- `web/gameforge-input/prepare.html`: page d'attente immersive pendant la generation.
- `web/gameforge-input/result.html`: page de jeu genere.
- `web/gameforge-input/app.js`: capture vocale simulee, edition de transcription et redirection.
- `web/gameforge-input/prepare.js`: animation d'attente plein ecran et appel au Game Compiler.
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

`sessionStorage["gameforge:pendingPrompt"]` transmet la demande entre `index.html` et `prepare.html`.
`sessionStorage["gameforge:lastGame"]` sert uniquement au prototype pour transmettre cette representation de jeu a `result.html`.

## Remplacement futur

Trois points seront remplaces plus tard:

- la capture simulee dans `micButton.addEventListener(...)`, par Gradium STT;
- `compileGameRequest(...)`, par l'appel OpenAI reel;
- les etapes fictionnelles de `prepare.js`, par les evenements reels de generation si disponibles;
- `sessionStorage`, par l'etat applicatif ou le routeur du runtime final si une app plus large absorbe cette page.

La reponse OpenAI doit retourner une representation equivalente du jeu. Cette representation alimente ensuite la page de jeu effective et les briques Gradium, fal et Pioneer.
