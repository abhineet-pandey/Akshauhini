import React,{useEffect,useRef,useState} from 'react';
import {Application,Container,Graphics,Text,TextStyle} from 'pixi.js';
import {OfficeEngine,Point,stations,desk,deskPoint,DOOR,activeStations} from './engine';
import {drawCharacter,drawClassicCharacter,drawDeskDeco,identity} from './Character';
import {hireSalt} from './looks';
import {createHoverTip,usageLines} from './usage';
import {CameraTools,flipPan,overlayInsets,readableText,runCameraCommands,useCameraControls} from './camera';
import {Theme,FlatTheme} from './theme';

const iso = (p:Point)=>({x:(p.x-p.y)*37, y:(p.x+p.y)*20});
const BODY_FRAME_MS=1000/30;

/** The isometric themes. The flat ones are drawn by FlatOffice instead. */
export type OfficeTheme=Exclude<Theme,FlatTheme>;

/** Colors drawn over the floor that must flip with its brightness. */
type Ink={name:number;idle:number;working:number;error:number;bubble:number;selection:number;shadowAlpha:number};
const DARK_INK:Ink={name:0xe2e8f0,idle:0x38bdf8,working:0x34d399,error:0xf87171,bubble:0x00f5d4,selection:0xfbbf24,shadowAlpha:1};

/** Every theme reskins the office canvas; all are dark except `light`, which also supplies its own ink. */
type Palette={
  ink?:Ink;
  station:Record<string,number>;
  canvasBg:number;
  floorZones:number[][];      // [ops, research, engDb, default] each [parityA, parityB]
  floorCollab:number; floorEdgeStep:number;
  grid:number; conduitGold:number; conduitGreen:number; meetingRing:number;
  wallA:number; wallB:number; crown:number; baseboardBright:number; baseboardDim:number;
  casingBg:number; casingStroke:number; glassOuter:number; glassTop:number; glassBottom:number;
  towers:number[]; towerLine:number; beacon:number;
  litWindowA:number; litWindowB:number; star1:number; star2:number;
  mullion:number; glare:number; sillBright:number; sillDim:number;
  dust:number; fogNear:number; fogFar:number; bubbleBg:number;
};

const COOL_PALETTE:Palette={
  station:{research:0x00d4ff, archive:0xffa439, database:0x38bdf8,
    engineering:0x10b981, compute:0xa855f7, human:0xf43f5e, meeting:0x06b6d4},
  canvasBg:0x050c14,
  floorZones:[[0x0e1724,0x0a121c],[0x091929,0x061422],[0x08191f,0x06141a],[0x091624,0x07111c]],
  floorCollab:0x0c1e2b, floorEdgeStep:50,
  grid:0x0a324b, conduitGold:0x00e5ff, conduitGreen:0x10b981, meetingRing:0x00d4ff,
  wallA:0x071520, wallB:0x091926, crown:0x0c2c3e, baseboardBright:0x00b4d8, baseboardDim:0x084058,
  casingBg:0x030d17, casingStroke:0x0c3a54, glassOuter:0x020712, glassTop:0x091c3d, glassBottom:0x030d20,
  towers:[0x061122,0x08152a,0x050e1c], towerLine:0x0f274a, beacon:0xef4444,
  litWindowA:0x38bdf8, litWindowB:0xfcd34d, star1:0xffffff, star2:0x38bdf8,
  mullion:0x0c3a54, glare:0xffffff, sillBright:0x00e5ff, sillDim:0x00b4d8,
  dust:0x38bdf8, fogNear:0x001424, fogFar:0x000812, bubbleBg:0x051322,
};

const WARM_PALETTE:Palette={
  ink:{name:0xf5e6c8,idle:0xe0a050,working:0xa8c060,error:0xf87171,bubble:0xfcd34d,selection:0xfbbf24,shadowAlpha:1},
  station:{research:0xd9a63e, archive:0xe08a3a, database:0xc97b4a,
    engineering:0x8a9c4a, compute:0xa8699c, human:0xcf5a42, meeting:0xc99a3e},
  canvasBg:0x1c140c,
  floorZones:[[0x241a10,0x1c130b],[0x231708,0x1a1006],[0x1f1a0c,0x181407],[0x201609,0x170f06]],
  floorCollab:0x2a2012, floorEdgeStep:36,
  grid:0x4a3418, conduitGold:0xcf9b3f, conduitGreen:0x8a9c4a, meetingRing:0xc99a3e,
  wallA:0x1c1309, wallB:0x241a0e, crown:0x3a2a14, baseboardBright:0xc9893f, baseboardDim:0x5a3f1c,
  casingBg:0x170f08, casingStroke:0x4a3418, glassOuter:0x120b06, glassTop:0x3d2a12, glassBottom:0x201406,
  towers:[0x221507,0x2a1c0a,0x1c1206], towerLine:0x4a3418, beacon:0xef4444,
  litWindowA:0xfcd34d, litWindowB:0xe8973f, star1:0xfff4e0, star2:0xfcd34d,
  mullion:0x4a3418, glare:0xfff4e0, sillBright:0xc9893f, sillDim:0x8a6a2e,
  dust:0xc9893f, fogNear:0x140d06, fogFar:0x0c0704, bubbleBg:0x1c1309,
};

/** Retro theme: amber-phosphor CRT terminal, with green/red/magenta kept as the limited secondary alert colors a real terminal had. */
const RETRO_PALETTE:Palette={
  ink:{name:0xffd060,idle:0xffb000,working:0x66ff66,error:0xff5544,bubble:0xffd060,selection:0xffe08a,shadowAlpha:1},
  station:{research:0xffb000, archive:0xff8800, database:0x33ff33,
    engineering:0x66ff66, compute:0xff66cc, human:0xff3333, meeting:0xffcc33},
  canvasBg:0x0d0800,
  floorZones:[[0x1a1000,0x120b00],[0x190f00,0x110a00],[0x160d00,0x0f0900],[0x140c00,0x0d0800]],
  floorCollab:0x1e1200, floorEdgeStep:30,
  grid:0x3a2800, conduitGold:0xffb000, conduitGreen:0x33ff33, meetingRing:0xffcc33,
  wallA:0x120b00, wallB:0x170e00, crown:0x2a1c00, baseboardBright:0xffb000, baseboardDim:0x6b4a00,
  casingBg:0x0d0800, casingStroke:0x3a2800, glassOuter:0x0a0600, glassTop:0x241700, glassBottom:0x140c00,
  towers:[0x160d00,0x1c1100,0x120b00], towerLine:0x3a2800, beacon:0xff3333,
  litWindowA:0xffb000, litWindowB:0xff8800, star1:0xffd060, star2:0xffb000,
  mullion:0x3a2800, glare:0xffe8b0, sillBright:0xffb000, sillDim:0x8a6a2e,
  dust:0xffb000, fogNear:0x0d0800, fogFar:0x080400, bubbleBg:0x1a1000,
};

/** Classical theme: mahogany wood and brass, an executive library. */
const CLASSICAL_PALETTE:Palette={
  ink:{name:0xf0e0b8,idle:0xc49b56,working:0x8fae6a,error:0xd0604e,bubble:0xf0e0b8,selection:0xe0b860,shadowAlpha:1},
  station:{research:0xc49b56, archive:0x8c6a3a, database:0x4a6b3a,
    engineering:0x5c7a4a, compute:0x6b4a5c, human:0x8c3a2e, meeting:0xb8793a},
  canvasBg:0x150e08,
  floorZones:[[0x1f160d,0x170f09],[0x1c130a,0x140d08],[0x19140c,0x120e09],[0x180f08,0x110b07]],
  floorCollab:0x241a10, floorEdgeStep:32,
  grid:0x3a2a18, conduitGold:0xc49b56, conduitGreen:0x4a6b3a, meetingRing:0xb8793a,
  wallA:0x160f09, wallB:0x1c130b, crown:0x2e2113, baseboardBright:0xc49b56, baseboardDim:0x6e5230,
  casingBg:0x120b06, casingStroke:0x3a2a18, glassOuter:0x0f0905, glassTop:0x2e2214, glassBottom:0x170f09,
  towers:[0x1a120a,0x201609,0x160f08], towerLine:0x3a2a18, beacon:0x8c3a2e,
  litWindowA:0xc49b56, litWindowB:0xb8793a, star1:0xf0e0b8, star2:0xc49b56,
  mullion:0x3a2a18, glare:0xf0e4c8, sillBright:0xc49b56, sillDim:0x6e5230,
  dust:0xc49b56, fogNear:0x120b06, fogFar:0x0a0603, bubbleBg:0x201609,
};

/** Arcade theme: synthwave neon cabinet. */
const ARCADE_PALETTE:Palette={
  station:{research:0x00f0ff, archive:0xffcc00, database:0xa020f0,
    engineering:0x39ff14, compute:0xff00aa, human:0xff2050, meeting:0x00d4ff},
  canvasBg:0x08000f,
  floorZones:[[0x1c0632,0x140425],[0x1a0530,0x120420],[0x16042a,0x10031d],[0x14031f,0x0d0218]],
  floorCollab:0x200838, floorEdgeStep:34,
  grid:0x4a1a6e, conduitGold:0xff00aa, conduitGreen:0x39ff14, meetingRing:0x00f0ff,
  wallA:0x14041f, wallB:0x1a0530, crown:0x3a1458, baseboardBright:0xff00aa, baseboardDim:0x6b2894,
  casingBg:0x0d0218, casingStroke:0x4a1a6e, glassOuter:0x08000f, glassTop:0x2a0a48, glassBottom:0x140420,
  towers:[0x1a0530,0x220a3c,0x160428], towerLine:0x4a1a6e, beacon:0xff2050,
  litWindowA:0x00f0ff, litWindowB:0xffcc00, star1:0xffffff, star2:0xff00aa,
  mullion:0x4a1a6e, glare:0xffffff, sillBright:0xff00aa, sillDim:0x6b2894,
  dust:0x00f0ff, fogNear:0x0a0014, fogFar:0x05000a, bubbleBg:0x1a0530,
};

