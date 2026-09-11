# Sight Reading Trainer

## <https://sightreading.training>

![test](https://github.com/leafo/sightreading.training/workflows/test/badge.svg)

[![Twitch Link](http://leafo.net/dump/twitch-banner.svg)](https://www.twitch.tv/moonscript)

A tool for practicing sight reading, learning songs, and training other musical skills in your browser. The successor to <https://github.com/leafo/mursic>.

Learn more on [the guide](https://sightreading.training/about).

![screenshot](http://leafo.net/shotsnb/2016-05-14_16-30-55.png)

## Frontend development

The frontend is a React app that can be developed without the backend (Lua,
PostgreSQL, tup). All you need is Node:

```bash
npm install
npm run dev
```

Then open <http://localhost:3000/>. The dev server bundles with esbuild,
watches for changes, and reloads the page automatically. Backend-only features
(login, stats, the play-along song library) will not function in this mode;
everything else works, including MIDI input and output.

To generate a CSV table of every Note Math interval calculation for review:

```bash
npm run --silent note_math_csv > note-math.csv
```

## Remote development with GitHub Codespaces

To test a pull-request branch without installing anything locally:

1. Open the pull request on GitHub, select **Code**, then **Codespaces**, and
   create a codespace on the pull-request branch.
2. Wait for the container setup to finish. Dependencies are installed
   automatically.
3. Run `npm run dev` in the Codespaces terminal.
4. When Codespaces forwards port 3000, select **Open in Browser**. If the
   notification is missed, open the **Ports** panel and use the globe icon next
   to **Sight Reading Trainer**.
5. Visit `/flash-cards/note-math` on the forwarded HTTPS URL.

The forwarded site runs in the codespace; only the browser is local. The
frontend-only limitations below still apply.

The full site build (backend + minified production assets) uses the
[tup](https://gittup.org/tup/) build system, see the Tupfiles in the repo.

