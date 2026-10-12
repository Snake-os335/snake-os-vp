from pathlib import Path
p = Path("/srv/juegos_david/snake-os/metaverse.js")
t = p.read_text(encoding="utf-8")
old = """    function loadProgressThenConnect() {
      fetch('/api/metaverse/progress', { credentials: 'include' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (prog) {
          // Pending room from notification wins over saved room pose
          var pendingEarly = pendingMetaverseRoom;
          if (pendingEarly && pendingEarly.roomId) {
            if (prog) applyProgress(prog, { applyPose: false, restoreMic: false, clearRoom: true });
            else { currentRoom = null; }
          } else if (prog) {
            applyProgress(prog, { applyPose: true, restoreMic: false, clearRoom: false });
          }
          connectWs();
          setTimeout(function () { tryPendingMetaverseRoom(); }, 400);
        })
        .catch(function () {
          connectWs();
          setTimeout(function () { tryPendingMetaverseRoom(); }, 400);
        });
    }"""
new = """    function loadProgressThenConnect() {
      fetch('/api/metaverse/progress', { credentials: 'include' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (prog) {
          // Pending room from notification wins over saved room; apply on WS welcome
          var pendingEarly = pendingMetaverseRoom;
          if (pendingEarly && pendingEarly.roomId) {
            if (prog) applyProgress(prog, { applyPose: false, restoreMic: false, clearRoom: true });
            else { currentRoom = null; }
          } else if (prog) {
            applyProgress(prog, { applyPose: true, restoreMic: false, clearRoom: false });
          }
          connectWs();
        })
        .catch(function () { connectWs(); });
    }"""
if old in t:
    t = t.replace(old, new, 1)
    print("loadProgress race fixed")
else:
    print("WARNING: loadProgress block not found")

# In welcome: try pending BEFORE applying progress room, and if pending, clearRoom
old_w = """        if (msg.type === 'welcome') {
          players = {};
          remotePos = {};
          if (msg.progress) applyProgress(msg.progress, { applyPose: true, restoreMic: false });
          if (msg.you) {
            me.x = msg.you.x; me.y = msg.you.y; me.ry = msg.you.ry || 0;
            if (typeof msg.you.score === 'number') setScore(msg.you.score);
            if (msg.you.room) currentRoom = msg.you.room;
          }
          currentWorld = msg.world || currentWorld;
          bones = msg.bones || [];
          (msg.players || []).forEach(upsertPlayer);
          clearMessages();
          (msg.history || []).forEach(appendMsg);
          renderWorlds();
          renderRooms();
          renderOnline();
          if (threeReady) { buildWorld3D(); syncBoneMeshes(); }
          setStatus('En línea · ' + Object.keys(players).length + ' en ' + worldName(currentWorld));
          sendGame({ action: 'list' });
          if (voiceOn) syncVoiceMesh();
          tryPendingMetaverseRoom();
        } else if (msg.type === 'join') {"""

new_w = """        if (msg.type === 'welcome') {
          players = {};
          remotePos = {};
          var hasPendingRoom = !!(pendingMetaverseRoom && pendingMetaverseRoom.roomId) || !!opts.room;
          if (msg.progress) {
            applyProgress(msg.progress, {
              applyPose: !hasPendingRoom,
              restoreMic: false,
              clearRoom: !!hasPendingRoom
            });
          }
          if (msg.you) {
            if (!hasPendingRoom) {
              me.x = msg.you.x; me.y = msg.you.y; me.ry = msg.you.ry || 0;
              if (msg.you.room) currentRoom = msg.you.room;
            }
            if (typeof msg.you.score === 'number') setScore(msg.you.score);
          }
          if (!hasPendingRoom) currentWorld = msg.world || currentWorld;
          bones = msg.bones || [];
          (msg.players || []).forEach(upsertPlayer);
          clearMessages();
          (msg.history || []).forEach(appendMsg);
          renderWorlds();
          renderRooms();
          renderOnline();
          if (threeReady) { buildWorld3D(); syncBoneMeshes(); }
          setStatus('En línea · ' + Object.keys(players).length + ' en ' + worldName(currentWorld));
          sendGame({ action: 'list' });
          if (voiceOn) syncVoiceMesh();
          tryPendingMetaverseRoom();
        } else if (msg.type === 'join') {"""

if old_w in t:
    t = t.replace(old_w, new_w, 1)
    print("welcome pending-aware")
else:
    print("WARNING: welcome block not found")
    # show a bit
    i = t.find("if (msg.type === 'welcome')")
    print(repr(t[i:i+400]))

# bump cache comment
if t.startswith("/* cache-bust"):
    nl = t.find("\n")
    t = "/* cache-bust 20261002142600mvevents — pending room on welcome */" + t[nl:]

p.write_text(t, encoding="utf-8")

# cache-bust index
idx = Path("/srv/juegos_david/snake-os/index.html")
it = idx.read_text(encoding="utf-8")
import re
it2 = re.sub(
    r'src="/static/metaverse\.js\?v=[^"]+"',
    'src="/static/metaverse.js?v=20261002142600mvevents"',
    it,
    count=1,
)
it2 = re.sub(
    r'src="/static/doganiero-chat\.js\?v=[^"]+"',
    'src="/static/doganiero-chat.js?v=20261002142600mvevents"',
    it2,
    count=1,
)
idx.write_text(it2, encoding="utf-8")
print("index cache-bust updated")
print("done")
