import {Graphics} from 'pixi.js';
import {Agent,CharacterController,isManagerRole} from './engine';
import {lookSeed,skinTone} from './looks';

// ── Palettes ──────────────────────────────────────────────────────────────────
const skins = [
  0xf5d0b5, 0xe8b896, 0xd49b72, 0xba7a54, 0x8c5338, 
  0x603825, 0xfce2cb, 0xc68d66, 0xdfa57e, 0xaa7052
];

const shirts = [
  0x2b4c6f, 0xb86c35, 0x5a4d8c, 0x3d7052, 0x8c3d3d,
  0x38556b, 0x3a7584, 0x9e6c2b, 0x246272, 0x614878
];

const hairColors = [
  0x181310, 0x322214, 0x4a2e18, 0x7a4c28, 0x222226,
  0xa88452, 0x0a0a0d, 0x8a3820, 0x544c44, 0x384a56
];

const irisColors = [
  0x2b6cb0, 0x2f855a, 0x805ad5, 0x744210, 0x319795, 0xd69e2e, 0x4a5568, 0x1a365d
];

const deskDecos = ['cup','plant','notebook','lamp','mug','succulent'] as const;

export function identity(id:string){
  let v=0;
  for(const ch of id)v=(Math.imul(v,31)+ch.charCodeAt(0))>>>0;
  return v;
}

function limb(g:Graphics,pts:number[],color:number,width:number){
  g.moveTo(pts[0],pts[1]);
  for(let i=2;i<pts.length;i+=2)g.lineTo(pts[i],pts[i+1]);
  g.stroke({color,width,cap:'round',join:'round'});
}

// ── Desk decorations ──────────────────────────────────────────────────────────

function drawCup(g:Graphics,cx:number,cy:number,col=0xe2cc9d){
  // Saucer
  g.ellipse(cx,cy+4,9,3).fill({color:0xb09868,alpha:0.45});
  // Cup body
  g.roundRect(cx-5,cy-6,10,9,2).fill(col).stroke({color:0x7a5b28,width:1});
  // Coffee surface
  g.ellipse(cx,cy-5,4.2,1.8).fill(0x281608);
  // Handle
  g.moveTo(cx+5,cy-4).quadraticCurveTo(cx+11,cy-4,cx+11,cy+1)
   .quadraticCurveTo(cx+11,cy+5,cx+5,cy+5).stroke({color:0x7a5b28,width:1.5});
  // Rising gentle steam wisps
  g.moveTo(cx-1,cy-8).quadraticCurveTo(cx+1,cy-12,cx-1,cy-16)
   .stroke({color:0xffffff,width:1,alpha:0.35});
  g.moveTo(cx+2,cy-8).quadraticCurveTo(cx+4,cy-13,cx+2,cy-18)
   .stroke({color:0xffffff,width:0.8,alpha:0.25});
}

function drawPlant(g:Graphics,cx:number,cy:number){
  // Modern geometric planter
  g.poly([cx-6,cy+7,cx+6,cy+7,cx+7,cy-1,cx-7,cy-1]).fill(0x24332c).stroke({color:0x3e574b,width:1});
  g.ellipse(cx,cy-1,7,2.5).fill(0x18201a);
  // Foliage with depth
  g.ellipse(cx,cy-3,9,8).fill(0x2e6b3b);
  g.ellipse(cx-6,cy-6,6,5).fill(0x3e8a4e);
  g.ellipse(cx+6,cy-5,5,5).fill(0x265a32);
  g.ellipse(cx,cy-9,5,5).fill(0x4ea860);
  // Leaf vein highlights
  g.moveTo(cx,cy-1).quadraticCurveTo(cx,cy-6,cx,cy-9).stroke({color:0x70c982,width:0.8,alpha:0.7});
  g.moveTo(cx-1,cy-4).quadraticCurveTo(cx-4,cy-5,cx-6,cy-6).stroke({color:0x70c982,width:0.6,alpha:0.6});
  g.moveTo(cx+1,cy-3).quadraticCurveTo(cx+4,cy-4,cx+6,cy-5).stroke({color:0x70c982,width:0.6,alpha:0.6});
}

function drawNotebook(g:Graphics,cx:number,cy:number){
  // Shadow
  g.roundRect(cx-7,cy-3,16,13,2).fill({color:0x000000,alpha:0.25});
  // Leather journal cover
  g.roundRect(cx-8,cy-5,16,12,2).fill(0x22364a).stroke({color:0x3a546e,width:1});
  // Cream paper pages
  g.roundRect(cx-6,cy-4,13,10,1).fill(0xf4efe2);
  // Bookmark ribbon
  g.poly([cx-2,cy-5,cx+1,cy-5,cx+1,cy+7,cx-0.5,cy+5.5,cx-2,cy+7]).fill(0xb93838);
  // Pen resting beside notebook
  limb(g,[cx+9,cy-4,cx+9,cy+6],0x8898a8,1.8);
  g.circle(cx+9,cy+7,1).fill(0x384858);
}

function drawLamp(g:Graphics,cx:number,cy:number){
  // Heavy weighted base
  g.roundRect(cx-5,cy+3,10,4,1.5).fill(0x182430).stroke({color:0x2a3e50,width:0.8});
  // Articulated metallic arm
  limb(g,[cx,cy+3,cx+3,cy-3,cx+5,cy-9],0x506880,1.8);
  // Lamp cone
  g.poly([cx+3,cy-9,cx+10,cy-14,cx+13,cy-8]).fill(0x2a3e50);
  // Warm glowing bulb
  g.circle(cx+9,cy-9,3.5).fill(0xfff0aa);
  // Ambient light cone cast onto desk
  g.poly([cx+8,cy-8,cx+2,cy+6,cx+18,cy+6]).fill({color:0xfff6c0,alpha:0.12});
}

function drawMug(g:Graphics,cx:number,cy:number){
  g.ellipse(cx,cy+4,8,3).fill({color:0x000000,alpha:0.25});
  // Ceramic mug
  g.roundRect(cx-5,cy-5,10,10,2.5).fill(0x386890).stroke({color:0x204468,width:1});
  // Logo decal on mug
  g.circle(cx-0.5,cy,2.2).fill({color:0xffffff,alpha:0.5});
  // Handle
  g.moveTo(cx+5,cy-3).quadraticCurveTo(cx+10,cy-3,cx+10,cy+2)
   .quadraticCurveTo(cx+10,cy+5,cx+5,cy+5).stroke({color:0x204468,width:1.6});
}

function drawSucculent(g:Graphics,cx:number,cy:number){
  // White ceramic hexagonal pot
  g.poly([cx-5,cy+6,cx+5,cy+6,cx+6,cy,cx-6,cy]).fill(0xebeff4).stroke({color:0xa0b0c0,width:0.8});
  // Rosette succulent leaves
  g.ellipse(cx,cy-1,6,4).fill(0x408a68);
  g.ellipse(cx-4,cy-3,4,4).fill(0x56a87e);
  g.ellipse(cx+4,cy-3,4,4).fill(0x56a87e);
  g.ellipse(cx,cy-5,5,4).fill(0x6ec496);
  // Pink leaf tips
  g.circle(cx-4,cy-5,1.2).fill(0xd97594);
  g.circle(cx+4,cy-5,1.2).fill(0xd97594);
  g.circle(cx,cy-7,1.2).fill(0xd97594);
}

// ── Ultra High-Quality Holographic Floating Emojis / Props ────────────────────

/** 💡 Holographic Thinking Neural Bulb / Matrix */
function drawThinkingEmoji(g:Graphics,cx:number,cy:number,t:number){
  const pulse = Math.sin(t*4.0)*0.15 + 0.85;
  // Ambient glow halo
  g.circle(cx,cy-4,18*pulse).fill({color:0x00e5ff,alpha:0.10});
  g.circle(cx,cy-4,12*pulse).fill({color:0xffd54f,alpha:0.18});

  // Floating rotating orbital thought ring
  const orbitA = t*2.5;
  g.ellipse(cx,cy-4,15,6).stroke({color:0x00e5ff,width:1,alpha:0.45});
  const ox1 = cx + Math.cos(orbitA)*15, oy1 = cy - 4 + Math.sin(orbitA)*6;
  const ox2 = cx + Math.cos(orbitA+Math.PI)*15, oy2 = cy - 4 + Math.sin(orbitA+Math.PI)*6;
  g.circle(ox1,oy1,2.5).fill(0x00e5ff);
  g.circle(ox2,oy2,2).fill(0xffd54f);

  // Glowing lightbulb glass envelope
  g.poly([
    cx-7,cy-9, cx,cy-16, cx+7,cy-9, 
    cx+5,cy-2, cx+3,cy+2, cx-3,cy+2, cx-5,cy-2
  ]).fill({color:0x102538,alpha:0.92}).stroke({color:0xffd54f,width:1.5});

  // Radiant bulb interior
  g.circle(cx,cy-9,5).fill({color:0xfff176,alpha:0.75});

  // Glowing filament
  limb(g,[cx-2.5,cy-2, cx-2.5,cy-8, cx,cy-11, cx+2.5,cy-8, cx+2.5,cy-2],0xffeb3b,1.5);

  // Metal threaded screw base
  g.roundRect(cx-3,cy+3,6,4,1).fill(0x78909c).stroke({color:0x37474f,width:0.8});
  g.roundRect(cx-2,cy+7,4,2,0.8).fill(0x37474f);

  // Radiating thought energy sparks
  for(let i=0;i<4;i++){
    const ang = t*3 + (i/4)*Math.PI*2;
    const dist = 14 + Math.sin(t*5+i)*3;
    g.circle(cx+Math.cos(ang)*dist, cy-8+Math.sin(ang)*dist, 1.2).fill(0x00e5ff);
  }
}

/** 🔍 Precision Cyber-Magnifier */
function drawMagnifierEmoji(g:Graphics,cx:number,cy:number,t:number){
  const rot = Math.sin(t*3)*0.15;
  // Lens outer body with metallic rim
  g.circle(cx,cy,10).fill({color:0x071e30,alpha:0.85});
  g.circle(cx,cy,10).stroke({color:0x00b4d8,width:2.2});
  g.circle(cx,cy,11.5).stroke({color:0x90e0ef,width:0.8,alpha:0.5});

  // Holographic glass refraction & radar reticle
  g.circle(cx,cy,6.5).stroke({color:0x00f5d4,width:0.9,alpha:0.4});
  // Crosshairs
  g.moveTo(cx-8,cy).lineTo(cx+8,cy).stroke({color:0x00f5d4,width:0.8,alpha:0.5});
  g.moveTo(cx,cy-8).lineTo(cx,cy+8).stroke({color:0x00f5d4,width:0.8,alpha:0.5});
  // Rotating radar sweep
  const sweepA = t*4;
  g.moveTo(cx,cy).lineTo(cx+Math.cos(sweepA)*7.5, cy+Math.sin(sweepA)*7.5)
   .stroke({color:0xffffff,width:1.2,alpha:0.85});

  // Specular glass glare arc
  g.moveTo(cx-6,cy-6).quadraticCurveTo(cx,cy-9,cx+6,cy-6).stroke({color:0xffffff,width:1.4,alpha:0.75});

  // Ergonomic cyber handle
  limb(g,[cx+7,cy+7, cx+15,cy+15],0x1e293b,3.5);
  limb(g,[cx+8,cy+8, cx+14,cy+14],0x00b4d8,1.2);
  g.circle(cx+15.5,cy+15.5,2.2).fill(0x00b4d8);
}

/** 🗄️ Quantum Database Cylinder Stack */
function drawDatabaseEmoji(g:Graphics,cx:number,cy:number,t:number){
  // 3-tier glowing database servers
  for(let tier=0;tier<3;tier++){
    const ty = cy - 8 + tier*7;
    // Base disk
    g.ellipse(cx,ty+4,11,4).fill(0x132a48).stroke({color:0x00b4d8,width:1});
    // Cylinder body
    g.rect(cx-11,ty-2,22,6).fill(0x1a365d);
    // Disk top
    const isTop = tier===0;
    g.ellipse(cx,ty-2,11,4).fill(isTop?0x2b6cb0:0x1e4976)
     .stroke({color:0x00e5ff,width:1});

    // Blinking activity LEDs on front panel
    const ledPulse = Math.sin(t*8 + tier*2)>0;
    g.circle(cx-6,ty+1,1.3).fill(ledPulse?0x00ff88:0x006633);
    g.circle(cx-2,ty+1,1.3).fill(0x00e5ff);
    g.circle(cx+2,ty+1,1.3).fill({color:0xffd166,alpha:0.8});
    // Data slot lines
    limb(g,[cx+5,ty+1, cx+9,ty+1],0x63b3ed,1);
  }
  // Upward data stream beam
  g.moveTo(cx,cy-14).lineTo(cx,cy-20).stroke({color:0x00e5ff,width:1.5,alpha:0.6});
  g.circle(cx,cy-20,2).fill(0x00e5ff);
}

