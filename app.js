const $ = id => document.getElementById(id);
const page = document.body?.dataset?.page || 'home';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fmt = size => size < 1024 ? `${size} B` : size < 1048576 ? `${(size/1024).toFixed(1)} KB` : `${(size/1048576).toFixed(1)} MB`;
const getRoom = () => sessionStorage.getItem('droppoint-room') || '';
const setRoom = room => sessionStorage.setItem('droppoint-room', room);

let socket = null;
let room = getRoom();
let pc = null;
let channel = null;
let initiator = false;
let connected = false;
let incoming = null;
let files = [];
let offerPending = false;

function wsUrl() { return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`; }
function setStatus(text, on) { const el = $('status'); if (!el) return; el.innerHTML = `<span class="status-dot"></span> ${text}`; el.className = `status ${on ? 'on' : 'off'}`; }
function notice(text, kind='info') { const el = $('roomStatus') || $('connectNotice'); if (!el) return; el.className = `notice ${kind}`; el.innerHTML = text; }
function go(path) { location.href = path; }
function safeJson(value) { try { return JSON.parse(value); } catch { return null; } }

function connectSignal() {
  if (socket && socket.readyState <= WebSocket.OPEN) return Promise.resolve();
  return new Promise((resolve, reject) => {
    socket = new WebSocket(wsUrl());
    socket.onopen = () => { setStatus('Sunucu hazır', true); resolve(); };
    socket.onerror = () => { setStatus('Bağlantı hatası', false); notice('Sunucuya bağlanılamadı. Sayfayı yenileyip tekrar dene.', 'error'); reject(new Error('WebSocket error')); };
    socket.onclose = () => { connected = false; setStatus('Bağlantı kapandı', false); updateTransferButtons(); };
    socket.onmessage = handleSignal;
  });
}

async function handleSignal(event) {
  const msg = safeJson(event.data);
  if (!msg) return;
  if (msg.type === 'created' || msg.type === 'joined') {
    room = msg.room; setRoom(room);
    if (page === 'room') {
      const result = $('roomResult'); if (result) result.classList.remove('hidden');
      $('roomCode').textContent = room;
      notice(msg.type === 'created' ? 'Oda hazır. Diğer cihazın bu kodla katılmasını bekliyoruz.' : 'Odaya katıldın. Diğer cihazla eşleşme bekleniyor.', 'success');
      if (msg.type === 'joined') await createPeer(false);
    }
    return;
  }
  if (msg.type === 'peer-joined') {
    await createPeer(true);
    return;
  }
  if (msg.type === 'room-full') { notice('Bu oda zaten iki cihazla dolu.', 'error'); return; }
  if (msg.type === 'error') { notice(msg.message || 'Bir hata oluştu.', 'error'); return; }
  if (msg.type === 'offer') {
    if (!pc) await createPeer(false);
    offerPending = true;
    await pc.setRemoteDescription(msg.offer);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket.send(JSON.stringify({ type:'answer', answer }));
    return;
  }
  if (msg.type === 'answer' && pc && initiator) {
    await pc.setRemoteDescription(msg.answer);
    return;
  }
  if (msg.type === 'ice' && pc && msg.candidate) {
    try { await pc.addIceCandidate(msg.candidate); } catch {}
  }
}

async function createPeer(asInitiator) {
  if (pc) pc.close();
  initiator = !!asInitiator;
  pc = new RTCPeerConnection({ iceServers: [{ urls:'stun:stun.l.google.com:19302' }] });
  pc.onicecandidate = e => { if (e.candidate && socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({type:'ice', candidate:e.candidate})); };
  pc.onconnectionstatechange = () => {
    const state = pc.connectionState;
    connected = state === 'connected';
    setStatus(connected ? 'Cihaz bağlı' : state === 'connecting' ? 'Cihaz bağlanıyor' : 'Cihaz ayrıldı', connected);
    updateTransferButtons();
    if (connected) notice('Cihazlar bağlandı. Paylaşım hazır.', 'success');
  };
  pc.ondatachannel = e => setupChannel(e.channel);
  if (initiator) {
    setupChannel(pc.createDataChannel('droppoint'));
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.send(JSON.stringify({ type:'offer', offer }));
  }
}

function setupChannel(ch) {
  channel = ch;
  ch.binaryType = 'arraybuffer';
  ch.onopen = () => { connected = true; setStatus('Cihaz bağlı', true); updateTransferButtons(); notice('Cihazlar bağlandı. Paylaşım hazır.', 'success'); };
  ch.onclose = () => { connected = false; setStatus('Cihaz ayrıldı', false); updateTransferButtons(); };
  ch.onerror = () => { connected = false; setStatus('Aktarım hatası', false); updateTransferButtons(); };
  ch.onmessage = receiveMessage;
}

function updateTransferButtons() {
  if ($('sendFile')) $('sendFile').disabled = !connected || !files.length;
  if ($('sendText')) $('sendText').disabled = !connected || !$('text')?.value.trim();
}

async function createRoom() { try { await connectSignal(); socket.send(JSON.stringify({type:'create'})); } catch {} }
async function joinRoom() {
  const code = $('roomInput')?.value.trim().toUpperCase() || '';
  if (!/^[A-Z0-9]{6}$/.test(code)) { notice('6 haneli oda kodunu gir.', 'error'); return; }
  try { await connectSignal(); socket.send(JSON.stringify({type:'join', room:code})); } catch {}
}

async function initRoomPage() {
  const mode = new URLSearchParams(location.search).get('mode');
  if ($('create')) $('create').onclick = createRoom;
  if ($('join')) $('join').onclick = joinRoom;
  if ($('roomInput')) $('roomInput').addEventListener('keydown', e => { if (e.key === 'Enter') joinRoom(); });
  if ($('copyRoom')) $('copyRoom').onclick = async () => { await navigator.clipboard.writeText(room); $('copyRoom').textContent = 'Kopyalandı'; setTimeout(() => $('copyRoom').textContent='Kodu kopyala', 1400); };
  try { await connectSignal(); notice('Sunucu hazır. Bir oda oluştur veya koda katıl.', 'info'); } catch {}
  if (mode === 'create') $('create')?.focus(); else if (mode === 'join') $('roomInput')?.focus();
}

function initChoosePage() {
  if (!room) { go('room.html'); return; }
  if ($('currentRoom')) $('currentRoom').textContent = room;
}

function renderFiles() {
  const list = $('fileList'); if (!list) return;
  list.innerHTML = '';
  for (const f of files) {
    const tpl = $('fileItem').content.cloneNode(true);
    tpl.querySelector('b').textContent = f.name;
    tpl.querySelector('small').textContent = fmt(f.size);
    list.appendChild(tpl);
  }
}

async function sendText() {
  if (!channel || channel.readyState !== 'open') return;
  const text = $('text').value.trim(); if (!text) return;
  channel.send(JSON.stringify({kind:'text', text}));
  $('text').value = ''; updateTransferButtons();
  addReceived('Metin gönderildi', text);
}

async function sendFiles() {
  if (!channel || channel.readyState !== 'open' || !files.length) return;
  const queue = [...files];
  for (const file of queue) {
    const id = crypto.randomUUID();
    channel.send(JSON.stringify({kind:'file-start', id, name:file.name, size:file.size, type:file.type || 'application/octet-stream'}));
    let offset = 0;
    while (offset < file.size) {
      while (channel.bufferedAmount > 4 * 1024 * 1024) await sleep(20);
      const chunk = await file.slice(offset, offset + 64*1024).arrayBuffer();
      channel.send(chunk); offset += chunk.byteLength;
    }
    channel.send(JSON.stringify({kind:'file-end', id}));
    addReceived('Dosya gönderildi', `${file.name} · ${fmt(file.size)}`);
  }
}

function addReceived(title, body, download) {
  const box = $('received'); if (!box) return;
  box.querySelector('.muted')?.remove();
  const row = document.createElement('article'); row.className='received-item';
  const copy = document.createElement('div'); copy.innerHTML=`<b>${title}</b><p></p>`; copy.querySelector('p').textContent=body;
  row.appendChild(copy);
  if (download) { const a=document.createElement('a'); a.className='m3-btn tonal small'; a.href=download.url; a.download=download.name; a.textContent='İndir'; row.appendChild(a); }
  box.prepend(row);
}

function receiveMessage(e) {
  if (typeof e.data === 'string') {
    const msg = safeJson(e.data); if (!msg) return;
    if (msg.kind === 'text') addReceived('Metin alındı', msg.text);
    if (msg.kind === 'file-start') incoming={id:msg.id,name:msg.name,size:msg.size,type:msg.type,chunks:[],received:0};
    if (msg.kind === 'file-end' && incoming?.id===msg.id) {
      const blob=new Blob(incoming.chunks,{type:incoming.type});
      const url=URL.createObjectURL(blob); addReceived('Dosya alındı', `${incoming.name} · ${fmt(incoming.size)}`, {url,name:incoming.name});
      incoming=null;
    }
  } else if (incoming) { incoming.chunks.push(e.data); incoming.received += e.data.byteLength; }
}

async function initTransferPage() {
  if (!room) { go('room.html'); return; }
  const type = new URLSearchParams(location.search).get('type') || 'file';
  $('transferRoom').textContent = room;
  const isFile = type === 'file';
  $('transferTitle').textContent = isFile ? 'Dosya gönder' : 'Metin gönder';
  $('transferLead').textContent = isFile ? 'Dosyaları seç, ardından diğer cihaza gönder.' : 'Metnini yaz, ardından diğer cihaza gönder.';
  $(isFile ? 'filePanel' : 'textPanel').classList.remove('hidden');
  if ($('file')) {
    $('file').onchange = () => { files=[...$('file').files]; renderFiles(); updateTransferButtons(); };
    const drop=$('.drop');
    if (drop) {
      ['dragenter','dragover'].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.add('drag');}));
      ['dragleave','drop'].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.remove('drag');}));
      drop.addEventListener('drop',e=>{files=[...e.dataTransfer.files];renderFiles();updateTransferButtons();});
    }
  }
  if ($('text')) $('text').addEventListener('input',()=>{ $('count').textContent=`${$('text').value.length.toLocaleString('tr-TR')} / 20.000`; updateTransferButtons(); });
  $('sendText')?.addEventListener('click',sendText);
  $('sendFile')?.addEventListener('click',sendFiles);
  $('clear')?.addEventListener('click',()=>{ $('received').innerHTML='<p class="muted">Henüz bir şey alınmadı.</p>'; });
  $('newRoom')?.addEventListener('click',()=>{sessionStorage.removeItem('droppoint-room');go('room.html');});
  await connectSignal();
  await createPeer(false);
  updateTransferButtons();
}

if (page === 'room') initRoomPage();
else if (page === 'choose') initChoosePage();
else if (page === 'transfer') initTransferPage();
