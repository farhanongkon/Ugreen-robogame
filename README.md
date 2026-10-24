# UGREEN ZIG ZAG

An endless zig-zag arcade runner starring a UGREEN-style robot charger.
Tap to change direction, stay on the path, grab the green power bolts, and chase the high score.

## Play

Open `index.html` in any modern browser. No build step and no dependencies, and it works offline.

Controls:

- Tap / click anywhere, or press Space (or Up / Enter) to change direction
- P or Esc, or the pause button, to pause
- The speaker button mutes sound

Your best score is saved in the browser (localStorage).

## Files

| File | What it is |
| --- | --- |
| `index.html` | Page markup: HUD, start, pause and game-over screens |
| `style.css` | Look and feel (dark theme, green accent) |
| `game.js` | All game logic: path generation, movement, collisions, scoring, sound |
| `ugreen-robot-charger.png` | The player character (transparent PNG, swap in any image) |

## Tweaking

In `game.js`:

- `LEVELS`: difficulty names and the scores where they start
- `speed = 2.6 + ramp * 2.0`: start and top speed
- `hh = 62 - ramp * 22`: path half-width, which shrinks as you score
- `bonus += 5`: points per power bolt

In `style.css`, change `--green` to re-theme the game.

## Publish on GitHub Pages

Push the folder to a repo, then in Settings > Pages choose the branch and root folder.