/** ⚙️ Interlocking Dual Mechanical Gears */
function drawGearEmoji(g:Graphics,cx:number,cy:number,t:number){
  // Primary Gear
  const r1=7, r2=11, teeth=8;
  const a0 = t*3.2;
  for(let i=0;i<teeth;i++){
    const a1 = a0 + (i/teeth)*Math.PI*2;
    const a2 = a0 + ((i+0.35)/teeth)*Math.PI*2;
    const a3 = a0 + ((i+0.65)/teeth)*Math.PI*2;
    const a4 = a0 + ((i+1)/teeth)*Math.PI*2;
    g.poly([
      cx+Math.cos(a1)*r1, cy+Math.sin(a1)*r1,
      cx+Math.cos(a1)*r2, cy+Math.sin(a1)*r2,
      cx+Math.cos(a2)*r2, cy+Math.sin(a2)*r2,
      cx+Math.cos(a3)*r2, cy+Math.sin(a3)*r2,
      cx+Math.cos(a4)*r2, cy+Math.sin(a4)*r2,
      cx+Math.cos(a4)*r1, cy+Math.sin(a4)*r1,
    ]).fill(0x4a5568).stroke({color:0x718096,width:0.8});
  }
  g.circle(cx,cy,5).fill(0x2d3748).stroke({color:0xa0aec0,width:1});
  g.circle(cx,cy,2.5).fill(0x00e5ff);

  // Secondary Meshed Micro-Gear (top-right)
  const mx = cx + 11, my = cy - 9;
  const mr1 = 4.5, mr2 = 7.5, mteeth = 6;
  const ma0 = -t*4.8 + 0.3;
  for(let i=0;i<mteeth;i++){
    const a1 = ma0 + (i/mteeth)*Math.PI*2;
    const a2 = ma0 + ((i+0.35)/mteeth)*Math.PI*2;
    const a3 = ma0 + ((i+0.65)/mteeth)*Math.PI*2;
    const a4 = ma0 + ((i+1)/mteeth)*Math.PI*2;
    g.poly([
      mx+Math.cos(a1)*mr1, my+Math.sin(a1)*mr1,
      mx+Math.cos(a1)*mr2, my+Math.sin(a1)*mr2,
      mx+Math.cos(a2)*mr2, my+Math.sin(a2)*mr2,
      mx+Math.cos(a3)*mr2, my+Math.sin(a3)*mr2,
      mx+Math.cos(a4)*mr2, my+Math.sin(a4)*mr2,
      mx+Math.cos(a4)*mr1, my+Math.sin(a4)*mr1,
    ]).fill(0x2d3748).stroke({color:0x00e5ff,width:0.7});
  }
  g.circle(mx,my,3).fill(0x1a202c);
  g.circle(mx,my,1.5).fill(0x63b3ed);
}

/** ⏱️ Luxury Precision Chronometer */
function drawClockEmoji(g:Graphics,cx:number,cy:number,t:number){
  // Outer bezel
  g.circle(cx,cy,12).fill(0x0f172a).stroke({color:0xf59e0b,width:1.8});
  g.circle(cx,cy,13.5).stroke({color:0xfcd34d,width:0.6,alpha:0.4});
  // Inner dial
  g.circle(cx,cy,9.5).fill(0x1e293b);

  // 12-hour indices
  for(let tick=0;tick<12;tick++){
    const a = (tick/12)*Math.PI*2 - Math.PI/2;
    const major = tick%3===0;
    const rIn = major?6.5:7.8;
    g.moveTo(cx+Math.cos(a)*rIn, cy+Math.sin(a)*rIn)
     .lineTo(cx+Math.cos(a)*9, cy+Math.sin(a)*9)
     .stroke({color:major?0xfbbf24:0x94a3b8,width:major?1.4:0.7});
  }

  // Smooth sweeping second hand
  const secA = (t*1.8)%(Math.PI*2) - Math.PI/2;
  const minA = (t*0.2)%(Math.PI*2) - Math.PI/2;
  const hrA  = (t*0.03)%(Math.PI*2) - Math.PI/2;

  // Hour hand
  limb(g,[cx,cy, cx+Math.cos(hrA)*5, cy+Math.sin(hrA)*5],0xf1f5f9,2);
  // Minute hand
  limb(g,[cx,cy, cx+Math.cos(minA)*7, cy+Math.sin(minA)*7],0x38bdf8,1.6);
  // Second hand (orange neon with tail)
  limb(g,[cx-Math.cos(secA)*2.5, cy-Math.sin(secA)*2.5, cx+Math.cos(secA)*8, cy+Math.sin(secA)*8],0xf59e0b,1);
  // Center jewel pin
  g.circle(cx,cy,2).fill(0xfcd34d).stroke({color:0x0f172a,width:0.8});
}

/** ⚠️ Glowing Neon Alert Shield / Error */
function drawErrorEmoji(g:Graphics,cx:number,cy:number,t:number){
  const pulse = Math.sin(t*6.0)*0.15 + 0.85;
  // Warning pulse aura
  g.poly([cx,cy-17*pulse, cx-14*pulse,cy+8*pulse, cx+14*pulse,cy+8*pulse])
   .fill({color:0xef4444,alpha:0.18});

  // Main hazard triangle
  g.poly([cx,cy-15, cx-12,cy+7, cx+12,cy+7]).fill(0x1c1012).stroke({color:0xf87171,width:2});
  g.poly([cx,cy-13, cx-10,cy+5, cx+10,cy+5]).stroke({color:0xfca5a5,width:0.8,alpha:0.6});

  // Glowing exclamation mark
  limb(g,[cx,cy-8, cx,cy],0xffffff,2.5);
  limb(g,[cx,cy-8, cx,cy],0xef4444,1.8);
  g.circle(cx,cy+3.5,1.5).fill(0xffffff);
}

/** ✅ Radiant Emerald Success Badge */
function drawSuccessEmoji(g:Graphics,cx:number,cy:number,t:number){
  const pulse = Math.sin(t*3.0)*0.1 + 0.9;
  // Celebratory radial aura
  g.circle(cx,cy,14*pulse).fill({color:0x10b981,alpha:0.18});

  // Emerald badge shield
  g.poly([
    cx,cy-12, cx+11,cy-6, cx+9,cy+7, cx,cy+12, cx-9,cy+7, cx-11,cy-6
  ]).fill(0x064e3b).stroke({color:0x34d399,width:2});

  // Inner gold trim
  g.poly([
    cx,cy-10, cx+9,cy-5, cx+7,cy+6, cx,cy+10, cx-7,cy+6, cx-9,cy-5
  ]).stroke({color:0xfbbf24,width:0.8,alpha:0.7});

  // Crisp checkmark
  g.moveTo(cx-5,cy-1).lineTo(cx-1,cy+4).lineTo(cx+6,cy-5)
   .stroke({color:0xffffff,width:2.6,cap:'round',join:'round'});

  // Twinkling sparkle stars
  const sA = t*2.5;
  for(let i=0;i<3;i++){
    const ang = sA + (i/3)*Math.PI*2;
    const sx = cx + Math.cos(ang)*15, sy = cy + Math.sin(ang)*11;
    g.circle(sx,sy,1.2).fill(0xfef08a);
  }
}

/** 🙋 Glowing Attention / Human Required Beacon */
function drawAwaitingHumanEmoji(g:Graphics,cx:number,cy:number,t:number){
  const pulse = (Math.sin(t*4)+1)*0.5;
  // Sonar wave rings
  g.circle(cx,cy,12+pulse*6).stroke({color:0xf59e0b,width:1.5,alpha:(1-pulse)*0.7});
  g.circle(cx,cy,10).fill(0x271a06).stroke({color:0xfbbf24,width:1.8});

  // Silhouette bust
  g.circle(cx,cy-3,3.5).fill(0xfef3c7);
  g.poly([cx-5,cy+6, cx+5,cy+6, cx+4,cy+2, cx-4,cy+2]).fill(0xfef3c7);

  // Floating notification badge
  g.circle(cx+7,cy-7,4.5).fill(0xef4444).stroke({color:0xffffff,width:1});
  limb(g,[cx+7,cy-8.5, cx+7,cy-6.5],0xffffff,1.2);
  g.circle(cx+7,cy-5,0.7).fill(0xffffff);
}

/** 🔄 High-Tech Dual Arrow Retrying Cycle */
function drawRetryEmoji(g:Graphics,cx:number,cy:number,t:number){
  const rot = t*4.5;
  g.circle(cx,cy,11).fill(0x1e1b13).stroke({color:0xf59e0b,width:1.5});

  // Two curved arrows with trailing motion
  for(let arm=0;arm<2;arm++){
    const offset = arm*Math.PI;
    const startA = rot + offset;
    const endA   = rot + offset + Math.PI*0.75;
    g.moveTo(cx+Math.cos(startA)*7.5, cy+Math.sin(startA)*7.5);
    for(let step=1;step<=12;step++){
      const a = startA + (endA-startA)*(step/12);
      g.lineTo(cx+Math.cos(a)*7.5, cy+Math.sin(a)*7.5);
    }
    g.stroke({color:0xfcd34d,width:2,cap:'round'});
    // Arrowhead tip
    const tipX = cx+Math.cos(endA)*7.5, tipY = cy+Math.sin(endA)*7.5;
    g.poly([
      tipX, tipY,
      tipX + Math.cos(endA - 2.2)*4.5, tipY + Math.sin(endA - 2.2)*4.5,
      tipX + Math.cos(endA - 0.9)*4.5, tipY + Math.sin(endA - 0.9)*4.5,
    ]).fill(0xfcd34d);
  }
}

/** 💻 High-Detail Sleek Ultrabook Workstation */
function drawLaptop(g:Graphics,sit:number,seed:number,t:number,kind:'code'|'search'|'query'|'compute'|'work'){
  const palette:{[k:string]:{bg:number;kw:number;fn:number;str:number;glow:number}} = {
    code:    {bg:0x0b1320, kw:0x38bdf8, fn:0x4ade80, str:0xfb923c, glow:0x0284c7},
    search:  {bg:0x081b26, kw:0x22d3ee, fn:0x38bdf8, str:0xa5f3fc, glow:0x00b4d8},
    query:   {bg:0x111625, kw:0x818cf8, fn:0xa78bfa, str:0xc4b5fd, glow:0x6366f1},
    compute: {bg:0x0e1c18, kw:0x34d399, fn:0x6ee7b7, str:0xa7f3d0, glow:0x10b981},
    work:    {bg:0x0f172a, kw:0x38bdf8, fn:0x818cf8, str:0xf472b6, glow:0x0284c7},
  };
  const pal = palette[kind];

  // Screen ambient backglow
  g.roundRect(-19,-33+sit,38,26,4).fill({color:pal.glow,alpha:0.14});

  // Aluminum Display Enclosure
  g.roundRect(-17,-31+sit,34,23,3).fill(0x1e293b).stroke({color:0x334155,width:1});
  // Active Screen Panel
  g.roundRect(-15,-29+sit,30,19,2).fill(pal.bg);

  // Editor window header bar
  g.roundRect(-15,-29+sit,30,4,1).fill(0x111827);
  // macOS / terminal window dots
  g.circle(-12,-27+sit,1).fill(0xef4444);
  g.circle(-9,-27+sit,1).fill(0xf59e0b);
  g.circle(-6,-27+sit,1).fill(0x10b981);

  // Syntax highlighted code lines
  if(kind==='code'){
    for(let ln=0;ln<4;ln++){
      const y = -23 + sit + ln*3.6;
      // Line number
      g.roundRect(-13,y,2,1.6,0.5).fill({color:0x475569,alpha:0.8});
      // Keyword
      g.roundRect(-10,y,4.5,1.6,0.5).fill(pal.kw);
      // Function / Identifier
      const wFn = 4 + ((seed+ln*5)%7);
      g.roundRect(-4.5,y,wFn,1.6,0.5).fill(pal.fn);
      // String / Value
      const wStr = 3 + ((seed*2+ln*7)%8);
      g.roundRect(-4.5+wFn+1.5,y,wStr,1.6,0.5).fill(pal.str);
    }
  } else if(kind==='search'){
    // Search bar
    g.roundRect(-13,-24+sit,26,3.5,1.5).fill({color:0x1e293b,alpha:0.9}).stroke({color:0x38bdf8,width:0.7});
    g.circle(-10,-22.2+sit,1).stroke({color:0x38bdf8,width:0.6});
    g.roundRect(-7,-23+sit,10,1.5,0.5).fill(0x94a3b8);
    // Search result entries
    for(let ln=0;ln<3;ln++){
      const y = -19 + sit + ln*3.8;
      g.roundRect(-13,y,14+((seed+ln*6)%9),1.8,0.5).fill(pal.kw);
      g.roundRect(-13,y+2,9+((seed+ln*3)%7),1.2,0.4).fill({color:0x94a3b8,alpha:0.6});
    }
  } else {
    for(let ln=0;ln<4;ln++){
      const y = -23 + sit + ln*3.6;
      const w1 = 5 + ((seed+ln*4)%9);
      const w2 = 4 + ((seed*3+ln*5)%8);
      g.roundRect(-13,y,w1,1.6,0.5).fill(pal.kw);
      g.roundRect(-13+w1+2,y,w2,1.6,0.5).fill(pal.fn);
    }
  }

  // Blinking terminal cursor
  if(Math.floor(t*3)%2===0){
    g.roundRect(5,-12+sit,1.5,2.2,0.5).fill(0x38bdf8);
  }

  // Display hinge & metallic bezel accent
  limb(g,[-16,-7.5+sit, 16,-7.5+sit],0x475569,2);
  // Lower chassis (keyboard deck)
  g.roundRect(-17,-8+sit,34,9.5,1.5).fill(0x1e293b).stroke({color:0x334155,width:0.8});
  // Backlit keyboard well
  g.roundRect(-14,-7+sit,28,5,1).fill(0x0f172a);
  // Individual illuminated chiclet keys
  for(let row=0;row<2;row++){
    for(let col=0;col<6;col++){
      const kx = -13 + col*4.5;
      const ky = -6.5 + sit + row*2.4;
      g.roundRect(kx,ky,3.5,1.8,0.5).fill({color:0x334155,alpha:0.85});
    }
  }
  // Glass trackpad with subtle rim
  g.roundRect(-5,-1.5+sit,10,3,0.8).fill(0x334155).stroke({color:0x475569,width:0.5});
}

