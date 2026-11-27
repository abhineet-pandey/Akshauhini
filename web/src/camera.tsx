import React,{useRef,useState} from 'react';
import {Container,Text} from 'pixi.js';
import {IconFit} from './Icons';

/**
 * View controls shared by both office renderers: turn the floor to the other corner, zoom, and frame it.
 * "Rotate" mirrors the whole floor left to right. For the isometric office that is the view from the opposite back
 * corner (the walls stay behind the floor, where they don't hide anyone); for the 2D plans it swaps the sides.
 * Labels are flipped back so they stay readable. The choice is a per-viewer preference kept in localStorage.
 */
const KEY='akshauhini-office-rotated';
const load=()=>{try{return localStorage.getItem(KEY)==='1';}catch{return false;}};
const save=(v:boolean)=>{try{localStorage.setItem(KEY,v?'1':'0');}catch{/* blocked storage: the choice just won't persist */}};

export type CameraCommand='in'|'out'|'fit'|'left'|'right'|'up'|'down';

/** State for the controls; renderers read `rotated` and drain `commands` in their ticker. */
export function useCameraControls(){
  const [rotated,setRotated]=useState(load);
  const commands=useRef<CameraCommand[]>([]);
  const toggle=()=>setRotated(r=>{save(!r);return !r;});
  return {rotated,commands,toggle};
}

/** Applies queued commands to a renderer's camera: zoom about the canvas centre, nudge the frame, or refit. */
export function runCameraCommands(commands:CameraCommand[],cam:{zoom:number;pan:{x:number;y:number}},
  screen:{width:number;height:number},limits:{min:number;max:number},fit:()=>void):boolean{
  let acted=false;
  for(let c=commands.shift();c;c=commands.shift()){
    acted=true;
    if(c==='fit'){fit();continue;}
    if(c==='in'||c==='out'){
      const nz=Math.max(limits.min,Math.min(limits.max,cam.zoom*(c==='in'?1.25:.8)));
      const x=screen.width/2,y=screen.height/2;
      cam.pan={x:x-(x-cam.pan.x)*nz/cam.zoom,y:y-(y-cam.pan.y)*nz/cam.zoom};cam.zoom=nz;continue;
    }
    const step=Math.min(screen.width,screen.height)*.15;
    if(c==='left')cam.pan.x+=step;else if(c==='right')cam.pan.x-=step;else if(c==='up')cam.pan.y+=step;else cam.pan.y-=step;
  }
  return acted;
}

/** Keeps the same floor point in the middle of the canvas when the view flips. */
export function flipPan(panX:number,zoom:number,width:number,wasRotated:boolean){
  const sx=wasRotated?-1:1,centre=(width/2-panX)/(sx*zoom);
  return width/2+sx*centre*zoom;
}

const baseAnchor=new WeakMap<Text,number>();
/** Un-mirrors every Text under `root` (anchor swapped so it keeps its place), so labels read normally in a rotated view. */
export function readableText(root:Container,rotated:boolean){
  const visit=(o:Container)=>{
    if(o instanceof Text){
      let a=baseAnchor.get(o);
      if(a===undefined){a=o.anchor.x;baseAnchor.set(o,a);}
      const want=rotated?1-a:a,sx=Math.abs(o.scale.x)*(rotated?-1:1);
      if(o.anchor.x!==want)o.anchor.x=want;
      if(o.scale.x!==sx)o.scale.x=sx;
    }
    for(const c of o.children)visit(c as Container);
  };
  visit(root);
}

/** The control cluster in the corner of the office canvas. */
export function CameraTools({rotated,toggle,commands}:{rotated:boolean;toggle:()=>void;commands:React.MutableRefObject<CameraCommand[]>}){
  const send=(c:CameraCommand)=>commands.current.push(c);
  return(
    <div className="camera-tools" role="toolbar" aria-label="View controls" onPointerDown={e=>e.stopPropagation()}>
      <button aria-pressed={rotated} title="Turn the floor to view it from the other corner" aria-label="Rotate view" onClick={toggle}>
        {/* Rotate icon derived from Lucide "refresh-cw" (ISC License, Lucide Icons and Contributors; see akshauhini/THIRD_PARTY_NOTICES.md). */}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 12a9 9 0 0 1 15.5-6.2L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.5 6.2L3 16"/><path d="M3 21v-5h5"/>
        </svg>
      </button>
      <span className="camera-sep" aria-hidden="true"/>
      <button title="Zoom out (or scroll)" aria-label="Zoom out" onClick={()=>send('out')}>−</button>
      <button title="Zoom in (or scroll)" aria-label="Zoom in" onClick={()=>send('in')}>+</button>
      <span className="camera-sep" aria-hidden="true"/>
      <button title="Move the frame left" aria-label="Pan left" onClick={()=>send('left')}>‹</button>
      <button title="Move the frame up" aria-label="Pan up" onClick={()=>send('up')}>˄</button>
      <button title="Move the frame down" aria-label="Pan down" onClick={()=>send('down')}>˅</button>
      <button title="Move the frame right" aria-label="Pan right" onClick={()=>send('right')}>›</button>
      <span className="camera-sep" aria-hidden="true"/>
      <button title="Show the whole floor (Fit office frames the activity)" aria-label="Reset view" onClick={()=>send('fit')}><IconFit size={13}/></button>
    </div>
  );
}

/**
 * How much of the canvas is covered by the scene heading and hint line when they float over it (landscape layout),
 * so framing keeps agents clear of them. Zero when they sit in their own rows.
 */
export function overlayInsets(host:HTMLElement|null){
  const scene=host?.closest('.scene');
  if(!host||!scene)return {top:0,bottom:0};
  const r=host.getBoundingClientRect();
  const head=scene.querySelector('.scene-heading')?.getBoundingClientRect();
  const foot=scene.querySelector('.scene-footer')?.getBoundingClientRect();
  // The heading's lower part is a fade into the floor, so a little of it may overlap what is framed.
  const top=head&&head.height?Math.max(0,head.bottom-r.top-16):0;
  const bottom=foot&&foot.height?Math.max(0,r.bottom-foot.top-6):0;
  return {top,bottom};
}
