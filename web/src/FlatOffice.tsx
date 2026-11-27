import React,{useEffect,useRef,useState} from 'react';
import {Application,Container,Graphics,Text,TextStyle} from 'pixi.js';
import {OfficeEngine,Point,stations,desk,deskPoint,isManagerRole,stationFor,DOOR,activeStations} from './engine';
import {identity} from './Character';
import {lookSeed,skinTone,hireSalt} from './looks';
import {createHoverTip,usageLines} from './usage';
import {floorName,stationOf,trunc} from './Office';
import {CameraTools,flipPan,overlayInsets,readableText,runCameraCommands,useCameraControls} from './camera';

/** Flat 2D office: a top-down floor plan with pixel furniture and 8-bit agents. Same engine, same grid as the isometric view. */
const T=48;
const P=3; // one sprite pixel, in world units
/** Horizontal pitch of a grid column. The 2D plans widen to the canvas shape (more floor between columns, sprites
 *  unchanged), so a landscape pane is filled by the office instead of empty side bars. Set per mount; see FlatOffice. */
let TX=T;
const flat=(p:Point)=>({x:p.x*TX,y:p.y*T});
/** Column pitch that fills a `w`x`h` canvas: snapped so the floor is a whole number of square tiles, and capped so
 *  the plan never stretches more than 1.7x (or narrower than square). */
function pitchFor(w:number,h:number,rows:number,wallH:number){
  const want=((rows*T+wallH+40)*w/Math.max(1,h)-64)/15;
  const tx=Math.max(T,Math.min(T*1.7,want));
  return T*Math.round(15*tx/T)/15;
}
const FONT='"Press Start 2P",ui-monospace,monospace';
const BODY_FRAME_MS=1000/8;

/** A small fixed palette, so the whole scene reads as one 8-bit set. */
const C={
  ink:0x1b1b2a, night:0x262b44, slate:0x3a4466, steel:0x5a6988, fog:0x8b9bb4, paper:0xf4f4f4, cream:0xfff1d6,
  wood:0xc28455, woodHi:0xd99c68, woodLo:0x8c5a33, woodDark:0x5c3a20,
  floorA:0xe6c79c, floorB:0xdcbb8d, seam:0xc9a676,
  wall:0xf1e3c8, wallLo:0xd9c6a3, trim:0x8c5a33, sky:0x8fd3ff, skyHi:0xc8ecff, cloud:0xffffff,
  red:0xe43b44, orange:0xf77622, yellow:0xfee761, green:0x3e8948, lime:0x63c74d, teal:0x2ce8f5, blue:0x0099db, navy:0x124e89,
  purple:0x68386c, pink:0xf6757a, leaf:0x3e8948, leafHi:0x63c74d, pot:0xb86f50,
  screenOff:0x262b44, screenOn:0x0d2b45,
};
/** `pixel`: a daylit top-down floor plan. `studio`: a front-view office at night on carpet tiles, agents behind their desks. */
export type FlatVariant='pixel'|'studio'|'cozy'|'midnight'|'rpg';
const WALL_H:Record<FlatVariant,number>={pixel:90,studio:170,cozy:90,midnight:60,rpg:84};
/** Studio colours: charcoal carpet and walls, a red executive rug, lit monitors. */
const S={
  carpetA:0x3b3b41, carpetB:0x34343a, carpetLine:0x29292e, wall:0x55555c, wallHi:0x626269, wallLo:0x404046, skirting:0x2a2a2e,
  frame:0x2b2b30, metal:0xa9a9b0, metalHi:0xd0d0d6, metalLo:0x77777f, crt:0xbdbdbd, crtHi:0xdedede, crtLo:0x8f8f8f,
  rug:0x8e1b25, rugLo:0x5e1119, gold:0xc9a227, led:0x39ff14, ledBg:0x0b0b0c, nightSky:0x16244a, nightLo:0x0e1630,
  building:0x1b1f2c, buildingHi:0x262b3b, window:0xf2c94c, moon:0xffe9a8,
};
/** Room-plan looks: `cozy` is a warm daylit floor with coloured rooms; `midnight` is a dark, minimal one with tagged rooms. */
type Floor='grid'|'checker'|'planks'|'carpet'|'tiles';
type RoomKit={bg:number;floorA:number;floorB:number;floor:Floor;roomFloors?:Record<string,[Floor,number,number]>;outline?:number;grid?:number;wall:number;wallTop:number;wallFace:number;tagBg:number;tagText:number;rooms:Record<string,number>;label:number;window:number;font:string;bold:boolean};
const ROOM_KITS:Record<'cozy'|'midnight'|'rpg',RoomKit>={
  cozy:{floor:'grid',bg:0xf3ebdc,floorA:0xdcc7a0,floorB:0xd6c098,grid:0xcbb38a,wall:0x6e5240,wallTop:0x8f6f55,wallFace:0xe9dcc4,tagBg:0xf0a030,tagText:0xffffff,
    rooms:{lobby:0xe6d6b6,meeting:0xaaa6c9,lounge:0xb4c7a3,workshop:0xd3cbb2,server:0xb9c0d0,boss:0xe0c9a0},label:0x8a7458,window:0x9fd3f0,font:'"DM Mono",ui-monospace,monospace',bold:true},
  midnight:{floor:'checker',bg:0x15141d,floorA:0x2b3a4b,floorB:0x314255,wall:0x0d0f15,wallTop:0x232733,wallFace:0x1a1d27,tagBg:0x2a2316,tagText:0xe8b04a,
    rooms:{lobby:0x202a37,meeting:0x36404f,lounge:0x2c413d,workshop:0x383844,server:0x2a3341,boss:0x3f3530},label:0x8a94a6,window:0x2d4a6b,font:FONT,bold:false},
  // Forest-lodge palette: sandstone flagstones, moss-green walls, terracotta and plum rugs, slate server tiles.
  rpg:{floor:'grid',bg:0x0d100b,floorA:0xc2a878,floorB:0xb89c6c,grid:0xa38a5e,outline:0x0d100b,wall:0x2f3d2a,wallTop:0x52683f,wallFace:0x3b4a34,tagBg:0x2f3d2a,tagText:0xf2e6c8,
    roomFloors:{lounge:['carpet',0x9a4e36,0x86412d],meeting:['carpet',0x5e4a7c,0x51406b],server:['grid',0x6c7a84,0x6c7a84],lobby:['planks',0x9a6a3e,0x8a5c34]},
    rooms:{lobby:0x9a6a3e,meeting:0x5e4a7c,lounge:0x9a4e36,workshop:0xb39668,server:0x6c7a84,boss:0xad8f60},label:0xf2e6c8,window:0x4f8a8c,font:FONT,bold:false},
};
/** Rooms on the engine grid (inclusive edges), with the walls between them. Doorways sit where agents' paths cross. */
const ROOMS:{key:string;name:string;x0:number;x1:number;y0:number;y1:number;only?:'cozy'|'midnight'}[]=[
  {key:'lobby',name:'ENTRANCE',x0:-.5,x1:14.5,y0:-.5,y1:1.55},
  {key:'boss',name:'BOSS',x0:-.5,x1:3.2,y0:1.55,y1:3.25,only:'midnight'},
  {key:'lounge',name:'LOUNGE',x0:-.5,x1:1.55,y0:3.3,y1:6.85},
  {key:'meeting',name:'MEETING',x0:5.95,x1:8.55,y0:3.95,y1:6.35},
  {key:'workshop',name:'WORKSHOP',x0:-.5,x1:5.6,y0:6.85,y1:10.5},
  {key:'server',name:'SERVER ROOM',x0:5.6,x1:14.5,y0:6.85,y1:10.5},
];
/** Wall segments [x0,y0,x1,y1] in grid units; gaps between segments are doorways. */
const ROOM_WALLS:[number,number,number,number][]=[
  [-.5,6.85,2.2,6.85],[3.9,6.85,7.1,6.85],[9.1,6.85,11.1,6.85],[12.9,6.85,14.5,6.85],
  [5.6,6.85,5.6,7.5],[5.6,8.7,5.6,10.5],
  [-.5,3.3,1.55,3.3],[1.55,3.3,1.55,4.3],[1.55,5.7,1.55,6.85],
  [5.95,3.95,6.9,3.95],[7.6,3.95,8.55,3.95],
];
const STATION_COLOR:Record<string,number>={research:C.blue,archive:C.orange,database:C.purple,engineering:C.green,compute:C.pink,human:C.red,meeting:C.teal,manager:C.yellow};
const STATION_NAMES:Record<string,string>={manager:'OPERATIONS',research:'RESEARCH',archive:'LIBRARY',engineering:'WORKSHOP',database:'RECORDS',compute:'SERVERS',human:'HELP DESK',meeting:'MEETING'};

// ── 8-bit sprites: 10 x 14 cells, drawn with P-sized squares, feet at the origin ──────────────
// H hair · S skin · E eye · T top · t top shade · W collar · K tie/accent · P trousers · B shoes · C chair
const HEAD_FRONT=['...HHHH...','..HHHHHH..','..HSSSSH..','..SESSES..','..SSSSSS..','...SSSS...'];
const HEAD_BACK =['...HHHH...','..HHHHHH..','..HHHHHH..','..HHHHHH..','..SHHHHS..','...SSSS...'];
const HEAD_SIDE =['...HHHH...','..HHHHHH..','..HHHSSS..','..HHSSES..','..HSSSSS..','...SSSS...'];
const BODY_FRONT=['.TTTWWTTT.','TtTTKKTTtT','TtTTKKTTtT','StTTTTTTtS'];
const BODY_BACK =['.TTTTTTTT.','TtTTTTTTtT','TtTTTTTTtT','StTTTTTTtS'];
const BODY_SIDE =['...TTTT...','...TTTT...','...TTTS...','...tTTT...'];
const LEGS_STAND=['..PPPPPP..','..PP..PP..','..PP..PP..','.BBB..BBB.'];
const LEGS_STEP =['..PPPPPP..','..PP...PP.','.PP....PP.','.BB....BB.'];
const LEGS_SIDE_STAND=['...PPPP...','...PP.P...','...PP.P...','...BBBBB..'];
const LEGS_SIDE_STEP =['...PPPP...','..PP..PP..','.PP....PP.','.BB....BB.'];
const SEATED_BACK=['..PPPPPP..','.CCCCCCCC.','.C......C.','.C......C.'];
const TYPING_A=['.TTTTTTTT.','TtTTTTTTtT','StTTTTTTtS','.tTTTTTTt.'];
const TYPING_B=['.TTTTTTTT.','StTTTTTTtT','TtTTTTTTtS','.tTTTTTTt.'];

const SKINS=[0xf5c6a0,0xe8b28a,0xc98b5e,0xa86b44,0x7a4a2e,0x5a3420];
const HAIRS=[0x2b1d14,0x4a2e1a,0x7a4a24,0xc28a3a,0x1b1b2a,0x9c3a2a,0xd8d0c0,0x3a2a4a];
const TOPS=[0x0099db,0xe43b44,0x3e8948,0xf77622,0x68386c,0x2ce8f5,0xfee761,0xf6757a,0x124e89,0x63c74d];