// ── Main character renderer ───────────────────────────────────────────────────

function drawLegacyCharacter(g:Graphics,a:Agent,c:CharacterController,time:number,selected:boolean,seated:number){
  const seed    = identity(a.id);
  const skin    = skins[seed%skins.length];
  const shirt   = shirts[seed%shirts.length];
  const hair    = hairColors[seed%hairColors.length];
  const iris    = irisColors[(seed*3)%irisColors.length];
  const deco    = deskDecos[seed%deskDecos.length];
  const isMgr   = isManagerRole(a.role);
  const walk    = c.phase==='walking';
  const action  = c.current?.behavior??a.status;
  const working = !walk&&/Thinking|Searching|Coding|Querying|Computing|Working|Reviewing|Reading/.test(action);
  const t       = time/1000;

  // Staggered rhythmic idle animations
  const phase0  = (seed%7)*0.9;
  const phase1  = (seed%5)*0.7;
  // Diaphragm breathing
  const breathe = Math.sin(t*1.4+phase0)*0.7;
  // Secondary head micro-nod
  const nod     = Math.sin(t*0.95+phase1)*0.3;
  // Dynamic walk bob vs breathing
  const walkBob = walk?Math.sin(t*11)*1.8:0;
  const bob     = walk?walkBob:breathe;
  const sit     = seated*12;
  const headY   = -74+sit+bob*0.45+nod;
  const bodyY   = -56+sit+bob*0.6;
  const face    = c.facing;

  // Natural organic blink: ~15x/min, staggered so agents never blink together
  const blinkT  = (t*0.22+seed*0.63)%1;
  const blink   = blinkT>0.965;

  g.clear();

  // ── Soft Dynamic Ground Shadow ────────────────────────────────────────────
  const shadowW = 18 + seated*2.5;
  const shadowH = 7.5 + (walk?Math.abs(Math.sin(t*11))*1.5:0);
  g.ellipse(0,3,shadowW+4,shadowH+2).fill({color:0x000000,alpha:0.12});
  g.ellipse(0,3,shadowW,shadowH).fill({color:0x000000,alpha:0.25-seated*0.06});

  // ── Selection Ring ────────────────────────────────────────────────────────
  if(selected){
    const p = 0.75 + Math.sin(t*4.0)*0.25;
    g.ellipse(0,2,36*p,15*p).fill({color:0x00e5ff,alpha:0.08});
    g.ellipse(0,2,30*p,13*p).stroke({color:0x00e5ff,width:2.2,alpha:0.85});
    g.ellipse(0,2,35*p,15*p).stroke({color:0x00e5ff,width:1,alpha:0.35});
    // Animated tick marks
    for(let i=0;i<4;i++){
      const ta = (i/4)*Math.PI*2 + t*2;
      const tx = Math.cos(ta)*30*p, ty = 2 + Math.sin(ta)*13*p;
      g.circle(tx,ty,2).fill(0x00e5ff);
    }
  }

  // ── Manager Orchestration Aura ─────────────────────────────────────────────
  if(isMgr&&/Routing|Discussing|Assigning|Delivering|Working|Thinking/.test(action)){
    const r = 36 + Math.sin(t*4.8)*5;
    g.circle(0,-24,r).stroke({color:0x38bdf8,width:1.5,alpha:0.45});
    g.circle(0,-24,r+9).stroke({color:0x818cf8,width:0.8,alpha:0.22});
  }

  // ── Ergonomic Office Chair ────────────────────────────────────────────────
  if(seated>0.05){
    const sa = seated;
    // Chair backrest with contour
    g.roundRect(-16,-48,32,14,6).fill({color:0x1e293b,alpha:sa});
    g.roundRect(-14,-46,28,10,4).fill({color:0x334155,alpha:sa*0.75});
    // Lumbar accent strip
    g.roundRect(-10,-40,20,3,1.5).fill({color:0x475569,alpha:sa*0.8});

    if(seated>0.45){
      // Armrests
      g.roundRect(-19,-33,6,14,3).fill({color:0x334155,alpha:sa*0.9});
      g.roundRect(13,-33,6,14,3).fill({color:0x334155,alpha:sa*0.9});
      g.roundRect(-19,-33,6,3,1.5).fill({color:0x64748b,alpha:sa*0.6});
      g.roundRect(13,-33,6,3,1.5).fill({color:0x64748b,alpha:sa*0.6});
    }
    // Heavy chrome pedestal & caster base
    limb(g,[0,-16,0,2],0x64748b,4.5);
    limb(g,[-14,4, 0,2, 14,4],0x64748b,4);
    g.circle(-15,5,2.5).fill(0x1e293b);
    g.circle(15,5,2.5).fill(0x1e293b);
    g.circle(0,6,2.5).fill(0x1e293b);
  }

  // ── Legs & Footwear ───────────────────────────────────────────────────────
  const stride = walk?Math.sin(t*11)*10:0;
  const lift   = walk?Math.max(0,Math.sin(t*11))*4.5:0;
  const lift2  = walk?Math.max(0,-Math.sin(t*11))*4.5:0;
  const pant   = isMgr?0x111827:0x1e293b;
  const pantD  = isMgr?0x1f2937:0x334155;

  // Left Leg & Right Leg
  limb(g,[-5,-30+sit, -8-stride*0.3,-14+lift, -7-stride,1-lift],pant,10.5);
  limb(g,[5,-30+sit, 8+stride*0.3,-14+lift2, 7+stride,1-lift2],pantD,10.5);

  // Shoes: Sleek designer dress shoes / high-end minimalist sneakers
  const shoeColor = isMgr?0x090d16:0x0f172a;
  // Left shoe
  g.ellipse(-8-stride,2-lift,9.5,4.5).fill(shoeColor);
  g.ellipse(-11-stride,1-lift,4.5,2.2).fill({color:0x64748b,alpha:0.4});
  // Right shoe
  g.ellipse(8+stride,2-lift2,9.5,4.5).fill(isMgr?0x0d121c:0x1e293b);
  g.ellipse(11+stride,1-lift2,4.5,2.2).fill({color:0x64748b,alpha:0.4});

  // ── Torso & Attire ────────────────────────────────────────────────────────
  if(isMgr){
    // Executive Bespoke Suit
    g.poly([-12,bodyY, -16,bodyY+12, -13,bodyY+32, 13,bodyY+32, 16,bodyY+12, 12,bodyY]).fill(0x111827);
    // Subtle left shadow
    g.poly([-12,bodyY, -16,bodyY+12, -13,bodyY+32, -6,bodyY+32, -6,bodyY]).fill({color:0x000000,alpha:0.18});
    // Crisp white dress shirt
    g.poly([-7,bodyY+1, 0,bodyY+8, 7,bodyY+1, 5,bodyY+14, -5,bodyY+14]).fill(0xf8fafc);
    // Tailored lapels
    g.poly([-7,bodyY+2, -2,bodyY+11, -8,bodyY+24, -15,bodyY+8]).fill(0x1f2937);
    g.poly([7,bodyY+2, 2,bodyY+11, 8,bodyY+24, 15,bodyY+8]).fill(0x1f2937);
    // Lapel neon tech emblem pin
    g.circle(-10,bodyY+12,1.8).fill(0x00e5ff);
    // Silk Tie with gold tie-bar
    g.poly([-2.5,bodyY+8, 2.5,bodyY+8, 3,bodyY+25, 0,bodyY+30, -3,bodyY+25]).fill(0x991b1b);
    g.poly([-2,bodyY+8, 2,bodyY+8, 1.2,bodyY+13, -1.2,bodyY+13]).fill(0x7f1d1d);
    g.roundRect(-3.5,bodyY+18,7,2.5,1).fill(0xfbbf24).stroke({color:0xd97706,width:0.5});
    // Pocket square
    g.poly([-13,bodyY+8, -8,bodyY+8, -8,bodyY+12, -11,bodyY+14, -13,bodyY+12]).fill(0x38bdf8);
  } else {
    // Designer Tech Casual (Fitted crewneck / layered button-down)
    g.poly([-12,bodyY, -15,bodyY+11, -12,bodyY+30, 12,bodyY+30, 15,bodyY+11, 11,bodyY]).fill(shirt);
    g.poly([-12,bodyY, -15,bodyY+11, -13,bodyY+30, -5,bodyY+30, -5,bodyY]).fill({color:0x000000,alpha:0.12});
    // Layered collar
    g.poly([-8,bodyY, 0,bodyY+7, 8,bodyY, 5,bodyY+13, -5,bodyY+13]).fill(0xf8fafc);
    // Placket & buttons
    g.moveTo(-0.5,bodyY+7).lineTo(-0.5,bodyY+28).stroke({color:0x94a3b8,width:1.2});
    for(let b=0;b<3;b++)g.circle(-0.5,bodyY+11+b*6,1.4).fill(0xcbd5e1);
    // Smart Security Lanyard + Holographic Badge
    g.moveTo(0,bodyY+7).quadraticCurveTo(9,bodyY+17,1,bodyY+24).stroke({color:0x2563eb,width:1.6,alpha:0.85});
    g.roundRect(-3.5,bodyY+23,8,6.5,2).fill(0x1e3a8a).stroke({color:0x3b82f6,width:0.9});
    g.roundRect(-2.5,bodyY+24,6,2.2,0.8).fill(0x60a5fa);
  }

  // Belt with metallic buckle
  g.roundRect(-11,bodyY+29,22,4.5,1.5).fill(isMgr?0x0f172a:0x1e293b);
  g.roundRect(-3,bodyY+29,7,4.5,0.8).fill(0xd97706);
  g.roundRect(-2,bodyY+30,5,2.5,0.5).fill(0xfbbf24);

  // ── Arms & Hands ──────────────────────────────────────────────────────────
  // Alternating typing hand flutter when working at desk
  const typeSwing1 = working?Math.sin(t*18)*2.5:0;
  const typeSwing2 = working?Math.cos(t*18)*2.5:0;
  const handSwing  = working?typeSwing1:walk?Math.sin(t*11)*7:breathe*1.8;
  const handSwingR = working?typeSwing2:walk?-Math.sin(t*11)*7:-breathe*1.8;

  const reading     = !!c.carriedObject || /Reading archive|Delivering|Routing/.test(action);
  const armC        = isMgr?0x111827:shirt;
  const raisingHand = /Awaiting human/.test(action)&&!walk;

  // Left Arm
  limb(g,[-12,bodyY+10, -18,bodyY+21, -(reading?6:16),bodyY+(reading?26:33)+handSwing],armC,8.5);
  // Left Hand
  g.ellipse(reading?-7:-16,bodyY+(reading?24:31)+handSwing,4.5,3.5).fill(skin);

  // Smartwatch on left wrist with pulsing LED
  const lx = reading?-7:-16, ly = bodyY+(reading?24:31)+handSwing-3;
  g.roundRect(lx-3,ly-1.5,6,3,1).fill(0x0f172a).stroke({color:0x00e5ff,width:0.8});
  g.circle(lx,ly,1).fill(Math.floor(t*2)%2?0x00e5ff:0x38bdf8);

  // Right Arm
  if(!raisingHand){
    limb(g,[12,bodyY+10, 18,bodyY+21, (reading?6:17),bodyY+(reading?26:33)+handSwingR],armC,8.5);
    g.ellipse(reading?7:17,bodyY+(reading?24:31)+handSwingR,4.5,3.5).fill(skin);
  }

  // ── Neck ──────────────────────────────────────────────────────────────────
  g.roundRect(-4,headY+12,8,11,3).fill(skin);
  g.roundRect(-3,headY+13,6,5,2).fill({color:0x000000,alpha:0.10});

  // ── Sculpted Face & Head ──────────────────────────────────────────────────
  // Main cranium
  g.ellipse(0,headY,13,15.5).fill(skin);
  // Refined tapered jawline
  g.roundRect(-10,headY+9,20,8.5,5.5).fill(skin);
  // Chin shadow
  g.ellipse(0,headY+5.5,11,10.5).fill({color:0x000000,alpha:0.04});
  // Delicate cheek blush
  g.ellipse(-8,headY+6,5,3.5).fill({color:0xf43f5e,alpha:0.08});
  g.ellipse(8,headY+6,5,3.5).fill({color:0xf43f5e,alpha:0.08});
  // Ears with inner helix detail
  g.ellipse(-13,headY+3,3.8,5.2).fill(skin);
  g.ellipse(-13,headY+3,1.9,2.8).fill({color:0x000000,alpha:0.09});
  g.ellipse(13,headY+3,3.8,5.2).fill(skin);
  g.ellipse(13,headY+3,1.9,2.8).fill({color:0x000000,alpha:0.09});

  // Cyber Earbud on one ear with tiny status LED
  if(seed%2===1){
    g.circle(13,headY+3,2.2).fill(0x0f172a).stroke({color:0x38bdf8,width:0.7});
    g.circle(13,headY+3,1).fill(0x00e5ff);
  }

  // ── 8 Diverse, Modern Hairstyles ──────────────────────────────────────────
  const hStyle = seed%8;
  if(hStyle===0){
    // Style 0: Sleek Executive Undercut / Side Sweep
    g.ellipse(0,headY-7,13.5,9.5).fill(hair);
    g.poly([-13,headY-2, 7,headY-15, 14,headY-1, 3,headY-7, -10,headY, -13,headY+5]).fill(hair);
    // Tapered fade line
    g.moveTo(2,headY-15).lineTo(1,headY-3).stroke({color:0x000000,alpha:0.18,width:1.4});
  } else if(hStyle===1){
    // Style 1: Modern Textured Crop / Spikes
    g.ellipse(0,headY-7,14,9).fill(hair);
    g.poly([-12,headY-2, -6,headY-15, -2,headY-12, 3,headY-16, 7,headY-12, 13,headY-14, 13,headY+3, -13,headY+3]).fill(hair);
  } else if(hStyle===2){
    // Style 2: Elegant Shoulder Bob with Soft Drapery
    g.ellipse(0,headY-7,13.5,10).fill(hair);
    g.poly([-13,headY-2, 6,headY-14, 14,headY-1, 3,headY-7, -10,headY, -13,headY+8]).fill(hair);
    g.ellipse(-13.5,headY+3,4.5,13).fill(hair);
    g.ellipse(13.5,headY+3,4.5,11).fill(hair);
  } else if(hStyle===3){
    // Style 3: Voluminous Curly Afro
    g.ellipse(0,headY-6,15.5,13.5).fill(hair);
    g.circle(-11,headY-6,6.5).fill(hair);
    g.circle(11,headY-6,6.5).fill(hair);
    g.circle(-6,headY-13,6.5).fill(hair);
    g.circle(6,headY-13,6.5).fill(hair);
    g.circle(0,headY-14,7.5).fill(hair);
    for(let tx=-9;tx<=9;tx+=4.5)
      g.circle(tx,headY-8,2.2).fill({color:0x000000,alpha:0.10});
  } else if(hStyle===4){
    // Style 4: Modern Samurai Topknot / High Bun
    g.ellipse(0,headY-7,13.5,9.5).fill(hair);
    g.poly([-12,headY-2, 0,headY-13, 12,headY-2, -12,headY-2]).fill(hair);
    // High Bun with wrap tie
    g.circle(0,headY-17,6).fill(hair);
    g.roundRect(-3,headY-13,6,2.5,1).fill(0x38bdf8);
  } else if(hStyle===5){
    // Style 5: Long Flowing Layered Waves
    g.ellipse(0,headY-7,14,10).fill(hair);
    g.poly([-13,headY-2, 4,headY-14, 13,headY-2, -13,headY-2]).fill(hair);
    g.ellipse(-14,headY+6,5,16).fill(hair);
    g.ellipse(14,headY+5,4.5,14).fill(hair);
    g.moveTo(-14,headY-3).quadraticCurveTo(-16,headY+7,-13,headY+18).stroke({color:0x000000,alpha:0.15,width:1.2});
  } else if(hStyle===6){
    // Style 6: High-Fade Pompadour
    g.ellipse(0,headY-9,14,11).fill(hair);
    g.poly([-11,headY-3, -3,headY-17, 7,headY-17, 13,headY-3, -11,headY-3]).fill(hair);
    g.ellipse(-12,headY+2,2.5,6).fill({color:hair,alpha:0.6});
    g.ellipse(12,headY+2,2.5,6).fill({color:hair,alpha:0.6});
  } else {
    // Style 7: Asymmetrical Cyber Bob with Neon Highlight Streak
    g.ellipse(0,headY-7,14,10).fill(hair);
    g.poly([-13,headY-2, 6,headY-14, 14,headY-1, -13,headY-2]).fill(hair);
    g.ellipse(-14,headY+4,5,15).fill(hair);
    g.ellipse(13,headY+2,4,9).fill(hair);
    // Glowing neon highlight strand
    limb(g,[-11,headY-6, -14,headY+3, -13,headY+14],0x00e5ff,2.2);
  }

  // Manager silver temple accents
  if(isMgr){
    g.ellipse(-12,headY-1,2.5,5.5).fill(0x94a3b8);
    g.ellipse(12,headY-1,2.5,5.5).fill(0x94a3b8);
  }
  // Hair specular shine
  g.ellipse(-2,headY-12,5,3.2).fill({color:0xffffff,alpha:0.10});

  // ── High-Resolution Expressive Eyes ───────────────────────────────────────
  const eS = face*1.5;
  // Dynamic gaze: glance down at screen if working, glance up if thinking
  const gazeY = working?1.2:action==='Thinking'?-1.2:0;
  const gazeX = action==='Thinking'?1:0;

  if(!blink){
    // Sclera (eye whites) - sculpted natural almond curve
    g.ellipse(-4+eS,headY+2.5,3.4,4).fill(0xf8fafc);
    g.ellipse(4+eS,headY+2.5,3.4,4).fill(0xf8fafc);
    // Iris with gradient depth
    g.ellipse(-4+eS+gazeX,headY+2.6+gazeY,2.2,2.6).fill(iris);
    g.ellipse(4+eS+gazeX,headY+2.6+gazeY,2.2,2.6).fill(iris);
    // Pupil
    g.ellipse(-4+eS+gazeX,headY+2.8+gazeY,1.25,1.5).fill(0x020617);
    g.ellipse(4+eS+gazeX,headY+2.8+gazeY,1.25,1.5).fill(0x020617);
    // Specular catchlights (primary bright + secondary ambient sparkle)
    g.circle(-2.9+eS+gazeX,headY+1.8+gazeY,0.85).fill(0xffffff);
    g.circle(5.1+eS+gazeX,headY+1.8+gazeY,0.85).fill(0xffffff);
    g.circle(-4.8+eS+gazeX,headY+3.4+gazeY,0.45).fill({color:0xffffff,alpha:0.75});
    g.circle(3.2+eS+gazeX,headY+3.4+gazeY,0.45).fill({color:0xffffff,alpha:0.75});
    // Eyelid upper lash curve
    g.moveTo(-7+eS,headY+0.6).quadraticCurveTo(-4+eS,headY-1.2,-1+eS,headY+0.6).stroke({color:0x0f172a,width:1.6});
    g.moveTo(1+eS,headY+0.6).quadraticCurveTo(4+eS,headY-1.2,7+eS,headY+0.6).stroke({color:0x0f172a,width:1.6});
    // Lower lash line
    g.moveTo(-7+eS,headY+4.2).quadraticCurveTo(-4+eS,headY+5.8,-1+eS,headY+4.2).stroke({color:0x1e293b,width:0.7,alpha:0.45});
    g.moveTo(1+eS,headY+4.2).quadraticCurveTo(4+eS,headY+5.8,7+eS,headY+4.2).stroke({color:0x1e293b,width:0.7,alpha:0.45});
  } else {
    // Closed eyelids with gentle lash curve
    g.roundRect(-7+eS,headY+2.5,6,1.4,0.8).fill(skin);
    g.roundRect(1+eS,headY+2.5,6,1.4,0.8).fill(skin);
    g.moveTo(-7+eS,headY+2.5).quadraticCurveTo(-4+eS,headY+5.6,-1+eS,headY+2.5).stroke({color:0x0f172a,width:1.4});
    g.moveTo(1+eS,headY+2.5).quadraticCurveTo(4+eS,headY+5.6,7+eS,headY+2.5).stroke({color:0x0f172a,width:1.4});
  }

  // ── Eyebrows (Dynamic & State-Driven) ──────────────────────────────────────
  const errorState = /Error|Retry|Revise|Rejected/.test(action);
  const thinkState = /Thinking/.test(action)&&!walk;
  const doneState  = /Complete|Approved/.test(action);
  const browY = headY-7;
  const tilt  = thinkState?-2.8:errorState?1.8:0;
  const arch  = thinkState?-2.0:0;

  g.moveTo(-9+eS,browY+tilt).quadraticCurveTo(-4+eS,browY-2.5+arch,-0.5+eS,browY-0.5)
   .stroke({color:hair,width:2.2,cap:'round'});
  g.moveTo(0.5+eS,browY-0.5).quadraticCurveTo(4+eS,browY-2.5+arch,9+eS,browY+tilt)
   .stroke({color:hair,width:2.2,cap:'round'});

  // ── Nose ──────────────────────────────────────────────────────────────────
  g.moveTo(eS,headY+4).quadraticCurveTo(eS+2,headY+9,eS+1,headY+10)
   .stroke({color:0x000000,alpha:0.16,width:1.3});
  g.ellipse(eS-2,headY+10,2,1.3).fill({color:0x000000,alpha:0.07});
  g.ellipse(eS+3,headY+10,2,1.3).fill({color:0x000000,alpha:0.07});

  // ── Expressive Mouth ──────────────────────────────────────────────────────
  const mY = headY+13;
  if(doneState){
    // Confident happy smile
    g.moveTo(-4,mY).quadraticCurveTo(0,mY+5.5,4,mY).stroke({color:0x881337,width:2});
    g.circle(-6,mY+1,1.4).fill({color:0xf43f5e,alpha:0.25});
    g.circle(6,mY+1,1.4).fill({color:0xf43f5e,alpha:0.25});
  } else if(errorState){
    // Concerned downturned mouth
    g.moveTo(-3,mY+3).quadraticCurveTo(0,mY-1.8,3,mY+3).stroke({color:0x991b1b,width:1.8});
  } else if(/Discussing|Routing|question/i.test(action)){
    // Animated speaking mouth
    const talkCycle = Math.abs(Math.sin(t*10))*3;
    g.ellipse(0,mY+1.5,3.2,1.2+talkCycle).fill(0x881337);
  } else {
    // Focused pleasant resting mouth
    g.moveTo(-3,mY+2).quadraticCurveTo(0,mY+3.6,3,mY+2).stroke({color:0x4c0519,width:1.5});
  }

  // ── Modern Designer Eyewear / Smart Glasses ───────────────────────────────
  if(seed%2===0||isMgr){
    const fc = isMgr?0x0f172a:0x1e293b;
    const tint = isMgr?0x00e5ff:0x38bdf8;
    // Left lens frame
    g.roundRect(-11+eS,headY-3,9,8,3).stroke({color:fc,width:1.8});
    g.roundRect(-11+eS,headY-3,9,8,3).fill({color:tint,alpha:0.10});
    // Right lens frame
    g.roundRect(2+eS,headY-3,9,8,3).stroke({color:fc,width:1.8});
    g.roundRect(2+eS,headY-3,9,8,3).fill({color:tint,alpha:0.10});
    // Bridge & temples
    limb(g,[-2+eS,headY+1, 2+eS,headY+1],fc,1.5);
    limb(g,[-11+eS,headY+1, -16+eS,headY+5],fc,1.4);
    limb(g,[11+eS,headY+1, 16+eS,headY+5],fc,1.4);
    // AR lens HUD reflection tick
    g.moveTo(-9+eS,headY-1).lineTo(-5+eS,headY-1).stroke({color:0xffffff,width:1,alpha:0.6});
    g.moveTo(4+eS,headY-1).lineTo(8+eS,headY-1).stroke({color:0xffffff,width:1,alpha:0.6});
  }

  // ── Carried Physical Document / Artifact ──────────────────────────────────
  if(reading){
    // Elegant clipboard / document folio
    g.poly([-13,bodyY+22, 0,bodyY+27, 13,bodyY+22, 13,bodyY+40, 0,bodyY+45, -13,bodyY+40]).fill(0xf8fafc);
    limb(g,[0,bodyY+27, 0,bodyY+45],0x94a3b8,1.2);
    // Gold security seal
    g.circle(0,bodyY+29,2.5).fill(0xf59e0b);
    // Text lines
    for(let j=0;j<5;j++)limb(g,[3,bodyY+32+j*2.5, 9,bodyY+31+j*2.5],0x64748b,1);
  }

  // ── Laptop (Rendered when working at station) ──────────────────────────────
  if(/Coding|Searching|Querying|Computing|Working/.test(action)&&!walk){
    const k = /Searching/.test(action)?'search':/Querying/.test(action)?'query':/Computing/.test(action)?'compute':/Coding/.test(action)?'code':'work';
    drawLaptop(g,sit,seed,t,k as 'code'|'search'|'query'|'compute'|'work');
  }

  // ── High-Quality Floating Generated Emojis & Status Badges ────────────────
  if(/Searching/.test(action)&&!walk) drawMagnifierEmoji(g,28,headY-8,t);
  if(/Querying/.test(action)&&!walk)  drawDatabaseEmoji(g,28,headY-12,t);
  if(/Computing/.test(action)&&!walk) drawGearEmoji(g,28,headY-12,t);
  if(thinkState)                       drawThinkingEmoji(g,28,headY-14,t);
  if(/Waiting|Blocked|Awaiting|Queued/.test(action)&&!walk&&!/Awaiting human/.test(action)) drawClockEmoji(g,26,headY-12,t);
  if(errorState&&!walk)                drawErrorEmoji(g,26,headY-14,t);
  if(doneState&&!walk)                 drawSuccessEmoji(g,26,headY-14,t);
  if(raisingHand)                      drawAwaitingHumanEmoji(g,28,headY-14,t);
  if(/Retrying/.test(action)&&!walk)   drawRetryEmoji(g,26,headY-14,t);

  // Raised arm for awaiting human
  if(raisingHand){
    const wave = Math.sin(t*8)*2.5;
    limb(g,[12,bodyY+10, 22,bodyY-8, 18+wave,bodyY-24],armC,8.5);
    g.ellipse(18+wave,bodyY-28,5.5,7).fill(skin);
    for(let f=0;f<4;f++)g.roundRect(13+wave+f*2.8,bodyY-38,2.2,9,1.5).fill(skin);
    g.roundRect(8+wave,bodyY-33,2.2,7,1.5).fill(skin);
  }

  // Carried Project Folder
  if(c.carriedObject&&!reading){
    g.roundRect(9,bodyY+20,24,18,3).fill(0x3b82f6).stroke({color:0x1d4ed8,width:1.4});
    g.rect(9,bodyY+17,11,5).fill(0x60a5fa).stroke({color:0x1d4ed8,width:1});
    // Document peek
    g.roundRect(13,bodyY+18,18,6,1).fill(0xffffff);
    for(let fl=0;fl<3;fl++)limb(g,[12,bodyY+28+fl*3.5, 28,bodyY+27+fl*3.5],0xbfdbfe,1);
  }

  // ── Desk Decorations ──────────────────────────────────────────────────────
  if(!walk&&seated>0.3){
    const dx=21,dy=-6+sit;
    switch(deco){
      case 'cup':       drawCup(g,dx,dy);       break;
      case 'plant':     drawPlant(g,dx,dy);     break;
      case 'notebook':  drawNotebook(g,dx,dy);  break;
      case 'lamp':      drawLamp(g,dx,dy);      break;
      case 'mug':       drawMug(g,dx,dy);       break;
      case 'succulent': drawSucculent(g,dx,dy); break;
    }
  }
}

