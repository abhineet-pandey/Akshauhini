import React,{useMemo} from 'react';
import {OfficeEngine,State,isManagerRole,stationFor,ToolStation} from './engine';

/** Who handed work to whom, and which tools each agent called: a laned node graph built from the run's events. */
type EdgeKind='assign'|'handoff'|'message'|'question'|'tool';
type Node={id:string;kind:'agent'|'tool';label:string;sub:string;state:'working'|'waiting'|'error'|'done'|'idle';station?:ToolStation;lane:number;row:number};
type Edge={from:string;to:string;kind:EdgeKind;count:number;failed:number;last:number};

const KIND_COLOR:Record<EdgeKind,string>={assign:'#5aa9ff',handoff:'#7c8cff',message:'#b48cff',question:'#3ad6c5',tool:'#8b97ab'};
const KIND_WORD:Record<EdgeKind,string>={assign:'assign',handoff:'handoff',message:'message',question:'question',tool:''};
const STATE_COLOR:Record<Node['state'],string>={working:'#39d353',waiting:'#f0b43c',error:'#ef4444',done:'#5aa9ff',idle:'#6b7385'};
const CARD_W=176,CARD_H=54,LANE_GAP=110,ROW_GAP=22,TOP=52,LEFT=24;
/** An edge counts as live while its last event is this recent, measured against the newest event in the run. */
const LIVE_MS=5000;

function agentState(status:string):Node['state']{
  if(/Error|Failed|Rejected/.test(status))return 'error';
  if(/Waiting|Blocked|Awaiting|Queued/.test(status))return 'waiting';
  if(/Complete|Approved/.test(status))return 'done';
  if(/Idle|Cancelled/.test(status))return 'idle';
  return 'working';
}

export function buildGraph(state:State){
  const edges=new Map<string,Edge>();
  const add=(from:string,to:string,kind:EdgeKind,at:number,failed=false)=>{
    const key=`${from}>${to}>${kind}`;
    const e=edges.get(key)??{from,to,kind,count:0,failed:0,last:0};
    e.count++;if(failed)e.failed++;e.last=Math.max(e.last,at);edges.set(key,e);
  };
  const tools=new Map<string,{calls:number;failed:number}>();
  const opTool=new Map<string,string>();
  for(const e of state.events){
    if(!e.agent_id||!state.agents[e.agent_id])continue;
    const at=Date.parse(e.timestamp),target=typeof e.data?.target_agent_id==='string'?e.data.target_agent_id:undefined;
    if(target&&target!==e.agent_id&&state.agents[target]){
      if(e.type==='task.assigned')add(e.agent_id,target,'assign',at);
      else if(e.type==='handoff.started')add(e.agent_id,target,'handoff',at);
      else if(e.type==='message.sent')add(e.agent_id,target,'message',at);
      else if(e.type==='question.routed')add(e.agent_id,target,'question',at);
    }
    if(e.type==='tool.call.started'&&typeof e.data?.tool==='string'){
      const tool=e.data.tool;
      if(e.operation_id)opTool.set(e.agent_id+':'+e.operation_id,tool);
      const t=tools.get(tool)??{calls:0,failed:0};t.calls++;tools.set(tool,t);
      add(e.agent_id,'tool:'+tool,'tool',at);
    }
    if(e.type==='tool.call.failed'){
      const tool=typeof e.data?.tool==='string'?e.data.tool:e.operation_id?opTool.get(e.agent_id+':'+e.operation_id):undefined;
      if(tool){const t=tools.get(tool);if(t)t.failed++;const edge=edges.get(`${e.agent_id}>tool:${tool}>tool`);if(edge){edge.failed++;edge.last=Math.max(edge.last,at);}}
    }
  }

  // Lanes: leads first, then each agent one lane after whoever first handed it work, then the tools.
  const agents=Object.values(state.agents);
  const incoming=new Map<string,string[]>();
  for(const e of edges.values())if(e.kind!=='tool'){const list=incoming.get(e.to)??[];list.push(e.from);incoming.set(e.to,list);}
  const lane=new Map<string,number>();
  // Leads are the managers; only a team without one starts from the agents nobody hands work to.
  const managers=agents.filter(a=>isManagerRole(a.role));
  const roots=managers.length?managers:agents.filter(a=>!incoming.has(a.id));
  for(const a of (roots.length?roots:agents.slice(0,1)))lane.set(a.id,0);
  for(let pass=0;pass<agents.length;pass++){
    let changed=false;
    for(const e of edges.values()){
      if(e.kind==='tool'||!lane.has(e.from)||lane.has(e.to))continue;
      lane.set(e.to,lane.get(e.from)!+1);changed=true;
    }
    if(!changed)break;
  }
  for(const a of agents)if(!lane.has(a.id))lane.set(a.id,roots.length&&!isManagerRole(a.role)?1:0);
  const agentLanes=Math.max(0,...lane.values())+1;

  const nodes:Node[]=[];
  const rows=new Map<number,number>();
  for(const a of [...agents].sort((x,y)=>lane.get(x.id)!-lane.get(y.id)!)){
    const l=lane.get(a.id)!,row=rows.get(l)??0;rows.set(l,row+1);
    nodes.push({id:a.id,kind:'agent',label:a.name,sub:`${a.role} · ${a.status}`.toLowerCase(),state:agentState(a.status),lane:l,row});
  }
  [...tools.entries()].sort((a,b)=>b[1].calls-a[1].calls).forEach(([tool,t],row)=>{
    nodes.push({id:'tool:'+tool,kind:'tool',label:tool,sub:`${t.calls} call${t.calls===1?'':'s'}${t.failed?` · ${t.failed} failed`:''}`,state:t.failed?'error':'idle',station:stationFor(tool),lane:agentLanes,row});
  });
  return {nodes,edges:[...edges.values()],lanes:agentLanes+(tools.size?1:0),agentLanes};
}

