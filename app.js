const $ = id => document.getElementById(id);
const log = (message, good = false) => {
  const el = $('activity');
  if (el.querySelector('.muted')) el.innerHTML = '';
  const row = document.createElement('div'); row.className = 'event';
  row.innerHTML = `<span class="event-dot">●</span><span>${message}</span>`;
  el.prepend(row);
};

let socket, room = '', pc, channel, connected = false, makingOffer = false;
let incoming = null;
const files = [];

function setStatus(text, on) { const s = $('status'); s.textContent = `● ${text}`; s.className = `status ${on ? 'on' : 'off'}`; }
function wsUrl() { return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`; }

function connectSignal() {
  if (socket && socket.readyState <= 1) return;
  socket = new WebSocket(wsUrl());
  socket.onopen = () => setStatus('Sunucu hazır', true);
  socket.onclose = () => { setStatus('Sunucu bağlantısı yok', false); connected = false; };
  socket.onerror = () => setStatus('Bağlantı hatası', false);
  socket.onmessage = async e => {
    const m = JSON.parse(e.data);
    if (m.type === 'created') { room = m.room; renderRoom(); log(`Oda oluşturuldu: ${room}`); }
    if (m.type === 'joined') { room = m.room; renderRoom(); log(`Odaya katıldın: ${room}`); }
    if (m.type === 'error') log(`Hata: ${m.message}`);
    if (m.type === 'peer-joined') await makePeer(true);
    if (m.type === 'offer') { await makePeer(false); await pc.setRemoteDescription(m.offer); const answer = await pc.createAnswer(); await pc.setLocalDescription(answer); socket.send(JSON.stringify({type:'answer',answer})); }
    if (m.type === 'answer') { await pc.setRemoteDescription(m.answer); }
    if (m.type === 'ice' && pc) { try { await pc.addIceCandidate(m.candidate); } catch {} }
  };
}

async function makePeer(initiator) {
  if (pc) pc.close();
  pc = new RTCPeerConnection({ iceServers: [{urls:'stun:stun.l.google.com:19302'}] });
  pc.onicecandidate = e => { if (e.candidate && socket?.readyState === 1) socket.send(JSON.stringify({type:'ice',candidate:e.candidate})); };
  pc.onconnectionstatechange = () => { connected = ['connected'].includes(pc.connectionState); setStatus(connected ? 'Cihaz bağlı' : pc.connectionState, connected); updateButtons(); if (connected) log('Cihaz eşleşti. Gönderime hazır.'); };
  pc.ondatachannel = e => setupChannel(e.channel);
  if (initiator) setupChannel(pc.createDataChannel('droppoint'));
}
function setupChannel(ch) {
  channel = ch;
  ch.binaryType = 'arraybuffer';
  ch.onopen = () => { connected = true; setStatus('Cihaz bağlı', true); updateButtons(); };
  ch.onclose = () => { connected = false; setStatus('Cihaz ayrıldı', false); updateButtons(); };
  ch.onmessage = receiveMessage;
}
async function createOffer() {
  if (!pc) await makePeer(true);
  const offer = await pc.createOffer(); await pc.setLocalDescription(offer);
  socket.send(JSON.stringify({type:'offer',offer}));
}

function renderRoom() { $('roomCode').textContent = room || '—'; $('copyRoom').disabled = !room; }
function updateButtons() { $('sendFile').disabled = !connected || !files.length; $('sendText').disabled = !connected || !$('text').value.trim(); }
function fmt(size) { if (size < 1024) return `${size} B`; if (size < 1048576) return `${(size/1024).toFixed(1)} KB`; return `${(size/1048576).toFixed(1)} MB`; }

$('create').onclick = () => { connectSignal(); const go = () => socket.send(JSON.stringify({type:'create'})); socket.readyState === 1 ? go() : socket.addEventListener('open', go, {once:true}); };
$('join').onclick = () => { const code = $('roomInput').value.trim().toUpperCase(); if (!code) return; connectSignal(); const go = () => socket.send(JSON.stringify({type:'join',room:code})); socket.readyState === 1 ? go() : socket.addEventListener('open', go, {once:true}); };
$('copyRoom').onclick = async () => { await navigator.clipboard.writeText(room); log('Oda kodu panoya kopyalandı.'); };
$('text').oninput = () => { $('count').textContent = `${$('text').value.length.toLocaleString('tr-TR')} / 20.000`; updateButtons(); };
$('clear').onclick = () => { $('activity').innerHTML = '<p class="muted">Aktivite temizlendi.</p>'; };

$('file').onchange = () => { files.splice(0, files.length, ...$('file').files); renderFiles(); updateButtons(); };
const drop = document.querySelector('.drop');
['dragenter','dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.style.borderColor='#90a5da'; }));
['dragleave','drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.style.borderColor=''; }));
drop.addEventListener('drop', e => { files.splice(0, files.length, ...e.dataTransfer.files); renderFiles(); updateButtons(); });
function renderFiles() { const list = $('fileList'); list.innerHTML=''; files.forEach(f => { const n=document.getElementById('fileItem').content.cloneNode(true); n.querySelector('b').textContent=f.name; n.querySelector('small').textContent=fmt(f.size); list.appendChild(n); }); }

async function sendText() { if (!channel || channel.readyState !== 'open') return; const text=$('text').value.trim(); if(!text) return; channel.send(JSON.stringify({kind:'text',text})); log(`Metin gönderildi · ${text.length} karakter`); $('text').value=''; $('text').dispatchEvent(new Event('input')); }
$('sendText').onclick = sendText;

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function sendFiles() {
  if (!channel || channel.readyState !== 'open') return;
  const queue = [...files];
  for (const file of queue) {
    const id = crypto.randomUUID();
    channel.send(JSON.stringify({kind:'file-start',id,name:file.name,size:file.size,type:file.type||'application/octet-stream'}));
    let offset = 0;
    while (offset < file.size) {
      while (channel.bufferedAmount > 4 * 1024 * 1024) await sleep(20);
      const chunk = await file.slice(offset, offset + 64 * 1024).arrayBuffer();
      channel.send(chunk); offset += chunk.byteLength;
    }
    channel.send(JSON.stringify({kind:'file-end',id}));
    log(`Dosya gönderildi · ${file.name} (${fmt(file.size)})`);
  }
}
$('sendFile').onclick = sendFiles;

function receiveMessage(e) {
  if (typeof e.data === 'string') {
    const m = JSON.parse(e.data);
    if (m.kind === 'text') { log(`Metin alındı · ${m.text.length} karakter`); showReceivedText(m.text); }
    if (m.kind === 'file-start') incoming={id:m.id,name:m.name,size:m.size,type:m.type,chunks:[],received:0};
    if (m.kind === 'file-end' && incoming?.id === m.id) { const blob=new Blob(incoming.chunks,{type:incoming.type}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=incoming.name; a.click(); setTimeout(()=>URL.revokeObjectURL(url),30000); log(`Dosya alındı · ${incoming.name} (${fmt(incoming.size)})`); incoming=null; }
  } else if (incoming) { incoming.chunks.push(e.data); incoming.received += e.data.byteLength; }
}
function showReceivedText(text) {
  const row=document.createElement('div'); row.className='event'; row.innerHTML=`<span class="event-dot">●</span><span><b>Alınan metin</b><br><span class="muted"></span></span>`; row.querySelector('.muted').textContent=text.slice(0,300)+(text.length>300?'…':''); $('activity').prepend(row);
}

renderRoom(); updateButtons(); connectSignal();