/**
 * Editorial vector character system.
 *
 * The legacy renderer above is intentionally retained as a visual reference,
 * while the live office uses this calmer, better-proportioned system. Motion
 * remains driven entirely by projected telemetry state.
 */
// ── Retro theme props and wardrobe ───────────────────────────
/** The personal item an agent keeps on its desk. */
export function drawDeskDeco(g:Graphics,id:string,x:number,y:number,retro=false){
  const seed=identity(id),deco=deskDecos[seed%deskDecos.length];
  if(retro&&seed%2===0)drawBookStack(g,x,y);
  else if(deco==='cup')drawCup(g,x,y);
  else if(deco==='plant')drawPlant(g,x,y);
  else if(deco==='notebook')drawNotebook(g,x,y);
  else if(deco==='lamp')drawLamp(g,x,y);
  else if(deco==='mug')drawMug(g,x,y);
  else drawSucculent(g,x,y);
}

const retroKnits=[0xb8862b,0xa4502a,0x6b7a3a,0x7a5230,0x3f6f6a,0xc29a5b];

/** Beige desktop computer with a phosphor screen; stands in for the laptop in the retro theme. */
function drawRetroTerminal(g:Graphics,sit:number,t:number){
  g.roundRect(-18,-36+sit,36,27,3).fill(0xd2c7a6).stroke({color:0x8a7f62,width:1});
  g.roundRect(-15,-33+sit,30,20,5).fill(0x140c00);
  const lines=3+Math.floor(t*2)%3;
  for(let ln=0;ln<lines;ln++)g.rect(-12,-30+sit+ln*3.4,8+(ln*7)%14,1.5).fill(0xffb000);
  if(Math.floor(t*3)%2===0)g.rect(-12,-30+sit+lines*3.4,3,2).fill(0xffd060);
  g.roundRect(-20,-9+sit,40,7,1.5).fill(0xc4b896).stroke({color:0x8a7f62,width:.8});
  g.rect(4,-7+sit,13,1.6).fill(0x4a4230);
}

