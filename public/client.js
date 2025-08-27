const socket = io();

let state = {
  me: { id: null, name: null, team: 'blue' },
  roomId: null,
  room: null
};

const $ = (sel) => document.querySelector(sel);
const joinScreen = $('#join-screen');
const gameScreen = $('#game-screen');

function showJoin() { joinScreen.classList.remove('hidden'); gameScreen.classList.add('hidden'); }
function showGame() { joinScreen.classList.add('hidden'); gameScreen.classList.remove('hidden'); }

$('#createBtn').onclick = () => join(true);
$('#joinBtn').onclick = () => join(false);

function join(create) {
  const name = $('#name').value.trim();
  const roomId = $('#roomId').value.trim();
  const team = $('#team').value;
  if (!name || !roomId) return alert('İsim ve Oda ID gerekli.');
  state.me.name = name;
  state.me.team = team;
  state.roomId = roomId;
  socket.emit('room:join', { roomId, name, team, create });
}

socket.on('room:state', (room) => {
  state.room = room;
  state.me.id = state.me.id || socket.id;
  showGame();
  render();
});

socket.on('game:ended', ({ winner, blue, red, target }) => {
  const el = $('#endMsg');
  el.classList.remove('hidden');
  el.textContent = `Oyun Bitti! Kazanan: ${winner} | Mavi: ${blue} - Kırmızı: ${red} (Hedef: ${target})`;
});

socket.on('error:message', (msg) => alert(msg));

// Admin controls
$('#setTarget').onclick = () => {
  socket.emit('game:admin', { roomId: state.roomId, action: 'setTarget', value: $('#targetScore').value });
};
$('#setSeconds').onclick = () => {
  socket.emit('game:admin', { roomId: state.roomId, action: 'setSeconds', value: $('#roundSeconds').value });
};
$('#pause').onclick = () => socket.emit('game:admin', { roomId: state.roomId, action: 'pause' });
$('#resume').onclick = () => socket.emit('game:admin', { roomId: state.roomId, action: 'resume' });
$('#restart').onclick = () => socket.emit('game:admin', { roomId: state.roomId, action: 'restart' });
$('#forceSwitch').onclick = () => socket.emit('turn:forceSwitch', { roomId: state.roomId });

$('#transferOwner').onclick = () => {
  const uid = $('#ownerSelect').value;
  if (!uid) return;
  socket.emit('game:admin', { roomId: state.roomId, action: 'transferOwner', targetUserId: uid });
};

// Rename team (any player of that team)
$('#blueRename').onclick = () => {
  const name = $('#blueName').value.trim();
  socket.emit('team:setName', { roomId: state.roomId, team: 'blue', name });
};
$('#redRename').onclick = () => {
  const name = $('#redName').value.trim();
  socket.emit('team:setName', { roomId: state.roomId, team: 'red', name });
};

// Captain panel actions
$('#setController').onclick = () => {
  const uid = $('#controllerSelect').value;
  const myTeam = state.room?.users.find(u => u.id === state.me.id)?.team || 'blue';
  socket.emit('team:setController', { roomId: state.roomId, team: myTeam, targetUserId: uid });
};
$('#setNarrator').onclick = () => {
  const uid = $('#narratorSelect').value;
  const myTeam = state.room?.users.find(u => u.id === state.me.id)?.team || 'blue';
  socket.emit('turn:setNarrator', { roomId: state.roomId, team: state.room.turn.team, targetUserId: uid });
};

// Buttons for actions
$('#btnPass').onclick = () => socket.emit('action:press', { roomId: state.roomId, type: 'pass' });
$('#btnTaboo').onclick = () => socket.emit('action:press', { roomId: state.roomId, type: 'taboo' });
$('#btnCorrect').onclick = () => socket.emit('action:press', { roomId: state.roomId, type: 'correct' });

function roleEmoji(room, user) {
  const em = [];
  if (room.ownerId === user.id) em.push('👑');
  if (room.teams[user.team].captainId === user.id) em.push('🧭');
  if (room.teams[user.team].controllerId === user.id) em.push('🎮');
  if (room.turn.narratorId === user.id) em.push('🗣️');
  return em.join('');
}

function renderRoster(teamKey) {
  const roster = $('#' + teamKey + 'Roster');
  roster.innerHTML = '';
  if (!state.room) return;
  const team = state.room.teams[teamKey];
  state.room.users
    .filter(u => u.team === teamKey)
    .forEach(u => {
      const div = document.createElement('div');
      div.className = 'user';
      div.textContent = `${u.name} ${roleEmoji(state.room, u)}`;
      roster.appendChild(div);
    });
}