/** Small line glyphs drawn in a 20 x 20 box. */
function Glyph({node}:{node:Node}){
  const s={fill:'none',stroke:'currentColor',strokeWidth:1.8,strokeLinecap:'round' as const,strokeLinejoin:'round' as const};
  if(node.kind==='agent')return <text x="10" y="14.5" textAnchor="middle" fontSize="12" fontWeight="700" fill="currentColor">{node.label.slice(0,1).toUpperCase()}</text>;
  switch(node.station){
    case 'research':return <g {...s}><circle cx="8.5" cy="8.5" r="5"/><path d="M12.5 12.5 17 17"/></g>;
    case 'engineering':return <g {...s}><path d="M4 6l4 4-4 4"/><path d="M10 15h6"/></g>;
    case 'database':return <g {...s}><ellipse cx="10" cy="5" rx="6" ry="2.5"/><path d="M4 5v10c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5V5"/><path d="M4 10c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5"/></g>;
    case 'archive':return <g {...s}><path d="M4 4h4v12H4zM9 4h3v12H9zM13 5l3-.5 2 11-3 .5z"/></g>;
    default:return <g {...s}><rect x="5" y="5" width="10" height="10" rx="1.5"/><path d="M8 2v3M12 2v3M8 15v3M12 15v3M2 8h3M2 12h3M15 8h3M15 12h3"/></g>;
  }
}