/** Light theme: a daylit office with deeper accent hues, since neon tones wash out on a pale floor. */
const LIGHT_PALETTE:Palette={
  ink:{name:0x1e293b,idle:0x0369a1,working:0x047857,error:0xb91c1c,bubble:0x0f172a,selection:0xd97706,shadowAlpha:.3},
  station:{research:0x0284c7, archive:0xc2620a, database:0x2563eb,
    engineering:0x059669, compute:0x7c3aed, human:0xe11d48, meeting:0x0891b2},
  canvasBg:0xe9eff6,
  floorZones:[[0xf7f9fc,0xeef2f8],[0xf1f7fd,0xe7f0f9],[0xf0f8f5,0xe6f2ed],[0xf5f7fa,0xecf0f5]],
  floorCollab:0xe3eef7, floorEdgeStep:14,
  grid:0xb9c8d8, conduitGold:0x0284c7, conduitGreen:0x059669, meetingRing:0x0891b2,
  wallA:0xdfe7f0, wallB:0xe7edf4, crown:0xc7d4e2, baseboardBright:0x0284c7, baseboardDim:0x9fb3c8,
  casingBg:0xf7fafc, casingStroke:0xb4c4d5, glassOuter:0xcfe7f7, glassTop:0xe3f2fc, glassBottom:0xb9dcf2,
  towers:[0x9db4ca,0x8aa4bd,0xaabdd0], towerLine:0x7890a8, beacon:0xe11d48,
  litWindowA:0xffffff, litWindowB:0xfef3c7, star1:0xffffff, star2:0xffffff,
  mullion:0xb4c4d5, glare:0xffffff, sillBright:0x0284c7, sillDim:0x9fb3c8,
  dust:0x7890a8, fogNear:0xffffff, fogFar:0xdbeafe, bubbleBg:0xffffff,
};

const OFFICE_PALETTES:Record<OfficeTheme,Palette>={cool:COOL_PALETTE,original:COOL_PALETTE,light:LIGHT_PALETTE,warm:WARM_PALETTE,retro:RETRO_PALETTE,classical:CLASSICAL_PALETTE,arcade:ARCADE_PALETTE};

const STATION_NAMES:Record<string,string>={
  manager:'OPERATIONS',research:'RESEARCH LAB',archive:'KNOWLEDGE VAULT',
  engineering:'CYBER·ENGINEERING',database:'QUANTUM RECORDS',compute:'COMPUTE MATRIX',
  human:'HUMAN TELEMETRY',meeting:'COLLAB DOME',
};

/** A stable per-agent animation offset, so neighbours don't pulse in lockstep. */
const identityPhase=(id:string)=>(identity(id)%17)*.37;

export function trunc(s:string,n=26){return s.length>n?s.slice(0,n-1)+'…':s;}
/** A name short enough for a floor label: the specific part of "Role: Subject" names, capped. The full name is in the
 *  hover card and the panel. */
export function floorName(name:string,n=22){const i=name.indexOf(': ');return trunc(i>0&&i<name.length-2?name.slice(i+2):name,n);}

/** Cool "navy" furniture darks are blue-dominant; swapping red and blue turns them into a matching warm "espresso" dark. */
const warmShift=(hex:number)=>((hex&0xff)<<16)|(hex&0x00ff00)|((hex>>16)&0xff);
/** Inverting a navy dark gives a pale peach; the red/blue swap brings it back to a matching pale blue. */
const lightShift=(hex:number)=>warmShift(0xffffff-hex);
const furnitureTint=(hex:number,theme:OfficeTheme)=>theme==='cool'||theme==='original'?hex:theme==='light'?lightShift(hex):warmShift(hex);

/** Darkens a packed hex color per channel. Plain integer subtraction on packed RGB underflows a channel into its
 *  neighbor (e.g. green going negative borrows from red), which turns a smooth vignette into a glitchy bright patch. */
const shade=(hex:number,amount:number)=>{
  const r=Math.max(0,((hex>>16)&0xff)-amount);
  const g=Math.max(0,((hex>>8)&0xff)-amount);
  const b=Math.max(0,(hex&0xff)-amount);
  return (r<<16)|(g<<8)|b;
};

function limb(g:Graphics,pts:number[],color:number,width:number){
  g.moveTo(pts[0],pts[1]);
  for(let i=2;i<pts.length;i+=2)g.lineTo(pts[i],pts[i+1]);
  g.stroke({color,width,cap:'round',join:'round'});
}

// ── Ambient particle pool ─────────────────────────────────────────────────────
type Particle={x:number;y:number;vx:number;vy:number;life:number;maxLife:number;color:number;size:number;kind?:'mote'|'dust'|'spark'};
const POOL:Particle[]=[];

function spawnMote(sx:number,sy:number,color:number){
  if(POOL.length>280)return;
  const a=Math.random()*Math.PI*2;
  const sp=0.3+Math.random()*0.5;
  POOL.push({x:sx+(Math.random()-0.5)*50,y:sy+(Math.random()-0.5)*18,
    vx:Math.cos(a)*sp*0.6,vy:-0.55-Math.random()*0.45,
    life:0,maxLife:2+Math.random()*2.5,color,size:1+Math.random()*2.2,kind:'mote'});
}

/** Ambient atmospheric dust that drifts across the entire office floor */
function spawnDust(cx:number,cy:number,pal:Palette){
  if(POOL.length>350)return;
  POOL.push({x:cx+(Math.random()-0.5)*700,y:cy+(Math.random()-0.5)*350,
    vx:(Math.random()-0.5)*0.18,vy:-0.08-Math.random()*0.12,
    life:0,maxLife:6+Math.random()*5,color:pal.dust,size:0.5+Math.random()*1.3,kind:'dust'});
}

function tickParticles(dt:number,g:Graphics){
  for(let i=POOL.length-1;i>=0;i--){
    const p=POOL[i];p.x+=p.vx;p.y+=p.vy*dt*60;p.life+=dt;
    if(p.life>=p.maxLife){POOL.splice(i,1);continue;}
    const f=p.life/p.maxLife;
    const a=f<0.18?f/0.18:1-((f-0.18)/0.82);
    if(p.kind==='dust'){
      g.circle(p.x,p.y,p.size*(1-f*0.3)).fill({color:p.color,alpha:a*0.16});
    } else {
      g.circle(p.x,p.y,p.size*(1-f*0.6)).fill({color:p.color,alpha:a*0.6});
      g.circle(p.x,p.y,p.size*(1-f*0.6)*2.5).fill({color:p.color,alpha:a*0.12});
    }
  }
}

// ── State-of-the-Art Architectural Floor Grid & Cyber Skyline ─────────────────
function drawHoloFloor(g:Graphics,cols:number,rows:number,pal:Palette){
  g.clear();

  // Multi-tier zoned flooring: slate obsidian, carbon composite, and department runners
  const [ops,research,engDb,fallback]=pal.floorZones;
  for(let x=0;x<cols;x++)for(let y=0;y<rows;y++){
    const p=iso({x,y});
    const edge=Math.max(Math.abs(x-cols/2)/(cols/2),Math.abs(y-rows/2)/(rows/2))*0.5;

    // Zone materials:
    // Operations & Executive zone (x <= 5, y <= 3) -> Deep obsidian with bronze hint
    // Research & Knowledge (x > 5, y <= 3) -> Deep navy carbon tile
    // Engineering & Database (y >= 6) -> Slate emerald / teal
    // Central Collab (x >= 5 && x <= 9 && y >= 4 && y <= 6) -> Circular terrazzo
    let baseCol = ops[0];
    if(y<=3 && x<=5){
      baseCol = (x+y)%2?ops[0]:ops[1];
    } else if(y<=3 && x>5){
      baseCol = (x+y)%2?research[0]:research[1];
    } else if(y>=6){
      baseCol = (x+y)%2?engDb[0]:engDb[1];
    } else if(x>=5 && x<=9 && y>=4 && y<=6){
      baseCol = pal.floorCollab;
    } else {
      baseCol = (x+y)%2?fallback[0]:fallback[1];
    }

    const col=shade(baseCol,Math.round(edge*pal.floorEdgeStep));
    // Diamond tile
    g.poly([p.x,p.y-20, p.x+37,p.y, p.x,p.y+20, p.x-37,p.y]).fill(col);

    // Subtle chamfered inner bevel
    g.poly([p.x,p.y-18, p.x+34,p.y, p.x,p.y+18, p.x-34,p.y])
     .stroke({color:0xffffff,width:0.4,alpha:0.03});
  }

  // ── High-Tech Floor Conduits / Optical Bus Lines ──
  // Conduits connecting departments to central hub
  // Main spine conduits
  const s1 = iso({x:2,y:2}), s2 = iso({x:12,y:2});
  const s3 = iso({x:2,y:8}), s4 = iso({x:12,y:8});
  const hub = iso({x:7,y:5});

  // Glowing conduit paths
  g.moveTo(s1.x,s1.y).lineTo(hub.x,hub.y).lineTo(s2.x,s2.y).stroke({color:pal.conduitGold,width:1.2,alpha:0.25});
  g.moveTo(s3.x,s3.y).lineTo(hub.x,hub.y).lineTo(s4.x,s4.y).stroke({color:pal.conduitGreen,width:1.2,alpha:0.25});

  // Central meeting terrazzo perimeter ring
  g.ellipse(hub.x,hub.y,64,34).stroke({color:pal.meetingRing,width:1.5,alpha:0.35});
  g.ellipse(hub.x,hub.y,72,38).stroke({color:pal.meetingRing,width:0.6,alpha:0.18});

  // Subtle isometric grid lines
  const GRID_COL=pal.grid;
  const GRID_A=0.45;
  for(let y=0;y<=rows;y++){
    const a=iso({x:0,y}),b=iso({x:cols-1,y});
    g.moveTo(a.x-37,a.y).lineTo(b.x+37,b.y).stroke({color:GRID_COL,width:0.7,alpha:GRID_A});
  }
  for(let x=0;x<=cols;x++){
    const a=iso({x,y:0}),b=iso({x,y:rows-1});
    g.moveTo(a.x,a.y-20).lineTo(b.x,b.y+20).stroke({color:GRID_COL,width:0.7,alpha:GRID_A});
  }

  // ── Lobby rug in front of the door, where finished agents wait ──
  const rug=[iso({x:2.6,y:-.45}),iso({x:11.6,y:-.45}),iso({x:11.6,y:1.6}),iso({x:2.6,y:1.6})];
  g.poly(rug.flatMap(p=>[p.x,p.y])).fill({color:pal.floorCollab,alpha:.85}).stroke({color:pal.meetingRing,width:1,alpha:.35});
  // Door mat and walkway marking the entrance lane
  const mat=iso(DOOR);
  g.poly([mat.x,mat.y-16,mat.x+30,mat.y,mat.x,mat.y+16,mat.x-30,mat.y]).fill({color:pal.meetingRing,alpha:.14});

  // ── Panoramic Architectural Windows & Twilight Cyber Skyline ──
  for(const side of [0,1]){
    const left =iso(side?{x:0,y:rows-1}:{x:0,y:0});
    const right=iso(side?{x:0,y:0}:{x:cols-1,y:0});

    // Wall structure
    g.poly([left.x-37,left.y-20,right.x+37,right.y-20,
            right.x+37,right.y-94,left.x-37,left.y-94])
     .fill({color:side?pal.wallA:pal.wallB,alpha:1});

    // Architectural crown molding strip
    g.poly([left.x-37,left.y-91,right.x+37,right.y-91,
            right.x+37,right.y-94,left.x-37,left.y-94])
     .fill({color:pal.crown,alpha:0.9});

    // Neon baseboard runner
    g.moveTo(left.x-37,left.y-20).lineTo(right.x+37,right.y-20)
     .stroke({color:pal.baseboardBright,width:2,alpha:0.85});
    g.moveTo(left.x-37,left.y-91).lineTo(right.x+37,right.y-91)
     .stroke({color:pal.baseboardDim,width:1.2,alpha:0.6});

    // Panoramic window bays
    const wCount=side?Math.max(4,Math.round(rows*.36)):4;
    for(let i=0;i<wCount;i++){
      const wx=left.x+(right.x-left.x)*(i+.5)/wCount;
      const wy=left.y+(right.y-left.y)*(i+.5)/wCount;

      // Heavy chamfered window casing
      g.roundRect(wx-20,wy-86,40,48,4).fill(pal.casingBg).stroke({color:pal.casingStroke,width:1.5});

      // Window Glass: Deep Twilight Sky Gradient
      g.roundRect(wx-18,wy-84,36,44,2).fill(pal.glassOuter);
      g.roundRect(wx-18,wy-84,36,20,2).fill({color:pal.glassTop,alpha:0.75});
      g.roundRect(wx-18,wy-64,36,24,0).fill({color:pal.glassBottom,alpha:0.85});

      // Distant City Skyline Silhouettes through glass
      // Tall skyscraper 1
      g.rect(wx-15,wy-70,8,28).fill(pal.towers[0]);
      // Tall skyscraper 2 with spire
      g.rect(wx-5,wy-78,10,36).fill(pal.towers[1]);
      limb(g,[wx,wy-83, wx,wy-78],pal.towerLine,1.5);
      // Red aviation beacon on spire
      g.circle(wx,wy-83,1.2).fill(pal.beacon);

      // Skyscraper 3
      g.rect(wx+7,wy-66,9,24).fill(pal.towers[2]);

      // Lit office windows on distant towers (tiny glittering dots)
      for(let r=0;r<4;r++){
        for(let c=0;c<2;c++){
          if((i+r+c)%3===0){
            g.circle(wx-2+c*4,wy-74+r*5,0.7).fill({color:pal.litWindowA,alpha:0.85});
          }
          if((i+r*2)%2===0){
            g.circle(wx-13+c*3,wy-66+r*4,0.7).fill({color:pal.litWindowB,alpha:0.75});
          }
        }
      }

      // Stars in upper night sky
      g.circle(wx-12,wy-80,0.8).fill({color:pal.star1,alpha:0.8});
      g.circle(wx+10,wy-76,0.6).fill({color:pal.star2,alpha:0.7});
      g.circle(wx+4,wy-81,0.5).fill({color:pal.star1,alpha:0.6});

      // Window mullions (sleek cross frame)
      g.rect(wx-0.8,wy-84,1.6,44).fill({color:pal.mullion,alpha:0.9});
      g.rect(wx-18,wy-62,36,1.6).fill({color:pal.mullion,alpha:0.9});

      // Specular glass glare reflection
      g.moveTo(wx-16,wy-84).lineTo(wx-6,wy-84).lineTo(wx-14,wy-42).lineTo(wx-18,wy-42)
       .fill({color:pal.glare,alpha:0.04});

      // Glowing neon sill
      g.moveTo(wx-20,wy-86).lineTo(wx+20,wy-86).stroke({color:pal.sillBright,width:1.2,alpha:0.7});
      g.moveTo(wx-20,wy-38).lineTo(wx+20,wy-38).stroke({color:pal.sillDim,width:1,alpha:0.45});
    }
    if(side===0)drawDoor(g,left,right,pal);
  }
}

