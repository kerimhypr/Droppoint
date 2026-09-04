const path=require('path');
const http=require('http');
const express=require('express');
const {WebSocketServer}=require('ws');
const app=express();
app.use(express.static(__dirname));
app.use((_req,res)=>res.sendFile(path.join(__dirname,'index.html')));
const server=http.createServer(app);
const wss=new WebSocketServer({server});
const rooms=new Map();
const ROOM_TTL=10*60*1000;
const id=()=>Math.random().toString(36).slice(2,8).toUpperCase();
function scheduleRoomCleanup(code){const state=rooms.get(code);if(!state)return;clearTimeout(state.timer);state.timer=setTimeout(()=>{const current=rooms.get(code);if(current&&!current.peers.size)rooms.delete(code)},ROOM_TTL)}
function leave(ws){const code=ws.room;if(!code)return;const state=rooms.get(code);if(state)state.peers.delete(ws);ws.room=null;if(state&&!state.peers.size)scheduleRoomCleanup(code)}
wss.on('connection',ws=>{ws.on('message',raw=>{let msg;try{msg=JSON.parse(raw.toString())}catch{return}
if(msg.type==='create'){leave(ws);let code=id();while(rooms.has(code))code=id();rooms.set(code,{peers:new Set([ws]),timer:null});ws.room=code;ws.send(JSON.stringify({type:'created',room:code}));return}
if(msg.type==='join'){leave(ws);const code=String(msg.room||'').trim().toUpperCase();const state=rooms.get(code);if(!/^[A-Z0-9]{6}$/.test(code)||!state){ws.send(JSON.stringify({type:'error',message:'Oda bulunamadı veya süresi doldu.'}));return}if(state.peers.size>=2){ws.send(JSON.stringify({type:'room-full'}));return}clearTimeout(state.timer);for(const peer of state.peers)if(peer.readyState===1)peer.send(JSON.stringify({type:'peer-joined'}));state.peers.add(ws);ws.room=code;ws.send(JSON.stringify({type:'joined',room:code}));return}
if(['offer','answer','ice'].includes(msg.type)&&ws.room){const state=rooms.get(ws.room);for(const peer of state?.peers||[])if(peer!==ws&&peer.readyState===1)peer.send(JSON.stringify(msg))}});ws.on('close',()=>leave(ws))});
const port=Number(process.env.PORT)||3000;server.listen(port,'0.0.0.0',()=>console.log(`Droppoint listening on ${port}`));