function drawManilaFolder(g:Graphics,bodyY:number,dx=0){
  g.roundRect(dx+9,bodyY+15,9,5,1.5).fill(0xc9a55c);
  g.roundRect(dx+11,bodyY+16,16,15,1).fill(0xf4ecd8);
  for(let ln=0;ln<3;ln++)g.rect(dx+13,bodyY+21+ln*3,11,.9).fill(0x8a7f62);
  g.roundRect(dx+7,bodyY+19,21,14,1.5).fill(0xdcbc78).stroke({color:0x8f6f35,width:.8});
}

function drawBookStack(g:Graphics,cx:number,cy:number){
  g.roundRect(cx-9,cy+1,18,5,1).fill(0x7a2e22);
  g.roundRect(cx-8,cy-3.5,15,4.5,1).fill(0x3d5a3a);
  g.roundRect(cx-7,cy-7.5,14,4,1).fill(0xb8862b);
  g.rect(cx-9,cy+3,18,.8).fill(0xe8d9a8);
  g.rect(cx-8,cy-1.4,15,.7).fill(0xe8d9a8);
}

// ── Figure renderer ───────────────────────────────────────────────────────────
/** Smoothed motion the office supplies each frame, so walking and turning read as continuous movement. */
export type Pose={
  /** Walk-cycle phase in radians. The office advances it by distance walked, so feet plant instead of sliding. */
  gait?:number;
  /** Facing from -1 (screen left) to 1 (screen right), eased so a turn is gradual. */
  facing?:number;
  /** 0 standing still … 1 full walking pace; eases in and out at the start and end of a walk. */
  stride?:number;
};

type P={x:number;y:number};
const mix=(a:number,b:number,k:number)=>{
  const ch=(s:number)=>{const x=(a>>s)&255,y=(b>>s)&255;return Math.round(x+(y-x)*k)<<s;};
  return ch(16)|ch(8)|ch(0);
};
const dark=(c:number,k:number)=>mix(c,0x000000,k);
const lite=(c:number,k:number)=>mix(c,0xffffff,k);
const lerp=(a:number,b:number,k:number)=>a+(b-a)*k;
const lerpP=(a:P,b:P,k:number):P=>({x:lerp(a.x,b.x,k),y:lerp(a.y,b.y,k)});
const ease=(x:number)=>{const c=Math.max(0,Math.min(1,x));return c*c*(3-2*c);};

function line(g:Graphics,pts:number[],color:number,width:number,alpha=1){
  g.moveTo(pts[0],pts[1]);
  for(let i=2;i<pts.length;i+=2)g.lineTo(pts[i],pts[i+1]);
  g.stroke({color,width,alpha,cap:'round',join:'round'});
}

/** Two-bone IK: where the knee or elbow sits between `root` and `end` for bones `l1`,`l2`, bent toward `pref`. */
function joint(root:P,end:P,l1:number,l2:number,pref:P):P{
  const dx=end.x-root.x,dy=end.y-root.y,len=Math.hypot(dx,dy)||1;
  const ux=dx/len,uy=dy/len,d=Math.min(l1+l2-.01,len);
  const a=(l1*l1-l2*l2+d*d)/(2*d),h=Math.sqrt(Math.max(0,l1*l1-a*a));
  let px=-uy,py=ux;
  if(px*pref.x+py*pref.y<0){px=-px;py=-py;}
  return {x:root.x+ux*a+px*h,y:root.y+uy*a+py*h};
}

const trousers=[0x1f2a3a,0x2e3440,0x3b3226,0x243447,0x2b2b33,0x3a3f4a];
const retroTrousers=[0x4a3420,0x6b4a2a,0x3d3a28,0x5a2e22,0x2f3a2a];
const shoeColors=[0x14181f,0x3b2a1e,0xe7e5e4,0x1f2937,0x5b3a24];
const TOPS=['tee','shirt','hoodie','sweater'] as const;
type Top=typeof TOPS[number]|'blazer'|'knit'|'suit70';

/** `atDesk`: the agent is at its own desk, whose computer and decoration the office draws, so no laptop is carried.
 *  `pose` carries the office's smoothed gait and facing; without it the figure animates from `time` alone. */