type Look={skin:number;hair:number;top:number;topLo:number;tie:number;pants:number;style:number;glasses:boolean};
/** Scales each channel, clamped so a lightened colour never spills into the next channel. */
const shadeHex=(hex:number,f:number)=>{const ch=(v:number)=>Math.min(255,Math.round(v*f));return (ch((hex>>16)&255)<<16)|(ch((hex>>8)&255)<<8)|ch(hex&255);};
function lookFor(id:string,role:string):Look{
  const seed=lookSeed(id),mgr=isManagerRole(role);
  const top=mgr?C.night:TOPS[seed%TOPS.length];
  return {skin:skinTone(id,SKINS),hair:HAIRS[(seed>>3)%HAIRS.length],top,topLo:shadeHex(top,.72),
    tie:mgr?C.red:shadeHex(top,.72),pants:mgr?C.ink:[C.navy,C.slate,C.woodDark,C.ink][(seed>>5)%4],style:(seed>>7)%4,glasses:!mgr&&(seed>>9)%3===0||mgr&&(seed>>9)%2===0};
}
/** Hair variations: 0 short, 1 long, 2 bun, 3 cap in the top colour. */
function styleHead(rows:string[],style:number,view:'front'|'back'|'side'):string[]{
  const r=rows.map(x=>x.split(''));
  if(style===1&&view!=='side'){for(let y=2;y<6;y++){r[y][1]='H';r[y][8]='H';}}
  if(style===1&&view==='side'){for(let y=2;y<6;y++)r[y][2]='H';}
  if(style===2){r[0][4]='H';r[0][5]='H';r.unshift('....HH....'.split(''));r.pop();}
  if(style===3){r[0]='...KKKK...'.split('');r[1]=(view==='side'?'..KKKKKKK.':'..KKKKKK..').split('');}
  return r.map(x=>x.join(''));
}
function spriteColors(l:Look,glasses:boolean):Record<string,number>{
  return {H:l.hair,S:l.skin,E:glasses?C.ink:0x1b1b2a,T:l.top,t:l.topLo,W:C.paper,K:l.style===3?shadeHex(l.top,.85):l.tie,P:l.pants,B:C.ink,C:C.woodDark};
}
function drawSprite(g:Graphics,rows:string[],colors:Record<string,number>,flip=false,dy=0){
  const w=rows[0].length,h=rows.length,ox=-w*P/2,oy=-h*P+dy;
  for(let y=0;y<h;y++){
    const row=rows[y];
    for(let x=0;x<w;x++){
      const ch=row[flip?w-1-x:x];
      if(ch==='.')continue;
      g.rect(ox+x*P,oy+y*P,P,P).fill(colors[ch]??C.ink);
    }
  }
}

type Pose={view:'front'|'back'|'side';flip:boolean;seated:boolean;step:number;typing:number;headset?:boolean;chibi?:boolean};
/** RPG-style sprite: a head about a third larger than the body, everything outlined in near-black. */
function drawChibi(g:Graphics,head:string[],rest:string[],colors:Record<string,number>,flip:boolean,bob:number){
  const HP=P*1.35,w=10;
  const cells:[number,number,number,string][]=[];
  const restTop=-rest.length*P+bob,headTop=restTop-head.length*HP+HP*1.2;
  rest.forEach((row,y)=>{for(let x=0;x<w;x++){const ch=row[flip?w-1-x:x];if(ch!=='.')cells.push([-w*P/2+x*P,restTop+y*P,P,ch]);}});
  head.forEach((row,y)=>{for(let x=0;x<w;x++){const ch=row[flip?w-1-x:x];if(ch!=='.')cells.push([-w*HP/2+x*HP,headTop+y*HP,HP,ch]);}});
  for(const [x,y,s] of cells)g.rect(x-1.5,y-1.5,s+3,s+3).fill(0x0d100b);
  for(const [x,y,s,ch] of cells)g.rect(x,y,s,s).fill(colors[ch]??C.ink);
}
function drawAgent(g:Graphics,l:Look,pose:Pose,carrying:boolean){
  g.clear();
  g.ellipse(0,0,14,4).fill({color:C.ink,alpha:.22});
  const colors=spriteColors(l,l.glasses);
  const head=styleHead(pose.view==='front'?HEAD_FRONT:pose.view==='back'?HEAD_BACK:HEAD_SIDE,l.style,pose.view);
  let body=pose.view==='front'?BODY_FRONT:pose.view==='back'?BODY_BACK:BODY_SIDE;
  let legs=pose.view==='side'?(pose.step?LEGS_SIDE_STEP:LEGS_SIDE_STAND):(pose.step?LEGS_STEP:LEGS_STAND);
  if(pose.seated&&pose.view==='back'){body=pose.typing?TYPING_B:TYPING_A;legs=SEATED_BACK;}
  else if(pose.seated){legs=LEGS_STAND;if(pose.typing)body=[body[0],body[1],body[2],'.tTTTTTTt.'];}
  const bob=pose.step?-P:0;
  if(pose.chibi){drawChibi(g,head,[...body,...legs],colors,pose.flip,bob);return;}
  drawSprite(g,[...head,...body,...legs],colors,pose.flip,bob);
  // Glasses: a dark bar across the eyes (front and side only).
  if(l.glasses&&pose.view!=='back'){
    const top=-14*P+bob+(l.style===2?4*P:3*P);
    if(pose.view==='front')g.rect(-3*P,top,6*P,P).fill({color:C.ink,alpha:.85});
    else g.rect((pose.flip?-3:1)*P,top,2*P,P).fill({color:C.ink,alpha:.85});
  }
  if(pose.headset&&pose.view!=='side'){
    // Over-ear headset with a boom mic.
    const top=-14*P+bob+(l.style===2?P:0);
    g.rect(-3*P,top-P,6*P,P).fill(C.ink);
    g.rect(-4*P,top,P,P).fill(C.ink);g.rect(3*P,top,P,P).fill(C.ink);
    g.rect(-5*P,top+P,2*P,3*P).fill(C.ink);g.rect(3*P,top+P,2*P,3*P).fill(C.ink);
    g.rect(-5*P+1,top+P+1,P,P).fill(C.steel);g.rect(4*P-1,top+P+1,P,P).fill(C.steel);
    if(pose.view==='front'){g.rect(-4*P,top+4*P,P,P).fill(C.ink);g.rect(-3*P,top+5*P,2*P,P/1.5).fill(C.ink);g.rect(-1*P,top+5*P,P,P).fill(C.red);}
  }
  if(carrying){
    const fx=pose.flip?-6*P:3*P,fy=-6*P+bob;
    g.rect(fx,fy-P,2*P,P).fill(0xd9a033);
    g.rect(fx,fy,4*P,3*P).fill(C.yellow);
    g.rect(fx+P,fy+P,2*P,P).fill(C.paper);
  }
}

/** Small pixel icon over the head for the state the agent is in. */
function drawStateIcon(g:Graphics,action:string,frame:number,y:number){
  const px=(x:number,yy:number,c:number)=>g.rect(x*P-P/2+8,y+yy*P,P,P).fill(c);
  const box=(c:number)=>{g.rect(8-P*2.5,y-P,P*6,P*6).fill(C.paper).stroke({color:C.ink,width:1.5});void c;};
  if(/Error|Failed|Rejected|Revise/.test(action)){box(C.red);for(let i=0;i<4;i++){px(-1+i,i,C.red);px(2-i,i,C.red);}return;}
  if(/Complete|Approved/.test(action)){box(C.green);px(-1,2,C.green);px(0,3,C.green);px(1,2,C.green);px(2,1,C.green);px(3,0,C.green);return;}
  if(/Awaiting human/.test(action)){box(C.orange);px(0,0,C.orange);px(1,0,C.orange);px(2,1,C.orange);px(1,2,C.orange);px(1,4,C.orange);return;}
  if(/Waiting|Blocked|Queued/.test(action)){box(C.yellow);for(let i=0;i<4;i++)px(i,0,C.woodLo),px(i,4,C.woodLo);px(1,1,C.yellow);px(2,1,C.yellow);px(frame%2?1:2,3,C.yellow);px(1.5,2,C.woodLo);return;}
  if(/Thinking/.test(action)){for(let i=0;i<3;i++)if(i<=frame%3)g.rect(8-P*3+i*P*2.5,y+P*2,P*1.6,P*1.6).fill(C.ink);return;}
  if(/Discussing|question|Routing/i.test(action)){box(C.teal);px(0,1,C.teal);px(1,1,C.teal);px(2,1,C.teal);px(0,3,C.teal);px(1,3,C.teal);return;}
}

