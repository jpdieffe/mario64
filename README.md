# Mario 64 Together

Two-player Super Mario 64 co-op for the browser. Play at **https://jpdieffe.github.io/mario64/**.

Create an adventure, send its invite link or four-character code, and have your friend join. Both players run the native game with independent cameras and visible characters. Land on the other player's head to bounce; a crouching teammate gives a bigger boost. Friendly attacks do no damage. Each player has their own health. When either dies, including falling into a pit, both restart at the failed course's entrance with full health. Collected stars are retained.

## Controls and devices

On Android and iPhone, rotate sideways. Use the left analog stick, A to jump, B to punch/dive and Z to crouch/ground-pound. Camera arrows and Start are on screen. Tap Enable sound after loading. Expand uses fullscreen where supported; iPhone can use Add to Home Screen. Keep both tabs visible: mobile operating systems can suspend background games.

Keyboard: WASD moves, Z jumps, X punches, Shift crouches, Enter pauses, arrows move the camera, Q centers it, T opens chat. The engine also supports gamepads. Native settings are accessible through the pause menu.

This is a substantial native game: roughly 69 MB uncompressed on the first visit, plus runtime memory for assets. Recent phones work best. Mobile viewport/touch tests use Chromium device emulation; physical iPhone Safari and Android hardware performance need device testing.

## Network and saves

The host remains in charge of the session. PeerJS's public signaling service introduces the peers; game packets travel over WebRTC. Rooms are not advertised in the upstream public lobby. Codes are invitations, not authentication. Use them with friends.

Some carrier, corporate or symmetric-NAT networks require TURN. Both players can configure their own TURN URL and credentials under Connection options; these stay in that tab's session storage. No relay service or credentials are bundled. If a guest disconnects, they can rejoin the same code while the host remains open. When the host leaves, the session ends; there is no host migration.

The host's native save is stored in that browser's local storage. Use the game's normal save opportunities; stars are not cleared by team deaths. Clearing site data or private browsing can remove progress. A fresh browser starts with a normal empty save, not an unlocked/100% save.

## Run and check

Requires Node 22+. `npm ci`, then `npm start`; open http://localhost:4196/.

- `npm run check`: syntax and local entry-point assets.
- `npm test`: runs the actual Lua rules in Fengari to check shared death, duplicate/simultaneous requests, client/host authority and respawn timing; also validates room codes.
- `npm run test:browser`: installed Google Chrome required. Two native game instances communicate over real WebRTC with an in-process signaling fixture. Tests separate health, native head collision, deaths from either peer and a native pit death across different courses.
- `node tests/mobile.mjs`: Android/iPhone viewport emulation, actual touch stick/jump events, audio gesture and reachable controls.
- Set `PUBLIC_SIGNALING=1` to use real PeerJS signaling in the co-op browser test. Set `TEST_URL=https://jpdieffe.github.io/mario64/` to test the deployed build; `ROOM` can choose a fresh code.

Browser checks write screenshots into ignored `test-results/`. `?debug` enables the `/cooptest` developer chat commands in the required Lua mod for gameplay checks; normal game URLs do not enable them.

## Implementation and provenance

This is a browser build of SM64CoopDX, not an emulator or a ROM patch. The unchanged supplied US ROM (`SHA-1 9bef1128717f958171a4afac3ed78ee2bb4e86ce`) supplies the original assets at runtime. `site/mods/together.lua` contains the co-op rules. Native SM64CoopDX implements world synchronization, individual Mario states and solid player collision.

The web source snapshot is [zalo/sm64coopdx at 1277ec162448cbb8944100a8411ec6bb394c9d10](https://github.com/zalo/sm64coopdx/tree/1277ec162448cbb8944100a8411ec6bb394c9d10), branch `feature/emscripten-web-port`. The checked-in WASM is a downloaded upstream web artifact, not a locally compiled binary. Its exact hash and the repackaged JS/data hashes are in `site/engine-manifest.json`. The source snapshot identifies the inspected upstream source; it is not a reproducible-build attestation for that binary.

`scripts/fetch-engine.mjs` downloads upstream originals into `.build/` and rejects mismatched hashes. `python scripts/prepare-engine.py` repackages those files, removes optional mods/character packs (about 49 MB), disables public lobby calls, and wires in this project's shell. To compile a new engine, use the upstream snapshot's `build_web.sh` with Emscripten, then deliberately update the pins and repeat gameplay checks. Do not silently replace only the WASM.

GitHub Actions validates and publishes `site/` through GitHub Pages. Original game and assets © Nintendo; see `site/credits.html` and `site/THIRD_PARTY_NOTICES.txt` for upstream credits and bundled library notices.
