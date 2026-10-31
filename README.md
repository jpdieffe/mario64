# Mario 64 Together

Three-player Super Mario 64 co-op for the browser. Play at **https://jpdieffe.github.io/mario64/**.

Create an adventure, send its invite link or four-character code, and have two friends join. All players run the native game with independent cameras and visible characters. Land on a teammate's head to bounce; a crouching teammate gives a bigger boost. Friendly attacks do no damage. Each player has their own health. When anyone dies, including falling into a pit, everyone restarts at the failed course's entrance with full health. Collected stars are retained.

The host is Mario, the first guest is Luigi, and the second guest is Yoshi, using the native global player slots. A fourth connection is rejected. One or two players can still play. Rejoining takes an available guest slot; character identity is slot-based, not an account reservation. The v2 room namespace keeps older two-player clients out of these sessions.

Yoshi uses the bundled animated Coop Team model. Press B (keyboard X) for a visible extending tongue. A regular or tiny Goomba in front of Yoshi, within reach and unobstructed, can be swallowed to charge one fireball. Press B again to spit; hold Z (Shift) while pressing B for a spinning three-fireball spread. Fireballs use native attack reactions on Goombas, Bob-ombs and Piranha Plants; teammates cannot be hurt. Bosses, large Goombas and NPCs cannot be swallowed. Eating/projectile hits are sent through the engine's native object synchronization. Ammo clears on course changes and team restarts. Carrying, swimming and nearby NPC/grab interactions retain their normal B behavior.

## Controls and devices

On Android and iPhone, rotate sideways. Use the left analog stick, A to jump, B to punch/dive and Z to crouch/ground-pound. Camera arrows and Start are on screen. Tap Enable sound after loading. Expand uses fullscreen where supported; iPhone can use Add to Home Screen. Keep all tabs visible: mobile operating systems can suspend background games.

Keyboard: WASD moves, Z jumps, X punches, Shift crouches, Enter pauses, arrows move the camera, Q centers it, T opens chat. The engine also supports gamepads. Native settings are accessible through the pause menu.

This is a substantial native game: roughly 69 MB uncompressed on the first visit, plus runtime memory for assets. Recent phones work best. Mobile viewport/touch tests use Chromium device emulation; physical iPhone Safari and Android hardware performance need device testing.

## Network and saves

The host remains in charge of the session. PeerJS's public signaling service introduces the peers; game packets travel over WebRTC. Rooms are not advertised in the upstream public lobby. Codes are invitations, not authentication. Use them with friends.

Some carrier, corporate or symmetric-NAT networks require TURN. All players can configure their own TURN URL and credentials under Connection options; these stay in that tab's session storage. No relay service or credentials are bundled. If a guest disconnects, they can rejoin the same code while the host remains open. The WebRTC close event enters the pinned engine as its native leaving packet, clearing player, reliable-packet and ordered-packet state before the slot is reused. Replacement transports wait for that cleanup, preventing stale rosters from reaching an unjoined player. When the host leaves, the session ends; there is no host migration.

The host's native save is stored in that browser's local storage. Use the game's normal save opportunities; stars are not cleared by team deaths. Clearing site data or private browsing can remove progress. A fresh browser starts with a normal empty save, not an unlocked/100% save.

## Run and check

Requires Node 22+. `npm ci`, then `npm start`; open http://localhost:4196/.

- `npm run check`: syntax and local entry-point assets.
- `npm test`: runs the actual Lua rules in Fengari to check shared death, duplicate/simultaneous requests, client/host authority and respawn timing; also validates room codes.
- `npm run test:browser`: installed Google Chrome required. Three native game instances communicate over real WebRTC with an in-process signaling fixture. Tests Yoshi rendering on all clients, shared swallowing and fireball kills, fourth-player rejection, guest rejoin, separate health, native head collision, deaths from every player and a native pit death across different courses.
- `node tests/mobile.mjs`: Android/iPhone viewport emulation, actual touch stick/jump events, audio gesture and reachable controls.
- Set `PUBLIC_SIGNALING=1` to use real PeerJS signaling in the co-op browser test. Set `TEST_URL=https://jpdieffe.github.io/mario64/` to test the deployed build; `ROOM` can choose a fresh code.

Browser checks write screenshots into ignored `test-results/`. `?debug` enables the `/cooptest` developer chat commands in the required Lua mod for gameplay checks; normal game URLs do not enable them.

## Implementation and provenance

This is a browser build of SM64CoopDX, not an emulator or a ROM patch. The unchanged supplied US ROM (`SHA-1 9bef1128717f958171a4afac3ed78ee2bb4e86ce`) supplies the original assets at runtime. `site/mods/together.lua` contains the co-op rules. Native SM64CoopDX implements world synchronization, individual Mario states and solid player collision.

The web source snapshot is [zalo/sm64coopdx at 1277ec162448cbb8944100a8411ec6bb394c9d10](https://github.com/zalo/sm64coopdx/tree/1277ec162448cbb8944100a8411ec6bb394c9d10), branch `feature/emscripten-web-port`. The checked-in WASM is a downloaded upstream web artifact, not a locally compiled binary. Its exact hash and the repackaged JS/data hashes are in `site/engine-manifest.json`. The source snapshot identifies the inspected upstream source; it is not a reproducible-build attestation for that binary.

`scripts/fetch-engine.mjs` downloads upstream originals into `.build/` and rejects mismatched hashes. `python scripts/prepare-engine.py` repackages those files, removes optional mods/character packs (about 49 MB), disables public lobby calls, and wires in this project's shell. It extracts only the 43 KB playable Yoshi mesh to `site/mods/assets/`; `python scripts/build-tongue.py` reproduces the original 3D tongue mesh. Both load in the directory mod alongside the Lua rules. To compile a new engine, use the upstream snapshot's `build_web.sh` with Emscripten, then deliberately update the pins and repeat gameplay checks. Do not silently replace only the WASM.

GitHub Actions validates and publishes `site/` through GitHub Pages. Original game and assets © Nintendo; see `site/credits.html` and `site/THIRD_PARTY_NOTICES.txt` for upstream credits and bundled library notices.