export function drawCharacter(g:Graphics,a:Agent,c:CharacterController,time:number,selected:boolean,seated:number,retro=false,atDesk=false,pose:Pose={}){
  const seed=lookSeed(a.id);
  const skin=skinTone(a.id,skins),skinD=dark(skin,.16);
  const shirt=shirts[seed%shirts.length];
  const hair=hairColors[seed%hairColors.length];
  const iris=irisColors[(seed>>3)%irisColors.length];
  const accent=[0x38bdf8,0x2dd4bf,0xa78bfa,0xf59e0b,0xfb7185,0x22d3ee][seed%6];
  const isMgr=isManagerRole(a.role);
  const action=c.current?.behavior??a.status;
  const walk=c.phase==='walking';
  const t=time/1000,ph=(seed%11)*.47;
  const typing=!walk&&/Coding|Searching|Querying|Computing|Working/.test(action);
  const thinking=!walk&&/Thinking/.test(action);
  const isError=/Error|Retry|Revise|Rejected|Failed/.test(action);
  const isDone=/Complete|Approved/.test(action);
  const isWaiting=/Waiting|Blocked|Awaiting|Queued/.test(action);
  const raising=/Awaiting human/.test(action)&&!walk;
  const speaking=!walk&&/Discussing|Routing|question/i.test(action);
  const carrying=!!c.carriedObject;
  const holding=carrying||(!walk&&!typing&&/Reading|Reviewing|Delivering/.test(action));

  const f=Math.max(-1,Math.min(1,pose.facing??c.facing));
  const far=f>=0?1:-1,near=-far;
  const stride=walk?Math.max(0,Math.min(1,pose.stride??1)):0;
  const gp=pose.gait??t*9;
  const sat=ease(seated);
  const blink=((t*.23+seed*.137)%1)>.966;

  // ── Body frame: hips carry the walk bob, shoulders breathe, idle weight shifts side to side ──
  const bob=stride*((1-Math.abs(Math.sin(gp)))*1.7-.5);
  const breathe=(Math.sin(t*1.45+ph)+1)*.5;
  const sway=(1-stride)*(1-sat)*Math.sin(t*.5+ph)*.8;
  const lean=f*1.6*stride;
  const slump=isError&&!walk?1.8:isWaiting&&!walk?.6:0;
  const hipY=-40+sat*10-bob;
  const waistY=hipY-6;
  const shY=hipY-22+slump-breathe*.45;
  const tx=sway,sx=sway+lean;
  const nod=typing?1.1:holding&&!walk?1.6:isError&&!walk?1.8:thinking?-.6:0;
  const headX=sx+f*.7,headY=shY-11.5+nod*.5;
  const gl=Math.sin(t*.29+ph*3);
  const glance=!walk&&!typing&&!speaking?(gl>.8?1:gl<-.8?-1:0):0;
  const lapY=hipY+3;

  // ── Wardrobe ──
  const style:Top=retro?(isMgr?'suit70':'knit'):isMgr?'blazer':TOPS[(seed>>2)%TOPS.length];
  const top=retro?(isMgr?0x5b3f26:retroKnits[seed%retroKnits.length]):isMgr?0x1c2638:shirt;
  const pants=retro?retroTrousers[seed%retroTrousers.length]:isMgr?0x161d2a:trousers[seed%trousers.length];
  const shoe=retro?[0x3a2414,0x5b3a24,0x1c140c][seed%3]:isMgr?0x0d1117:shoeColors[(seed>>1)%shoeColors.length];
  const forearm=style==='tee'?skin:top;

  g.clear();

  // Contact shadow: a soft penumbra and a darker core under the feet.
  g.ellipse(tx*.5,2,15+sat*4,5).fill({color:0x000000,alpha:.14});
  g.ellipse(tx*.5,2,9.5+sat*3,3.2).fill({color:0x000000,alpha:.22});

  // ── Office chair, behind the sitter ──
  if(sat>.06){
    const al=Math.min(1,sat*1.4);
    const frame=retro?0x3e2814:0x1b2533,pad=retro?0x6b4226:0x2a3a4e,metal=retro?0x2a1c0d:0x4b5563;
    line(g,[0,hipY+4,0,-3],metal,2.6,al);
    line(g,[-11,1,0,-2,11,1],metal,2.2,al);
    line(g,[0,-2,0,3],metal,2.2,al);
    for(const [cx,cy] of [[-11,2],[11,2],[0,4]])g.circle(cx,cy,1.5).fill({color:0x0b0f14,alpha:al});
    g.ellipse(0,hipY+2,11,3.8).fill({color:frame,alpha:al});
    g.roundRect(-10.5,hipY-28,21,25,6).fill({color:frame,alpha:al});
    g.roundRect(-8.5,hipY-26,17,20,5).fill({color:pad,alpha:al});
    g.roundRect(-8.5,hipY-26,17,3,1.5).fill({color:0xffffff,alpha:.06*al});
  }

  // ── Long hair falls behind the shoulders ──
  const hs=seed%8;
  if(hs===2)g.roundRect(headX-9.2,headY-3,18.4,12.5,4).fill(dark(hair,.12));
  if(hs===5)g.roundRect(headX-9.4,headY-4,18.8,19,6).fill(dark(hair,.12));
  if(hs===3){
    const r=retro?6:5.2;
    for(let i=0;i<9;i++){const an=Math.PI*(.95+i*.1375);g.circle(headX+Math.cos(an)*8.6,headY-2+Math.sin(an)*8.4,r).fill(dark(hair,.06));}
  }

  // ── Legs: two-bone IK toward planted / swinging feet, blended into a seated pose ──
  for(const s of [far,near]){
    const lp=gp+(s===1?0:Math.PI);
    const swing=Math.sin(lp)*stride,lift=Math.max(0,Math.cos(lp))*stride;
    const hip={x:tx+s*3.7,y:hipY};
    const standAnkle={x:s*3.9+f*7*swing,y:-2.2-lift*3.4};
    const standKnee=joint(hip,standAnkle,19.4,18.9,{x:f||.01,y:0});
    const knee=lerpP(standKnee,{x:s*4.4+f*3,y:hipY+5.5},sat);
    const ankle=lerpP(standAnkle,{x:s*4.6+f*3.4,y:-2.2},sat);
    const col=s===far?dark(pants,.2):pants;
    line(g,[hip.x,hip.y,knee.x,knee.y],col,7.2);
    line(g,[knee.x,knee.y,ankle.x,ankle.y],col,6.2);
    if(retro)g.poly([ankle.x-3,ankle.y-5,ankle.x+3,ankle.y-5,ankle.x+4.4,ankle.y+.9,ankle.x-4.4,ankle.y+.9]).fill(col);
    const sc=s===far?dark(shoe,.22):shoe,fx=ankle.x+f*1.6;
    g.ellipse(fx,ankle.y+1.7,4.4,2.3).fill(sc);
    g.ellipse(fx,ankle.y+3,4,.9).fill({color:0x000000,alpha:.35});
    g.ellipse(fx-1,ankle.y+.9,1.7,.7).fill({color:lite(shoe,.4),alpha:.45});
  }
  // Pelvis bridges the thighs under the hem.
  g.roundRect(tx-7.6,hipY-1,15.2,5,2.5).fill(pants);

  // ── Arms: a target per gesture, IK for the elbow ──
  const shoulder=(s:number):P=>({x:sx+s*8.6,y:shY+2.6});
  const target=(s:number):P=>{
    const isNear=s===near,lp=gp+(s===1?0:Math.PI);
    if(raising&&s===1)return {x:sx+7+Math.sin(t*6)*2.2,y:shY-19};
    if(typing){
      const tap=Math.max(0,Math.sin(t*15+(s>0?0:2.1)+ph))*1.1;
      return atDesk?{x:sx+s*6.2,y:shY+15.5+tap*.6}:{x:sx*.5+s*5.2,y:lapY+1-tap};
    }
    if(thinking)return isNear?{x:headX+f*2+near*1.5,y:headY+8.6}:{x:sx+near*2.5,y:shY+15};
    if(holding)return {x:sx+s*5.5+f*1.8,y:shY+14.5};
    if(isError&&!walk&&isNear)return {x:headX+near*6.5,y:headY-3};
    if(isWaiting&&!walk)return {x:sx-s*3.8,y:shY+12.5+(s===far?1.2:0)};
    if(speaking&&isNear)return {x:sx+near*9+f*3+Math.sin(t*2.7+ph)*2.2,y:shY+12+Math.cos(t*3.3+ph)*2.2};
    return {x:sx+s*10.2-f*6*Math.sin(lp)*stride,y:shY+22.5-Math.abs(Math.sin(lp))*stride*1.2+sat*-3};
  };
  const drawArm=(s:number)=>{
    const sh=shoulder(s),hd=target(s),el=joint(sh,hd,11.5,11,{x:s,y:.35});
    const dk=s===far?.2:0;
    line(g,[sh.x,sh.y,el.x,el.y],dark(top,dk),5);
    line(g,[el.x,el.y,hd.x,hd.y],dark(forearm,dk),4.3);
    if(forearm!==skin){const k=.86;g.circle(el.x+(hd.x-el.x)*k,el.y+(hd.y-el.y)*k,2.3).fill(dark(top,dk+.12));}
    g.circle(hd.x,hd.y,2.35).fill(dark(skin,dk*.8));
  };
  // Hands that rest in front of the body are drawn over the torso; hanging arms go behind it on the far side.
  const armsInFront=typing||thinking||holding||(isWaiting&&!walk);
  if(!armsInFront)drawArm(far);

  // ── Torso ──
  const shW=9.4,waW=7.2,hpW=7.9;
  g.moveTo(sx-shW,shY+3.2)
   .quadraticCurveTo(sx-shW+.4,shY-.6,sx-shW+4,shY-1)
   .lineTo(sx+shW-4,shY-1)
   .quadraticCurveTo(sx+shW-.4,shY-.6,sx+shW,shY+3.2)
   .quadraticCurveTo(tx+waW+.8,waistY-6,tx+waW,waistY)
   .lineTo(tx+hpW,hipY+1.5).lineTo(tx-hpW,hipY+1.5).lineTo(tx-waW,waistY)
   .quadraticCurveTo(tx-waW-.8,waistY-6,sx-shW,shY+3.2)
   .closePath().fill(top);
  const widthAt=(y:number)=>y<waistY?lerp(shW,waW,(y-shY)/(waistY-shY)):lerp(waW,hpW,(y-waistY)/(hipY-waistY));
  const xAt=(y:number)=>lerp(sx,tx,Math.max(0,Math.min(1,(y-shY)/(hipY-shY))));
  const cx=(y:number)=>xAt(y)+f*1.2;

  if(style==='knit'){
    for(const [y,col,al] of [[shY+9,0xf0e6cc,.5],[shY+12,dark(top,.3),.55],[shY+15,0xf0e6cc,.5]] as const){
      const w=widthAt(y)-.4;g.rect(xAt(y)-w,y,w*2,2).fill({color:col,alpha:al});
    }
    g.roundRect(tx-hpW,hipY-1.8,hpW*2,3,1.2).fill(dark(top,.2));
  }
  if(style==='suit70'){
    g.poly([cx(shY)-4.5,shY,cx(shY)+4.5,shY,cx(waistY)+5,waistY+2,cx(waistY)-5,waistY+2]).fill(0x6e4d2f);
    for(let b=0;b<3;b++)g.circle(cx(shY)+.2,shY+7+b*3.4,.6).fill(0x2e1c0d);
  }
  // Far-side shading and a soft rim of light on the near edge.
  g.poly([sx+far*2.5,shY-1,sx+far*(shW-3.5),shY-1,sx+far*shW,shY+3.2,tx+far*waW,waistY,tx+far*hpW,hipY+1.5,tx+far*2.8,hipY+1.5])
   .fill({color:0x000000,alpha:.16});
  line(g,[sx+near*(shW-.7),shY+3.2,tx+near*(waW-.4),waistY],0xffffff,1,.1);

  const nx=cx(shY);
  if(style==='tee'){
    g.ellipse(nx,shY-.1,3,1.6).fill(skinD);
    g.ellipse(nx,shY-.1,3,1.6).stroke({color:dark(top,.25),width:.9});
  }else if(style==='shirt'){
    g.poly([nx-2.4,shY-1,nx+2.4,shY-1,nx,shY+3.6]).fill(skinD);
    g.poly([nx-2.4,shY-1.2,nx-5,shY-.4,nx-1.1,shY+3.9]).fill(lite(top,.22));
    g.poly([nx+2.4,shY-1.2,nx+5,shY-.4,nx+1.1,shY+3.9]).fill(lite(top,.12));
    line(g,[nx,shY+3.6,cx(hipY),hipY],dark(top,.28),.7);
    for(let b=0;b<3;b++)g.circle(xAt(shY+7+b*5)+f*1.2+.7,shY+7+b*5,.45).fill(lite(top,.5));
    g.roundRect(xAt(shY+5)+near*6-1.8,shY+5,3.6,3,.6).stroke({color:dark(top,.25),width:.6});
  }else if(style==='hoodie'){
    g.roundRect(tx-hpW,hipY-1.8,hpW*2,3,1.2).fill(dark(top,.16));
    g.roundRect(cx(hipY-8)-5.5,hipY-8.5,11,6,2).fill(dark(top,.08)).stroke({color:dark(top,.28),width:.6});
  }else if(style==='sweater'){
    g.ellipse(nx,shY-.1,3.2,1.6).fill(skinD);
    g.ellipse(nx,shY-.1,3.2,1.6).stroke({color:dark(top,.28),width:1.3});
    g.poly([nx-2.7,shY+.2,nx-.4,shY+.5,nx-1.5,shY+2.7]).fill(0xf1f5f9);
    g.poly([nx+2.7,shY+.2,nx+.4,shY+.5,nx+1.5,shY+2.7]).fill(0xe2e8f0);
    g.roundRect(tx-hpW,hipY-1.8,hpW*2,3,1.2).fill(dark(top,.2));
  }else if(style==='blazer'||style==='suit70'){
    const w70=style==='suit70';
    g.poly([nx-3,shY-1,nx+3,shY-1,nx+.4,shY+11,nx-.4,shY+11]).fill(w70?0xf0e6cc:0xe8eef5);
    const tw=w70?1.8:1;
    g.poly([nx-tw,shY+1,nx+tw,shY+1,nx+tw+.5,shY+9.5,nx,shY+11.8,nx-tw-.5,shY+9.5]).fill(w70?0xb8862b:accent);
    if(w70)for(let b=0;b<3;b++)g.rect(nx-tw,shY+3+b*2.6,tw*2,.7).fill({color:0x5b3f26,alpha:.5});
    const lw=w70?6.5:4.2,lap=w70?0x7a5634:lite(top,.12);
    g.poly([nx+near*3,shY-1,nx+near*.6,shY+11,nx+near*lw,shY+6.5,nx+near*(lw+1.8),shY+.5]).fill(lap);
    g.poly([nx+far*3,shY-1,nx+far*.6,shY+11,nx+far*lw,shY+6.5,nx+far*(lw+1.8),shY+.5]).fill(dark(lap,.12));
    if(!w70){
      g.circle(cx(waistY),waistY-1,.65).fill(0x0b0f14);g.circle(cx(waistY),waistY+2.6,.65).fill(0x0b0f14);
      g.poly([nx+near*5.5,shY+5,nx+near*8,shY+5,nx+near*7.6,shY+6.6,nx+near*5.8,shY+6.6]).fill(0xf1f5f9);
    }
  }
  if(style==='shirt'||style==='blazer'||style==='suit70'){
    g.roundRect(tx-hpW+.4,hipY-1.2,hpW*2-.8,2.4,1).fill(0x111318);
    g.rect(cx(hipY)-1.2,hipY-1.2,2.4,2.4).fill(retro?0xc49b56:0xbcc8d5);
  }
  if(style==='knit'){
    // The big pointed collar of the shirt underneath.
    g.poly([nx-1,shY-1,nx+1,shY-1,nx,shY+3]).fill(skinD);
    g.poly([nx-1,shY-1.2,nx-6.5,shY-.2,nx-4.5,shY+4.6,nx-.4,shY+3]).fill(0xf0e6cc);
    g.poly([nx+1,shY-1.2,nx+6.5,shY-.2,nx+4.5,shY+4.6,nx+.4,shY+3]).fill(0xe2d6b8);
  }
  if(!retro&&!isMgr&&seed%2===1&&style!=='hoodie'){
    line(g,[nx-2,shY+.5,cx(waistY-4)-.6,waistY-4,nx+2,shY+.5],accent,.7,.85);
    g.roundRect(cx(waistY-4)-1.7,waistY-4,3.4,4.4,.8).fill(lite(accent,.15));
  }

  if(armsInFront)drawArm(far);
  drawArm(near);

  // ── Neck & head ──
  if(style==='hoodie'){
    g.roundRect(sx-6.5,shY-3.4,13,5,2.5).fill(dark(top,.14));
    line(g,[nx-1.6,shY+1,nx-2,shY+8],0xf1f5f9,.7,.85);
    line(g,[nx+1.6,shY+1,nx+2,shY+7.4],0xf1f5f9,.7,.85);
  }
  g.roundRect(headX-2.5,headY+5,5,shY-headY-3.5,2).fill(skinD);
  const shortHair=hs!==2&&hs!==3&&hs!==5;
  const ears=()=>{for(const s of [-1,1])if(s===near||Math.abs(f)<.35){
    g.ellipse(headX+s*7.2,headY+1.2,1.9,2.7).fill(skin);
    g.ellipse(headX+s*7.3,headY+1.3,.9,1.5).fill({color:skinD,alpha:.8});
  }};
  if(!shortHair)ears();
  g.ellipse(headX,headY,7.8,9.2).fill(skinD);
  g.ellipse(headX-f*.9,headY-.3,7.1,8.7).fill(skin);

  // Hair mass, then the face is cut back out of it, which gives a natural curved hairline and, as the head
  // turns, shows more hair on the back of the head.
  if(hs===3)g.ellipse(headX,headY-4.5,retro?11.5:10.5,retro?9:8).fill(hair);
  else if(hs===7)g.ellipse(headX-f*.6,headY-2.6,8.1,7.8).fill({color:hair,alpha:.65});
  else g.ellipse(headX-f*.6,headY-2.4,8.5,8.2).fill(hair);
  const faceX=headX+f*1.3;
  g.ellipse(faceX,headY+2.3,6.5-Math.abs(f)*.4,7.2).fill(skin);
  g.ellipse(faceX+f*1.8,headY+3,3.8,5.6).fill({color:0xffffff,alpha:.035});
  if(shortHair)ears();

  if(hs===0)g.poly([headX-7.6,headY-3.4,headX-4,headY-8.8,headX+3,headY-9.6,headX+8,headY-5.5,headX+6.8,headY-3.6,headX+1.5,headY-5.8,headX-3.8,headY-5.2]).fill(hair);
  else if(hs===1)for(let i=-3;i<=3;i++){const x=headX+i*2.3;g.poly([x-1.6,headY-8.4+Math.abs(i)*.6,x+.4,headY-11.4+Math.abs(i)*.7,x+1.6,headY-8.4+Math.abs(i)*.6]).fill(hair);}
  else if(hs===2){
    g.poly([headX-7.8,headY-2,headX-7,headY-8,headX+7,headY-8,headX+7.8,headY-2,headX+5,headY-3.8,headX-5,headY-3.8]).fill(hair);
    g.roundRect(headX-9.2,headY-4,3,11,1.5).fill(hair);g.roundRect(headX+6.2,headY-4,3,11,1.5).fill(hair);
  }else if(hs===4){
    g.circle(headX-f*1.2,headY-10.8,3.7).fill(hair);
    g.roundRect(headX-f*1.2-2,headY-8.2,4,1.4,.7).fill(retro?0xb8862b:accent);
  }else if(hs===5){
    g.poly([headX-.6,headY-8.6,headX-8.6,headY-4,headX-9,headY+10,headX-6.4,headY+9,headX-5.8,headY-2.8]).fill(hair);
    g.poly([headX+.6,headY-8.6,headX+8.6,headY-4,headX+9,headY+10,headX+6.4,headY+9,headX+5.8,headY-2.8]).fill(hair);
  }else if(hs===6){
    g.poly([headX-6,headY-6,headX-4,headY-11.8,headX+4,headY-12.8,headX+7.5,headY-8.5,headX+6,headY-5.5]).fill(hair);
    if(retro)line(g,[headX-7.4,headY-3,headX-8.6,headY+3],hair,2.2);
  }
  if(isMgr&&seed%2===0){g.ellipse(headX-7.4,headY-.5,1.4,2.8).fill(0x9ca3af);g.ellipse(headX+7.4,headY-.5,1.4,2.8).fill(0x9ca3af);}
  if(hs!==7)g.ellipse(headX-f*1.5-2,headY-8,3.2,1.3).fill({color:lite(hair,.3),alpha:.5});

  // ── Face: features shift toward the facing side for a three-quarter view ──
  const fx=headX+f*2.2,ey=headY+.4,my=headY+6.4,mx=fx+f*.2;
  const beard=retro?seed%6===2:seed%9===4;
  if(beard){
    g.moveTo(headX-7.1,headY+1).quadraticCurveTo(headX-6.7,headY+9.6,headX,headY+9.8)
     .quadraticCurveTo(headX+6.7,headY+9.6,headX+7.1,headY+1).lineTo(headX+5.6,headY+3.6)
     .quadraticCurveTo(fx,headY+5.2,headX-5.6,headY+3.6).closePath().fill({color:hair,alpha:.92});
  }
  const eyeX:number[]=[];
  for(const s of [-1,1]){
    const squash=1-(s===far?.28:0)*Math.abs(f);
    const ex=fx+s*2.9*squash;eyeX.push(ex);
    if(blink){line(g,[ex-1.4,ey,ex+1.4,ey],dark(skin,.55),.8);continue;}
    g.ellipse(ex,ey,1.55*squash,1.1).fill(0xf5f5f4);
    const gx=ex+f*.35+glance*.45,gy=ey+(typing?.35:thinking?-.4:0);
    g.circle(gx,gy,.92).fill(iris);
    g.circle(gx,gy,.48).fill(0x0b0f14);
    g.circle(gx-.35,gy-.35,.28).fill(0xffffff);
    g.moveTo(ex-1.7*squash,ey-.5).quadraticCurveTo(ex,ey-1.6,ex+1.7*squash,ey-.5).stroke({color:dark(hair,.25),width:.75});
  }
  const by=headY-2.6-(thinking?.5:0);
  for(const s of [-1,1]){
    const squash=1-(s===far?.28:0)*Math.abs(f);
    const inner=isError?-.9:0,outer=thinking&&s===1?-.8:0;
    line(g,[fx+s*1.1,by+inner,fx+s*4.2*squash,by+outer+.3],dark(hair,.05),1.05);
  }
  g.moveTo(fx+f*.5,headY+1.6).quadraticCurveTo(fx+f*1.6,headY+3.8,fx+f*.4,headY+4.4).stroke({color:dark(skin,.3),width:.8,alpha:.8});
  g.ellipse(fx+f*.3,headY+4.5,1.5,.6).fill({color:dark(skin,.35),alpha:.35});
  for(const s of [-1,1])g.ellipse(fx+s*3.9,headY+3.6,1.6,.9).fill({color:0xe11d48,alpha:.08});
  if(retro&&seed%5===1)g.roundRect(mx-2.6,my-2,5.2,1.6,.8).fill(hair);
  const lip=dark(skin,.5);
  if(isDone)g.moveTo(mx-2.2,my-.3).quadraticCurveTo(mx,my+1.9,mx+2.2,my-.3).stroke({color:lip,width:.95});
  else if(isError)g.moveTo(mx-2,my+.9).quadraticCurveTo(mx,my-.6,mx+2,my+.9).stroke({color:lip,width:.9});
  else if(speaking)g.ellipse(mx,my+.2,1.4,.5+Math.abs(Math.sin(t*9+ph))*.9).fill(0x5b1d1d);
  else g.moveTo(mx-1.8,my).quadraticCurveTo(mx,my+.6,mx+1.8,my).stroke({color:lip,width:.8});

  if(retro&&(seed%2===0||isMgr)){
    for(const ex of eyeX)g.roundRect(ex-2.6,ey-2.1,5.2,4.4,1.2).stroke({color:0x3a2a14,width:.9});
    line(g,[eyeX[0]+2.6,ey-.6,eyeX[1]-2.6,ey-.6],0x3a2a14,.8);
  }else if(!retro&&(seed%3===0||isMgr)){
    for(const ex of eyeX)g.circle(ex,ey,2.3).stroke({color:0x1b1f27,width:.75});
    line(g,[eyeX[0]+2.3,ey-.3,eyeX[1]-2.3,ey-.3],0x1b1f27,.7);
    line(g,[headX+near*7,headY+.5,eyeX[near<0?0:1]+near*2.3,ey],0x1b1f27,.7);
  }

  // ── Props ──
  if(typing&&!atDesk){
    const kind=/Searching/.test(action)?'search':/Querying/.test(action)?'query':/Computing/.test(action)?'compute':/Coding/.test(action)?'code':'work';
    g.save().translateTransform(sx*.5,lapY+6.5).scaleTransform(.78,.78);
    if(retro)drawRetroTerminal(g,0,t);else drawLaptop(g,0,seed,t,kind);
    g.restore();
    for(const s of [-1,1]){const h=target(s);g.circle(h.x,h.y,2.35).fill(skin);}
  }
  if(holding){
    const px=sx+f*1.8,py=shY+9;
    if(carrying&&retro){g.save().translateTransform(px,py+1).scaleTransform(.62,.62);drawManilaFolder(g,-19,-17.5);g.restore();}
    else if(carrying){
      g.roundRect(px-6.8,py+1,13.6,10.5,1.4).fill(accent).stroke({color:dark(accent,.35),width:.6});
      g.roundRect(px-6.8,py-.8,5.5,2.6,1).fill(lite(accent,.15));
      g.roundRect(px-5,py+.2,10,3,.6).fill(0xf1f5f9);
    }else{
      g.roundRect(px-5.2,py-.6,10.4,13,1).fill(0xf8fafc).stroke({color:0x94a3b8,width:.5});
      g.roundRect(px-1.8,py-1.6,3.6,2,.6).fill(0x64748b);
      for(let j=0;j<4;j++)g.rect(px-3.6,py+3+j*2.2,6+(j%2?-1.5:0),.6).fill(0x94a3b8);
    }
    g.circle(px-6,py+6.5,2.3).fill(dark(skin,.1));
    g.circle(px+6,py+5.5,2.3).fill(skin);
  }

  // ── Status glyphs over the shoulder ──
  const glyph=(draw:(g:Graphics,x:number,y:number,t:number)=>void)=>{
    g.save().translateTransform(headX+13,headY-13).scaleTransform(.72,.72);draw(g,0,0,t);g.restore();
  };
  if(/Searching/.test(action)&&!walk)glyph(drawMagnifierEmoji);
  else if(/Querying/.test(action)&&!walk)glyph(drawDatabaseEmoji);
  else if(/Computing/.test(action)&&!walk)glyph(drawGearEmoji);
  if(thinking)glyph(drawThinkingEmoji);
  if(isWaiting&&!walk&&!raising)glyph(drawClockEmoji);
  if(isError&&!walk)glyph(drawErrorEmoji);
  if(isDone&&!walk)glyph(drawSuccessEmoji);
  if(raising)glyph(drawAwaitingHumanEmoji);
  if(selected)g.ellipse(0,2,20,7).stroke({color:accent,width:1.4,alpha:.8});

}

