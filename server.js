const path=require('path');
const http=require('http');
const express=require('express');
const {WebSocketServer}=require('ws');
const app=express();
const rooms=new Map();
const ROOM_TTL=6*60*60*1000;
const MAX_FILE_BYTES=50*1024*1024;
const id=()=>Math.random().toString(36).slice(2,8).toUpperCase();
function getRoom(code){const room=rooms.get(code);if(!room)return null;if(room.expiresAt<Date.now()){rooms.delete(code);return null}return room}
function touch(room){room.expiresAt=Date.now()+ROOM_TTL}
function publicItem(item){return {id:item.id,kind:item.kind,name:item.name,size:item.size,type:item.type,text:item.text,createdAt:item.createdAt}}
function broadcast(code,msg){const room=getRoom(code);if(!room)return;for(const peer of room.peers)if(peer.readyState===1)peer.send(JSON.stringify(msg))}
function leave(ws){const code=ws.room;if(!code)return;const room=getRoom(code);if(room)room.peers.delete(ws);ws.room=null;if(room)touch(room)}
app.use(express.json({limit:'1mb'}));
app.post('/api/rooms/:code/files',express.raw({type:'*/*',limit:MAX_FILE_BYTES}),(req,res)=>{const code=String(req.params.code).toUpperCase();const room=getRoom(code);if(!room)return res.status(404).json({error:'Oda bulunamadı.'});if(!Buffer.isBuffer(req.body)||req.body.length>MAX_FILE_BYTES)return res.status(413).json({error:'Dosya çok büyük. Maksimum 50 MB.'});const name=decodeURIComponent(String(req.headers['x-file-name']||'dosya')).slice(0,240);const type=String(req.headers['content-type']||'application/octet-stream').slice(0,120);const item={id:id(),kind:'file',name,size:req.body.length,type,data:req.body,createdAt:Date.now()};room.items.push(item);touch(room);broadcast(code,{type:'item-added',item:publicItem(item)});res.json({item:publicItem(item)})});
app.post('/api/rooms/:code/text',(req,res)=>{const code=String(req.params.code).toUpperCase();const room=getRoom(code);const text=typeof req.body?.text==='string'?req.body.text.trim():'';if(!room)return res.status(404).json({error:'Oda bulunamadı.'});if(!text)return res.status(400).json({error:'Metin boş.'});if(text.length>20000)return res.status(413).json({error:'Metin çok uzun.'});const item={id:id(),kind:'text',text,size:text.length,createdAt:Date.now()};room.items.push(item);touch(room);broadcast(code,{type:'item-added',item:publicItem(item)});res.json({item:publicItem(item)})});
app.get('/api/rooms/:code/items',(req,res)=>{const code=String(req.params.code).toUpperCase();const room=getRoom(code);if(!room)return res.status(404).json({error:'Oda bulunamadı.'});touch(room);res.json({room:code,items:room.items.map(publicItem)})});
app.get('/api/rooms/:code/files/:itemId',(req,res)=>{const room=getRoom(String(req.params.code).toUpperCase());const item=room?.items.find(x=>x.id===req.params.itemId&&x.kind==='file');if(!item)return res.status(404).send('Dosya bulunamadı.');res.setHeader('Content-Type',item.type||'application/octet-stream');res.setHeader('Content-Length',String(item.data.length));res.setHeader('Content-Disposition',`attachment; filename*=UTF-8''${encodeURIComponent(item.name)}`);res.end(item.data)});
app.use(express.static(__dirname));
app.use((_req,res)=>res.sendFile(path.join(__dirname,'index.html')));
const server=http.createServer(app);const wss=new WebSocketServer({server});
wss.on('connection',ws=>{ws.on('message',raw=>{let msg;try{msg=JSON.parse(raw.toString())}catch{return}
if(msg.type==='create'){leave(ws);let code=id();while(rooms.has(code))code=id();rooms.set(code,{peers:new Set([ws]),items:[],expiresAt:Date.now()+ROOM_TTL});ws.room=code;ws.send(JSON.stringify({type:'created',room:code,items:[]}));return}
if(msg.type==='join'){leave(ws);const code=String(msg.room||'').trim().toUpperCase();const room=getRoom(code);if(!/^[A-Z0-9]{6}$/.test(code)||!room){ws.send(JSON.stringify({type:'error',message:'Oda bulunamadı veya süresi doldu.'}));return}for(const peer of room.peers)if(peer.readyState===1)peer.send(JSON.stringify({type:'peer-joined'}));room.peers.add(ws);ws.room=code;touch(room);ws.send(JSON.stringify({type:'joined',room:code,items:room.items.map(publicItem)}));return}}
);ws.on('close',()=>leave(ws))});
setInterval(()=>{for(const [code,room] of rooms)if(room.expiresAt<Date.now())rooms.delete(code)},60000).unref();
const port=Number(process.env.PORT)||3000;server.listen(port,'0.0.0.0',()=>console.log(`Droppoint listening on ${port}`));