/** The office door, set into the back wall at DOOR. The wall's base runs from left-37 to right+37, 20px above the tiles. */
function drawDoor(g:Graphics,left:Point,right:Point,pal:Palette){
  const x0=left.x-37,y0=left.y-20,slope=((right.y-20)-y0)/((right.x+37)-x0);
  const cx=iso(DOOR).x,baseY=(x:number)=>y0+(x-x0)*slope;
  const half=19,height=60,a=cx-half,b=cx+half;
  // Frame, then the open doorway showing the hall beyond
  g.poly([a-3,baseY(a-3),b+3,baseY(b+3),b+3,baseY(b+3)-height-4,a-3,baseY(a-3)-height-4]).fill(pal.casingStroke);
  g.poly([a,baseY(a),b,baseY(b),b,baseY(b)-height,a,baseY(a)-height]).fill(pal.glassOuter);
  g.poly([a,baseY(a),b,baseY(b),b,baseY(b)-height*.35,a,baseY(a)-height*.35]).fill({color:pal.sillBright,alpha:.12});
  // Door leaf swung open against the frame
  g.poly([a,baseY(a),a+9,baseY(a)+9,a+9,baseY(a)+9-height,a,baseY(a)-height]).fill(pal.casingBg).stroke({color:pal.casingStroke,width:1});
  g.circle(a+7,baseY(a)+5-height*.45,1.4).fill(pal.sillBright);
  // Lit sign over the door
  g.poly([cx-11,baseY(cx-11)-height-14,cx+11,baseY(cx+11)-height-14,cx+11,baseY(cx+11)-height-8,cx-11,baseY(cx-11)-height-8]).fill({color:pal.sillBright,alpha:.85});
}

/** Dynamic floor pulse wave – a radial scan line that sweeps across the office grid */
function drawFloorPulse(g:Graphics,cols:number,rows:number,t:number,pal:Palette){
  const period=8;
  const phase=(t%period)/period;
  const maxR=Math.hypot(cols,rows)*0.8;
  const waveR=phase*maxR;
  const center=iso({x:cols/2,y:rows/2});
  const alpha=Math.max(0,(1-phase)*0.14);
  g.circle(center.x,center.y,waveR*37).stroke({color:pal.sillBright,width:1.4,alpha});
  g.circle(center.x,center.y,waveR*37-9).stroke({color:pal.baseboardBright,width:0.6,alpha:alpha*0.5});
}

// ── Ceiling light fixture ────────────────────────────────────────────────────
function drawCeilingLight(g:Graphics,sx:number,sy:number,col:number,intensity:number,theme:OfficeTheme){
  const h=intensity*95;
  for(let s=0;s<6;s++){
    const w=14+s*9;
    const y0=sy-h+s*(h/6);
    const a=(0.045-s*0.0055)*intensity;
    g.roundRect(sx-w/2,y0,w,h/6+2,2).fill({color:col,alpha:Math.max(0,a)});
  }
  const housing=furnitureTint(0x0c2030,theme);
  g.roundRect(sx-9,sy-h-5,18,6,2).fill({color:housing,alpha:0.95});
  g.roundRect(sx-7,sy-h-3,14,3,1).fill({color:col,alpha:0.5*intensity});
}

/** The station a behavior is performed at, if any. */
export function stationOf(b:string){
  if(/Searching/.test(b))return 'research';
  if(/Reading archive/.test(b))return 'archive';
  if(/Querying/.test(b))return 'database';
  if(/Coding/.test(b))return 'engineering';
  if(/Computing/.test(b))return 'compute';
  if(/human|Human/.test(b))return 'human';
  if(/Discussing/.test(b))return 'meeting';
  return undefined;
}

// ── Retro theme station props: beige computers, filing, books and paper ──────
const BOOK_SPINES=[0x7a2e22,0x3d5a3a,0xb8862b,0x2f4a6b,0x6e4d2f,0x8c3a2e,0x4f6b4a];

function drawBookshelf(g:Graphics,x:number,y:number){
  g.roundRect(x-30,y-72,60,54,2).fill(0x4a2f18).stroke({color:0x2e1c0d,width:1.2});
  for(let shelf=0;shelf<3;shelf++){
    const base=y-58+shelf*17;
    g.rect(x-27,base-11,54,13).fill(0x24150a);
    let bx=x-26,i=shelf*3;
    while(bx<x+22){
      const w=4+(i*5)%4,h=9+(i*3)%3;
      g.rect(bx,base+1-h,w,h).fill(BOOK_SPINES[i%BOOK_SPINES.length]);
      g.rect(bx+1,base-h+3,w-2,.9).fill({color:0xe8d9a8,alpha:.7});
      bx+=w+.7;i++;
    }
    g.rect(x-28,base+2,56,2).fill(0x6e4d2f);
  }
}

function drawFilingCabinet(g:Graphics,x:number,y:number){
  g.roundRect(x-9,y-52,18,44,1.5).fill(0x8f8a70).stroke({color:0x5a5644,width:1});
  for(let d=0;d<3;d++){
    g.rect(x-7,y-49+d*14,14,12).fill(0xa39d80);
    g.rect(x-3,y-44+d*14,6,1.6).fill(0x4a4230);
    g.rect(x-4,y-47.5+d*14,8,2.6).fill(0xf0e6cc);
  }
}

function drawPaperStack(g:Graphics,x:number,y:number){
  for(let s=0;s<4;s++)g.rect(x-8+(s%2),y-s*1.4,16,5).fill(s%2?0xe8dfc6:0xf4ecd8).stroke({color:0xa89b78,width:.4});
  for(let ln=0;ln<3;ln++)g.rect(x-5,y-3.4+ln*1.7,10,.6).fill(0x8a7f62);
}