/** The previous figure, kept for the "Original" theme: stockier proportions, swinging-stick limbs, HUD-style status glyphs. */
export function drawClassicCharacter(g:Graphics,a:Agent,c:CharacterController,time:number,selected:boolean,seated:number,retro=false,atDesk=false){
  const seed=lookSeed(a.id);
  const skin=skinTone(a.id,skins);
  const shirt=shirts[seed%shirts.length];
  const hair=hairColors[seed%hairColors.length];
  const accent=[0x38bdf8,0x2dd4bf,0xa78bfa,0xf59e0b,0xfb7185,0x22d3ee][seed%6];
  const isMgr=isManagerRole(a.role);
  const action=c.current?.behavior??a.status;
  const walk=c.phase==='walking';
  const working=!walk&&/Thinking|Searching|Coding|Querying|Computing|Working|Reviewing|Reading/.test(action);
  const t=time/1000;
  const phase=(seed%11)*.47;
  const step=walk?Math.sin(t*9.5+phase):0;
  const breathe=walk?Math.abs(step)*1.2:Math.sin(t*1.6+phase)*.38;
  const sit=seated*10;
  const bodyY=-48+sit+breathe;
  const headY=-69+sit+breathe*.72;
  const facing=c.facing*1.15;
  const isError=/Error|Retry|Revise|Rejected|Failed/.test(action);
  const isDone=/Complete|Approved/.test(action);
  const isWaiting=/Waiting|Blocked|Awaiting|Queued/.test(action);
  const activeColor=isError?0xfb7185:isDone?0x34d399:isWaiting?0xfbbf24:accent;
  const blink=((t*.2+seed*.137)%1)>.968;
  const speaking=/Discussing|Routing|question/i.test(action);

  g.clear();

  // Soft contact shadow and a restrained state halo.
  g.ellipse(0,4,18+seated*3,6.4).fill({color:0x000000,alpha:.28});
  if(working||selected||isError){
    const pulse=.84+Math.sin(t*3.2+phase)*.08;
    g.ellipse(0,2,30*pulse,11*pulse).fill({color:activeColor,alpha:selected ? .09 : .035});
    g.ellipse(0,2,27*pulse,10*pulse).stroke({color:activeColor,width:selected?1.8:1,alpha:selected ? .9 : .34});
  }
  if(selected){
    const scan=(t*.24)%1;
    g.ellipse(0,2,34,13).stroke({color:0xffffff,width:.6,alpha:.25});
    g.circle(-31+62*scan,2-Math.sin(scan*Math.PI)*10,1.8).fill(activeColor);
  }

  // Chair silhouette stays behind the person.
  if(seated>.08){
    g.roundRect(-14,-42,28,25,8).fill({color:0x101c2b,alpha:seated});
    g.roundRect(-11,-40,22,18,6).fill({color:0x1c2e42,alpha:seated});
    limb(g,[0,-20,0,2],0x42566b,3.2);
    limb(g,[-12,4,0,1,12,4],0x42566b,2.5);
    g.circle(-13,5,2).fill(0x0b1420);g.circle(13,5,2).fill(0x0b1420);
  }

  // Longer, cleaner proportions and a less exaggerated walk cycle.
  const stride=step*6.5*(1-seated);
  const liftL=walk?Math.max(0,step)*2.6:0;
  const liftR=walk?Math.max(0,-step)*2.6:0;
  const trouser=retro?0x4a3420:isMgr?0x101827:0x17263a;
  const trouserHi=retro?0x5a4028:isMgr?0x1d293b:0x263a51;
  limb(g,[-4,bodyY+27,-5-stride*.3,-12+sit,-5-stride,0-liftL],trouser,7.2);
  limb(g,[4,bodyY+27,5+stride*.3,-12+sit,5+stride,0-liftR],trouserHi,7.2);
  g.roundRect(-11-stride,-2-liftL,13,5,2.5).fill(0x080f19);
  g.roundRect(-2+stride,-2-liftR,13,5,2.5).fill(0x0b1420);
  g.roundRect(-9-stride,-1-liftL,7,1,1).fill({color:accent,alpha:.38});
  g.roundRect(2+stride,-1-liftR,7,1,1).fill({color:accent,alpha:.38});

  // Tailored silhouette: executive blazer or contemporary overshirt.
  const knit=retroKnits[seed%retroKnits.length];
  if(retro&&isMgr){
    // Brown three-piece with wide lapels and a wide tie.
    g.roundRect(-12,bodyY,24,30,6).fill(0x5b3f26);
    g.poly([-5,bodyY+1,0,bodyY+9,5,bodyY+1,4,bodyY+16,-4,bodyY+16]).fill(0xf0e6cc);
    g.poly([-3,bodyY+7,3,bodyY+7,4.5,bodyY+22,0,bodyY+27,-4.5,bodyY+22]).fill(0xb8862b);
    g.poly([-12,bodyY+2,-3,bodyY+1,-5,bodyY+20,-13,bodyY+12]).fill(0x6e4d2f);
    g.poly([12,bodyY+2,3,bodyY+1,5,bodyY+20,13,bodyY+12]).fill(0x6e4d2f);
  }else if(retro){
    // Striped knit with a big open collar.
    g.roundRect(-12,bodyY,24,29,6).fill(knit);
    for(let band=0;band<3;band++)g.rect(-12,bodyY+11+band*6,24,2.2).fill({color:0xf0e6cc,alpha:.55});
    g.poly([-9,bodyY,0,bodyY+9,9,bodyY,6,bodyY+7,0,bodyY+13,-6,bodyY+7]).fill(0xf0e6cc);
  }else if(isMgr){
    g.roundRect(-12,bodyY,24,30,8).fill(0x111b2b);
    g.poly([-11,bodyY+2,-2,bodyY+12,-7,bodyY+25,-13,bodyY+13]).fill(0x233248);
    g.poly([11,bodyY+2,2,bodyY+12,7,bodyY+25,13,bodyY+13]).fill(0x1b293c);
    g.poly([-5,bodyY+1,0,bodyY+8,5,bodyY+1,3,bodyY+14,-3,bodyY+14]).fill(0xe8eef5);
    g.poly([-1.7,bodyY+7,1.7,bodyY+7,2.2,bodyY+20,0,bodyY+24,-2.2,bodyY+20]).fill(accent);
    g.circle(-8,bodyY+12,1.6).fill(0xf8d77c);
  }else{
    g.roundRect(-12,bodyY,24,29,8).fill(shirt);
    g.roundRect(-11,bodyY+1,9,27,6).fill({color:0x000000,alpha:.1});
    g.poly([-6,bodyY,0,bodyY+6,6,bodyY,3,bodyY+10,-3,bodyY+10]).fill(0xe9eff6);
    g.moveTo(0,bodyY+7).lineTo(0,bodyY+27).stroke({color:0xffffff,width:.8,alpha:.25});
  }
  g.roundRect(-10,bodyY+27,20,3,1.5).fill(0x101827);
  g.roundRect(-2.5,bodyY+27,5,3,1).fill(0xbcc8d5);

  // Arms respond to walking, typing and human-attention states.
  const armSwing=working?Math.sin(t*14+phase)*1.8:step*5;
  const raising=/Awaiting human/.test(action)&&!walk;
  const sleeve=retro?(isMgr?0x5b3f26:knit):isMgr?0x19263a:shirt;
  limb(g,[-10,bodyY+8,-15,bodyY+17,-14-armSwing,bodyY+27],sleeve,6.6);
  g.circle(-14-armSwing,bodyY+28,3.4).fill(skin);
  if(raising){
    const wave=Math.sin(t*6)*2;
    limb(g,[10,bodyY+8,16,bodyY-5,17+wave,bodyY-20],sleeve,6.6);
    g.roundRect(14+wave,bodyY-27,6,9,3).fill(skin);
  }else{
    limb(g,[10,bodyY+8,15,bodyY+17,14+armSwing,bodyY+27],sleeve,6.6);
    g.circle(14+armSwing,bodyY+28,3.4).fill(skin);
  }

  // Neck and compact editorial portrait.
  g.roundRect(-3.5,headY+12,7,9,3).fill(skin);
  g.ellipse(0,headY,11.5,14).fill(skin);
  g.ellipse(0,headY+7,9.5,8).fill({color:0x000000,alpha:.035});
  g.ellipse(-11.2,headY+2,2.5,4).fill(skin);
  g.ellipse(11.2,headY+2,2.5,4).fill(skin);

  // Eight silhouettes with graphic, animation-studio shapes.
  const style=seed%8;
  if(style===0){
    g.ellipse(-1,headY-8,11.5,8).fill(hair);
    g.poly([-11,headY-6,6,headY-14,11,headY-6,5,headY-8,-9,headY+1]).fill(hair);
  }else if(style===1){
    g.poly([-11,headY-3,-8,headY-13,-3,headY-10,1,headY-15,5,headY-11,11,headY-13,11,headY-1]).fill(hair);
  }else if(style===2){
    g.ellipse(0,headY-7,12,9).fill(hair);g.roundRect(-13,headY-5,5,19,2).fill(hair);g.roundRect(8,headY-5,5,18,2).fill(hair);
  }else if(style===3){
    g.circle(0,headY-9,12).fill(hair);g.circle(-9,headY-6,7).fill(hair);g.circle(9,headY-6,7).fill(hair);
  }else if(style===4){
    g.ellipse(0,headY-7,12,8).fill(hair);g.circle(0,headY-15,5).fill(hair);g.roundRect(-3,headY-12,6,2,1).fill(accent);
  }else if(style===5){
    g.ellipse(0,headY-7,12,9).fill(hair);g.ellipse(-11,headY+3,4,16).fill(hair);g.ellipse(11,headY+2,4,15).fill(hair);
  }else if(style===6){
    g.ellipse(1,headY-10,12,9).fill(hair);g.poly([-9,headY-7,-3,headY-16,7,headY-16,11,headY-6]).fill(hair);
  }else{
    g.ellipse(0,headY-7,12,9).fill(hair);g.roundRect(-13,headY-4,5,18,2).fill(hair);limb(g,[-10,headY-7,-12,headY+10],accent,1.8);
  }
  g.ellipse(-3,headY-11,4,2).fill({color:0xffffff,alpha:.08});

  // Subtle face: compact eyes, clear gaze, state-aware expression.
  const gazeY=working?1:/Thinking/.test(action)?-1:0;
  if(blink){
    limb(g,[-7+facing,headY+1,-2+facing,headY+1],0x17202b,1.2);
    limb(g,[2+facing,headY+1,7+facing,headY+1],0x17202b,1.2);
  }else{
    g.ellipse(-4+facing,headY+1,2.2,2.5).fill(0xf8fafc);
    g.ellipse(4+facing,headY+1,2.2,2.5).fill(0xf8fafc);
    g.circle(-4+facing,headY+1+gazeY,1.15).fill(0x15263c);
    g.circle(4+facing,headY+1+gazeY,1.15).fill(0x15263c);
    g.circle(-3.6+facing,headY+.5+gazeY,.38).fill(0xffffff);
    g.circle(4.4+facing,headY+.5+gazeY,.38).fill(0xffffff);
  }
  limb(g,[-7+facing,headY-4,-2+facing,headY-4.5],hair,1.4);
  limb(g,[2+facing,headY-4.5,7+facing,headY-4],hair,1.4);
  if(isDone)g.moveTo(-3,headY+8).quadraticCurveTo(0,headY+11,3,headY+8).stroke({color:0x7f1d1d,width:1.3});
  else if(isError)g.moveTo(-3,headY+10).quadraticCurveTo(0,headY+7,3,headY+10).stroke({color:0x7f1d1d,width:1.3});
  else if(speaking)g.ellipse(0,headY+9,2.2,1.2+Math.abs(Math.sin(t*9))*1.2).fill(0x7f1d1d);
  else limb(g,[-2.5,headY+9,2.5,headY+9],0x713f3f,1.1);

  // Minimal eyewear and a quiet identity/status light.
  if(retro&&(seed%2===0||isMgr)){
    // Oversized period frames.
    g.roundRect(-10+facing,headY-3,9,8,3).stroke({color:0x3a2a14,width:1.5});
    g.roundRect(1+facing,headY-3,9,8,3).stroke({color:0x3a2a14,width:1.5});
    limb(g,[-1+facing,headY,1+facing,headY],0x3a2a14,1.2);
  }else if(!retro&&(seed%3===0||isMgr)){
    g.roundRect(-9+facing,headY-2,7,6,2).stroke({color:0x162234,width:1.25});
    g.roundRect(2+facing,headY-2,7,6,2).stroke({color:0x162234,width:1.25});
    limb(g,[-2+facing,headY+1,2+facing,headY+1],0x162234,1.1);
  }
  g.circle(10.5,headY+8,1.25).fill(activeColor);

  // Work props preserve the semantic visual language of every existing state.
  if(/Coding|Searching|Querying|Computing|Working/.test(action)&&!walk&&!atDesk){
    const kind=/Searching/.test(action)?'search':/Querying/.test(action)?'query':/Computing/.test(action)?'compute':/Coding/.test(action)?'code':'work';
    if(retro)drawRetroTerminal(g,sit,t);else drawLaptop(g,sit,seed,t,kind);
  }
  if(c.carriedObject&&retro)drawManilaFolder(g,bodyY);
  else if(c.carriedObject){
    g.roundRect(7,bodyY+18,21,15,3).fill(accent).stroke({color:0xffffff,width:.7,alpha:.35});
    g.roundRect(10,bodyY+15,9,5,2).fill({color:accent,alpha:.88});
    g.roundRect(11,bodyY+20,13,8,1.5).fill(0xf1f5f9);
  }
  if(/Searching/.test(action)&&!walk) drawMagnifierEmoji(g,24,headY-9,t);
  if(/Querying/.test(action)&&!walk) drawDatabaseEmoji(g,24,headY-10,t);
  if(/Computing/.test(action)&&!walk) drawGearEmoji(g,24,headY-10,t);
  if(/Thinking/.test(action)&&!walk) drawThinkingEmoji(g,24,headY-11,t);
  if(isWaiting&&!walk&&!raising) drawClockEmoji(g,24,headY-10,t);
  if(isError&&!walk) drawErrorEmoji(g,24,headY-10,t);
  if(isDone&&!walk) drawSuccessEmoji(g,24,headY-10,t);
  if(raising) drawAwaitingHumanEmoji(g,24,headY-10,t);

  if(!walk&&seated>.3&&!atDesk){
    const deco=deskDecos[seed%deskDecos.length];
    const dx=20,dy=-5+sit;
    if(retro&&seed%2===0)drawBookStack(g,dx,dy);
    else if(deco==='cup')drawCup(g,dx,dy);
    else if(deco==='plant')drawPlant(g,dx,dy);
    else if(deco==='notebook')drawNotebook(g,dx,dy);
    else if(deco==='lamp')drawLamp(g,dx,dy);
    else if(deco==='mug')drawMug(g,dx,dy);
    else drawSucculent(g,dx,dy);
  }
}