export function Dataflow({engine,selected,onSelect}:{engine:OfficeEngine;selected?:string;onSelect:(id:string)=>void}){
  const state=engine.state,count=state.events.length;
  // Rebuilt only when events arrive; statuses inside are read fresh with it.
  const graph=useMemo(()=>buildGraph(state),[state,count,Object.values(state.agents).map(a=>a.status+a.name).join('|')]);
  const now=count?Date.parse(state.events[count-1].timestamp):0;
  const pos=new Map(graph.nodes.map(n=>[n.id,{x:LEFT+n.lane*(CARD_W+LANE_GAP),y:TOP+n.row*(CARD_H+ROW_GAP)}]));
  const width=LEFT*2+Math.max(1,graph.lanes)*(CARD_W+LANE_GAP)-LANE_GAP;
  const rows=Math.max(1,...graph.nodes.map(n=>n.row+1));
  const height=TOP+rows*(CARD_H+ROW_GAP)+40;
  const laneTitle=(l:number)=>l===graph.agentLanes?'TOOLS':l===0?'LEAD':`STAGE ${l}`;
  const transfers=graph.edges.filter(e=>e.kind!=='tool').reduce((n,e)=>n+e.count,0);

  if(!graph.nodes.length)return <div className="dataflow empty-dataflow">No agents yet. The dataflow appears as soon as the run reports agents.</div>;

  return (
    <div className="dataflow">
      <svg viewBox={`0 0 ${width} ${height}`} style={{width:'100%',maxWidth:width,minWidth:Math.min(width,560),height:'auto'}} role="img"
        aria-label={`Dataflow: ${graph.nodes.filter(n=>n.kind==='agent').length} agents, ${graph.nodes.filter(n=>n.kind==='tool').length} tools, ${transfers} transfers`}>
        <defs>
          {(Object.keys(KIND_COLOR) as EdgeKind[]).map(k=>(
            <marker key={k} id={`df-arrow-${k}`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0 0 8 4 0 8z" fill={KIND_COLOR[k]}/>
            </marker>
          ))}
          <filter id="df-shadow" x="-10%" y="-10%" width="120%" height="140%"><feDropShadow dx="0" dy="3" stdDeviation="4" floodOpacity=".28"/></filter>
        </defs>
        {Array.from({length:graph.lanes},(_,l)=>(
          <text key={l} className={`df-lane ${l===graph.agentLanes?'df-lane-accent':''}`} x={LEFT+l*(CARD_W+LANE_GAP)} y={28}>{laneTitle(l)}</text>
        ))}
        {graph.edges.map((e,i)=>{
          const a=pos.get(e.from),b=pos.get(e.to);if(!a||!b)return null;
          // Forward edges run right to left-edge; edges within or back across lanes loop out to the side.
          const forward=b.x>a.x;
          const x1=a.x+CARD_W,y1=a.y+CARD_H/2,x2=forward?b.x:b.x+CARD_W,y2=b.y+CARD_H/2;
          const bend=forward?Math.max(40,(x2-x1)/2):60+Math.abs(y2-y1)*.15;
          const d=forward?`M${x1} ${y1} C${x1+bend} ${y1} ${x2-bend} ${y2} ${x2-4} ${y2}`:`M${x1} ${y1} C${x1+bend} ${y1} ${x2+bend} ${y2} ${x2+4} ${y2}`;
          const live=now-e.last<LIVE_MS,color=e.failed&&e.kind==='tool'?'#ef4444':KIND_COLOR[e.kind];
          const mx=forward?(x1+x2)/2:Math.max(x1,x2)+bend*.75,my=(y1+y2)/2;
          const text=`${KIND_WORD[e.kind]}${KIND_WORD[e.kind]?' ':''}×${e.count}`;
          return (
            <g key={i} className={live?'df-edge live':'df-edge'}>
              <path d={d} fill="none" stroke={color} strokeWidth={1.2+Math.min(2.4,Math.log2(e.count+1)*.7)} strokeDasharray="2 5" strokeLinecap="round" markerEnd={`url(#df-arrow-${e.kind})`} opacity={live?1:.55}/>
              {live&&<circle r="3.2" fill={color}><animateMotion dur="1.6s" repeatCount="indefinite" path={d}/></circle>}
              <g transform={`translate(${mx} ${my})`}>
                <rect x={-text.length*3.3-8} y={-9} width={text.length*6.6+16} height={18} rx={5} className="df-pill"/>
                <text x={0} y={4} textAnchor="middle" className="df-pill-text">{text}</text>
              </g>
            </g>
          );
        })}
        {graph.nodes.map(n=>{
          const p=pos.get(n.id)!,isSel=n.id===selected,glyph=n.kind==='agent'?STATE_COLOR[n.state]:KIND_COLOR.tool;
          return (
            <g key={n.id} transform={`translate(${p.x} ${p.y})`} className={`df-node ${n.kind} ${isSel?'selected':''}`}
              onClick={()=>n.kind==='agent'&&onSelect(n.id)} role={n.kind==='agent'?'button':undefined} tabIndex={n.kind==='agent'?0:undefined}
              onKeyDown={e=>{if(n.kind==='agent'&&(e.key==='Enter'||e.key===' '))onSelect(n.id);}}>
              <rect width={CARD_W} height={CARD_H} rx={10} className="df-card" filter="url(#df-shadow)"/>
              <g transform="translate(12 17)" style={{color:glyph}}><Glyph node={n}/></g>
              <text x={42} y={24} className="df-label">{n.label.length>17?n.label.slice(0,16)+'…':n.label}</text>
              <text x={42} y={40} className="df-sub">{n.sub.length>21?n.sub.slice(0,20)+'…':n.sub}</text>
              {n.kind==='agent'&&<circle cx={CARD_W-12} cy={12} r={3.5} fill={STATE_COLOR[n.state]} className={n.state==='working'?'df-pulse':undefined}/>}
            </g>
          );
        })}
        <text x={width/2} y={height-12} textAnchor="middle" className="df-caption">
          Dataflow · lanes · {graph.nodes.filter(n=>n.kind==='agent').length} agents · {graph.nodes.filter(n=>n.kind==='tool').length} tools · {transfers} transfers
        </text>
      </svg>
    </div>
  );
}