// ── Studio furniture ──────────────────────────────────────────────────────────
/** Basket-weave carpet tile: four quadrants of stripes, alternating direction. */
function drawCarpetTile(g:Graphics,px:number,py:number,odd:number){
  for(let q=0;q<4;q++){
    const qx=px+(q%2)*24,qy=py+Math.floor(q/2)*24,horizontal=(q+odd)%2===0;
    g.rect(qx,qy,24,24).fill(S.carpetB);
    for(let k=0;k<3;k++){
      if(horizontal)g.rect(qx,qy+k*8,24,6).fill(S.carpetA);else g.rect(qx+k*8,qy,6,24).fill(S.carpetA);
    }
    g.rect(qx,qy,24,1).fill(S.carpetLine);g.rect(qx,qy,1,24).fill(S.carpetLine);
  }
}
/** A night-city window: skyline, lit windows and a moon. */
function drawSkyline(g:Graphics,x:number,y:number,w:number,h:number){
  g.rect(x-6,y-6,w+12,h+12).fill(S.frame);
  g.rect(x,y,w,h).fill(S.nightSky);g.rect(x,y+h*.55,w,h*.45).fill(S.nightLo);
  g.rect(x+w-30,y+10,12,12).fill(S.moon);g.rect(x+w-27,y+8,6,2).fill(S.moon);
  let bx=x+3,i=0;
  while(bx<x+w-6){
    const bw=14+(i*7)%12,bh=h*.35+((i*37)%Math.floor(h*.5));
    g.rect(bx,y+h-bh,bw,bh).fill(i%2?S.building:S.buildingHi);
    for(let wy=y+h-bh+5;wy<y+h-5;wy+=7)for(let wx=bx+3;wx<bx+bw-4;wx+=5)if((wx*3+wy*7+i)%5<2)g.rect(wx,wy,2,3).fill(S.window);
    bx+=bw+2;i++;
  }
  g.rect(x+w/2-2,y,4,h).fill(S.frame);
  g.rect(x-8,y+h+6,w+16,5).fill(S.metalLo);
}
function drawElevator(g:Graphics,cx:number,base:number){
  g.rect(cx-38,base-112,76,112).fill(S.metalLo);
  g.rect(cx-34,base-106,68,106).fill(S.metal);
  g.rect(cx-30,base-100,29,100).fill(S.metalHi);g.rect(cx+1,base-100,29,100).fill(S.metalHi);
  g.rect(cx-1,base-100,2,100).fill(S.metalLo);
  for(const dx of [-24,-8,6,22])g.rect(cx+dx,base-96,2,92).fill({color:S.metalLo,alpha:.5});
  g.rect(cx-10,base-124,20,10).fill(S.frame);g.rect(cx-4,base-122,8,6).fill(C.red);
  g.rect(cx+42,base-60,8,14).fill(S.frame);g.rect(cx+44,base-57,4,3).fill(C.lime);g.rect(cx+44,base-52,4,3).fill(C.orange);
}
function drawWaterCooler(g:Graphics,x:number,y:number){
  g.rect(x-12,y-34,24,34).fill(S.metalHi);g.rect(x-12,y-34,24,3).fill(0xffffff);
  g.rect(x-6,y-26,12,6).fill(S.frame);g.rect(x-4,y-24,3,3).fill(C.blue);g.rect(x+1,y-24,3,3).fill(C.red);
  g.rect(x-10,y-64,20,30).fill({color:0x5bc0eb,alpha:.85});g.rect(x-7,y-60,4,22).fill({color:0xffffff,alpha:.5});
  g.rect(x-5,y-68,10,4).fill(0x3a9bd5);
}
function drawCoffeeMachine(g:Graphics,x:number,y:number){
  g.rect(x-16,y-12,32,12).fill(S.frame);
  g.rect(x-14,y-52,28,40).fill(S.metal);g.rect(x-14,y-52,28,4).fill(S.metalHi);
  g.rect(x-10,y-44,20,10).fill(S.frame);g.rect(x-8,y-42,6,3).fill(C.lime);
  g.rect(x-5,y-30,10,4).fill(S.frame);g.rect(x-4,y-24,8,10).fill(C.paper);g.rect(x-3,y-22,6,2).fill(C.woodDark);
  g.rect(x+10,y-60,8,40).fill({color:0x3a2a20,alpha:.8});g.rect(x+11,y-58,6,8).fill(0x7a4a2a);
}
function drawPrinter(g:Graphics,x:number,y:number){
  drawTable(g,x-24,x+24,y-22,y-14);
  g.rect(x-18,y-42,36,20).fill(0xe8e2d0);g.rect(x-18,y-42,36,3).fill(0xffffff);
  g.rect(x-12,y-46,24,5).fill(C.paper);g.rect(x-14,y-32,28,3).fill(S.frame);g.rect(x+10,y-38,4,2).fill(C.lime);
}
function drawWastebin(g:Graphics,x:number,y:number){
  g.rect(x-10,y-24,20,24).fill(S.frame);
  for(let i=0;i<4;i++)g.rect(x-9+i*5,y-23,2,22).fill(S.metalLo);
  g.rect(x-11,y-26,22,3).fill(S.metalLo);
  g.rect(x-6,y-30,6,5).fill(C.paper);g.rect(x+1,y-31,5,5).fill(C.paper);
}
/** An agent's desk seen from the front: the agent sits behind it, its CRT turned toward the agent, and a small LED plate on the front shows its current task. */
function drawStudioDesk(g:Graphics,id:string,manager:boolean,lit:boolean,col:number,frame:number){
  g.clear();
  const w=manager?46:40;
  g.rect(-w+2,30,2*w-4,5).fill({color:0x000000,alpha:.28});
  g.rect(-w,-10,2*w,10).fill(C.woodHi);g.rect(-w,-10,2*w,2).fill(0xe8b27e);
  g.rect(-w,0,2*w,24).fill(manager?C.woodLo:C.wood);g.rect(-w,0,2*w,2).fill(C.woodLo);
  g.rect(-w+4,4,2,18).fill({color:C.woodDark,alpha:.4});g.rect(w-6,4,2,18).fill({color:C.woodDark,alpha:.4});
  g.rect(-w+2,24,5,10).fill(C.woodDark);g.rect(w-7,24,5,10).fill(C.woodDark);
  g.rect(-31,6,62,12).fill(S.ledBg).stroke({color:C.woodDark,width:1});
  // CRT on the left, screen facing the agent: we see its grey casing, and its glow when it is on.
  g.rect(-w+2,-42,30,30).fill(S.crt);g.rect(-w+2,-42,30,3).fill(S.crtHi);g.rect(-w+2,-15,30,3).fill(S.crtLo);
  for(let v=0;v<4;v++)g.rect(-w+7,-34+v*5,20,2).fill(S.crtLo);
  g.rect(-w+10,-12,14,2).fill(S.crtLo);
  if(lit){g.rect(-w+32,-40,3,26).fill({color:col,alpha:.85});g.rect(-w+35,-38,4,22).fill({color:col,alpha:.25+((frame%2)*.15)});}
  g.rect(-12,-8,26,5).fill(S.frame);for(let k=0;k<6;k++)g.rect(-10+k*4,-7,3,1).fill(S.metalLo);
  const seed=identity(id);
  if(seed%4===0)drawMug(g,w-16,-17,[C.red,C.blue,C.paper,C.yellow][seed%4]);
  else if(seed%4===1)drawPlant(g,w-12,-8,.45);
  else if(seed%4===2){g.rect(w-20,-18,12,8).fill(C.yellow);g.rect(w-19,-17,10,1).fill(C.orange);}
  else{g.rect(w-18,-16,8,8).fill(C.ink);g.circle(w-14,-12,2).fill(C.paper);}
  if(manager){g.rect(w-34,-20,4,10).fill(C.woodDark);g.rect(w-38,-26,12,7).fill(C.yellow);}
}
/** Pixel icon for the kind of tool in use, shown in the studio speech bubble. */
function drawToolIcon(g:Graphics,kind:string|undefined,x:number,y:number){
  g.rect(x,y,16,16).fill(C.paper).stroke({color:C.ink,width:1.5});
  const px=(a:number,b:number,w=2,h=2,c:number=C.ink)=>g.rect(x+a,y+b,w,h).fill(c);
  if(kind==='research'){g.circle(x+7,y+7,4).stroke({color:C.ink,width:2});px(10,10,4,2);px(12,12,2,2);}
  else if(kind==='engineering'){px(3,4,2,2);px(5,6,2,2);px(3,8,2,2);px(8,10,5,2);}
  else if(kind==='database'){g.ellipse(x+8,y+4,5,2).fill(C.ink);px(3,4,10,8,C.ink);g.ellipse(x+8,y+12,5,2).fill(C.ink);px(4,7,8,1,C.paper);}
  else if(kind==='archive'){px(3,3,4,10,C.red);px(7,3,3,10,C.blue);px(10,4,3,9,C.green);}
  else if(kind==='compute'){px(5,5,6,6);px(7,2,2,12);px(2,7,12,2);px(7,7,2,2,C.paper);}
  else {px(3,7);px(7,7);px(11,7);}
}

// ── Furniture ─────────────────────────────────────────────────────────────────
/** A monitor with its screen facing the room. `lit` animates a few lines of output in `col`. */
function drawMonitor(g:Graphics,x:number,y:number,w:number,h:number,lit:boolean,col:number,frame:number){
  g.rect(x-w/2-3,y-h-3,w+6,h+6).fill(C.fog);
  g.rect(x-w/2-3,y-h-3,w+6,3).fill(C.paper);
  g.rect(x-w/2,y-h,w,h).fill(lit?C.screenOn:C.screenOff);
  if(lit){
    const lines=Math.floor((h-6)/5);
    for(let i=0;i<lines;i++){
      const len=((i*7+frame*3)%(w-10))+6;
      g.rect(x-w/2+4,y-h+4+i*5,Math.min(len,w-8),2).fill({color:col,alpha:i===((frame)%lines)?1:.7});
    }
    if(frame%2===0)g.rect(x-w/2+4+((frame*5)%(w-10)),y-6,3,3).fill(C.paper);
  }else g.rect(x-w/2+3,y-h+3,4,2).fill({color:C.fog,alpha:.5});
  g.rect(x-3,y+3,6,4).fill(C.steel);
  g.rect(x-8,y+7,16,2).fill(C.steel);
}
function drawTable(g:Graphics,x0:number,x1:number,yTop:number,yFront:number,top=C.wood){
  g.rect(x0,yTop,x1-x0,yFront-yTop).fill(top);
  g.rect(x0,yTop,x1-x0,3).fill(top===C.wood?C.woodHi:shadeHex(top,1.15));
  g.rect(x0,yFront,x1-x0,6).fill(top===C.wood?C.woodLo:shadeHex(top,.7));
  g.rect(x0+3,yFront+6,4,10).fill(C.woodDark);g.rect(x1-7,yFront+6,4,10).fill(C.woodDark);
}
function drawPlant(g:Graphics,x:number,y:number,s=1){
  g.rect(x-7*s,y-12*s,14*s,12*s).fill(C.pot);g.rect(x-8*s,y-14*s,16*s,3*s).fill(shadeHex(C.pot,.8));
  for(const [dx,dy,w,h,c] of [[-10,-26,8,12,C.leaf],[2,-30,8,16,C.leaf],[-4,-34,8,18,C.leafHi],[-12,-20,6,6,C.leafHi],[6,-22,6,8,C.leafHi]] as const)
    g.rect(x+dx*s,y+dy*s,w*s,h*s).fill(c);
}
function drawMug(g:Graphics,x:number,y:number,c:number){g.rect(x,y,6,6).fill(c);g.rect(x+6,y+1,2,3).fill(c);g.rect(x+1,y+1,4,1).fill(C.woodDark);}

/** An agent's own desk: a table north of the seat with a computer facing the room, so the owner sits with its back to us. */
function drawDesk(g:Graphics,id:string,manager:boolean,lit:boolean,col:number,frame:number,rpg=false,empty=false){
  g.clear();
  if(rpg){
    // Outlined walnut table, slate monitor with an amber screen, and a terracotta stool that shows while the seat is free.
    const w=manager?42:36,ink=0x0d100b;
    g.rect(-w-2,-50,2*w+4,30).fill(ink);g.rect(-w,-48,2*w,20).fill(0x7a5232);g.rect(-w,-48,2*w,3).fill(0x95683f);g.rect(-w,-28,2*w,6).fill(0x58391f);
    g.rect(-w+2,-22,5,10).fill(ink);g.rect(w-7,-22,5,10).fill(ink);
    g.rect(-17,-78,34,32).fill(ink);g.rect(-15,-76,30,24).fill(0x46505a);g.rect(-12,-73,24,17).fill(lit?0x4a2e0c:0x22262a);
    if(lit)for(let i=0;i<3;i++)g.rect(-10,-71+i*5,8+((i*7+frame*3)%12),2).fill(0xffc061);
    g.rect(-6,-52,12,4).fill(0x5a646e);g.rect(-14,-46,28,5).fill(0x6a747e);g.rect(-14,-46,28,1).fill(ink);
    if(empty){g.rect(-11,-2,22,12).fill(ink);g.rect(-9,0,18,8).fill(0xb4643c);g.rect(-9,0,18,2).fill(0xd08456);g.rect(-7,10,3,5).fill(ink);g.rect(4,10,3,5).fill(ink);}
    if(identity(id)%2===0)drawMug(g,w-12,-44,0xf0ead8);
    return;
  }
  const w=manager?40:34,top=manager?C.woodLo:C.wood;
  g.rect(-w+2,-22,2*w-4,6).fill({color:C.ink,alpha:.12});
  drawTable(g,-w,w,-46,-24,top);
  drawMonitor(g,manager?-8:0,-52,manager?30:28,20,lit,col,frame);
  if(manager)drawMonitor(g,20,-52,18,16,lit,C.yellow,frame+1);
  g.rect(-10,-36,20,5).fill(C.fog);g.rect(-9,-35,18,1).fill(C.paper);
  const seed=identity(id);
  if(seed%3===0)drawMug(g,w-14,-42,[C.red,C.blue,C.paper][seed%3]);
  else if(seed%3===1){g.rect(-w+6,-42,12,8).fill(C.paper);g.rect(-w+7,-40,10,1).fill(C.fog);g.rect(-w+7,-37,8,1).fill(C.fog);}
  else drawPlant(g,w-10,-36,.5);
}

