const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const app = express();
const server = http.createServer(app);
const io = new Server(server);
const players = new Map();
const monsterStates = new Map();
const parties = new Map();
const playerParty = new Map();
const code = () => Math.random().toString(36).slice(2, 7).toUpperCase();
function partyPayload(p) { return { code:p.code, leader:p.leader, members:p.members.map(id=>({id,name:(players.get(id)||{}).n||'모험가'})) }; }
function sendParty(p) { const payload=partyPayload(p); for(const id of p.members) io.to(id).emit('party:state',payload); }
function leaveParty(id) { const c=playerParty.get(id); if(!c)return; const p=parties.get(c); playerParty.delete(id); if(!p)return; p.members=p.members.filter(x=>x!==id); if(!p.members.length){parties.delete(c);return;} if(p.leader===id)p.leader=p.members[0]; sendParty(p); }
app.use(express.static(__dirname));
app.get('/health', (_req,res)=>res.json({ok:true,players:players.size,parties:parties.size}));
io.on('connection', socket => {
  socket.emit('players:init',[...players.entries()].filter(([id,p])=>id!==socket.id&&p).map(([id,presence])=>({id,presence})));
  players.set(socket.id,null); io.emit('player:update',{id:socket.id,presence:null});
  socket.on('player:presence', presence => {
    if(!presence||typeof presence!=='object')return;
    const clean={n:String(presence.n||'모험가').slice(0,20),x:Number(presence.x)||0,y:Number(presence.y)||0,f:Number(presence.f)||1,a:String(presence.a||'village').slice(0,24),s:Number(presence.s)||1,j:String(presence.j||'모험가').slice(0,24),l:Math.max(1,Number(presence.l)||1),h:Math.max(0,Number(presence.h)||0),m:Math.max(1,Number(presence.m)||1)};
    players.set(socket.id,clean);io.emit('player:update',{id:socket.id,presence:clean});
  });
  socket.on('monster:sync', data=>{
    const stage=Math.max(1,Math.min(50,Number(data&&data.stage)||1));
    const list=[];for(const [key,state] of monsterStates){if(state.stage===stage)list.push(state)}socket.emit('monster:sync',list);
  });
  socket.on('monster:hit', data=>{
    if(!data||data.area!=='dungeon')return;
    const stage=Math.max(1,Math.min(50,Number(data.stage)||1));const id=String(data.id);if(!/^\d{1,4}$/.test(id))return;
    const amount=Math.max(0,Math.min(1000000,Math.round(Number(data.amount)||0)));if(!amount)return;
    const key=stage+':'+id;let state=monsterStates.get(key);
    if(!state){const initial=Math.max(1,Math.min(10000000,Math.round(Number(data.hp)||1)));state={stage,id,hp:initial};monsterStates.set(key,state)}
    if(state.hp<=0)return;
    state.hp=Math.max(0,state.hp-amount);state.killer=state.hp===0?socket.id:null;
    io.emit('monster:state',{stage,id,hp:state.hp,killer:state.killer});
  });
  socket.on('party:create',()=>{
    leaveParty(socket.id);let c;do{c=code()}while(parties.has(c));const p={code:c,leader:socket.id,members:[socket.id]};parties.set(c,p);playerParty.set(socket.id,c);socket.emit('party:created',{code:c,party:partyPayload(p)});sendParty(p);
  });
  socket.on('party:join', raw=>{
    const c=String(raw||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,8);const p=parties.get(c);
    if(!p){socket.emit('party:error','초대 코드를 찾을 수 없습니다.');return}
    if(p.members.length>=4&&!p.members.includes(socket.id)){socket.emit('party:error','파티는 최대 4명까지 참가할 수 있습니다.');return}
    leaveParty(socket.id);if(!p.members.includes(socket.id))p.members.push(socket.id);playerParty.set(socket.id,c);sendParty(p);
  });
  socket.on('disconnect',()=>{leaveParty(socket.id);players.delete(socket.id);io.emit('player:left',socket.id)});
});
const port=process.env.PORT||3000;server.listen(port,'0.0.0.0',()=>console.log(`Dungeon RPG multiplayer server listening on ${port}`));