function drawRetroStation(g:Graphics,p:Point,col:number,key:string){
  if(key==='archive'){drawBookshelf(g,p.x,p.y);drawPaperStack(g,p.x-20,p.y-14);return;}
  const screen=key==='database'||key==='engineering'?0x33ff33:0xffb000;
  // Monitor on top of a horizontal desktop case.
  g.roundRect(p.x-20,p.y-69,40,36,3).fill(0xd2c7a6).stroke({color:0x8a7f62,width:1.2});
  g.roundRect(p.x-16,p.y-65,32,26,6).fill(0x140c00);
  for(let ln=0;ln<5;ln++)g.rect(p.x-12,p.y-61+ln*4,10+(ln*9+key.length*3)%16,1.6).fill({color:screen,alpha:.9});
  g.rect(p.x-12,p.y-41,4,2).fill(screen);
  for(let v=0;v<4;v++)g.rect(p.x+8+v*2.4,p.y-37,1.2,3).fill(0x8a7f62);
  g.roundRect(p.x-25,p.y-33,50,11,1.5).fill(0xc4b896).stroke({color:0x8a7f62,width:1});
  g.rect(p.x-20,p.y-29,18,2).fill(0x2e2818);
  g.circle(p.x+19,p.y-27.5,1.3).fill(col);
  drawPaperStack(g,p.x+24,p.y-14);
  if(key==='database')drawFilingCabinet(g,p.x-32,p.y);
  if(key==='research')drawBookshelf(g,p.x+50,p.y-8);
}

// ── Agent desks ───────────────────────────────────────────────────────────────
/** Desk colors per theme: top, front, legs, monitor housing, monitor trim. */
function deskColors(theme:OfficeTheme){
  if(theme==='retro')return {top:0x6e4d2f,front:0x4a2f18,leg:0x2e1c0d,monitor:0xd2c7a6,trim:0x8a7f62};
  if(theme==='classical')return {top:0x5a3a20,front:0x3e2814,leg:0x24150a,monitor:0x2a1e11,trim:0x8c6a3a};
  const wf=(hex:number)=>furnitureTint(hex,theme);
  return {top:wf(0x163a56),front:wf(0x0a1c2a),leg:wf(0x081522),monitor:wf(0x0c2030),trim:wf(0x2a4a64)};
}

/** An agent's own desk, drawn just in front of its seat: the seated owner shows behind the monitor and desktop.
 *  `lit` (0..1) glows the monitor while the owner works at it. */
function drawAgentDesk(g:Graphics,id:string,pal:Palette,theme:OfficeTheme,lit:number){
  const k=deskColors(theme),edge=pal.meetingRing;
  g.clear();
  g.ellipse(0,9,42,10).fill({color:0x000000,alpha:.32*(pal.ink??DARK_INK).shadowAlpha});
  g.rect(-31,-4,3,15).fill(k.leg);g.rect(28,-4,3,15).fill(k.leg);
  g.roundRect(-33,-5,66,10,2).fill(k.front);
  g.roundRect(-35,-17,70,14,3).fill(k.top).stroke({color:edge,width:1,alpha:.45});
  g.roundRect(-33,-4.5,66,1.4,.7).fill({color:edge,alpha:.5});
  // Monitor, seen from behind: its screen faces the agent sitting at the desk.
  if(lit>0)g.roundRect(-30,-41,34,26,5).fill({color:pal.station.research,alpha:.22*lit});
  g.roundRect(-27,-38,28,21,2).fill(k.monitor).stroke({color:k.trim,width:1});
  g.rect(-15,-17,4,3).fill(k.trim);
  g.circle(-24,-20,1.2).fill({color:lit>0?pal.station.engineering:k.trim,alpha:.9});
  g.roundRect(5,-14,16,4,1).fill(k.trim);
  drawDeskDeco(g,id,25,-14,theme==='retro');
}

// ── High-Tech Futuristic Workstations & Station Furniture ─────────────────────
function buildStation(key:string,pos:Point,furniture:Container,pal:Palette,theme:OfficeTheme){
  const p=iso(pos);
  const col=pal.station[key]??pal.station.research;
  const g=new Graphics();
  const wf=(hex:number)=>furnitureTint(hex,theme);

  // ── Elevated Platform with Beveled Hex Underglow ──
  g.ellipse(p.x,p.y+16,62,24).fill({color:0x000000,alpha:0.45*(pal.ink??DARK_INK).shadowAlpha});
  // Platform body
  g.poly([p.x-44,p.y+2, p.x,p.y+23, p.x+44,p.y+2, p.x,p.y-19]).fill(wf(0x0a1c2a));
  // Platform top
  g.poly([p.x-40,p.y+1, p.x,p.y+20, p.x+40,p.y+1, p.x,p.y-17]).fill(wf(0x0e2436));
  // Neon edge runner
  g.moveTo(p.x-40,p.y+1).lineTo(p.x,p.y+20).lineTo(p.x+40,p.y+1).lineTo(p.x,p.y-17).lineTo(p.x-40,p.y+1)
   .stroke({color:col,width:1.5,alpha:0.85});
  // Corner status beacon nodes
  for(const [cx,cy] of [[p.x-40,p.y+1],[p.x,p.y+20],[p.x+40,p.y+1],[p.x,p.y-17]]){
    g.circle(cx,cy,2.8).fill({color:col,alpha:0.95});
  }

  // ── Curved Ergonomic Matte Desk ──
  g.roundRect(p.x-33,p.y-21,66,22,5).fill(wf(0x081522));
  g.roundRect(p.x-31,p.y-25,62,21,4).fill(wf(0x0d2234));
  // Surface highlight edge
  g.roundRect(p.x-31,p.y-26,62,3.5,2).fill({color:col,alpha:0.25});
  // Front glowing LED lightbar
  g.roundRect(p.x-29,p.y-4,58,2.5,1.2).fill({color:col,alpha:0.85});
  g.roundRect(p.x-29,p.y-4,58,2.5,1.2).fill({color:0xffffff,alpha:0.20});

  if(theme==='retro'&&key!=='meeting'){
    drawRetroStation(g,p,col,key);
  } else if(key!=='meeting'){
    // ── Dual/Ultrawide Curved Displays on Articulated Heavy Mount ──
    // Articulated dual arm mount
    g.roundRect(p.x-2,p.y-34,4,14,1.5).fill(wf(0x081522));
    g.roundRect(p.x-8,p.y-22,16,3.5,1.5).fill(wf(0x0c2030));

    // Curved ultrawide display enclosure
    g.roundRect(p.x-20,p.y-66,40,34,5).fill(wf(0x050e18));
    g.roundRect(p.x-20,p.y-66,40,34,5).stroke({color:col,width:1.2,alpha:0.6});
    // Active display area
    g.roundRect(p.x-17,p.y-63,34,27,3).fill(wf(0x030c18));
    g.roundRect(p.x-17,p.y-63,34,27,3).fill({color:col,alpha:0.18});

    // Holographic scanlines & UI graphs on display
    for(let sl=0;sl<5;sl++){
      g.roundRect(p.x-15,p.y-60+sl*5,30,1.8,0.5).fill({color:0x000000,alpha:0.25});
    }
    // High-tech mini telemetry graph on screen
    limb(g,[p.x-14,p.y-45, p.x-8,p.y-50, p.x-2,p.y-47, p.x+4,p.y-53, p.x+12,p.y-48],col,1.2);
    // Camera / sensor bead
    g.circle(p.x,p.y-64.5,1.8).fill({color:col,alpha:0.8});

    // Corner futuristic bracket markings
    g.moveTo(p.x-20,p.y-66).lineTo(p.x-13,p.y-66).stroke({color:col,width:1.6,alpha:0.9});
    g.moveTo(p.x+20,p.y-66).lineTo(p.x+13,p.y-66).stroke({color:col,width:1.6,alpha:0.9});
  } else {
    // ── Meeting Table Floating 3D Holographic Projector Dome ──
    g.circle(p.x,p.y-24,16).fill({color:col,alpha:0.08});
    g.circle(p.x,p.y-24,12).stroke({color:col,width:1.2,alpha:0.6});
    g.circle(p.x,p.y-24,6).fill({color:col,alpha:0.35});
    g.circle(p.x,p.y-24,3).fill({color:0xffffff,alpha:0.85});

    // Floating 3D Wireframe Node Matrix (above dome)
    const hNodes = [[-8,-44],[8,-44],[0,-54],[-10,-32],[10,-32]];
    for(let i=0;i<hNodes.length;i++){
      const [nx,ny] = hNodes[i];
      g.circle(p.x+nx,p.y+ny,2.2).fill(col);
      // Link lines to adjacent nodes
      const next = hNodes[(i+1)%hNodes.length];
      g.moveTo(p.x+nx,p.y+ny).lineTo(p.x+next[0],p.y+next[1]).stroke({color:col,width:0.8,alpha:0.45});
    }
    // Vertical projector beam lines
    g.moveTo(p.x,p.y-24).lineTo(p.x,p.y-54).stroke({color:col,width:1,alpha:0.5});
  }

  // ── Illuminated Nameplate with Status Chip ──
  const plate=new Graphics();
  plate.roundRect(-30,-5,60,10,2.5).fill({color:wf(0x050e18),alpha:0.95});
  plate.roundRect(-30,-5,60,10,2.5).stroke({color:col,width:1,alpha:0.65});
  plate.roundRect(-28,-4,56,3,1.2).fill({color:col,alpha:0.3});
  plate.position.set(p.x,p.y-12);
  furniture.addChild(plate);
  furniture.addChild(g);

  // Label text with clean sci-fi typography
  const lbl=new Text({
    text:STATION_NAMES[key]??key.toUpperCase(),
    style:new TextStyle({fontFamily:'ui-monospace,monospace',fontSize:8,fill:col,
      letterSpacing:1.8,fontWeight:'700'})
  });
  lbl.position.set(p.x-lbl.width/2,p.y+30);
  furniture.addChild(lbl);

  // Station Code Number
  const num=new Text({
    text:Object.keys(STATION_NAMES).indexOf(key).toString().padStart(2,'0'),
    style:new TextStyle({fontFamily:'ui-monospace,monospace',fontSize:7,
      fill:col,letterSpacing:1.2})
  });
  num.alpha=0.55;
  num.position.set(p.x-num.width/2,p.y+41);
  furniture.addChild(num);
}

