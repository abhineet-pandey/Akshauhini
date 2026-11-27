import {Container,Graphics,Text,TextStyle} from 'pixi.js';
import {Agent} from './engine';

/**
 * Token usage per agent, shown when hovering it on the floor or in the team list: input and output tokens (and
 * cache reads/writes where the agent reports them), so it is clear what each one is costing. Counts come from the
 * telemetry: `llm.completed` events that report `input_tokens`/`output_tokens` are summed, and local sessions report
 * their transcript totals. Nothing is estimated; an agent that reported nothing says so.
 */
export const fmtTokens=(n:number)=>n>=1e6?`${(n/1e6).toFixed(n>=1e7?0:1)}M`:n>=1e3?`${(n/1e3).toFixed(n>=1e4?0:1)}k`:String(Math.round(n));

export function usageLines(a:Agent):string[]{
  const t=a.tokens;
  if(!t||!(t.input||t.output||t.cacheRead||t.cacheWrite))return ['No token usage reported'];
  const lines=[`${fmtTokens(t.input)} in · ${fmtTokens(t.output)} out`];
  // Input counts every prompt token; the cache line says how much of it was read from or written to the cache.
  if(t.cacheRead||t.cacheWrite)lines.push(`of input: ${fmtTokens(t.cacheRead??0)} cache read · ${fmtTokens(t.cacheWrite??0)} cache write`);
  if(a.model)lines.push(a.model);
  return lines;
}
/** One-line form for HTML `title` tooltips. */
export const usageTitle=(a:Agent)=>`Tokens: ${usageLines(a).join(' · ')}`;

/** A screen-space tooltip on the Pixi stage: stays the same size whatever the zoom, and is never mirrored. */
export function createHoverTip(stage:Container,colors:{bg:number;border:number;text:number;title:number}){
  const root=new Container(),bg=new Graphics();
  const style=(fill:number,weight:'400'|'700')=>new TextStyle({fontFamily:'ui-monospace,monospace',fontSize:11,fill,fontWeight:weight,letterSpacing:.3,lineHeight:15});
  const title=new Text({text:'',style:style(colors.title,'700')}),body=new Text({text:'',style:style(colors.text,'400')});
  root.addChild(bg,title,body);root.visible=false;root.eventMode='none';
  stage.addChild(root);
  let sig='';
  return {
    /** Above the agent (`top`), or below it (`bottom`) when that would run under the floating heading (`minY`). */
    show(name:string,lines:string[],x:number,top:number,bottom:number,screenW:number,minY=0){
      const s=`${name}|${lines.join('|')}`;
      if(s!==sig){
        sig=s;title.text=name;body.text=lines.join('\n');
        const w=Math.max(title.width,body.width)+20,h=title.height+body.height+16;
        bg.clear().roundRect(0,0,w,h,8).fill({color:colors.bg,alpha:.94}).stroke({color:colors.border,width:1,alpha:.8});
        title.position.set(10,7);body.position.set(10,9+title.height);
      }
      const w=bg.width,h=bg.height;
      const above=top-h-8;
      root.position.set(Math.round(Math.max(6,Math.min(screenW-w-6,x-w/2))),Math.round(above>=minY+6?above:bottom+8));
      root.visible=true;
    },
    hide(){root.visible=false;},
  };
}