function renderCardVisibility() {
  const turnTeam = state.room.turn.team;
  const isMyTeam = (state.me.team === turnTeam);
  const isNarrator = (state.room.turn.narratorId === state.me.id);

  socket.emit('card:see', { roomId: state.roomId }, ({ canSee, card }) => {
    const wordEl = $('#word');
    const taboosEl = $('#taboos');
    const visibilityEl = $('#visibility');
    taboosEl.innerHTML = '';

    if (!canSee) {
      wordEl.textContent = '***';
      visibilityEl.textContent = 'Anlatılan kelime takım arkadaşlarına gizli.';
      return;
    }

    wordEl.textContent = card.word;
    card.taboo.forEach(t => {
      const span = document.createElement('span');
      span.className = 'tag';
      span.textContent = t;
      taboosEl.appendChild(span);
    });
    visibilityEl.textContent = isNarrator ? 'Anlatıcı görünümündesiniz.' : 'Karşı takım görünümündesiniz.';
  });
}

function renderControls() {
  const isMyTurn = state.room.turn.team === state.me.team;
  const isNarrator = state.room.turn.narratorId === state.me.id;
  const oppTeam = state.me.team === 'blue' ? 'red' : 'blue';
  const isOppController = state.room.teams[oppTeam].controllerId === state.me.id;

  const passBtn = $('#btnPass');
  const tabooBtn = $('#btnTaboo');
  const correctBtn = $('#btnCorrect');

  passBtn.disabled = !(isNarrator || isOppController) || state.room.turn.passesLeft <= 0;
  tabooBtn.disabled = !(isNarrator || isOppController);
  correctBtn.disabled = !(isNarrator || isOppController);
}

function renderAdmin() {
  const isOwner = state.room.ownerId === state.me.id;
  $('#ownerInfo').textContent = `Oyun Kurucu: ${state.room.ownerName || '-'} ${isOwner ? '👑' : ''}`;
  ['setTarget','setSeconds','pause','resume','restart','forceSwitch','transferOwner'].forEach(id => {
    $('#' + id).disabled = !isOwner;
  });

  $('#targetScore').value = state.room.targetScore;
  $('#roundSeconds').value = state.room.roundSeconds;

  // populate ownerSelect
  const sel = $('#ownerSelect');
  sel.innerHTML = '';
  state.room.users.forEach(u => {
    const opt = document.createElement('option');
    opt.value = u.id;
    opt.textContent = u.name + (u.id === state.room.ownerId ? ' (👑)' : '');
    sel.appendChild(opt);
  });
}

function renderCaptainPanel() {
  const myTeam = state.room.users.find(u => u.id === state.me.id)?.team || 'blue';
  const isCaptain = state.room.teams[myTeam].captainId === state.me.id;
  ['controllerSelect','setController','narratorSelect','setNarrator'].forEach(id => {
    const el = $('#' + id);
    el.disabled = !isCaptain;
  });

  const cSel = $('#controllerSelect');
  cSel.innerHTML = '';
  state.room.users.filter(u => u.team === myTeam).forEach(u => {
    const opt = document.createElement('option');
    opt.value = u.id;
    opt.textContent = u.name + (u.id === state.room.teams[myTeam].controllerId ? ' (🎮)' : '');
    cSel.appendChild(opt);
  });

  const nSel = $('#narratorSelect');
  nSel.innerHTML = '';
  state.room.users.filter(u => u.team === state.room.turn.team).forEach(u => {
    const opt = document.createElement('option');
    opt.value = u.id;
    opt.textContent = u.name + (u.id === state.room.turn.narratorId ? ' (🗣️)' : '');
    nSel.appendChild(opt);
  });
}

function render() {
  if (!state.room) return;
  // names & scores
  $('#blueName').value = state.room.teams.blue.name;
  $('#redName').value = state.room.teams.red.name;
  $('#blueScore').textContent = state.room.teams.blue.score;
  $('#redScore').textContent = state.room.teams.red.score;

  $('#turnTeam').textContent = state.room.turn.team === 'blue' ? state.room.teams.blue.name : state.room.teams.red.name;
  const narrator = state.room.users.find(u => u.id === state.room.turn.narratorId);
  $('#narratorName').textContent = narrator ? narrator.name : '-';
  $('#timer').textContent = state.room.turn.remaining;
  $('#passesLeft').textContent = state.room.turn.passesLeft;

  renderRoster('blue');
  renderRoster('red');
  renderCardVisibility();
  renderControls();
  renderAdmin();
  renderCaptainPanel();
}

// Update every second for timer freshness
setInterval(() => { if (state.room) render(); }, 1000);