/** Each station's furniture, north of the point agents stand on to use it. */
function drawStation(g:Graphics,key:string,active:boolean,frame:number){
  g.clear();
  const col=STATION_COLOR[key]??C.blue;
  if(key==='research'){
    drawTable(g,-40,40,-46,-24);
    drawMonitor(g,-14,-52,32,22,active,col,frame);drawMonitor(g,18,-52,26,18,active,C.teal,frame+2);
    g.circle(30,-34,4).stroke({color:C.ink,width:2});g.rect(33,-31,5,2).fill(C.ink);
  }else if(key==='engineering'){
    drawTable(g,-40,40,-46,-24);
    drawMonitor(g,-16,-52,28,20,active,C.lime,frame);drawMonitor(g,16,-52,28,20,active,C.lime,frame+1);
    g.rect(-30,-36,14,6).fill(C.slate);g.rect(-29,-35,12,1).fill(C.lime);
  }else if(key==='archive'){
    for(const sx of [-38,2]){
      g.rect(sx,-86,36,64).fill(C.woodLo);g.rect(sx+2,-84,32,60).fill(C.woodDark);
      for(let shelf=0;shelf<4;shelf++){
        const by=-84+shelf*15;
        for(let b=0;b<6;b++){const h=9+((b*3+shelf)%3)*2;g.rect(sx+3+b*5,by+13-h,4,h).fill([C.red,C.blue,C.green,C.orange,C.purple,C.yellow][(b+shelf+(sx>0?2:0))%6]);}
        g.rect(sx+2,by+13,32,2).fill(C.woodLo);
      }
    }
    if(active){g.rect(-4,-30,8,6).fill(C.paper);g.rect(-3,-29,6,1).fill(C.fog);}
  }else if(key==='database'||key==='compute'){
    for(const sx of [-36,-11,14]){
      g.rect(sx,-84,22,62).fill(C.night);g.rect(sx,-84,22,3).fill(C.steel);
      for(let u=0;u<7;u++){
        g.rect(sx+2,-79+u*8,18,6).fill(C.slate);
        const on=active?((u+frame+sx)%3!==0):u%3===0;
        g.rect(sx+4,-77+u*8,3,2).fill(on?col:C.ink);g.rect(sx+9,-77+u*8,3,2).fill(on&&(u+frame)%2?C.lime:C.ink);
      }
    }
  }else if(key==='human'){
    drawTable(g,-40,40,-40,-22,C.cream);
    drawMonitor(g,-16,-46,24,16,active,col,frame);
    g.rect(14,-52,4,12).fill(C.woodDark);g.rect(6,-64,22,14).fill(C.paper).stroke({color:C.ink,width:1.5});
    g.rect(15,-61,4,2).fill(C.red);g.rect(17,-59,2,3).fill(C.red);g.rect(16,-55,2,2).fill(C.red);
    g.rect(24,-30,8,3).fill(C.yellow);g.rect(26,-33,4,3).fill(C.yellow);
  }else if(key==='meeting'){
    // Centred on its point (people gather on every side), unlike the other stations.
    for(const [cx,cy] of [[-30,-30],[0,-32],[30,-30]])g.rect(cx-6,cy,12,10).fill(C.woodDark);
    g.rect(-46,-20,92,30).fill(C.woodLo);g.rect(-44,-22,88,28).fill(C.wood);g.rect(-44,-22,88,3).fill(C.woodHi);
    g.rect(-6,-14,12,10).fill(active?C.teal:C.fog);
    if(active&&frame%2)g.rect(-2,-11,4,4).fill(C.paper);
  }
}