export function Office({engine,selected,follow,fitToken,onSelect,theme='cool',agentScale=1}:{
  engine:OfficeEngine;selected?:string;follow?:string;fitToken:number;onSelect:(id:string)=>void;theme?:OfficeTheme;agentScale?:number;
}){
  const host=useRef<HTMLDivElement>(null);
  const view=useCameraControls();
  const latest=useRef({selected,follow,onSelect,fitToken,agentScale,rotated:view.rotated});
  latest.current={selected,follow,onSelect,fitToken,agentScale,rotated:view.rotated};
  const [error,setError]=useState('');

  useEffect(()=>{
    let disposed=false;
    const pal=OFFICE_PALETTES[theme];
    const ink=pal.ink??DARK_INK;
    /** "Original" theme: the previous figures, foot reticles, bare labels and camera framing, with no motion smoothing. */
    const classic=theme==='original';
    const wf=(hex:number)=>furnitureTint(hex,theme);
    const app=new Application();
    let cleanup=()=>{};

    (async()=>{
      await app.init({
        resizeTo:host.current!,
        background:pal.canvasBg,
        // High-DPI screens are already smooth; skipping MSAA there saves a lot of GPU fill.
        antialias:devicePixelRatio<2,
        resolution:Math.min(devicePixelRatio,2),
        autoDensity:true,
      });
      if(disposed){app.destroy(true,{children:true});return;}
      host.current!.appendChild(app.canvas);

      // ── Layer stack (back → front) ────────────────────────────────────
      const world      =new Container();
      const floor      =new Graphics();         // iso grid & zoned materials
      const furniture  =new Container();        // desks, stations, planters
      const beams      =new Graphics();         // vertical light columns
      const glows      =new Graphics();         // station rings + particles
      const tracks     =new Graphics();         // selected agent's walked path
      const people     =new Container();        // agents
      const overlays   =new Container();        // speech bubbles
      const exchanges  =new Graphics();         // arcs + data-flow
      const atmosphere =new Graphics();         // atmospheric haze & dust
      app.ticker.maxFPS=60;
      app.stage.addChild(world);
      world.addChild(floor,furniture,beams,glows,tracks,people,overlays,exchanges,atmosphere);
      people.sortableChildren=true;

      let drawnRows=0,cacheRes=0;
      /** Viewed from the other corner: the world is mirrored left to right (see camera.tsx). */
      let rot=latest.current.rotated;
      const sx=()=>rot?-1:1;
      const buildFloor=(rows:number)=>{
        drawHoloFloor(floor,15,rows,pal);
        drawnRows=rows;
        if(cacheRes)floor.updateCacheTexture();
      };
      buildFloor(engine.rows());
      const lobbyLabel=new Text({text:'LOBBY',style:new TextStyle({fontFamily:'ui-monospace,monospace',fontSize:8,fill:pal.meetingRing,letterSpacing:1.8,fontWeight:'700'})});
      const lobbyAt=iso({x:9.8,y:-.15});lobbyLabel.alpha=.75;lobbyLabel.position.set(lobbyAt.x-lobbyLabel.width/2,lobbyAt.y-4);
      furniture.addChild(lobbyLabel);

      // ── Workstations: only the stations this run uses, added as its agents first need them ──
      const stationLayer=new Container();
      furniture.addChild(stationLayer);
      let stationSig='';
      const syncStations=()=>{
        const keys=activeStations(engine.state),sig=keys.join(',');
        if(sig===stationSig)return keys;
        stationSig=sig;
        for(const child of stationLayer.removeChildren())child.destroy({children:true});
        for(const key of keys)buildStation(key,stations[key],stationLayer,pal,theme);
        readableText(stationLayer,rot);
        if(cacheRes)furniture.updateCacheTexture();
        return keys;
      };
      syncStations();

      // ── Architectural Biophilic Planters ──────────────────────────────
      for(const pos of [{x:0,y:0},{x:14,y:0},{x:0,y:10},{x:14,y:10}]){
        const p=iso(pos);
        const g=new Graphics();
        // Matte geometric planter (foliage stays green in both themes — plants don't change color with the decor)
        g.roundRect(p.x-10,p.y-6,20,15,4).fill(wf(0x0c1b26)).stroke({color:wf(0x1e3a4e),width:1.2});
        g.ellipse(p.x,p.y-6,9,3).fill(wf(0x182c3c));

        // Lush monstera & fern foliage with depth layers
        g.circle(p.x,p.y-23,19).fill(0x07261a);
        g.circle(p.x,p.y-23,19).fill({color:0x10b981,alpha:0.06});
        g.circle(p.x-9,p.y-29,12).fill(0x0b3524);
        g.circle(p.x+8,p.y-31,10).fill(0x082f20);
        g.circle(p.x,p.y-37,9).fill(0x0f3e2b);

        // Bioluminescent leaf accents
        g.circle(p.x-4,p.y-35,4.5).fill({color:0x34d399,alpha:0.16});
        g.circle(p.x+5,p.y-29,3.5).fill({color:0x34d399,alpha:0.12});
        furniture.addChild(g);
      }

      // ── Corner High-Tech Espresso & Refreshment Bar ───────────────────
      const coffeePos = iso({x:0,y:5});
      const coffeeG = new Graphics();
      // Counter base
      coffeeG.roundRect(coffeePos.x-14,coffeePos.y-8,28,16,3).fill(wf(0x0a1a26)).stroke({color:wf(0x163448),width:1});
      // Espresso machine housing
      coffeeG.roundRect(coffeePos.x-9,coffeePos.y-24,18,16,2).fill(wf(0x1e293b)).stroke({color:wf(0x475569),width:1});
      // Portafilter & dispensing spout
      coffeeG.roundRect(coffeePos.x-5,coffeePos.y-14,10,3,1).fill(wf(0x64748b));
      // Cup warming tray on top
      coffeeG.roundRect(coffeePos.x-7,coffeePos.y-26,14,3,1).fill(wf(0x334155));
      // Status LEDs on machine
      coffeeG.circle(coffeePos.x-5,coffeePos.y-20,1.2).fill(0x10b981);
      coffeeG.circle(coffeePos.x,coffeePos.y-20,1.2).fill(pal.conduitGold);
      // Steam wisps
      coffeeG.moveTo(coffeePos.x-1,coffeePos.y-27).quadraticCurveTo(coffeePos.x+2,coffeePos.y-33,coffeePos.x-1,coffeePos.y-39)
             .stroke({color:0xffffff,width:1,alpha:0.35});
      furniture.addChild(coffeeG);

      // The floor, walls and furniture never animate. Render them into textures once instead of re-drawing
      // hundreds of shapes every frame; re-render only when the floor grows or zooming needs more detail.
      const cacheStatic=(resolution:number)=>{
        cacheRes=resolution;
        for(const layer of [floor,furniture]){layer.cacheAsTexture(false);layer.cacheAsTexture({resolution,antialias:true});}
      };

      // ── Agent desks: one per assigned seat, in the people layer so each sits in front of its owner ──
      const deskViews=new Map<string,{g:Graphics;plate:Text;sig:string}>();

      // ── Character Views ────────────────────────────────────────────────
      const views=new Map<string,{
        root:Container;body:Graphics;ring:Graphics;
        name:Text;status:Text;labels:Graphics;seated:number;
        bubble:Container;bubbleText:Text;bubbleBg:Graphics;
        bodySig:string;bodyAt:number;
        /** Smoothed screen position, facing, walk phase and stride: the engine moves in straight tile-to-tile
         *  segments; easing toward it rounds the corners, and the gait advances by distance so feet don't slide. */
        rx:number;ry:number;facing:number;gait:number;stride:number;wasHidden:boolean;
      }>();
      overlays.addChild(new Container());
      // Hovering an agent shows its token usage (see usage.ts).
      let hovered:string|undefined;
      const tip=createHoverTip(app.stage,{bg:pal.bubbleBg,border:ink.selection,text:ink.name,title:ink.selection});

      // ── Camera ────────────────────────────────────────────────────────
      let zoom=1,pan={x:0,y:0},fit=-1,interacted=false;
      let drag:{x:number;y:number}|undefined;
      /** Fit the whole office (floor diamond, back walls and the labels under the front row) to the canvas. */
      /** Canvas strips covered by the floating scene heading and hint line; re-measured on resize. */
      let insets=overlayInsets(host.current);
      /** Zoom and pan that fit a world-space box into the visible part of the canvas. */
      const frameBox=(minX:number,maxX:number,minY:number,maxY:number,maxZoom:number)=>{
        const pad=Math.min(24,app.screen.width*.03),h=app.screen.height-insets.top-insets.bottom;
        zoom=Math.max(.22,Math.min(maxZoom,Math.min((app.screen.width-pad*2)/(maxX-minX),(h-pad*2)/(maxY-minY))));
        pan={x:app.screen.width/2-sx()*(minX+maxX)/2*zoom,y:insets.top+h/2-(minY+maxY)/2*zoom};
      };
      const fitOffice=()=>{
        const rows=drawnRows||11;
        if(classic){
          const span=14+rows-1,h=app.screen.height-insets.top-insets.bottom;
          zoom=Math.min(app.screen.width/(span*37+90),h/(span*20+85));
          pan={x:app.screen.width/2-sx()*((14-(rows-1))*18.5-9)*zoom,
               y:insets.top+h/2-(((14+rows-1)*20-65)/2-12)*zoom};
          return;
        }
        frameBox(iso({x:0,y:rows-1}).x-37,iso({x:14,y:0}).x+37,-98,iso({x:14,y:rows-1}).y+46,3);
      };
      fitOffice();
      readableText(world,rot);

      /** What the camera frames while the viewer hasn't taken over: the activity (default), or the whole floor
       *  ("Reset view", and always in the Original theme). The floor is a wide diamond that agents rarely fill, so
       *  framing what is in use (agents, their desks, the stations in use) gives them most of the canvas. */
      let frame:'activity'|'office'=classic?'office':'activity',snap=true,goal:{zoom:number;pan:{x:number;y:number}}|undefined;
      const activityBox=()=>{
        let x0=Infinity,x1=-Infinity,y0=Infinity,y1=-Infinity;
        const add=(p:Point,up:number,down:number,side:number)=>{const q=iso(p);x0=Math.min(x0,q.x-side);x1=Math.max(x1,q.x+side);y0=Math.min(y0,q.y-up);y1=Math.max(y1,q.y+down);};
        for(const c of engine.characters.values())if(!c.hidden)add(c.location,118,34,70);
        for(const [id,slot] of Object.entries(engine.state.desks))if(engine.state.agents[id])add(deskPoint(slot),60,34,60);
        for(const key of activeStations(engine.state))add(stations[key],80,44,70);
        if(!Number.isFinite(x0))return undefined;
        // Never tighter than a few desks across, so a lone agent still shows the room around it.
        const w=Math.max(x1-x0,560),h=Math.max(y1-y0,320),cx=(x0+x1)/2,cy=(y0+y1)/2;
        return {x0:cx-w/2,x1:cx+w/2,y0:cy-h/2,y1:cy+h/2};
      };
      /** Camera that shows `frame`, without moving the current one. */
      const frameTarget=()=>{
        const keep={zoom,pan};
        const box=frame==='activity'?activityBox():undefined;
        if(box)frameBox(box.x0,box.x1,box.y0,box.y1,2);
        else fitOffice();
        const target={zoom,pan};zoom=keep.zoom;pan=keep.pan;
        return target;
      };

      // ── Input ──────────────────────────────────────────────────────────
      const observer=new ResizeObserver(()=>{app.resize();insets=overlayInsets(host.current);snap=true;});
      observer.observe(host.current!);
      const onDown=(e:PointerEvent)=>{drag={x:e.clientX,y:e.clientY};};
      const onMove=(e:PointerEvent)=>{
        if(drag){if(e.clientX!==drag.x||e.clientY!==drag.y)interacted=true;pan.x+=e.clientX-drag.x;pan.y+=e.clientY-drag.y;drag={x:e.clientX,y:e.clientY};}};
      const onUp=()=>{drag=undefined;};
      const onWheel=(e:WheelEvent)=>{
        e.preventDefault();interacted=true;
        const r=app.canvas.getBoundingClientRect();
        const x=e.clientX-r.left,y=e.clientY-r.top;
        const nz=Math.max(.22,Math.min(3,zoom*Math.exp(-e.deltaY*.001)));
        pan={x:x-(x-pan.x)*nz/zoom,y:y-(y-pan.y)*nz/zoom};zoom=nz;};
      app.canvas.addEventListener('pointerdown',onDown);
      window.addEventListener('pointermove',onMove);
      window.addEventListener('pointerup',onUp);
      app.canvas.addEventListener('wheel',onWheel,{passive:false});
      cleanup=()=>{
        observer.disconnect();
        window.removeEventListener('pointermove',onMove);
        window.removeEventListener('pointerup',onUp);
        app.canvas.removeEventListener('pointerdown',onDown);
        app.canvas.removeEventListener('wheel',onWheel);
      };

      // ── Arc Data-Flow Pool ─────────────────────────────────────────────
      type ArcDot={pct:number;speed:number;color:number;size:number};
      const arcDotMap=new Map<string,ArcDot[]>();

      // ── Render Tick ────────────────────────────────────────────────────
      let prevT=0,drawnTrack='';
      app.ticker.add(()=>{
        if(fit!==latest.current.fitToken){fit=latest.current.fitToken;interacted=false;frame=classic?'office':'activity';snap=true;}
        if(latest.current.rotated!==rot){
          pan.x=flipPan(pan.x,zoom,app.screen.width,rot);rot=latest.current.rotated;
          readableText(world,rot);if(cacheRes)cacheStatic(cacheRes);
        }
        {
          const cam={zoom,pan};let fitted=false;
          if(runCameraCommands(view.commands.current,cam,app.screen,{min:.22,max:3},()=>{frame='office';snap=true;fitted=true;})){
            zoom=cam.zoom;pan=cam.pan;interacted=!fitted;
          }
        }
        const rows=engine.rows();
        if(rows!==drawnRows)buildFloor(rows);
        const shown=syncStations();

        // Prune removed agents
        for(const [id,v] of views){
          if(!engine.characters.has(id)){v.root.destroy({children:true});views.delete(id);}
        }

        // Desks follow the seats the engine assigns. The OPERATIONS station already is a desk, so none is added there.
        const opsSeat=stations.manager;
        for(const [id,v] of deskViews){
          const slot=engine.state.desks[id];
          if(!slot||!engine.state.agents[id]){v.g.destroy();v.plate.destroy();deskViews.delete(id);}
        }
        for(const [id,slot] of Object.entries(engine.state.desks)){
          const a=engine.state.agents[id];if(!a)continue;
          const seat=deskPoint(slot);
          if(seat.x===opsSeat.x&&seat.y===opsSeat.y){const old=deskViews.get(id);if(old){old.g.destroy();old.plate.destroy();deskViews.delete(id);}continue;}
          let v=deskViews.get(id);
          if(!v){
            const g=new Graphics(),plate=new Text({text:'',style:new TextStyle({fontFamily:'ui-monospace,monospace',fontSize:8,fill:ink.name,letterSpacing:1,fontWeight:'700'})});
            plate.alpha=.55;people.addChild(g,plate);v={g,plate,sig:''};deskViews.set(id,v);
          }
          const c=engine.characters.get(id);
          const home=!!c&&!c.hidden&&c.phase!=='walking'&&Math.hypot(c.location.x-seat.x,c.location.y-seat.y)<.05;
          const lit=home&&/Thinking|Working|Reading|Reviewing|Coding|Searching|Querying|Computing/.test(c!.current?.behavior??a.status)?1:0;
          const sp=iso(seat),sig=`${sp.x},${sp.y}|${lit}|${a.name}|${home}`;
          if(sig!==v.sig){
            drawAgentDesk(v.g,id,pal,theme,lit);
            v.g.position.set(sp.x,sp.y);v.g.zIndex=sp.y+1;
            // The owner's name stays on an empty desk, so it is clear whose desk it is.
            v.plate.text=floorName(a.name).toUpperCase();v.plate.visible=!home;
            v.plate.position.set(sp.x-v.plate.width/2,sp.y+12);v.plate.zIndex=sp.y+1;
            v.sig=sig;
          }
        }

        const t   =engine.reducedMotion?0:engine.time/1000;
        const dt  =engine.reducedMotion?0:Math.max(0,Math.min(t-prevT,0.1));   // engine time restarts at 0 on reset
        prevT=t;

        // ── Characters Loop ───────────────────────────────────────────
        for(const [id,c] of engine.characters){
          const a=engine.state.agents[id];if(!a)continue;
          let v=views.get(id);

          if(!v){
            const root    =new Container();
            const body    =new Graphics();
            const ring    =new Graphics();
            const name    =new Text({text:a.name,style:new TextStyle(
              {fontFamily:'ui-monospace,monospace',fontSize:classic?10:9,fill:ink.name,fontWeight:'700',letterSpacing:classic?0.8:1})});
            const status  =new Text({text:'',style:new TextStyle(
              {fontFamily:'ui-monospace,monospace',fontSize:classic?9:8.5,fill:ink.idle,letterSpacing:classic?0.5:0.6,fontWeight:classic?'600':'700'})});
            // Pills behind the name and status keep them readable over busy floor and furniture.
            const labels  =new Graphics();
            const bubble    =new Container();
            const bubbleBg  =new Graphics();
            const bubbleText=new Text({text:'',style:new TextStyle(
              {fontFamily:'system-ui',fontSize:9,fill:ink.bubble,wordWrap:true,wordWrapWidth:120,fontWeight:'500'})});
            bubble.addChild(bubbleBg,bubbleText);
            bubble.visible=false;
            root.addChild(ring,body,labels,name,status,bubble);
            root.eventMode='static';root.cursor='pointer';
            root.on('pointertap',()=>latest.current.onSelect(id));
            root.on('pointerover',()=>{hovered=id;});root.on('pointerout',()=>{if(hovered===id)hovered=undefined;});
            people.addChild(root);
            v={root,body,ring,name,status,labels,seated:0,bubble,bubbleText,bubbleBg,bodySig:'',bodyAt:-Infinity,
              rx:0,ry:0,facing:c.facing,gait:0,stride:0,wasHidden:true};
            views.set(id,v);
          }

          // Waiting to come in, or gone out through the door.
          v.root.visible=!c.hidden;
          if(c.hidden){v.wasHidden=true;continue;}
          const p=iso(c.location);
          // Ease the drawn position toward the engine's: corners round off and stops settle instead of snapping.
          // Jumps (entering, seeking a replay, reduced motion) are taken at once.
          const ox=v.rx,oy=v.ry;
          if(classic||v.wasHidden||engine.reducedMotion||!(Math.hypot(p.x-v.rx,p.y-v.ry)<=140)){v.rx=p.x;v.ry=p.y;}
          else{const k=1-Math.exp(-dt*13);v.rx+=(p.x-v.rx)*k;v.ry+=(p.y-v.ry)*k;}
          const moved=v.wasHidden?0:Math.hypot(v.rx-ox,v.ry-oy);
          v.wasHidden=false;
          const walking=c.phase==='walking';
          // About 30px of travel per full stride (two steps), so the feet keep pace with the floor.
          v.gait+=moved*(Math.PI*2/30);
          const ease=(rate:number)=>engine.reducedMotion?1:1-Math.exp(-dt*rate);
          v.stride+=((walking?1:0)-v.stride)*ease(walking?7:5);
          v.facing+=(c.facing-v.facing)*ease(9);
          // Fade in and out while passing through the doorway.
          const fromDoor=Math.hypot(c.location.x-DOOR.x,c.location.y-DOOR.y);
          v.root.alpha=walking?Math.min(1,.2+fromDoor/.8):1;
          const action=c.current?.behavior??(c.inLobby&&a.status!=='Error'?engine.lobbyLabel??'In lobby · available':a.status);
          const working=!walking&&
            /Thinking|Searching|Coding|Querying|Computing|Working|Reviewing|Reading/.test(action);
          v.seated+=(Number(working)-v.seated)*(classic?0.13:ease(6));
          // Belt and braces: one bad frame must never leave a character permanently undrawable.
          if(!Number.isFinite(v.facing+v.stride+v.seated+v.gait)){v.facing=c.facing;v.stride=0;v.seated=Number(working);v.gait=0;}
          v.root.position.set(v.rx,v.ry);
          v.root.zIndex=v.ry;
          // Only the figure and its ring scale; labels stay full size so they remain readable.
          const figureScale=latest.current.agentScale;
          v.ring.scale.set(figureScale);
          v.body.scale.set(figureScale);

          // ── Foot status ring: a soft pool of state color, crisp only when selected ──
          v.ring.clear();
          const isSel=latest.current.selected===id;
          const ringCol=a.status==='Error'?ink.error:working?ink.working:ink.idle;
          const ringPulse=(Math.sin(t*2.6+(identityPhase(id)))+1)*0.5;
          const ringR=16+v.seated*2.5+ringPulse*1.5;
          if(classic){
            // The original sci-fi reticle: always-on bloom, double ring and rotating brackets.
            const col=a.status==='Error'?0xef4444:working?0x10b981:walking?0x00d4ff:0x3b82f6;
            const pulse=(Math.sin(t*3.8+Object.keys(engine.state.agents).indexOf(id)*0.7)+1)*0.5;
            const r=19+v.seated*3+pulse*3;
            v.ring.ellipse(0,4,r+7,r*0.45+3.5).fill({color:col,alpha:0.09});
            v.ring.ellipse(0,4,r,r*0.45).stroke({color:col,width:1.5,alpha:0.65+pulse*0.35});
            v.ring.ellipse(0,4,r*0.7,r*0.32).stroke({color:col,width:0.8,alpha:0.3+pulse*0.2});
            for(let tick=0;tick<4;tick++){
              const ta=(tick/4)*Math.PI*2+t*1.5;
              const rx=Math.cos(ta)*r,ry=Math.sin(ta)*r*0.45;
              v.ring.moveTo(rx*0.75,4+ry*0.75).lineTo(rx,4+ry).stroke({color:col,width:2,alpha:0.8});
            }
            if(isSel){
              const sp2=(Math.sin(t*5)+1)*0.5;
              v.ring.ellipse(0,4,r+14,r*0.55+6).stroke({color:ink.selection,width:2.2,alpha:0.7+sp2*0.3});
              v.ring.ellipse(0,4,r+18,r*0.62+7.5).stroke({color:ink.selection,width:0.9,alpha:0.3});
            }
          }else{
          v.ring.ellipse(0,3,ringR+5,ringR*0.42+2.5).fill({color:ringCol,alpha:working||a.status==='Error'?0.11+ringPulse*0.05:0.05});
          v.ring.ellipse(0,3,ringR,ringR*0.42).stroke({color:ringCol,width:1.1,alpha:working||a.status==='Error'?0.55+ringPulse*0.25:0.28});
          }
          if(isSel&&!classic){
            const sp2=(Math.sin(t*4)+1)*0.5;
            v.ring.ellipse(0,3,ringR+9,ringR*0.5+4).stroke({color:ink.selection,width:1.8,alpha:0.65+sp2*0.3});
            for(let tick=0;tick<4;tick++){
              const ta=(tick/4)*Math.PI*2+t*1.2;
              const rx=Math.cos(ta)*(ringR+9),ry=Math.sin(ta)*(ringR*0.5+4);
              v.ring.circle(rx,3+ry,1.8).fill({color:ink.selection,alpha:.9});
            }
          }

          // ── Figure: redrawn every frame while it moves, at 30 fps otherwise ──
          const seat=desk(id,engine.state);
          const atDesk=!walking&&Math.hypot(c.location.x-seat.x,c.location.y-seat.y)<.05&&!(seat.x===opsSeat.x&&seat.y===opsSeat.y);
          const inMotion=!classic&&(walking||v.stride>.01||Math.abs(c.facing-v.facing)>.01||Math.abs(Number(working)-v.seated)>.01);
          const bodySig=`${action}|${c.phase}|${c.facing}|${c.carriedObject?1:0}|${Math.round(v.seated*40)}|${atDesk}|${hireSalt()}`;
          if(engine.time<v.bodyAt)v.bodyAt=-Infinity;   // the engine was reset
          if(bodySig!==v.bodySig||(!engine.reducedMotion&&(inMotion||engine.time-v.bodyAt>=BODY_FRAME_MS))){
            if(classic)drawClassicCharacter(v.body,a,c,engine.reducedMotion?0:engine.time,false,v.seated,false,atDesk);
            else drawCharacter(v.body,a,c,engine.reducedMotion?0:engine.time,false,v.seated,theme==='retro',atDesk,
              {gait:v.gait,facing:v.facing,stride:v.stride});
            v.bodySig=bodySig;v.bodyAt=engine.time;
          }

          // ── Name + status labels ──
          // Status shows only when it says something: resting, arriving and returning agents just carry their name.
          const task=a.task?engine.state.tasks[a.task]:undefined;
          const quiet=/^(Idle|Arriving|Returning to desk|Collecting results|Received folder)$|lobby|sleep/i.test(action)&&a.status!=='Error';
          const dots=working&&!engine.reducedMotion?['·','··','···'][Math.floor(t*1.5)%3]:'';
          v.status.visible=!quiet||isSel;
          v.status.text=trunc(action.toUpperCase(),30)+(dots?' '+dots:'')+(task?.progress!==undefined?` ${Math.round(task.progress*100)}%`:'');
          const sf=a.status==='Error'?ink.error:working?ink.working:ink.idle;
          (v.status.style as TextStyle).fill=sf;
          v.name.text=floorName(a.name).toUpperCase();
          const nameY=12*figureScale+4,statusY=-104*figureScale+v.seated*8*figureScale;
          v.name.position.set(-v.name.width/2,nameY);
          v.status.position.set(-v.status.width/2,statusY);
          v.labels.clear();
          if(classic){
            // Original labels: bare text, status always shown, prefixed while walking.
            v.status.visible=true;
            v.status.text=(walking?'MOVING  ':'')+action.toUpperCase()+(dots?' '+dots:'')+(task?.progress!==undefined?` ${Math.round(task.progress*100)}%`:'');
            (v.status.style as TextStyle).fill=a.status==='Error'?ink.error:working?ink.working:ink.idle;
            v.name.position.set(-v.name.width/2,14*figureScale);
            v.status.position.set(-v.status.width/2,-118*figureScale);
          }else{
          v.labels.roundRect(-v.name.width/2-6,nameY-2,v.name.width+12,v.name.height+4,6)
            .fill({color:pal.bubbleBg,alpha:.78}).stroke({color:isSel?ink.selection:ringCol,width:1,alpha:isSel?.9:.35});
          if(v.status.visible){
            v.labels.roundRect(-v.status.width/2-7,statusY-2.5,v.status.width+14,v.status.height+5,7)
              .fill({color:pal.bubbleBg,alpha:.82}).stroke({color:sf,width:1,alpha:.5});
            v.labels.circle(-v.status.width/2-2.5,statusY+v.status.height/2,1.6).fill({color:sf,alpha:.5+ringPulse*.5});
          }
          }

          // ── Holographic Frosted Glass Speech Bubble ───────────────────
          const ai=engine.interactions.filter(i=>i.from===id&&i.question).at(-1);
          if(ai&&!engine.reducedMotion){
            const txt=trunc(ai.question??'',30);
            v.bubbleText.text=txt;
            v.bubbleBg.clear();
            const bw=Math.max(92,v.bubbleText.width+24);
            const bh=v.bubbleText.height+18;
            const bc=pal.station.meeting;
            // Drop shadow
            v.bubbleBg.roundRect(-bw/2+2,-bh-6,bw,bh,7).fill({color:0x000000,alpha:0.5*ink.shadowAlpha});
            // Frosted glass body
            v.bubbleBg.roundRect(-bw/2,-bh-8,bw,bh,7).fill({color:pal.bubbleBg,alpha:0.92});
            v.bubbleBg.roundRect(-bw/2,-bh-8,bw,bh,7).stroke({color:bc,width:1.2,alpha:0.75});
            // Cyan top accent lightbar
            v.bubbleBg.roundRect(-bw/2,-bh-8,bw,3,3).fill({color:bc,alpha:0.6});
            // Tail
            v.bubbleBg.poly([-6,-8,0,0,6,-8]).fill({color:pal.bubbleBg,alpha:0.92});
            v.bubbleBg.moveTo(-6,-8).lineTo(0,0).lineTo(6,-8).stroke({color:bc,width:1.2,alpha:0.75});
            v.bubbleText.position.set(-bw/2+12,-bh-3);
            v.bubble.position.set(0,classic?-128*figureScale:statusY-6);
            v.bubble.visible=true;
          } else {
            v.bubble.visible=false;
          }
        }

        // ── Selected agent's track: the path walked, older parts fainter, with a dot at every stop ──
        const tracked=latest.current.selected?engine.characters.get(latest.current.selected):undefined;
        const trackSig=tracked?`${tracked.id}|${tracked.trail.length}|${tracked.stops.length}|${tracked.trail.at(-1)?.x}|${tracked.trail.at(-1)?.y}`:'';
        if(trackSig!==drawnTrack){
          drawnTrack=trackSig;
          tracks.clear();
          if(tracked&&tracked.trail.length>1){
            const pts=tracked.trail.map(q=>{const s=iso(q);return {x:s.x,y:s.y+4};});
            // A handful of strokes (older bands fainter) instead of one stroke per segment.
            const BANDS=6,n=pts.length;
            for(let band=0;band<BANDS;band++){
              const from=Math.floor(band*(n-1)/BANDS),to=Math.floor((band+1)*(n-1)/BANDS);
              if(to<=from)continue;
              tracks.moveTo(pts[from].x,pts[from].y);
              for(let i=from+1;i<=to;i++)tracks.lineTo(pts[i].x,pts[i].y);
              tracks.stroke({color:ink.selection,width:2.2,alpha:.15+.7*((band+1)/BANDS),cap:'round',join:'round'});
            }
            tracks.circle(pts[0].x,pts[0].y,5).stroke({color:ink.selection,width:1.4,alpha:.5});
            tracked.stops.forEach((stop,i)=>{
              const s=iso(stop.at),recent=(i+1)/tracked.stops.length;
              tracks.circle(s.x,s.y+4,3.6).fill({color:ink.selection,alpha:.35+.6*recent}).stroke({color:pal.canvasBg,width:1,alpha:.8});
            });
          }
        }

        // ── Vertical Light Beams & Station Orbitals ───────────────────
        // Which characters are at work at each station, computed once per frame for the beams, rings and ceiling lights.
        const occupants=new Map<string,typeof busyChars>();
        const busyChars=[...engine.characters.values()].filter(ch=>!ch.hidden);
        for(const ch of busyChars){const key=stationOf(ch.current?.behavior??'');if(key){const list=occupants.get(key)??[];list.push(ch);occupants.set(key,list);}}
        beams.clear();
        glows.clear();

        for(const key of shown){
          const sp=iso(stations[key]);
          const col=pal.station[key]??pal.station.research;
          const occ=occupants.get(key)??[];
          const active=occ.length>0;

          // Subtle base floor glow
          glows.ellipse(sp.x,sp.y+8,58,20).fill({color:col,alpha:active?0.08:0.028});

          if(!engine.reducedMotion&&active){
            const pulse=(Math.sin(t*3.0)+1)*0.5;

            // Vertical holographic light column
            const beamH=125+pulse*15;
            for(let segment=0;segment<8;segment++){
              const sy=-50-segment*(beamH/8);
              const height=beamH/8;
              const w=22*(1-segment/8);
              const a=(0.14-segment*0.015)*(0.65+pulse*0.35);
              beams.roundRect(sp.x-w/2,sp.y+sy,w,height,2)
                   .fill({color:col,alpha:Math.max(0,a)});
            }
            // Beam core line
            beams.moveTo(sp.x,sp.y-50).lineTo(sp.x,sp.y-50-beamH)
                 .stroke({color:col,width:1,alpha:0.35+pulse*0.25});

            // Outer ring halos
            glows.circle(sp.x,sp.y-24,80).fill({color:col,alpha:0.035+pulse*0.025});
            glows.circle(sp.x,sp.y-24,56+pulse*9).stroke({color:col,width:2.2,alpha:0.4+pulse*0.25});
            glows.circle(sp.x,sp.y-24,67+pulse*6).stroke({color:col,width:0.8,alpha:0.16+pulse*0.10});
            glows.circle(sp.x,sp.y-24,42+pulse*5).stroke({color:col,width:1.2,alpha:0.25+pulse*0.18});

            // Orbiting data nodes
            for(let oi=0;oi<Math.min(occ.length,4);oi++){
              const da=(oi/Math.max(occ.length,1))*Math.PI*2+t*1.8;
              const ox=sp.x+Math.cos(da)*30,oy=sp.y-24+Math.sin(da)*15;
              glows.circle(ox,oy,8+pulse*3).fill({color:col,alpha:0.14});
              glows.circle(ox,oy,4.5+pulse*1.5).fill({color:col,alpha:0.6+pulse*0.3});
              glows.circle(ox,oy,4.5+pulse*1.5).stroke({color:0xffffff,width:0.8,alpha:0.4});
              // Trailing motion streak
              for(let tr=1;tr<=5;tr++){
                const ta2=da-tr*0.12;
                const tx=sp.x+Math.cos(ta2)*30,ty=sp.y-24+Math.sin(ta2)*15;
                glows.circle(tx,ty,2.6-tr*0.4).fill({color:col,alpha:(0.35-tr*0.06)*pulse});
              }
            }

            // Spawn ambient energy motes
            if(dt>0&&Math.random()<dt*4.5*occ.length)
              spawnMote(sp.x,sp.y-30,col);
          }
        }

        // Tick ambient particles
        if(!engine.reducedMotion) tickParticles(dt,glows);

        // Dynamic floor radar pulse
        if(!engine.reducedMotion && engine.characters.size > 0) drawFloorPulse(glows,15,drawnRows,t,pal);

        // Atmospheric drifting dust
        if(!engine.reducedMotion && dt>0 && Math.random()<dt*1.6){
          const center=iso({x:7,y:Math.round(drawnRows/2)});
          spawnDust(center.x,center.y,pal);
        }

        // Ceiling lights over active stations
        if(!engine.reducedMotion){
          for(const key of shown){
            const sp=iso(stations[key]);
            const col=pal.station[key]??pal.station.research;
            const occ=occupants.get(key)??[];
            if(occ.length>0){
              const pulse=(Math.sin(t*2.5)+1)*0.5;
              drawCeilingLight(beams,sp.x,sp.y-60,col,0.45+pulse*0.3,theme);
            }
          }
        }

        // Atmospheric haze & vignette
        atmosphere.clear();
        if(!engine.reducedMotion){
          const center=iso({x:7,y:Math.round(drawnRows/2)});
          atmosphere.ellipse(center.x,center.y+80,620,130).fill({color:pal.fogNear,alpha:0.07+Math.sin(t*0.3)*0.018});
          atmosphere.ellipse(center.x,center.y-200,720,210).fill({color:pal.fogFar,alpha:0.04});
        }

        // ── Interaction Data-Stream Arcs ─────────────────────────────
        exchanges.clear();
        for(const k of arcDotMap.keys()){
          if(!engine.interactions.find(i=>i.id===k))arcDotMap.delete(k);
        }

        for(const interaction of engine.interactions){
          const from=engine.characters.get(interaction.from);
          const to  =engine.characters.get(interaction.to);
          if(!from||!to)continue;
          const fa=iso(from.location),fb=iso(to.location);
          const age=engine.time-interaction.started;
          const fadeA=engine.reducedMotion?1:Math.max(0,1-age/5000);
          const pct  =engine.reducedMotion?1:Math.min(1,age/2000);

          const isAnswer=interaction.kind==='question.answered';
          const col=isAnswer?0x10b981:0xf59e0b;

          const arc=(u:number)=>({
            x:fa.x+(fb.x-fa.x)*u,
            y:fa.y+(fb.y-fa.y)*u-48-Math.sin(u*Math.PI)*42,
          });

          if(!engine.reducedMotion&&fadeA>0){
            const f0=arc(0);
            exchanges.moveTo(f0.x,f0.y);
            for(let i=1;i<=24;i++){const ap=arc(i/24);exchanges.lineTo(ap.x,ap.y);}
            exchanges.stroke({color:col,width:4.5,alpha:fadeA*0.09});

            exchanges.moveTo(f0.x,f0.y);
            for(let i=1;i<=24;i++){const ap=arc(i/24);exchanges.lineTo(ap.x,ap.y);}
            exchanges.stroke({color:col,width:1.4,alpha:fadeA*0.4});
          }

          // Trailing neon energy packets
          if(!engine.reducedMotion&&fadeA>0.1){
            if(!arcDotMap.has(interaction.id)){
              arcDotMap.set(interaction.id,[]);
              for(let d=0;d<4;d++){
                arcDotMap.get(interaction.id)!.push(
                  {pct:d*0.22,speed:0.22+Math.random()*0.14,color:col,size:2.2+Math.random()*1.5});
              }
            }
            for(const d of arcDotMap.get(interaction.id)!){
              d.pct=(d.pct+dt*d.speed)%1;
              if(d.pct>pct+0.08)d.pct=0;
              const dp=arc(d.pct);
              exchanges.circle(dp.x,dp.y,d.size*2.5).fill({color:d.color,alpha:0.14*fadeA});
              exchanges.circle(dp.x,dp.y,d.size).fill({color:d.color,alpha:0.85*fadeA});
            }
          }

          // Traveling message capsule
          const bp=arc(pct);
          const bpN=arc(Math.min(1,pct+0.04));
          const ang=Math.atan2(bpN.y-bp.y,bpN.x-bp.x);
          const bA=fadeA;

          exchanges.roundRect(bp.x-16,bp.y-12,32,22,8).fill({color:col,alpha:bA*0.16});
          exchanges.roundRect(bp.x-13,bp.y-10,26,18,6).fill({color:wf(0x050e18),alpha:bA*0.94});
          exchanges.roundRect(bp.x-13,bp.y-10,26,18,6).stroke({color:col,width:1.4,alpha:bA*0.9});

          if(isAnswer){
            exchanges.moveTo(bp.x-6,bp.y).lineTo(bp.x-1,bp.y+4.5).lineTo(bp.x+6,bp.y-5.5)
              .stroke({color:col,width:2,alpha:bA,cap:'round',join:'round'});
          } else {
            exchanges.circle(bp.x,bp.y-1.5,3.2).fill({color:col,alpha:bA*0.85});
            exchanges.circle(bp.x,bp.y+5,1.4).fill({color:col,alpha:bA*0.8});
          }
          exchanges.poly([
            bp.x+Math.cos(ang)*17,bp.y+Math.sin(ang)*17,
            bp.x+Math.cos(ang+2.2)*9.5,bp.y+Math.sin(ang+2.2)*9.5,
            bp.x+Math.cos(ang-2.2)*9.5,bp.y+Math.sin(ang-2.2)*9.5,
          ]).fill({color:col,alpha:bA*0.9});
        }

        // ── Camera Follow ─────────────────────────────────────────────
        let target=latest.current.follow;
        if(target?.startsWith('task:')){
          const taskId=target.slice(5);
          target=[...engine.characters.values()]
            .find(c=>c.carriedObject===taskId&&c.current?.target)?.id
            ??engine.state.tasks[taskId]?.owner;
        }
        const carrier=target?engine.characters.get(target):undefined;
        // Auto-framing: ease toward the framed area as agents come, go and move between stations. Small changes
        // are ignored so the view doesn't drift with every step.
        if(!interacted&&!carrier&&!drag){
          const next=frameTarget();
          if(snap||!goal||Math.abs(next.zoom/goal.zoom-1)>.06||Math.hypot(next.pan.x-goal.pan.x,next.pan.y-goal.pan.y)>48)goal=next;
          if(snap||engine.reducedMotion){zoom=goal.zoom;pan={...goal.pan};snap=false;}
          else{
            const k=1-Math.exp(-Math.min(.1,app.ticker.deltaMS/1000)*3.5);
            zoom+=(goal.zoom-zoom)*k;pan={x:pan.x+(goal.pan.x-pan.x)*k,y:pan.y+(goal.pan.y-pan.y)*k};
          }
        }else goal=undefined;
        if(carrier&&!drag){
          const p=iso(carrier.location);
          pan={x:app.screen.width/2-sx()*p.x*zoom,y:app.screen.height/2-p.y*zoom};
        }

        const hv=hovered?views.get(hovered):undefined,ha=hovered?engine.state.agents[hovered]:undefined;
        if(hv&&ha&&hv.root.visible&&!drag){
          const at=hv.root.toGlobal({x:0,y:-112*latest.current.agentScale}),foot=hv.root.toGlobal({x:0,y:30});
          tip.show(ha.name,usageLines(ha),at.x,at.y,foot.y,app.screen.width,insets.top);
        }else tip.hide();
        if(rot){readableText(people,true);readableText(overlays,true);}
        world.scale.set(sx()*zoom,zoom);

        // Static layers: keep the cached texture about as sharp as the screen shows it (capped to bound memory).
        const wantRes=Math.min(2.5,Math.max(1,Math.ceil(zoom*Math.min(devicePixelRatio,2)*2)/2));
        if(wantRes!==cacheRes&&!drag)cacheStatic(wantRes);

        // Full frame rate only while something moves; calm scenes run at 30 fps and reduced motion at 20.
        const moving=!!drag||engine.interactions.length>0||busyChars.some(ch=>ch.phase==='walking')||occupants.size>0;
        app.ticker.maxFPS=engine.reducedMotion?20:moving?60:30;
        world.position.set(pan.x,pan.y);
      });
    })().catch(e=>setError(String(e)));

    return()=>{disposed=true;cleanup();if(app.renderer)app.destroy(true,{children:true});};
  },[engine,theme]);

  return(
    <div className="office-canvas" ref={host}
      aria-label="Interactive isometric office. Select agents using the team list.">
      <CameraTools rotated={view.rotated} toggle={view.toggle} commands={view.commands}/>
      {error&&<div className="canvas-error">Office renderer could not start: {error}</div>}
    </div>
  );
}
