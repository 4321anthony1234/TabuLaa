const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const cors = require('cors');

const PORT = process.env.PORT || 3000;

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => res.send('ok'));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// In-memory store (stateless deploys will reset on restart)
const rooms = new Map();

const DEFAULT_ROUND_SECONDS = 90;
const DEFAULT_TARGET_SCORE = 20;

function createRoom(roomId, ownerName) {
  const room = {
    id: roomId,
    ownerId: null,            // socket id
    ownerName,
    targetScore: DEFAULT_TARGET_SCORE,
    roundSeconds: DEFAULT_ROUND_SECONDS,
    paused: false,
    running: false,
    createdAt: Date.now(),
    teams: {
      blue: {
        name: "Mavi",
        score: 0,
        captainId: null,
        controllerId: null,
        players: [] // {id, name}
      },
      red: {
        name: "Kırmızı",
        score: 0,
        captainId: null,
        controllerId: null,
        players: []
      }
    },
    turn: {
      team: "blue",            // 'blue' | 'red'
      narratorId: null,        // socket id
      startTime: null,
      remaining: DEFAULT_ROUND_SECONDS,
      passesLeft: 3,
      currentIndex: 0,
      deck: []                 // shuffled words
    },
    users: new Map(), // socketId -> {name, team, role: 'owner'|'player'}
  };
  return room;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function loadDeck() {
  const set = require('./data/words.json');
  // Flatten and shuffle all cards once per room
  return shuffle([...set]);
}

function getOppositeTeam(team) {
  return team === 'blue' ? 'red' : 'blue';
}

function emitRoomState(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  const safeUsers = [...room.users.entries()].map(([id, u]) => ({
    id, name: u.name, team: u.team, role: u.role
  }));
  io.to(roomId).emit('room:state', {
    id: room.id,
    ownerId: room.ownerId,
    ownerName: room.ownerName,
    targetScore: room.targetScore,
    roundSeconds: room.roundSeconds,
    paused: room.paused,
    running: room.running,
    teams: room.teams,
    turn: {
      team: room.turn.team,
      narratorId: room.turn.narratorId,
      startTime: room.turn.startTime,
      remaining: room.turn.remaining,
      passesLeft: room.turn.passesLeft,
      currentIndex: room.turn.currentIndex
    },
    users: safeUsers
  });
}

function currentCard(room) {
  const idx = room.turn.currentIndex % room.turn.deck.length;
  return room.turn.deck[idx];
}

function advanceCard(room) {
  room.turn.currentIndex = (room.turn.currentIndex + 1) % room.turn.deck.length;
}

function startTurn(room, team) {
  room.turn.team = team;
  room.turn.passesLeft = 3;
  room.turn.remaining = room.roundSeconds;
  room.turn.startTime = Date.now();
  // narrator default: first online player in team
  const teamPlayers = room.teams[team].players;
  if (teamPlayers.length) {
    // rotate narrator by round
    const idx = room.turn.currentIndex % teamPlayers.length;
    room.turn.narratorId = teamPlayers[idx].id;
  } else {
    room.turn.narratorId = null;
  }
  emitRoomState(room.id);
}

function endTurnAndSwitch(room) {
  const nextTeam = getOppositeTeam(room.turn.team);
  startTurn(room, nextTeam);
}

function checkWin(room) {
  const tBlue = room.teams.blue.score;
  const tRed = room.teams.red.score;
  const target = room.targetScore;
  if (tBlue >= target || tRed >= target) {
    room.running = false;
    room.paused = true;
    io.to(room.id).emit('game:ended', {
      winner: tBlue === tRed ? 'Berabere' : (tBlue > tRed ? room.teams.blue.name : room.teams.red.name),
      blue: tBlue, red: tRed, target
    });
    emitRoomState(room.id);
    return true;
  }
  return false;
}

setInterval(() => {
  rooms.forEach(room => {
    if (!room.running || room.paused) return;
    const elapsed = Math.floor((Date.now() - room.turn.startTime) / 1000);
    const remaining = Math.max(0, room.roundSeconds - elapsed);
    if (remaining !== room.turn.remaining) {
      room.turn.remaining = remaining;
      emitRoomState(room.id);
    }
    if (remaining <= 0) {
      endTurnAndSwitch(room);
    }
  });
}, 300);

io.on('connection', (socket) => {
  socket.on('room:join', ({ roomId, name, team, create }) => {
    if (!roomId || !name) return;
    let room = rooms.get(roomId);
    if (create && !room) {
      room = createRoom(roomId, name);
      rooms.set(roomId, room);
      room.ownerId = socket.id;
      room.users.set(socket.id, { name, team, role: 'owner' });
      room.turn.deck = loadDeck();
    } else {
      if (!room) {
        socket.emit('error:message', 'Oda bulunamadı.');
        return;
      }
      room.users.set(socket.id, { name, team, role: 'player' });
    }

    // add to team list
    if (team !== 'blue' && team !== 'red') team = 'blue';
    const teamObj = room.teams[team];
    teamObj.players.push({ id: socket.id, name });

    // set initial captains if empty
    if (!room.teams.blue.captainId && room.teams.blue.players.length) {
      room.teams.blue.captainId = room.teams.blue.players[0].id;
    }
    if (!room.teams.red.captainId && room.teams.red.players.length) {
      room.teams.red.captainId = room.teams.red.players[0].id;
    }

    socket.join(roomId);
    socket.data.roomId = roomId;

    // auto-start first turn if creator
    if (!room.running && room.ownerId === socket.id) {
      room.running = true;
      room.paused = false;
      startTurn(room, 'blue');
    }

    emitRoomState(roomId);
  });

  socket.on('room:leave', () => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;
    ['blue','red'].forEach(t => {
      room.teams[t].players = room.teams[t].players.filter(p => p.id !== socket.id);
      if (room.teams[t].captainId === socket.id) room.teams[t].captainId = room.teams[t].players[0]?.id || null;
      if (room.teams[t].controllerId === socket.id) room.teams[t].controllerId = null;
    });
    room.users.delete(socket.id);
    emitRoomState(roomId);
    socket.leave(roomId);
  });

  socket.on('disconnect', () => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;
    ['blue','red'].forEach(t => {
      room.teams[t].players = room.teams[t].players.filter(p => p.id !== socket.id);
      if (room.teams[t].captainId === socket.id) room.teams[t].captainId = room.teams[t].players[0]?.id || null;
      if (room.teams[t].controllerId === socket.id) room.teams[t].controllerId = null;
    });
    if (room.ownerId === socket.id) {
      // Transfer ownership to any remaining user
      const first = room.teams.blue.players[0] || room.teams.red.players[0];
      room.ownerId = first?.id || null;
      room.ownerName = first?.name || room.ownerName;
    }
    room.users.delete(socket.id);
    emitRoomState(roomId);
  });

  socket.on('game:admin', ({ roomId, action, value, targetUserId }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    if (socket.id !== room.ownerId) return; // only owner

    if (action === 'setTarget') room.targetScore = Math.max(1, Number(value) || 10);
    if (action === 'setSeconds') room.roundSeconds = Math.max(15, Number(value) || 60);
    if (action === 'pause') room.paused = true;
    if (action === 'resume') { room.paused = false; room.turn.startTime = Date.now() - (room.roundSeconds - room.turn.remaining) * 1000; }
    if (action === 'restart') {
      room.teams.blue.score = 0;
      room.teams.red.score = 0;
      room.turn.deck = loadDeck();
      startTurn(room, 'blue');
      room.running = true;
      room.paused = false;
    }
    if (action === 'transferOwner' && targetUserId && room.users.has(targetUserId)) {
      room.ownerId = targetUserId;
      room.ownerName = room.users.get(targetUserId).name;
    }
    emitRoomState(roomId);
  });

  socket.on('team:setName', ({ roomId, team, name }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    if (!['blue','red'].includes(team)) return;
    // only players in that team can rename
    const u = room.users.get(socket.id);
    if (!u || u.team !== team) return;
    room.teams[team].name = String(name || '').slice(0, 24) || room.teams[team].name;
    emitRoomState(roomId);
  });

  socket.on('team:setCaptain', ({ roomId, team, targetUserId }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    if (!['blue','red'].includes(team)) return;
    if (room.teams[team].players.find(p => p.id === socket.id) == null) return; // must be in team
    // only current captain may set
    if (room.teams[team].captainId !== socket.id) return;
    if (room.teams[team].players.find(p => p.id === targetUserId) == null) return;
    room.teams[team].captainId = targetUserId;
    emitRoomState(roomId);
  });

  socket.on('team:setController', ({ roomId, team, targetUserId }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    if (!['blue','red'].includes(team)) return;
    // only captain can set controller
    if (room.teams[team].captainId !== socket.id) return;
    if (room.teams[team].players.find(p => p.id === targetUserId) == null) return;
    room.teams[team].controllerId = targetUserId;
    emitRoomState(roomId);
  });

  socket.on('turn:setNarrator', ({ roomId, team, targetUserId }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    if (!['blue','red'].includes(team)) return;
    // only captain of current team can set narrator for their turn
    if (team !== room.turn.team) return;
    if (room.teams[team].captainId !== socket.id) return;
    if (room.teams[team].players.find(p => p.id === targetUserId) == null) return;
    room.turn.narratorId = targetUserId;
    emitRoomState(roomId);
  });

  socket.on('card:see', ({ roomId }, cb) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const u = room.users.get(socket.id);
    if (!u) return;
    const card = currentCard(room);
    const teamTurn = room.turn.team;
    const isNarrator = room.turn.narratorId === socket.id;
    const isOpponent = u.team !== teamTurn;
    // Visibility: narrator & opponents see taboo card; teammates (except narrator) do NOT
    const canSee = isNarrator || isOpponent;
    cb({ canSee, card: canSee ? card : null });
  });

  function applyAction(room, actionTeam, actionType) {
    if (actionType === 'pass') {
      if (room.turn.passesLeft <= 0) return;
      room.turn.passesLeft -= 1;
      advanceCard(room);
    } else if (actionType === 'taboo') {
      room.teams[actionTeam].score = Math.max(0, room.teams[actionTeam].score - 1);
      advanceCard(room);
    } else if (actionType === 'correct') {
      room.teams[actionTeam].score += 1;
      if (checkWin(room)) return;
      advanceCard(room);
    }
    emitRoomState(room.id);
  }

  socket.on('action:press', ({ roomId, type }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const u = room.users.get(socket.id);
    if (!u) return;
    const teamTurn = room.turn.team;

    const isNarrator = room.turn.narratorId === socket.id;
    const isOppController = room.teams[getOppositeTeam(teamTurn)].controllerId === socket.id;

    if (!isNarrator && !isOppController) return;
    if (type === 'pass' && room.turn.passesLeft <= 0) return;

    applyAction(room, teamTurn, type);
  });

  socket.on('turn:forceSwitch', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    // Only owner can force switch
    if (socket.id !== room.ownerId) return;
    endTurnAndSwitch(room);
  });

  socket.on('room:ping', () => socket.emit('room:pong'));
});

server.listen(PORT, () => {
  console.log(`Server listening on :${PORT}`);
});