export function FlatOffice({engine,selected,follow,fitToken,onSelect,agentScale=1,variant='pixel'}:{
  engine:OfficeEngine;selected?:string;follow?:string;fitToken:number;onSelect:(id:string)=>void;agentScale?:number;variant?:FlatVariant;
}){
  const host=useRef<HTMLDivElement>(null);
  const view=useCameraControls();
  const latest=useRef({selected,follow,onSelect,fitToken,agentScale,rotated:view.rotated});
  latest.current={selected,follow,onSelect,fitToken,agentScale,rotated:view.rotated};
  // Bumped when the canvas changes shape enough to need a different column pitch: the plan is rebuilt for it.
  const [layout,setLayout]=useState(0);
  const [error,setError]=useState('');

  useEffect(()=>{
    let disposed=false;
    const app=new Application();
    let cleanup=()=>{};

    (async()=>{
      const studio=variant==='studio',wallH=WALL_H[variant];
      const visibleHeight=()=>{const i=overlayInsets(host.current);return host.current!.clientHeight-i.top-i.bottom;};
      TX=pitchFor(host.current!.clientWidth,visibleHeight(),engine.rows(),wallH);
      /** Wall decor placed in pixels for the square plan, spread to the same spot on a wider wall. */
      const X=(n:number)=>Math.round(n*TX/T);
      const kit=variant==='cozy'||variant==='midnight'||variant==='rpg'?ROOM_KITS[variant]:undefined;
      const font=kit?.font??FONT;
      await app.init({resizeTo:host.current!,background:studio?0x141416:kit?kit.bg:0x2a2238,antialias:false,resolution:Math.min(devicePixelRatio,2),autoDensity:true,roundPixels:true});
      if(disposed){app.destroy(true,{children:true});return;}
      host.current!.appendChild(app.canvas);
      // The pixel font is optional: without it (offline) labels use the monospace fallback.
      await Promise.race([document.fonts?.load(`${kit?.bold?'700 ':''}8px ${font}`).catch(()=>undefined),new Promise(r=>setTimeout(r,1500))]);
      if(disposed)return;

      const world=new Container(),floor=new Graphics(),rugs=new Graphics(),tracks=new Graphics(),people=new Container(),overlay=new Graphics(),labels=new Container();
      app.stage.addChild(world);
      const wallLive=new Graphics(),wallText=new Container();
      world.addChild(floor,rugs,wallLive,wallText,tracks,people,overlay,labels);
      people.sortableChildren=true;labels.sortableChildren=true;
      const label=(text:string,size:number,fill:number)=>new Text({text,style:new TextStyle({fontFamily:font,fontSize:kit?.bold?size+2:size,fill,letterSpacing:.5,fontWeight:kit?.bold?'700':'400'})});

      // ── Floor, walls and fixed decor ──────────────────────────────────────
      let drawnRows=0;
      const buildFloor=(rows:number)=>{
        drawnRows=rows;floor.clear();
        const x0=-TX/2,x1=14.5*TX,y0=-T/2,y1=(rows-.5)*T,cols=Math.round(15*TX/T);
        if(studio){buildStudio(rows,x0,x1,y0,y1,cols);return;}
        if(kit){buildRooms(kit,rows,x0,x1,y0,y1);return;}
        for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){
          const px=x0+x*T,py=y*T-T/2;
          for(let k=0;k<4;k++){
            g4(floor,px,py+k*12,T,12,(y*4+k+(x%2))%2?C.floorA:C.floorB);
            const off=((y*4+k)*17+x*29)%T;
            floor.rect(px+off,py+k*12,2,12).fill(C.seam);
          }
        }
        // Back wall with windows and the door.
        floor.rect(x0-6,y0-84,x1-x0+12,84).fill(C.wall);
        floor.rect(x0-6,y0-12,x1-x0+12,12).fill(C.wallLo);
        floor.rect(x0-6,y0-90,x1-x0+12,6).fill(C.trim);
        floor.rect(x0-6,y0-3,x1-x0+12,3).fill(C.trim);
        for(const wx of [1.5,4,10,12.5]){
          const cx=wx*TX;
          floor.rect(cx-30,y0-72,60,48).fill(C.trim);
          floor.rect(cx-26,y0-68,52,40).fill(C.sky);
          floor.rect(cx-26,y0-68,52,12).fill(C.skyHi);
          floor.rect(cx-18+((wx*13)%10),y0-58,14,4).fill(C.cloud);floor.rect(cx-14+((wx*13)%10),y0-62,8,4).fill(C.cloud);
          floor.rect(cx-1,y0-68,2,40).fill(C.trim);floor.rect(cx-26,y0-49,52,2).fill(C.trim);
          floor.rect(cx-32,y0-26,64,4).fill(C.woodHi);
        }
        const door=flat(DOOR).x;
        floor.rect(door-26,y0-78,52,78).fill(C.trim);
        floor.rect(door-21,y0-73,42,73).fill(C.night);
        floor.rect(door-21,y0-73,10,73).fill(C.woodLo);floor.rect(door-14,y0-38,3,3).fill(C.yellow);
        floor.rect(door-16,y0-86,32,8).fill(C.lime);floor.rect(door-12,y0-84,24,4).fill(C.green);
        // Side walls: thin borders so the floor reads as a room.
        floor.rect(x0-10,y0-90,6,y1-y0+100).fill(C.trim);floor.rect(x1+4,y0-90,6,y1-y0+100).fill(C.trim);
        floor.rect(x0-10,y1+4,x1-x0+20,6).fill(C.trim);
      };
      function g4(g:Graphics,x:number,y:number,w:number,h:number,c:number){g.rect(x,y,w,h).fill(c);}
      /** Room plan: a fine-grid or checker floor, coloured rooms, walls with doorways, and a back wall with windows. */
      /** Fills a rectangle with one floor material. */
      function paintFloor(style:Floor,ax:number,ay:number,bx:number,by:number,c1:number,c2:number,grid?:number){
        floor.rect(ax,ay,bx-ax,by-ay).fill(c1);
        if(style==='grid'&&grid){for(let x=ax;x<=bx;x+=12)floor.rect(x,ay,1,by-ay).fill(grid);for(let y=ay;y<=by;y+=12)floor.rect(ax,y,bx-ax,1).fill(grid);}
        else if(style==='checker'||style==='tiles'){const n=style==='tiles'?16:12;for(let y=ay,i=0;y<by;y+=n,i++)for(let x=ax+(i%2)*n;x<bx;x+=2*n)floor.rect(x,y,Math.min(n,bx-x),Math.min(n,by-y)).fill(c2);}
        else if(style==='planks'){
          for(let y=ay,i=0;y<by;y+=8,i++){
            floor.rect(ax,y,bx-ax,1).fill(shadeHex(c1,.72));
            for(let x=ax+((i*37)%48);x<bx;x+=48)floor.rect(x,y,1,8).fill(shadeHex(c1,.72));
            if(i%3===1)floor.rect(ax,y+3,bx-ax,1).fill({color:c2,alpha:.5});
          }
        }else if(style==='carpet'){for(let y=ay;y<by;y+=4)for(let x=ax+((y/4)%2)*4;x<bx;x+=8)floor.rect(x,y,2,2).fill(c2);}
      }
      function buildRooms(k:RoomKit,rows:number,x0:number,x1:number,y0:number,y1:number){
        paintFloor(k.floor,x0,y0,x1,y1,k.floorA,k.floorB,k.grid);
        for(const r of ROOMS){
          if(r.only&&r.only!==variant)continue;
          const a=flat({x:r.x0,y:r.y0}),b=flat({x:r.x1,y:Math.min(r.y1,rows-.5)});
          const own=k.roomFloors?.[r.key];
          if(own){paintFloor(own[0],a.x,a.y,b.x,b.y,own[1],own[2]);continue;}
          floor.rect(a.x,a.y,b.x-a.x,b.y-a.y).fill({color:k.rooms[r.key],alpha:k.floor==='grid'?.85:k.floor==='planks'?0:1});
          if(k.floor==='grid'){for(let x=a.x;x<=b.x;x+=12)floor.rect(x,a.y,1,b.y-a.y).fill({color:0x000000,alpha:.05});for(let y=a.y;y<=b.y;y+=12)floor.rect(a.x,y,b.x-a.x,1).fill({color:0x000000,alpha:.05});}
        }
        // Interior walls: a dark body and a lighter cap, so they read as low partitions (outlined in the RPG look).
        const thick=k.outline?14:10;
        for(const [ax,ay,bx,by] of ROOM_WALLS){
          const a=flat({x:ax,y:ay}),b=flat({x:bx,y:by});
          if(ay===by){
            if(k.outline)floor.rect(a.x-2,a.y-thick+2,b.x-a.x+4,thick+4).fill(k.outline);
            floor.rect(a.x,a.y-thick+4,b.x-a.x,thick).fill(k.wall);floor.rect(a.x,a.y-thick+4,b.x-a.x,3).fill(k.wallTop);
          }else{
            if(k.outline)floor.rect(a.x-thick/2-2,a.y-10,thick+4,b.y-a.y+16).fill(k.outline);
            floor.rect(a.x-thick/2,a.y-8,thick,b.y-a.y+12).fill(k.wall);floor.rect(a.x-thick/2,a.y-8,thick,3).fill(k.wallTop);
          }
        }
        // Back wall with windows and the door.
        floor.rect(x0-8,y0-wallH,x1-x0+16,wallH).fill(k.wallFace);
        floor.rect(x0-8,y0-8,x1-x0+16,8).fill(k.wall);floor.rect(x0-8,y0-wallH-6,x1-x0+16,6).fill(k.wall);
        if(k.outline){
          // RPG back wall: bookshelves, a clock and framed pictures instead of windows.
          for(const bx of [1.6,10.4]){const cx=bx*TX;floor.rect(cx-38,y0-wallH+18,76,44).fill(k.outline);floor.rect(cx-36,y0-wallH+20,72,40).fill(0x6b3f22);
            for(let sh=0;sh<2;sh++){for(let b=0;b<12;b++){const h=10+((b*5+sh)%3)*2;floor.rect(cx-33+b*5.6,y0-wallH+38+sh*20-h,4,h).fill([0xc0392b,0xe8d9a8,0x2e86c1,0x27ae60,0xf39c12][(b+sh)%5]);}floor.rect(cx-36,y0-wallH+38+sh*20,72,3).fill(0x4a2a14);}}
          floor.circle(5*TX,y0-wallH+40,12).fill(k.outline);floor.circle(5*TX,y0-wallH+40,10).fill(0xf5f0e6);floor.rect(5*TX-1,y0-wallH+33,2,8).fill(0xc0392b);floor.rect(5*TX,y0-wallH+40,6,2).fill(0xc0392b);
          for(const [px,w] of [[12.6,26],[13.6,18]] as const){const cx=px*TX;floor.rect(cx-w/2-2,y0-wallH+20,w+4,34).fill(k.outline);floor.rect(cx-w/2,y0-wallH+22,w,30).fill(0x7a5a2a);floor.rect(cx-w/2+3,y0-wallH+25,w-6,24).fill(0x2a3a5a);floor.rect(cx-w/2+5,y0-wallH+38,w-10,8).fill(0xe0a040);}
        }
        for(const wx of k.outline?[]:variant==='midnight'?[2.5,11.5]:[1,2.4,9.4,10.8,13.4]){
          const cx=wx*TX,h=variant==='midnight'?22:34;
          floor.rect(cx-26,y0-wallH+10,52,h).fill(k.wall);floor.rect(cx-23,y0-wallH+13,46,h-6).fill(k.window);
          floor.rect(cx-1,y0-wallH+13,2,h-6).fill(k.wall);
          if(variant==='cozy')floor.rect(cx-20,y0-wallH+16,10,3).fill({color:0xffffff,alpha:.6});
        }
        const door=flat(DOOR).x;
        floor.rect(door-22,y0-(variant==='midnight'?44:66),44,variant==='midnight'?44:66).fill(k.wall);
        floor.rect(door-18,y0-(variant==='midnight'?40:62),36,variant==='midnight'?40:62).fill(variant==='midnight'?0x0a0b10:0x4a3628);
        floor.rect(x0-12,y0-wallH-6,6,y1-y0+wallH+16).fill(k.wall);floor.rect(x1+6,y0-wallH-6,6,y1-y0+wallH+16).fill(k.wall);
        floor.rect(x0-12,y1+4,x1-x0+24,6).fill(k.wall);
      }
      /** Studio room: carpet, a tall back wall with the elevator at the door, a night window and frames for the live wall boards. */
      function buildStudio(rows:number,x0:number,x1:number,y0:number,y1:number,cols:number){
        for(let y=0;y<rows;y++)for(let x=0;x<cols;x++)drawCarpetTile(floor,x0+x*T,y*T-T/2,(x+y)%2);
        floor.rect(x0-8,y0-wallH,x1-x0+16,wallH).fill(S.wall);
        for(let i=0;i<8;i++)floor.rect(x0-8,y0-wallH+i*18,x1-x0+16,1).fill({color:S.wallHi,alpha:.5});
        floor.rect(x0-8,y0-wallH-6,x1-x0+16,6).fill(S.skirting);
        floor.rect(x0-8,y0-10,x1-x0+16,10).fill(S.wallLo);floor.rect(x0-8,y0-3,x1-x0+16,3).fill(S.skirting);
        drawSkyline(floor,X(118),y0-150,150,96);
        drawElevator(floor,flat(DOOR).x,y0);
        // Board frames; their contents are live (see updateWall).
        floor.rect(X(53)-37,y0-152,74,98).fill(C.yellow);floor.rect(X(53)-33,y0-148,66,90).fill(S.frame);
        floor.circle(X(436),y0-112,30).fill(S.frame);floor.circle(X(436),y0-112,26).fill(C.paper);
        for(let h=0;h<12;h++){const a=h/12*Math.PI*2;floor.rect(X(436)+Math.sin(a)*21-1,y0-112-Math.cos(a)*21-1,3,3).fill(C.ink);}
        floor.rect(X(553)-75,y0-160,150,112).fill(S.metalLo);floor.rect(X(553)-71,y0-156,142,104).fill(C.paper);
        floor.rect(X(553)-71,y0-156,142,13).fill(S.frame);
        floor.rect(X(553)-53,y0-50,104,5).fill(S.metalLo);floor.rect(X(553)-43,y0-53,10,3).fill(C.red);floor.rect(X(553)-29,y0-53,10,3).fill(C.green);floor.rect(X(553)-15,y0-53,10,3).fill(C.blue);
        floor.rect(X(673)-33,y0-150,66,84).fill(C.green);floor.rect(X(673)-29,y0-146,58,76).fill(0x1d6b2e);floor.rect(X(673)-29,y0-146,58,14).fill(C.red);
        floor.rect(x0-12,y0-wallH-6,6,y1-y0+wallH+16).fill(S.skirting);floor.rect(x1+6,y0-wallH-6,6,y1-y0+wallH+16).fill(S.skirting);
        floor.rect(x0-12,y1+4,x1-x0+24,6).fill(S.skirting);
      }
      buildFloor(engine.rows());

      // Rugs mark each station's zone and the lobby; they never animate.
      let rugSig='';
      const drawRugs=()=>{
        rugs.clear();
        if(kit)return;
        if(studio){
          // A red executive rug under each manager's desk; faint carpet patches mark the stations.
          for(const [id,slot] of Object.entries(engine.state.desks)){
            if(!slot.manager||!engine.state.agents[id])continue;
            const p=flat(deskPoint(slot));
            rugs.rect(p.x-74,p.y-66,148,112).fill(S.rug);rugs.rect(p.x-68,p.y-60,136,100).stroke({color:S.gold,width:2});
            for(let x=p.x-64;x<p.x+64;x+=8){rugs.rect(x,p.y-56,4,4).fill(S.gold);rugs.rect(x,p.y+32,4,4).fill(S.gold);}
            rugs.rect(p.x-62,p.y-48,124,76).stroke({color:S.rugLo,width:2});
          }
          for(const key of activeStations(engine.state)){
            if(key==='manager')continue;
            const p=flat(stations[key]),col=STATION_COLOR[key]??C.blue;
            rugs.rect(p.x-56,p.y-96,112,116).fill({color:col,alpha:.07});rugs.rect(p.x-56,p.y+17,112,2).fill({color:col,alpha:.45});
          }
          return;
        }
        const lobbyA=flat({x:2.6,y:-.45}),lobbyB=flat({x:11.6,y:1.6});
        rugs.rect(lobbyA.x,lobbyA.y,lobbyB.x-lobbyA.x,lobbyB.y-lobbyA.y).fill({color:C.teal,alpha:.18});
        for(let x=lobbyA.x+6;x<lobbyB.x-6;x+=12)rugs.rect(x,lobbyA.y+4,6,3).fill({color:C.teal,alpha:.35});
        for(const key of activeStations(engine.state)){
          const p=flat(stations[key]),col=STATION_COLOR[key]??C.blue;
          rugs.rect(p.x-56,p.y-96,112,116).fill({color:col,alpha:.13});
          rugs.rect(p.x-56,p.y+17,112,3).fill({color:col,alpha:.5});
        }
        const coffee=flat({x:0,y:5});
        rugs.rect(coffee.x-18,coffee.y-40,36,30).fill(C.steel);rugs.rect(coffee.x-14,coffee.y-60,28,22).fill(C.fog);
        rugs.rect(coffee.x-10,coffee.y-56,20,10).fill(C.sky);rugs.rect(coffee.x-4,coffee.y-36,8,4).fill(C.red);
      };
      drawRugs();
      // Room-plan looks name their rooms: a tag pill (midnight, RPG) or a quiet caption (cozy).
      if(kit)for(const r of ROOMS){
        if(r.only&&r.only!==variant||r.key==='lobby')continue;
        const name=variant==='midnight'&&r.key==='lounge'?'CANTEEN':r.name;
        const t=label((kit.font===FONT?'* ':'')+name,variant==='cozy'?6:6,kit.tagText),p=flat({x:(r.x0+r.x1)/2,y:r.y0});
        const pill=new Graphics();
        if(variant!=='cozy'){pill.rect(p.x-t.width/2-6,p.y+4,t.width+12,t.height+6).fill(kit.tagBg).stroke({color:kit.outline??kit.tagText,width:1,alpha:.7});}
        else (t.style as TextStyle).fill=kit.label;
        t.position.set(Math.round(p.x-t.width/2),p.y+7);labels.addChild(pill,t);
      }
      const lobbyText=label(kit?'ENTRANCE':'LOBBY',8,studio?C.fog:kit?kit.label:C.night);lobbyText.alpha=.7;
      {const p=flat({x:4.6,y:1.15});lobbyText.position.set(p.x-lobbyText.width/2,p.y);}
      labels.addChild(lobbyText);
      const stationLabels=new Container();labels.addChild(stationLabels);
      const drawStationLabels=(keys:string[])=>{
      for(const child of stationLabels.removeChildren())child.destroy();
      for(const key of keys){
        if((studio||kit)&&key==='manager')continue;
        const p=flat(stations[key]),t=label(STATION_NAMES[key]??key.toUpperCase(),kit?5:7,kit?kit.label:studio?shadeHex(STATION_COLOR[key]??C.blue,1.25):shadeHex(STATION_COLOR[key]??C.blue,.6));
        if(kit){const u=new Graphics();u.rect(p.x-10,p.y+24+t.height+2,20,2).fill(STATION_COLOR[key]??C.blue);stationLabels.addChild(u);}
        t.position.set(p.x-t.width/2,p.y+24);stationLabels.addChild(t);
      }
      };
      if(studio){
        const props:[(g:Graphics,x:number,y:number)=>void,number,number][]=[[drawWaterCooler,-.1,.1],[drawCoffeeMachine,14,.1],[drawPrinter,0,10],[(g,x,y)=>drawPlant(g,x,y,1.2),14,10],[drawWastebin,13.2,10]];
        for(const [draw,x,y] of props){const g=new Graphics();draw(g,x*TX,y*T+12);g.zIndex=y*T+12;people.addChild(g);}
      }else if(kit){
        const sofa=(g:Graphics,x:number,y:number,c:number,w=56)=>{if(kit.outline)g.rect(x-w/2-2,y-26,w+4,30).fill(kit.outline);g.rect(x-w/2,y-24,w,10).fill(shadeHex(c,.8));g.rect(x-w/2,y-14,w,14).fill(c);g.rect(x-w/2,y-24,6,24).fill(shadeHex(c,.8));g.rect(x+w/2-6,y-24,6,24).fill(shadeHex(c,.8));};
        const table=(g:Graphics,x:number,y:number,c:number)=>{if(kit.outline)g.rect(x-20,y-18,40,22).fill(kit.outline);g.rect(x-18,y-16,36,16).fill(c);g.rect(x-18,y-16,36,3).fill(shadeHex(c,1.2));drawMug(g,x-4,y-12,0xf0ead8);};
        const props:[(g:Graphics)=>void,number][]=[];
        const lounge=flat({x:.5,y:4.4});
        const sofaColor=variant==='rpg'?0xc89a3a:variant==='cozy'?0xa8683c:0x4a4f60;
        props.push([g=>sofa(g,lounge.x,lounge.y,sofaColor),lounge.y]);
        props.push([g=>table(g,lounge.x,lounge.y+40,variant==='midnight'?0x6b4a2a:variant==='rpg'?0x7a5232:0xc79a63),lounge.y+40]);
        props.push([g=>sofa(g,lounge.x,lounge.y+92,sofaColor),lounge.y+92]);
        if(variant==='cozy'){const r=flat({x:.5,y:6.3});props.push([g=>{g.circle(r.x,r.y,16).fill(0xc9a26a);g.circle(r.x,r.y,12).stroke({color:0xe8c88a,width:2});},r.y-30]);}
        for(const pos of [{x:0,y:0},{x:14,y:0},{x:0,y:10},{x:14,y:10},{x:5.2,y:7.4}])props.push([g=>{
          if(kit.outline){g.rect(pos.x*TX-9,pos.y*T-2,18,16).fill(kit.outline);}
          drawPlant(g,pos.x*TX,pos.y*T+12,variant==='midnight'?.6:1.1);},pos.y*T+12]);
        for(const [draw,z] of props){const g=new Graphics();draw(g);g.zIndex=z;people.addChild(g);}
      }else for(const pos of [{x:0,y:0},{x:14,y:0},{x:0,y:10},{x:14,y:10}]){const g=new Graphics();drawPlant(g,pos.x*TX,pos.y*T+12,1.2);g.zIndex=pos.y*T+12;people.addChild(g);}

      // ── Sprint board (cozy: on the back wall, live columns) and sprint card (midnight, RPG: pinned to the corner of the view) ──
      const sprint=new Graphics(),sprintText=new Container();
      if(kit){
        if(variant==='cozy')wallText.addChild(sprint,sprintText);
        else app.stage.addChild(sprint,sprintText);
      }
      const sprintLines=Array.from({length:6},()=>label('',variant==='cozy'?5:6,variant==='rpg'?0xf2e6c8:0x2a2316));
      sprintLines.forEach(t=>sprintText.addChild(t));
      let sprintEvents=-1;
      const links=new Graphics();if(kit&&variant!=='cozy')world.addChildAt(links,world.getChildIndex(tracks));
      const updateSprint=()=>{
        const st=engine.state;
        if(st.events.length===sprintEvents&&variant==='cozy')return;
        const changed=st.events.length!==sprintEvents;sprintEvents=st.events.length;
        const tasks=Object.values(st.tasks);
        const done=tasks.filter(t=>/completed/.test(t.status)),doing=tasks.filter(t=>/started|accepted|working|assigned|waiting|blocked/.test(t.status)),todo=tasks.filter(t=>!done.includes(t)&&!doing.includes(t));
        if(variant==='cozy'){
          // Three columns of sticky notes, one per task.
          const bx=3.4*TX,by=-T/2-82,w=150,h=66;
          sprint.clear();
          sprint.rect(bx-3,by-3,w+6,h+6).fill(0x6e5240);sprint.rect(bx,by,w,h).fill(0xfbf7ee);sprint.rect(bx,by,w,11).fill(0x8a84b8);
          [['TODO',todo,0xf2c46d],['DOING',doing,0x9ad0a4],['DONE',done,0xb7c8e8]].forEach(([name,list,col],ci)=>{
            const cx=bx+ci*50;
            if(ci)sprint.rect(cx,by+11,1,h-11).fill(0xd8ccb4);
            (list as unknown[]).slice(0,8).forEach((_,i)=>sprint.rect(cx+5+(i%4)*11,by+24+Math.floor(i/4)*12,9,9).fill(col as number));
            const t=sprintLines[ci];t.text=`${name} ${(list as unknown[]).length}`;(t.style as TextStyle).fill=0x5a4a3a;t.position.set(cx+4,by+13);
          });
          const title=sprintLines[3];title.text='SPRINT';(title.style as TextStyle).fill=0xffffff;title.position.set(bx+w/2-title.width/2,by+1);
          for(const t of sprintLines.slice(4))t.text='';
          return;
        }
        // The pinned card: what reached done, and what needs attention.
        const pending=new Set<string>();
        for(const e of st.events){if(!e.agent_id)continue;if(e.type==='human.requested')pending.add(e.agent_id);else if(/human\.(approved|rejected)/.test(e.type))pending.delete(e.agent_id);}
        const errors=Object.values(st.operations).filter(o=>o.status==='failed').length;
        const working=Object.values(st.agents).filter(a=>/Thinking|Working|Using tool|Reading|Reviewing/.test(a.status)).length;
        const rows:[string,number][]=[['tasks closed',done.length],['in progress',doing.length],['agents working',working],['waiting on you',pending.size],['errors',errors]];
        sprintLines[0].text='SPRINT WALL';
        rows.forEach(([k,v],i)=>{sprintLines[i+1].text=`${k} ${'.'.repeat(Math.max(2,16-k.length))} ${v}`;});
        const w=Math.max(...sprintLines.map(t=>t.width))+24,x=app.screen.width-w-14,y=56;
        sprint.clear();sprint.rect(x,y,w,sprintLines.length*14+14).fill(variant==='rpg'?0x2f3d2a:0xfbf3df).stroke({color:variant==='rpg'?0x0d100b:0xd8c79f,width:2});
        sprintLines.forEach((t,i)=>t.position.set(x+12,y+9+i*14));
        if(!changed)return;
        // Orchestration links: a line between the desks of every pair of agents that handed work or messages to each other.
        links.clear();
        const pairs=new Set<string>();
        for(const e of st.events){
          const to=e.data?.target_agent_id;
          if(!e.agent_id||typeof to!=='string'||to===e.agent_id||!/task\.assigned|handoff\.started|message\.sent/.test(e.type))continue;
          pairs.add([e.agent_id,to].sort().join('|'));
        }
        for(const pair of pairs){
          const [a,b]=pair.split('|');if(!st.desks[a]||!st.desks[b])continue;
          const pa=flat(deskPoint(st.desks[a])),pb=flat(deskPoint(st.desks[b]));
          links.moveTo(pa.x,pa.y-8).lineTo(pb.x,pb.y-8).stroke({color:variant==='rpg'?0xf2e6c8:0x8f9bb3,width:2,alpha:.45});
          for(const q of [pa,pb])links.rect(q.x-3,q.y-11,6,6).fill({color:variant==='rpg'?0xf2e6c8:0x8f9bb3,alpha:.8});
        }
      };

      // ── Studio wall boards: run clock, task list, employee of the month, tool calls since the last error ──
      const y0w=-T/2;
      const todoTitle=label('TASKS',7,C.paper),todoLines=Array.from({length:6},()=>label('',6,C.ink));
      const eomTitle=label('TOP\nAGENT',6,C.yellow),eomName=label('',6,C.yellow),signTitle=label('SAFETY',6,C.paper),signCount=label('0',16,C.yellow),signCaption=label('TOOL CALLS\nSINCE LAST\nERROR',4,C.paper);(signCaption.style as TextStyle).align='center';(signCaption.style as TextStyle).letterSpacing=0;(signCaption.style as TextStyle).lineHeight=7;
      if(studio){
        todoTitle.position.set(X(553)-todoTitle.width/2,y0w-153);
        todoLines.forEach((t,i)=>t.position.set(X(553)-65,y0w-136+i*13));
        eomTitle.position.set(X(53)-eomTitle.width/2,y0w-145);(eomTitle.style as TextStyle).align='center';
        signTitle.position.set(X(673)-signTitle.width/2,y0w-143);
        wallText.addChild(todoTitle,...todoLines,eomTitle,eomName,signTitle,signCount,signCaption);
      }
      const eomFace=new Graphics();if(studio)wallText.addChild(eomFace);
      let wallEvents=-1,clockMinute=-1;
      const updateWall=()=>{
        const st=engine.state,last=st.events.at(-1);
        const now=last?new Date(last.timestamp):new Date();
        const minute=now.getHours()*60+now.getMinutes();
        if(minute!==clockMinute){
          clockMinute=minute;wallLive.clear();
          const hand=(angle:number,len:number,w:number,c:number)=>{for(let r=0;r<len;r+=2)wallLive.rect(X(436)+Math.sin(angle)*r-w/2,y0w-112-Math.cos(angle)*r-w/2,w,w).fill(c);};
          hand((minute%720)/720*Math.PI*2,13,3,C.ink);hand((minute%60)/60*Math.PI*2,20,2,C.ink);
          wallLive.rect(X(436)-2,y0w-114,4,4).fill(C.red);
        }
        if(st.events.length===wallEvents)return;
        wallEvents=st.events.length;
        const tasks=Object.values(st.tasks).slice(-6);
        todoLines.forEach((t,i)=>{
          const task=tasks[i];
          if(!task){t.text='';return;}
          const done=/completed/.test(task.status),active=/started|accepted|working|assigned/.test(task.status);
          t.text=`${done?'x':active?'>':'o'} ${trunc(task.title,16)}`;
          (t.style as TextStyle).fill=done?C.green:active?C.blue:C.ink;
        });
        if(!tasks.length)todoLines[0].text='o no tasks yet';
        const completed=new Map<string,number>();
        for(const e of st.events)if(e.type==='task.completed'&&e.agent_id)completed.set(e.agent_id,(completed.get(e.agent_id)??0)+1);
        const best=[...completed.entries()].filter(([id])=>st.agents[id]).sort((a,b)=>b[1]-a[1])[0];
        eomFace.clear();
        if(best){
          const a=st.agents[best[0]];
          drawAgent(eomFace,lookFor(a.id,a.role),{view:'front',flip:false,seated:false,step:0,typing:0},false);
          eomFace.position.set(X(53),y0w-70);eomFace.scale.set(.9);
          eomName.text=trunc(a.name.toUpperCase(),8);
        }else eomName.text='---';
        eomName.position.set(X(53)-eomName.width/2,y0w-66);
        let lastError='';
        for(const op of Object.values(st.operations))if(op.status==='failed'&&(op.ended??op.started)>lastError)lastError=op.ended??op.started;
        const since=Object.values(st.operations).filter(op=>op.kind==='tool.call'&&op.started>lastError).length;
        signCount.text=String(since);signCount.position.set(X(673)-signCount.width/2,y0w-124);
        signCaption.position.set(X(673)-signCaption.width/2,y0w-102);
      };

      // Stations: furniture redrawn only when its activity or animation frame changes.
      // Only the stations this run uses exist on the floor; they appear the first time an agent needs one.
      const stationViews=new Map<string,{g:Graphics;sig:string}>();
      let stationSig:string|undefined;
      const syncStations=()=>{
        const keys=activeStations(engine.state),sig=keys.join(',');
        if(sig===stationSig)return;
        stationSig=sig;
        for(const [key,v] of stationViews)if(!keys.includes(key)){v.g.destroy();stationViews.delete(key);}
        for(const key of keys){
          if(key==='manager'||stationViews.has(key))continue;
          const g=new Graphics(),p=flat(stations[key]);g.position.set(p.x,p.y);g.zIndex=key==='meeting'?p.y+10:p.y-1;people.addChild(g);
          stationViews.set(key,{g,sig:''});
        }
        drawStationLabels(keys);
        drawRugs();
      };
      syncStations();
      const deskViews=new Map<string,{g:Graphics;plate:Text;sig:string}>();
      const ledPlates=new Map<string,Text>();
      // Hovering an agent shows its token usage (see usage.ts).
      let hovered:string|undefined,tipTop=overlayInsets(host.current).top;
      const tip=createHoverTip(app.stage,{bg:0x1b1b2a,border:C.yellow,text:C.paper,title:C.yellow});
      const views=new Map<string,{root:Container;body:Graphics;icon:Graphics;ring:Graphics;tag:Graphics;name:Text;status:Text;bubble:Container;bubbleBg:Graphics;bubbleText:Text;sig:string;last:Point;view:Pose['view'];flip:boolean}>();

      // ── Camera ────────────────────────────────────────────────────────────
      let zoom=1,pan={x:0,y:0},fit=-1,interacted=false;
      /** Viewed from the other side: the world is mirrored left to right (see camera.tsx). */
      let rot=latest.current.rotated;
      const sx=()=>rot?-1:1;
      let drag:{x:number;y:number}|undefined;
      const fitOffice=()=>{
        const rows=drawnRows||11,x0=-TX/2-12,x1=14.5*TX+12,y0=-T/2-wallH-8,y1=(rows-.5)*T+14;
        const ins=overlayInsets(host.current),h=app.screen.height-ins.top-ins.bottom;
        zoom=Math.min(app.screen.width/(x1-x0+40),h/(y1-y0+40));
        pan={x:app.screen.width/2-sx()*(x0+x1)/2*zoom,y:ins.top+h/2-(y0+y1)/2*zoom};
      };
      fitOffice();
      let relayout:ReturnType<typeof setTimeout>|undefined;
      const observer=new ResizeObserver(()=>{
        app.resize();fit=-1;tipTop=overlayInsets(host.current).top;
        // A different canvas shape wants a different column pitch: rebuild the plan once resizing settles.
        clearTimeout(relayout);
        relayout=setTimeout(()=>{if(!disposed&&host.current&&Math.abs(pitchFor(host.current.clientWidth,visibleHeight(),engine.rows(),wallH)-TX)>=T*.1)setLayout(n=>n+1);},250);
      });
      observer.observe(host.current!);
      const onDown=(e:PointerEvent)=>{drag={x:e.clientX,y:e.clientY};interacted=true;};
      const onMove=(e:PointerEvent)=>{if(drag){pan.x+=e.clientX-drag.x;pan.y+=e.clientY-drag.y;drag={x:e.clientX,y:e.clientY};}};
      const onUp=()=>{drag=undefined;};
      const onWheel=(e:WheelEvent)=>{
        e.preventDefault();interacted=true;
        const r=app.canvas.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;
        const nz=Math.max(.22,Math.min(4,zoom*Math.exp(-e.deltaY*.001)));
        pan={x:x-(x-pan.x)*nz/zoom,y:y-(y-pan.y)*nz/zoom};zoom=nz;
      };
      app.canvas.addEventListener('pointerdown',onDown);
      window.addEventListener('pointermove',onMove);
      window.addEventListener('pointerup',onUp);
      app.canvas.addEventListener('wheel',onWheel,{passive:false});
      cleanup=()=>{
        observer.disconnect();clearTimeout(relayout);
        window.removeEventListener('pointermove',onMove);window.removeEventListener('pointerup',onUp);
        app.canvas.removeEventListener('pointerdown',onDown);app.canvas.removeEventListener('wheel',onWheel);
      };

      let drawnTrack='';
      app.ticker.add(()=>{
        if(fit!==latest.current.fitToken){fit=latest.current.fitToken;interacted=false;fitOffice();}
        const rows=engine.rows();
        if(rows!==drawnRows){buildFloor(rows);if(!interacted&&!latest.current.follow)fitOffice();}
        const motion=!engine.reducedMotion;
        const frame=motion?Math.floor(engine.time/250):0;
        const scale=latest.current.agentScale;
        if(kit)updateSprint();
        if(studio){
          updateWall();
          const sig=Object.entries(engine.state.desks).filter(([id,d])=>d.manager&&engine.state.agents[id]).map(([,d])=>d.index).join(',');
          if(sig!==rugSig){rugSig=sig;drawRugs();}
        }

        for(const [id,v] of views)if(!engine.characters.has(id)){v.root.destroy({children:true});views.delete(id);}

        syncStations();
        // Which stations are in use this frame.
        const busy=new Set<string>();
        for(const c of engine.characters.values()){if(c.hidden||c.phase==='walking')continue;const k=stationOf(c.current?.behavior??'');if(k)busy.add(k);}
        for(const [key,v] of stationViews){
          const active=busy.has(key),sig=`${active}|${active?frame:0}`;
          if(sig!==v.sig){drawStation(v.g,key,active,frame);v.sig=sig;}
        }

        // Desks follow the seats the engine assigns.
        for(const [id,v] of deskViews)if(!engine.state.desks[id]||!engine.state.agents[id]){v.g.destroy();v.plate.destroy();ledPlates.get(id)?.destroy();ledPlates.delete(id);deskViews.delete(id);}
        for(const [id,slot] of Object.entries(engine.state.desks)){
          const a=engine.state.agents[id];if(!a)continue;
          let v=deskViews.get(id);
          if(!v){const g=new Graphics(),plate=label('',6,C.night);plate.alpha=.75;people.addChild(g);labels.addChild(plate);v={g,plate,sig:''};deskViews.set(id,v);}
          const seat=deskPoint(slot),sp=flat(seat),c=engine.characters.get(id);
          const home=!!c&&!c.hidden&&c.phase!=='walking'&&Math.hypot(c.location.x-seat.x,c.location.y-seat.y)<.05;
          const lit=home&&/Thinking|Working|Reading|Reviewing|Coding|Searching|Querying|Computing/.test(c!.current?.behavior??a.status);
          const task=a.task?engine.state.tasks[a.task]:undefined;
          const sig=`${sp.x},${sp.y}|${lit}|${lit?frame:0}|${a.name}|${home}|${a.role}|${task?.title}`;
          if(sig!==v.sig){
            const col=/Thinking/.test(c?.current?.behavior??a.status)?C.yellow:C.teal;
            if(studio){
              drawStudioDesk(v.g,id,isManagerRole(a.role),lit,col,frame);
              // In front of the seated agent, who shows from the chest up behind it.
              v.g.position.set(sp.x,sp.y-6);v.g.zIndex=sp.y+20;
              let led=ledPlates.get(id);
              if(!led){led=label('',5,S.led);people.addChild(led);ledPlates.set(id,led);}
              // The plate shows the task while the owner works, and the owner's name while the desk is empty.
              led.text=trunc((home&&task?task.title:a.name).toLowerCase(),14);
              led.position.set(Math.round(sp.x-led.width/2),sp.y+4);led.zIndex=sp.y+21;
              v.plate.visible=false;
            }else{
              drawDesk(v.g,id,isManagerRole(a.role),lit,col,frame,variant==='rpg',!home);
              v.g.position.set(sp.x,sp.y);v.g.zIndex=sp.y-1;
              v.plate.text=floorName(a.name,18).toUpperCase();v.plate.visible=!home;
              v.plate.position.set(sp.x-v.plate.width/2,sp.y-4);
            }
            v.sig=sig;
          }
        }

        // ── Agents ────────────────────────────────────────────────────────
        for(const [id,c] of engine.characters){
          const a=engine.state.agents[id];if(!a)continue;
          let v=views.get(id);
          if(!v){
            const root=new Container(),ring=new Graphics(),body=new Graphics(),icon=new Graphics(),tag=new Graphics();
            const dark=studio||variant==='midnight'||variant==='rpg';
            const name=label(floorName(a.name,18).toUpperCase(),7,variant==='cozy'?0xffffff:dark?C.paper:C.ink),status=label('',6,dark?C.fog:variant==='cozy'?0x7a6650:C.night);
            const bubble=new Container(),bubbleBg=new Graphics(),bubbleText=label('',6,C.ink);
            bubble.addChild(bubbleBg,bubbleText);bubble.visible=false;
            root.addChild(ring,body,icon,tag,name,status,bubble);
            root.eventMode='static';root.cursor='pointer';
            root.on('pointertap',()=>latest.current.onSelect(id));
            root.on('pointerover',()=>{hovered=id;});root.on('pointerout',()=>{if(hovered===id)hovered=undefined;});
            people.addChild(root);
            v={root,body,icon,ring,tag,name,status,bubble,bubbleBg,bubbleText,sig:'',last:{...c.location},view:'front',flip:false};
            views.set(id,v);
          }
          v.root.visible=!c.hidden;
          if(c.hidden)continue;
          const seat=desk(id,engine.state);
          const atDesk=c.phase!=='walking'&&Math.hypot(c.location.x-seat.x,c.location.y-seat.y)<.05;
          const action=c.current?.behavior??(c.inLobby&&a.status!=='Error'?engine.lobbyLabel??'In lobby':a.status);
          const working=c.phase!=='walking'&&/Thinking|Searching|Coding|Querying|Computing|Working|Reviewing|Reading/.test(action);

          // Facing comes from the actual movement since last frame.
          const dx=c.location.x-v.last.x,dy=c.location.y-v.last.y;
          if(c.phase==='walking'&&Math.hypot(dx,dy)>.001){
            if(Math.abs(dx)>Math.abs(dy)){v.view='side';v.flip=dx<0;}else{v.view=dy<0?'back':'front';v.flip=false;}
          }else if(c.phase!=='walking'){
            // Working at a desk or a station means facing the furniture to the north; otherwise face the room.
            // In the studio the agent sits behind its desk, facing us.
            v.view=working&&(atDesk&&!studio||stationOf(action))?'back':'front';v.flip=false;
          }
          v.last={...c.location};
          const seated=atDesk&&working;
          const step=c.phase==='walking'&&motion?frame%2:0;
          const typing=seated&&motion?frame%2:0;
          const p=flat(c.location);
          // Seated agents sit a little south of their seat so the desk edge shows above their shoulders.
          const sitOffset=seated?(studio?-6:14):0;
          v.root.position.set(Math.round(p.x),Math.round(p.y+sitOffset));
          v.root.zIndex=p.y+sitOffset;
          const fromDoor=Math.hypot(c.location.x-DOOR.x,c.location.y-DOOR.y);
          v.root.alpha=c.phase==='walking'?Math.min(1,.2+fromDoor/.8):1;

          const look=lookFor(id,a.role);
          const sig=`${v.view}|${v.flip}|${seated}|${step}|${typing}|${!!c.carriedObject}|${a.role}|${hireSalt()}`;
          if(sig!==v.sig){drawAgent(v.body,look,{view:v.view,flip:v.flip,seated,step,typing,headset:studio,chibi:variant==='rpg'},!!c.carriedObject);v.sig=sig;}
          // The midnight office is drawn small, as a status overview.
          const figure=scale*(variant==='midnight'?.8:1);
          v.body.scale.set(figure);

          // Above the head, or above the monitor when seated at a desk.
          const top=seated&&!studio?-92:-14*P*figure-(variant==='rpg'?14:6);
          v.icon.clear();
          if(c.phase!=='walking')drawStateIcon(v.icon,action,frame,variant==='cozy'?top-44:top-22);

          v.ring.clear();
          if(latest.current.selected===id){
            const on=!motion||frame%2===0,w=18*scale+4,h=14*P*scale+6,col=on?C.yellow:C.orange;
            for(const [sx,sy] of [[-1,-1],[1,-1],[-1,1],[1,1]]){
              const cx=sx*w,cy=sy<0?-h:6;
              v.ring.rect(cx-(sx>0?6:0),cy,6,3).fill(col);v.ring.rect(cx-(sx>0?3:0),cy-(sy<0?0:3),3,6).fill(col);
            }
          }
          if(a.status==='Error'){v.ring.rect(-14,2,28,3).fill(C.red);}
          // Cozy: a soft halo around anyone at work.
          if(variant==='cozy'&&working){const pulse=motion?Math.sin(engine.time/300)*2:0;v.ring.circle(0,-18,30+pulse).fill({color:0xf0a030,alpha:.14}).stroke({color:0xf0a030,width:2,alpha:.45});}

          v.name.text=floorName(a.name,18).toUpperCase();
          // Behind a studio desk the feet are hidden, so the name goes under the desk.
          v.name.position.set(Math.round(-v.name.width/2),studio&&atDesk?38:8);v.name.visible=true;
          v.tag.clear();
          if(variant==='cozy'){
            // An orange name pill above the head; the status moves under the feet.
            v.name.position.set(Math.round(-v.name.width/2),Math.round(top-v.name.height-4));
            v.tag.roundRect(v.name.x-8,v.name.y-3,v.name.width+16,v.name.height+6,(v.name.height+6)/2).fill(0xf0a030);
          }
          const task=a.task?engine.state.tasks[a.task]:undefined;
          v.status.text=trunc((c.phase==='walking'?'> ':'')+action.toUpperCase()+(task?.progress!==undefined?` ${Math.round(task.progress*100)}%`:''),28);
          v.status.position.set(Math.round(-v.status.width/2),Math.round(variant==='cozy'?10:top-12));
          const darkFloor=studio||variant==='midnight'||variant==='rpg';
          (v.status.style as TextStyle).fill=a.status==='Error'?C.red:working?(darkFloor?C.lime:C.green):(darkFloor?C.fog:variant==='cozy'?0x7a6650:C.night);

          const ai=engine.interactions.filter(i=>i.from===id&&i.question).at(-1);
          // Studio speech bubbles also name the tool an agent is using, with an icon for its kind.
          const tool=studio&&c.phase!=='walking'&&a.tool&&/Using tool|Searching|Reading archive|Querying|Coding|Computing|Retrying|Queued/.test(action)?a.tool:undefined;
          const said=ai&&motion?trunc(ai.question??'',26):tool?trunc(tool,22):'';
          if(said){
            v.bubbleText.text=said;
            const icon=tool&&!ai?20:0;
            const bw=Math.max(60,v.bubbleText.width+14+icon),bh=Math.max(v.bubbleText.height+10,icon?22:0);
            v.bubbleBg.clear();
            v.bubbleBg.rect(-bw/2,-bh,bw,bh).fill(C.paper).stroke({color:C.ink,width:2});
            v.bubbleBg.rect(-3,0,6,3).fill(C.ink);v.bubbleBg.rect(-1.5,3,3,3).fill(C.ink);
            if(icon)drawToolIcon(v.bubbleBg,stationFor(tool!),-bw/2+4,-bh+3);
            v.bubbleText.position.set(-bw/2+7+icon,-bh+Math.round((bh-v.bubbleText.height)/2));
            v.bubble.position.set(0,Math.round(variant==='cozy'?v.name.y-6:top-22));
            v.bubble.visible=true;
            // The bubble already says what the agent is doing.
            if(studio)v.status.text='';
          }else v.bubble.visible=false;
        }

        // ── Labels never overprint: front-most agents keep their place, the others' labels step aside ──
        const placed:{x:number;y:number;w:number;h:number}[]=[];
        const hits=(r:{x:number;y:number;w:number;h:number})=>placed.some(o=>r.x<o.x+o.w&&o.x<r.x+r.w&&r.y<o.y+o.h&&o.y<r.y+r.h);
        const ordered=[...views.entries()].filter(([id,v])=>v.root.visible&&engine.characters.has(id)).sort((a,b)=>b[1].root.y-a[1].root.y);
        ordered.sort((a,b)=>Number(b[0]===latest.current.selected)-Number(a[0]===latest.current.selected));
        for(const [,v] of ordered){
          for(const [text,dir] of [[v.name,variant==='cozy'?-1:1],[v.status,variant==='cozy'?1:-1]] as const){
            if(!text.text){continue;}
            let r={x:v.root.x+text.x,y:v.root.y+text.y,w:text.width,h:text.height},tries=0;
            while(hits(r)&&tries<4){text.y+=dir*(text.height+2);r={...r,y:v.root.y+text.y};tries++;}
            if(hits(r)&&text===v.status)text.visible=false;else{text.visible=true;placed.push(r);}
            // The cozy name pill follows its name wherever the name ended up.
            if(variant==='cozy'&&text===v.name){v.tag.clear();v.tag.roundRect(text.x-8,text.y-3,text.width+16,text.height+6,(text.height+6)/2).fill(0xf0a030);}
          }
        }

        // ── Selected agent's walked path: pixel dots, older ones fainter ──
        const tracked=latest.current.selected?engine.characters.get(latest.current.selected):undefined;
        const trackSig=tracked?`${tracked.id}|${tracked.trail.length}|${tracked.stops.length}|${tracked.trail.at(-1)?.x}|${tracked.trail.at(-1)?.y}`:'';
        if(trackSig!==drawnTrack){
          drawnTrack=trackSig;tracks.clear();
          if(tracked&&tracked.trail.length>1){
            const n=tracked.trail.length;
            tracked.trail.forEach((q,i)=>{if(i%2)return;const s=flat(q);tracks.rect(Math.round(s.x)-2,Math.round(s.y)-2,4,4).fill({color:C.orange,alpha:.2+.7*(i/n)});});
            tracked.stops.forEach(stop=>{const s=flat(stop.at);tracks.rect(s.x-5,s.y-5,10,10).fill({color:C.yellow,alpha:.85}).stroke({color:C.ink,width:1.5});});
          }
        }

        // ── Messages between agents: a dotted arc with a pixel envelope travelling along it ──
        overlay.clear();
        for(const interaction of engine.interactions){
          const from=engine.characters.get(interaction.from),to=engine.characters.get(interaction.to);
          if(!from||!to||from.hidden||to.hidden)continue;
          const fa=flat(from.location),fb=flat(to.location),age=engine.time-interaction.started;
          const fade=motion?Math.max(0,1-age/5000):1,pct=motion?Math.min(1,age/2000):1;
          const col=interaction.kind==='question.answered'?C.green:C.orange;
          const arc=(u:number)=>({x:fa.x+(fb.x-fa.x)*u,y:fa.y+(fb.y-fa.y)*u-60-Math.sin(u*Math.PI)*36});
          for(let i=0;i<=20;i++){const q=arc(i/20);overlay.rect(Math.round(q.x)-2,Math.round(q.y)-2,4,4).fill({color:col,alpha:.55*fade});}
          const b=arc(pct);
          overlay.rect(b.x-9,b.y-6,18,12).fill({color:C.paper,alpha:fade}).stroke({color:C.ink,width:2,alpha:fade});
          overlay.rect(b.x-6,b.y-3,3,3).fill({color:col,alpha:fade});overlay.rect(b.x-3,b.y,6,3).fill({color:col,alpha:fade});overlay.rect(b.x+3,b.y-3,3,3).fill({color:col,alpha:fade});
        }

        // ── Camera follow ─────────────────────────────────────────────────
        let target=latest.current.follow;
        if(target?.startsWith('task:')){
          const taskId=target.slice(5);
          target=[...engine.characters.values()].find(c=>c.carriedObject===taskId&&c.current?.target)?.id??engine.state.tasks[taskId]?.owner;
        }
        const carrier=target?engine.characters.get(target):undefined;
        if(carrier&&!drag){const p=flat(carrier.location);pan={x:app.screen.width/2-sx()*p.x*zoom,y:app.screen.height/2-p.y*zoom};}
        if(latest.current.rotated!==rot){pan.x=flipPan(pan.x,zoom,app.screen.width,rot);rot=latest.current.rotated;}
        {
          const cam={zoom,pan};let fitted=false;
          if(runCameraCommands(view.commands.current,cam,app.screen,{min:.22,max:4},()=>{fitOffice();cam.zoom=zoom;cam.pan=pan;fitted=true;})){
            zoom=cam.zoom;pan=cam.pan;interacted=!fitted;
          }
        }
        readableText(world,rot);
        world.scale.set(sx()*zoom,zoom);
        const hv=hovered?views.get(hovered):undefined,ha=hovered?engine.state.agents[hovered]:undefined;
        if(hv&&ha&&hv.root.visible&&!drag){
          const at=hv.root.toGlobal({x:0,y:Math.min(hv.name.y,-50)-6}),foot=hv.root.toGlobal({x:0,y:24});
          tip.show(ha.name,usageLines(ha),at.x,at.y,foot.y,app.screen.width,tipTop);
        }else tip.hide();
        world.position.set(Math.round(pan.x),Math.round(pan.y));
        const moving=!!drag||engine.interactions.length>0||[...engine.characters.values()].some(ch=>ch.phase==='walking')||busy.size>0;
        app.ticker.maxFPS=engine.reducedMotion?20:moving?60:30;
      });
    })().catch(e=>setError(String(e)));

    return()=>{disposed=true;cleanup();if(app.renderer)app.destroy(true,{children:true});};
  },[engine,variant,layout]);

  return(
    <div className="office-canvas flat-office" ref={host}
      aria-label="Flat 2D office floor plan. Select agents using the team list.">
      <CameraTools rotated={view.rotated} toggle={view.toggle} commands={view.commands}/>
      {error&&<div className="canvas-error">Office renderer could not start: {error}</div>}
    </div>
  );
}
