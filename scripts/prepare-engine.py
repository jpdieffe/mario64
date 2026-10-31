"""Prepare the pinned upstream web engine without unrelated mods or public lobbies."""
from pathlib import Path
import json, hashlib, re
root = Path(__file__).resolve().parent.parent
source = root / '.build'
js = (source / 'upstream.js').read_text()
start = js.index('loadPackage({') + len('loadPackage(')
metadata, length = json.JSONDecoder().raw_decode(js[start:])
original = (source / 'upstream.data').read_bytes()
data = bytearray()
files = []
removed = 0
for entry in metadata['files']:
    # Optional character packs/cafe/third-party mods are not part of this game.
    if '/mods/' in entry['filename'] or '/dynos/packs/' in entry['filename']:
        removed += entry['end'] - entry['start']
        continue
    blob = original[entry['start']:entry['end']]
    files.append({**entry, 'start': len(data), 'end': len(data) + len(blob)})
    data.extend(blob)
metadata['files'] = files
metadata['remote_package_size'] = len(data)
js = js[:start] + json.dumps(metadata, separators=(',', ':')) + js[start + length:]
# These generated JS functions are optional public-room directory advertising.
# Local room IDs use PeerJS directly, so no data should go to that directory.
for name in ['web_lobby_do_register', 'web_lobby_do_unregister', 'web_lobby_fetch_rooms']:
    pattern = re.compile(r'function _?' + name + r'\([^)]*\)\s*\{')
    match = pattern.search(js)
    if not match:
        raise RuntimeError('Missing upstream lobby function: ' + name)
    js = js[:match.end()] + '\nreturn; // Mario64 Together: private room codes only.\n' + js[match.end():]
(root / 'site/engine/sm64coopdx.js').write_text(js, encoding='utf-8', newline='\n')
(root / 'site/engine/sm64coopdx.data').write_bytes(data)
html = (source / 'upstream.html').read_text()
html = html.replace('width=device-width, initial-scale=1.0', 'width=device-width, initial-scale=1.0, viewport-fit=cover')
html = re.sub(r'<script[^>]+src="https://[^" ]*peerjs[^" ]*"[^>]*></script>', '<script src="./vendor/peerjs.min.js"></script>', html)
html = html.replace("navigator.serviceWorker.register('sw.js').catch(function() {});", '// No service worker: always use the current game protocol.')
html = re.sub(r'<link[^>]+(?:manifest|apple-touch-icon)[^>]*>', '', html)
html = re.sub(r'<link[^>]+rel="icon"[^>]*>', '<link rel="icon" href="./icon.svg" type="image/svg+xml">', html)
html = html.replace('<title>SM64 CoopDX - Web</title>', '<title>Mario 64 Together · Play</title>')
html = html.replace('</head>', '<link rel="stylesheet" href="./play.css"></head>')
html = html.replace('<script async type="text/javascript" src="sm64coopdx.js"></script>', '<script src="./coop.js"></script><script async src="./engine/sm64coopdx.js"></script>')
html = html.replace("            conn.close();\n            return;", "            conn.on('open', function() { conn.send({together: 'full'}); setTimeout(function() { conn.close(); }, 300); });\n            return;")
html = html.replace("conn.on('data', function(data) {", "conn.on('data', function(data) {\n          if (data && data.together === 'full') { window.togetherRoomFull(); return; }")
html = html.replace("alert('Room", "window.togetherNotice('Room").replace("alert('Failed to join room", "window.togetherNotice('Failed to join room")
(root / 'site/play.html').write_text(html, encoding='utf-8', newline='\n')
manifest = {'source': 'https://github.com/zalo/sm64coopdx', 'commit': '1277ec162448cbb8944100a8411ec6bb394c9d10', 'engine': {}}
for file in ['sm64coopdx.js', 'sm64coopdx.wasm', 'sm64coopdx.data']:
    blob = (root / 'site/engine' / file).read_bytes()
    manifest['engine'][file] = {'bytes': len(blob), 'sha256': hashlib.sha256(blob).hexdigest()}
rom = (root / 'site/roms/super-mario-64.z64').read_bytes()
manifest['rom'] = {'sha1': hashlib.sha1(rom).hexdigest(), 'bytes': len(rom)}
(root / 'site/engine-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8', newline='\n')
print(f'Engine package: {len(data):,} bytes; removed {removed:,} bytes of optional packs/mods.')
