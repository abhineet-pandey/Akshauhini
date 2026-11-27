export type ProgressReport = {state:string;summary:string;completed_items:string[];waiting_for:string[];next_steps:string[];completed_units?:number;total_units?:number;progress?:number|null};
export type AOEvent = {version?:string; event_id:string; run_id:string; type:string; timestamp:string; seq:number; agent_id?:string; task_id?:string; operation_id?:string; data:Record<string,unknown>};
export type Point = {x:number;y:number};
export type Agent = {id:string; name:string; role:string; department:string; status:string; task?:string; operation?:string; tool?:string; model?:string; started:number; metrics:Record<string,unknown>; queue:string[]; context:number; error?:string;report?:ProgressReport;updatedAt?:string;reportedAt?:string;
  /** Tokens used so far, as reported: summed from llm.completed, or a session's running total (x.usage). */
  tokens?:{input:number;output:number;cacheRead?:number;cacheWrite?:number};
  /** Introduced itself with agent.created/updated; otherwise its name and role are inferred from what it does. */
  announced?:boolean};
export type Task = {id:string;title:string;owner?:string;status:string;progress?:number;artifact?:string};
export type Operation = {id:string;agentId:string;kind:string;status:string;started:string;ended?:string;taskId?:string;tool?:string;metrics:Record<string,unknown>};
export type Artifact = {id:string;version:number;name:string;content:string;taskId?:string;agentId:string;parents:string[]};
export type ResourceState = {name:string;capacity:number;active:string[];waiting:string[]};
export type Interaction = {id:string;from:string;to:string;kind:string;started:number;question?:string};
export type DeskSlot = {manager:boolean;index:number};
export type State = {agents:Record<string,Agent>;tasks:Record<string,Task>;seen:Set<string>;runStatus:string;events:AOEvent[];operations:Record<string,Operation>;artifacts:Record<string,Artifact>;resources:Record<string,ResourceState>;desks:Record<string,DeskSlot>;used:Set<string>};
export const fresh = ():State => ({agents:{},tasks:{},seen:new Set(),runStatus:'Waiting',events:[],operations:{},artifacts:{},resources:{},desks:{},used:new Set()});
export const stations:Record<string,Point> = {desk:{x:3,y:4},manager:{x:2,y:2},research:{x:8,y:2},archive:{x:12,y:2},engineering:{x:3,y:8},database:{x:8,y:8},compute:{x:12,y:8},human:{x:12,y:5},meeting:{x:7,y:5}};
/** Split a role/tool name into lowercase words: "PythonREPLTool" -> python, repl, tool. */
const words=(s:string)=>s.replace(/([a-z0-9])([A-Z])/g,'$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g,'$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
const MANAGER_WORDS=new Set(['manager','orchestrator','supervisor','coordinator','director']);
/** One definition of "manager" for the desk layout, the suit, and the Ask/Follow manager buttons. */
export const isManagerRole=(role?:string)=>!!role&&(words(role).some(w=>MANAGER_WORDS.has(w))||/(^|[^a-z])(team|tech|project|group)[\s_-]*lead/i.test(role));

export type ToolStation='research'|'archive'|'database'|'engineering'|'compute';
const TOOL_STATIONS:ToolStation[]=['research','archive','database','engineering','compute'];
const has=(tokens:string[],exact:string[],stems:string[]=[])=>tokens.some(t=>exact.includes(t)||stems.some(s=>t.startsWith(s)));
/**
 * Which physical station a tool call visits. A producer may set data.station to decide explicitly;
 * otherwise whole words in the tool name are matched (never substrings: "average_calc" is not RAG).
 * Knowledge stores and code words are checked before generic "search", so vector_search goes to the archive and grep_search to engineering, not the web.
 */
export function stationFor(tool:string,explicit?:unknown):ToolStation{
  if(typeof explicit==='string'&&(TOOL_STATIONS as string[]).includes(explicit))return explicit as ToolStation;
  const t=words(tool);
  if(has(t,['rag','kb','vector','vectors','vectordb','pinecone','chroma','chromadb','faiss','weaviate','qdrant','milvus','pgvector','knowledge','semantic','document','documents','doc','docs'],['retriev','embed'])||(has(t,['file','files'])&&has(t,['search','lookup','query'])))return 'archive';
  if(has(t,['sql','sqlite','database','db','postgres','postgresql','mysql','mariadb','mongo','mongodb','redis','dynamodb','bigquery','snowflake','warehouse']))return 'database';
  if(has(t,['code','coding','python','py','exec','execute','executor','execution','compile','compiler','bash','shell','terminal','repl','interpreter','sandbox','git','github','gitlab','grep','script','javascript','typescript','node','docker'],['compil']))return 'engineering';
  if(has(t,['web','search','browse','browser','internet','google','bing','duckduckgo','tavily','serp','serpapi','brave','scrape','scraper','crawl','crawler','wikipedia','arxiv','news','http','url','fetch'],['brows']))return 'research';
  return 'compute';
}

/** Manager desks along the back wall, in the gaps between the stations there (research is at x 8, archive at x 12). */
const MANAGER_SEATS:Point[]=[{x:2,y:2},{x:4,y:2},{x:6,y:2},{x:10,y:2}];
const MANAGER_DESKS=MANAGER_SEATS.length;
/** The first worker desks: two clusters (west and east of the collaboration dome), each clear of every station on screen. */
const WORKER_SEATS:Point[]=[{x:3,y:4},{x:5,y:4},{x:3,y:6},{x:5,y:6},{x:10,y:4},{x:10,y:6},{x:14,y:3},{x:14,y:5}];
/** Desk positions: managers along the back wall, the first workers in the clusters, everyone else in an open-plan bullpen south of the stations. */
export function deskPoint(slot:DeskSlot):Point{
  if(slot.manager)return {...MANAGER_SEATS[slot.index]};
  if(slot.index<WORKER_SEATS.length)return {...WORKER_SEATS[slot.index]};
  const j=slot.index-WORKER_SEATS.length;
  return {x:1.5+(j%7)*2,y:11.6+Math.floor(j/7)*2.2};
}
/** Give each agent a stable desk: it never moves when other agents join or leave, and freed desks are reused. */
function assignDesk(state:State,a:Agent){
  const wantManager=isManagerRole(a.role),current=state.desks[a.id];
  if(current&&(current.manager===wantManager||(!wantManager&&!current.manager)))return;
  delete state.desks[a.id];
  const lowestFree=(manager:boolean)=>{const used=new Set(Object.values(state.desks).filter(d=>d.manager===manager).map(d=>d.index));let i=0;while(used.has(i))i++;return i;};
  if(wantManager){const i=lowestFree(true);if(i<MANAGER_DESKS){state.desks[a.id]={manager:true,index:i};return;}}
  state.desks[a.id]={manager:false,index:lowestFree(false)};
}
export function desk(id:string,state:State):Point { const slot=state.desks[id]; return slot?deskPoint(slot):{...stations.desk}; }
/** Floor rows (y = 0 .. rows-1): the fixed office is 11 rows; the bullpen extends it as the team grows. */
export function floorRows(state:State):number{let maxY=10;for(const slot of Object.values(state.desks))maxY=Math.max(maxY,deskPoint(slot).y);return Math.ceil(maxY)+1;}
export type Bounds={maxX:number;maxY:number};
export const boundsFor=(state:State):Bounds=>({maxX:14,maxY:floorRows(state)-1});
const NAME_POOL=['Ada','Bruno','Clara','Dev','Elena','Farid','Grace','Hiro','Ines','Jun','Kira','Liam','Mina','Nadia','Oscar','Pia'];
/** A display name for an agent that reported none: stable for the same ID, distinct from names already in the run. */
/** A readable id ("sentinel-coordinator", "web_researcher_2") as a title ("Sentinel Coordinator"); undefined for opaque ids. */
function nameFromId(agentId:string){
  const parts=agentId.split(/[-_.:\s]+/).filter(Boolean);
  if(!parts.length||!parts.every(p=>/^[a-z]{2,}$/i.test(p)||/^\d{1,3}$/.test(p))||!parts.some(p=>/[a-z]{3,}/i.test(p)))return;
  return parts.map(p=>p[0].toUpperCase()+p.slice(1).toLowerCase()).join(' ');
}
/** Name for an agent the telemetry never named: its id when that reads as a name, else a stable first name. */
export function autoName(agentId:string,taken:Set<string>):string{
  const fromId=nameFromId(agentId);
  if(fromId&&!taken.has(fromId))return fromId;
  let h=0;for(const ch of agentId)h=(Math.imul(h,31)+ch.charCodeAt(0))>>>0;
  for(let i=0;i<NAME_POOL.length;i++){const name=NAME_POOL[(h+i)%NAME_POOL.length];if(!taken.has(name))return name;}
  return `Agent ${agentId}`;
}
/** Record the station an event sends an agent to, so the floor shows only the rooms this run actually uses. */
function noteStation(state:State,e:AOEvent,a:Agent){
  const d=e.data;
  if(e.type==='tool.call.started'||e.type==='tool.retry'||e.type==='tool.queued')state.used.add(stationFor(String(d.tool??a.tool??''),d.station));
  else if(e.type.startsWith('human.'))state.used.add('human');
  else if(e.type==='message.sent'&&Array.isArray(d.participants)&&d.participants.length>2)state.used.add('meeting');
}
/**
 * The stations this run's floor shows, in layout order: tool stations, human review and the meeting area once an
 * event first sends someone there, and the operations desk while a manager-role agent is present.
 * Nothing is shown for a project that never uses it.
 */
export function activeStations(state:State):string[]{
  const manager=Object.values(state.agents).some(x=>isManagerRole(x.role));
  return Object.keys(stations).filter(key=>key!=='desk'&&(key==='manager'?manager:state.used.has(key)));
}
export function project(state:State,e:AOEvent):boolean {
  if(state.seen.has(e.event_id)) return false;
  state.seen.add(e.event_id); state.events.push(e);
  if(e.type.startsWith('run.')) {state.runStatus=e.type.slice(4);return true;}
  if(!e.agent_id)return true;
  const a=state.agents[e.agent_id]??= {id:e.agent_id,name:autoName(e.agent_id,new Set(Object.values(state.agents).map(x=>x.name))),role:'worker',department:'General',status:'Idle',started:Date.parse(e.timestamp),metrics:{},queue:[],context:0};
  const d=e.data;
  if(e.type==='agent.removed'){delete state.agents[a.id];delete state.desks[a.id];return true;}
  if(e.type==='agent.created'||e.type==='agent.updated'){a.announced=true;a.name=String(d.name??a.name);a.role=String(d.role??a.role);a.department=String(d.department??a.department);if(d.model)a.model=String(d.model);assignDesk(state,a);return true;}
  // x.usage carries an agent's running token totals; it is display-only (shown on hover) and changes no work state.
  if(e.type==='x.usage'){const n=(k:string)=>Number(d[k])||0;a.tokens={input:n('input'),output:n('output'),cacheRead:n('cache_read'),cacheWrite:n('cache_write')};return true;}
  // x.* are producer-defined extension events: kept in the stream, never allowed to change agent or task state.
  if(e.type.startsWith('x.')){a.updatedAt=e.timestamp;return true;}
  a.updatedAt=e.timestamp;
  // Questions don't bring an agent into the office; work does. An agent that left through the door has no desk
  // until it comes back to work, so the floor shows only the desks of agents actually here.
  if(e.type.startsWith('question.'))return true;
  if(!state.desks[a.id])assignDesk(state,a);
  noteStation(state,e,a);
  if(['resource.updated','tool.queued','tool.dequeued'].includes(e.type)&&typeof d.tool==='string'){
    state.resources[d.tool]={name:d.tool,capacity:Number(d.capacity??1),active:Array.isArray(d.active_agents)?d.active_agents.map(String):[],waiting:Array.isArray(d.waiting_agents)?d.waiting_agents.map(String):[]};
    if(e.type!=='tool.queued')return true;
  }
  if(e.operation_id&&/^(llm|tool.call|task)\.(started|completed|failed)$/.test(e.type)){
    const key=a.id+':'+e.operation_id;
    const op=state.operations[key]??={id:e.operation_id,agentId:a.id,kind:e.type.slice(0,e.type.lastIndexOf('.')),status:'started',started:e.timestamp,taskId:e.task_id,tool:typeof d.tool==='string'?d.tool:undefined,metrics:{}};
    op.status=e.type.slice(e.type.lastIndexOf('.')+1);op.metrics={...op.metrics,...d};
    if(op.status!=='started')op.ended=e.timestamp;
  }
  let t:Task|undefined;
  if(e.task_id){t=state.tasks[e.task_id]??={id:e.task_id,title:String(d.title??e.task_id),status:'created'};if(d.title)t.title=String(d.title);}
  if(e.type==='agent.progress'){
    a.report=d as unknown as ProgressReport;a.reportedAt=e.timestamp;a.started=Date.parse(e.timestamp);
    a.status=({idle:'Idle',working:'Working',waiting:'Waiting',blocked:'Blocked',completed:'Complete',failed:'Error',cancelled:'Cancelled'} as Record<string,string>)[String(d.state)]??'Idle';
    a.error=d.state==='failed'?String(d.summary):undefined;
    if(e.task_id)a.task=e.task_id;
    if(t){t.owner=a.id;t.status=String(d.state);t.progress=typeof d.progress==='number'?d.progress:undefined;}
    if(['completed','failed','cancelled'].includes(String(d.state)))a.operation=undefined;
    return true;
  }
  if(e.type==='task.created'){return true;}
  if(e.type==='task.assigned'&&t){t.owner=String(d.target_agent_id??a.id);t.status='assigned';const target=state.agents[t.owner];if(target&&!target.queue.includes(t.id))target.queue.push(t.id);
    // An agent that never introduced itself but hands work to others is the coordinator: it gets the coordinator desk.
    if(!a.announced&&t.owner!==a.id&&!isManagerRole(a.role)){a.role='coordinator';assignDesk(state,a);}
  }
  if(e.type==='task.progress'&&t){if(typeof d.progress==='number'&&d.progress>=0&&d.progress<=1)t.progress=d.progress;return true;}
  if(e.type==='artifact.created'){
    if(t)t.artifact=String(d.name??'Document');
    const artifact:Artifact={id:String(d.artifact_id??e.event_id),version:Number(d.version??1),name:String(d.name??'Document'),content:String(d.content??''),taskId:e.task_id,agentId:a.id,parents:Array.isArray(d.parent_ids)?d.parent_ids.map(String):[]};
    state.artifacts[artifact.id+':'+artifact.version]=artifact;return true;
  }
  // Terminal events for an older operation cannot stop a newer concurrent operation.
  if(/\.(completed|failed)$/.test(e.type)&&e.operation_id&&a.operation&&e.operation_id!==a.operation&&!e.type.startsWith('task.'))return true;
  a.started=Date.parse(e.timestamp);a.metrics={...a.metrics,...d};
  if(d.model)a.model=String(d.model);
  if(typeof d.input_tokens==='number')a.context=d.input_tokens;
  // Each completed model call adds what it reported to the agent's running total. Producers may report input
  // tokens when the call starts and output tokens when it ends, so read the call's merged start+end metrics.
  if(e.type==='llm.completed'){
    const m=(e.operation_id&&state.operations[a.id+':'+e.operation_id]?.metrics)||d;
    if(typeof m.input_tokens==='number'||typeof m.output_tokens==='number'){
      const t=a.tokens??={input:0,output:0};
      t.input+=Number(m.input_tokens)||0;t.output+=Number(m.output_tokens)||0;
      if(typeof m.cache_read_tokens==='number')t.cacheRead=(t.cacheRead??0)+m.cache_read_tokens;
    }
  }
  if(e.task_id&&e.type!=='task.assigned')a.task=e.task_id;
  if(e.type.endsWith('.started')){a.operation=e.operation_id;a.error=undefined;}
  const statuses:Record<string,string>={'task.assigned':'Assigning','task.accepted':'Reading assignment','task.started':'Working','task.waiting':waitingLabel(d.reason),'task.completed':'Complete','task.cancelled':'Cancelled','llm.started':'Thinking','llm.completed':'Reading results','tool.call.started':'Using tool','tool.call.completed':'Collecting results','tool.queued':'Queued','tool.retry':'Retrying','message.sent':'Discussing','handoff.started':'Delivering folder','handoff.completed':'Received folder','review.started':'Reviewing','review.approved':'Approved','review.rejected':'Revise','human.requested':'Awaiting human approval','human.approved':'Human approved','human.rejected':'Human rejected'};
  if(e.type.endsWith('.failed')){a.status='Error';a.error=String(d.error??'Operation failed');}
  else if(statuses[e.type])a.status=statuses[e.type];
  if(e.type==='tool.call.started'||e.type==='tool.retry')a.tool=String(d.tool??'custom');
  if(t&&e.type.startsWith('task.')&&e.type!=='task.assigned'){t.status=e.type.slice(5);t.owner=a.id;}
  if(t&&e.type==='handoff.completed'){t.owner=String(d.target_agent_id??a.id);if(t.owner!==a.id)a.status='Idle';}
  if(t&&['task.accepted','task.started'].includes(e.type))a.queue=a.queue.filter(id=>id!==t!.id);
  if(t&&['task.completed','task.cancelled','task.failed'].includes(e.type)){for(const worker of Object.values(state.agents))worker.queue=worker.queue.filter(id=>id!==t!.id);a.operation=undefined;}
  if(e.type==='tool.call.completed'||e.type==='tool.call.failed')a.tool=undefined;
  if(e.operation_id&&e.type.endsWith('.completed')&&a.operation===e.operation_id){
    const remaining=Object.values(state.operations).filter(op=>op.agentId===a.id&&op.status==='started'&&op.kind!=='task').at(-1);
    if(remaining){a.operation=remaining.id;a.tool=remaining.tool;a.status=remaining.kind==='llm'?'Thinking':'Using tool';}
    else a.operation=undefined;
  }
  return true;
}
/** Free-text waiting reasons always keep the word Waiting so the badge, footer count and animation can rely on it. */
const waitingLabel=(reason:unknown)=>{const r=typeof reason==='string'?reason.trim():'';return !r?'Waiting for dependency':/^(waiting|blocked|awaiting|queued)\b/i.test(r)?r:'Waiting · '+r;};
export type Command = {eventId:string;agentId:string;priority:number;behavior:string;destination:Point;task?:string;target?:string;operation?:string;terminal:boolean;exit?:boolean;lobby?:boolean};
/** What a character does once its work is submitted: wait in the lobby (still available for questions) or leave. */
export type FinishMode='lobby'|'exit';
/** The office door on the back wall. Characters enter through it, and leave through it in `exit` mode. */
export const DOOR:Point={x:7,y:0};
/** Standing spots in the lobby beside the door, nearest first. The door lane (x = 7) stays clear. */
/** Idle agents that wait in the lobby at once. Past this, the earliest to arrive leave through the door first. */
export const LOBBY_CAPACITY=10;
const LOBBY_SPOTS:Point[]=[{x:6,y:.4},{x:8.2,y:.4},{x:5,y:.4},{x:9.2,y:.4},{x:5.6,y:1.1},{x:4,y:.4},{x:10.2,y:.4},{x:4.6,y:1.1},{x:10.6,y:1.2},{x:3,y:.4},{x:11.2,y:.4},{x:9.6,y:1.25}];
/** Gap between characters stepping through the door, so a group arriving together doesn't walk in stacked. */
const ENTRY_GAP_MS=700;
const TRAIL_POINTS=600,TRAIL_STOPS=40;
export function interpret(e:AOEvent,s:State):Command|undefined {
  if(!e.agent_id||e.type.startsWith('x.')||['agent.created','agent.updated','agent.removed','task.created','task.progress','artifact.created','resource.updated','tool.dequeued'].includes(e.type))return;
  const a=s.agents[e.agent_id]; if(!a)return;
  if(e.type.startsWith('question.')){
    const target=typeof e.data.target_agent_id==='string'?e.data.target_agent_id:undefined;
    const behavior=({'question.asked':'Question received','question.received':'Reading question','question.routed':'Routing question','question.answered':'Delivering answer','question.cancelled':'Question cancelled'} as Record<string,string>)[e.type];
    return {eventId:e.event_id,agentId:a.id,priority:e.type==='question.cancelled'?0:1,behavior,destination:target&&s.agents[target]?desk(target,s):desk(a.id,s),target,terminal:true};
  }
  if(e.operation_id&&a.operation&&e.operation_id!==a.operation&&/\.(completed|failed)$/.test(e.type)&&!e.type.startsWith('task.'))return;
  const tool=String(e.data.tool??a.tool??'').toLowerCase();
  let destination=desk(a.id,s),behavior=a.status,priority=2;
  if(/failed|cancelled|human\./.test(e.type)||e.type==='agent.progress'&&['waiting','blocked','failed','cancelled'].includes(String(e.data.state)))priority=0;
  else if(/handoff|task.assigned|task.completed|review\./.test(e.type))priority=1;
  if(e.type==='tool.call.started'||e.type==='tool.retry'||e.type==='tool.queued'){
    const key=stationFor(tool,e.data.station);
    destination=stations[key];behavior=e.type==='tool.queued'?'Queued':e.type==='tool.retry'?'Retrying':({research:'Searching',archive:'Reading archive',database:'Querying records',engineering:'Coding',compute:'Computing'}[key]??'Using tool');
  }
  const target=typeof e.data.target_agent_id==='string'?e.data.target_agent_id:undefined;
  if(/handoff|message.sent|task.assigned/.test(e.type)&&e.type!=='handoff.completed'&&target&&s.agents[target])destination=desk(target,s);
  if(e.type.startsWith('human.'))destination=stations.human;
  if(e.type==='message.sent'&&Array.isArray(e.data.participants)&&e.data.participants.length>2)destination=stations.meeting;
  return {eventId:e.event_id,agentId:a.id,priority,behavior,destination,task:e.type==='handoff.completed'&&target&&target!==a.id?undefined:e.task_id,target,operation:e.operation_id,terminal:/completed|failed|cancelled|approved|rejected/.test(e.type)||e.type==='agent.progress'&&['completed','failed','cancelled'].includes(String(e.data.state))};
}
// A* on a small office navigation grid. Furniture occupies blocked cells.
const blocked=new Set(['1,1','2,1','8,1','12,1','3,9','8,9','12,9','7,6']);
function nearestFree(wanted:Point,b:Bounds):Point{
  const p={x:Math.min(b.maxX,Math.max(0,wanted.x)),y:Math.min(b.maxY,Math.max(0,wanted.y))};
  for(let r=0;r<=Math.max(b.maxX,b.maxY);r++)for(let dx=-r;dx<=r;dx++)for(let dy=-r;dy<=r;dy++){
    if(Math.max(Math.abs(dx),Math.abs(dy))!==r)continue;
    const q={x:p.x+dx,y:p.y+dy};
    if(q.x>=0&&q.x<=b.maxX&&q.y>=0&&q.y<=b.maxY&&!blocked.has(`${q.x},${q.y}`))return q;
  }
  return p;
}
export function pathfind(from:Point,to:Point,bounds:Bounds={maxX:14,maxY:10}):Point[]{
  const start={x:Math.round(from.x),y:Math.round(from.y)},wanted={x:Math.round(to.x),y:Math.round(to.y)};
  // Approach slots can round onto furniture or off the floor; walk to the nearest free cell instead of silently not moving.
  const goal=blocked.has(`${wanted.x},${wanted.y}`)||wanted.x<0||wanted.x>bounds.maxX||wanted.y<0||wanted.y>bounds.maxY?nearestFree(wanted,bounds):wanted;
  const finish=goal===wanted?to:goal;
  const key=(p:Point)=>`${p.x},${p.y}`,h=(p:Point)=>Math.abs(p.x-goal.x)+Math.abs(p.y-goal.y);
  const open=[start],cost=new Map([[key(start),0]]),parent=new Map<string,Point>();
  while(open.length){open.sort((a,b)=>(cost.get(key(a))!+h(a))-(cost.get(key(b))!+h(b)));const p=open.shift()!;
    if(key(p)===key(goal)){const result=[goal];let cursor=p;while(parent.has(key(cursor))){cursor=parent.get(key(cursor))!;result.unshift(cursor);}return [...result.slice(1),finish];}
    for(const q of [{x:p.x+1,y:p.y},{x:p.x-1,y:p.y},{x:p.x,y:p.y+1},{x:p.x,y:p.y-1}]){
      if(q.x<0||q.x>bounds.maxX||q.y<0||q.y>bounds.maxY||blocked.has(key(q)))continue;
      const next=cost.get(key(p))!+1;if(next<(cost.get(key(q))??Infinity)){cost.set(key(q),next);parent.set(key(q),p);if(!open.some(n=>key(n)===key(q)))open.push(q);}
    }
  }return [];
}
export class CharacterController {
  facing=1; location:Point; destination:Point; path:Point[]=[];current?:Command;queue:Command[]=[];paused=false;elapsed=0;carriedObject?:string;phase='idle';bounds?:Bounds;
  /** Left through the door; comes back in when it is given new work. */
  away=false;
  /** Milliseconds left before this character steps through the door. */
  entering=0;
  /** Engine time it steps through the door; orders arrivals one after another. */
  enterAt=-Infinity;
  /** Resting in the lobby after finishing. */
  inLobby=false;
  /** Engine time it was sent to the lobby, which orders who leaves first once the lobby is full. */
  lobbySince?:number;
  get hidden(){return this.away||this.entering>0;}
  /** Where this character has walked, sampled about every quarter tile, newest last (capped). */
  trail:Point[]=[];
  /** Places it stopped after walking, with what it went there to do. */
  stops:{at:Point;behavior:string}[]=[];
  private record(){
    const last=this.trail.at(-1);
    if(!last||Math.hypot(last.x-this.location.x,last.y-this.location.y)>=.25){this.trail.push({...this.location});if(this.trail.length>TRAIL_POINTS)this.trail.shift();}
  }
  constructor(public id:string,position:Point){this.location={...position};this.destination={...position};this.trail.push({...position});}
  start(c:Command){this.away=false;this.inLobby=false;if(!c.lobby)this.lobbySince=undefined;this.current=c;this.destination=c.destination;this.path=pathfind(this.location,c.destination,this.bounds);this.elapsed=0;this.carriedObject=c.task;this.phase=this.path.length?'walking':'working';}
  schedule(c:Command){
    if(!this.current){this.start(c);return;}
    // Actual runtime state changes supersede presentation; P0 always interrupts.
    if(c.terminal&&c.priority!==0&&c.operation&&c.operation===this.current.operation&&this.elapsed<450){this.queue.push(c);return;}
    if(c.priority===0||c.terminal||c.priority<=this.current.priority||this.elapsed>=450){this.interrupt(c);}
    else this.queue.push(c);
  }
  interrupt(c:Command){this.cancel();this.start(c);}
  cancel(){this.queue=[];this.path=[];this.current=undefined;this.carriedObject=undefined;this.phase='idle';}
  pause(){this.paused=true;} resume(){this.paused=false;}
  complete(){this.current=undefined;this.phase='idle';const c=this.queue.shift();if(c)this.start(c);}
  update(ms:number){
    if(this.paused)return;
    if(this.entering>0){this.entering=Math.max(0,this.entering-ms);return;}
    this.elapsed+=ms;
    const next=this.path[0];if(next){const dx=next.x-this.location.x,dy=next.y-this.location.y,d=Math.hypot(dx,dy),step=ms*0.004;if(d<=step){this.location={...next};this.path.shift();}else{this.facing=dx-dy>=0?1:-1;this.location.x+=dx/d*step;this.location.y+=dy/d*step;}this.phase=this.path.length?'walking':'working';
      this.record();
      if(!this.path.length&&this.current){this.trail.push({...this.location});this.stops.push({at:{...this.location},behavior:this.current.behavior});if(this.stops.length>TRAIL_STOPS)this.stops.shift();}
    }
    if(this.current?.exit&&!this.path.length){this.location={...DOOR};this.away=true;this.complete();return;}
    if(this.current?.lobby&&!this.path.length)this.inLobby=true;
    if(this.queue.length&&this.elapsed>=450)this.start(this.queue.shift()!);
    // Finish only cosmetic terminal presentation, never invent a runtime completion.
    if(this.current?.terminal&&!this.path.length&&this.elapsed>=900)this.complete();
  }
}
/** Standing spots around a station, filled in arrival order. More arrivals than spots share spots instead of wandering off. */
const APPROACH_SLOTS:[number,number][]=[[0,0],[.5,0],[-.5,0],[0,.5],[.5,.5],[-.5,.5],[0,-.5],[.5,-.5],[-.5,-.5],[1,0],[-1,0],[0,1],[1,.5],[-1,.5],[0,-1],[1,-.5]];
/** Where a visitor stands at someone else's desk: beside it, never on the owner's seat. */
const VISITOR_SLOTS:[number,number][]=[[.75,-.55],[-.55,.75],[.95,.2],[.2,.95],[1,-1],[-1,1],[1.2,.6],[.6,1.2]];
/** Closer than this to another agent's seat counts as sitting at that agent's desk. */
const SEAT_RADIUS=.45;
/** How long a manager stands at a worker's desk after handing over a task the worker never acknowledges. */
const ASSIGN_HOLD_MS=2500;
const near=(a:Point,b:Point,r:number)=>Math.hypot(a.x-b.x,a.y-b.y)<r;
export class OfficeEngine {
  state=fresh();characters=new Map<string,CharacterController>();time=0;interactions:Interaction[]=[];reducedMotion=false;finishMode:FinishMode='lobby';
  /** Label shown for a character resting in the lobby. The local-agents floor calls it sleeping. */
  lobbyLabel?:string;
  reset(){this.state=fresh();this.characters.clear();this.time=0;this.interactions=[];}
  rows(){return floorRows(this.state);}
  /** The seat at every desk except `self`'s. */
  private otherSeats(self:string):Point[]{return Object.entries(this.state.desks).filter(([id])=>id!==self).map(([,slot])=>deskPoint(slot));}
  /** The first approach slot around `spot` that no other character stands on or is heading to, so two agents never
   *  render on the same point and hide each other. `taken` holds spots already handed out in the same batch.
   *  An agent's own seat is reserved for it, so it always works at its own desk; anyone visiting a desk stands beside it,
   *  and nobody is ever parked on another agent's seat, even while that agent is away. */
  freeSpot(spot:Point,self:string,taken:Point[]=[]):Point{
    const own=this.state.desks[self];
    if(own&&near(deskPoint(own),spot,.01))return {...spot};
    const seats=this.otherSeats(self);
    const slots=seats.some(s=>near(s,spot,.01))?VISITOR_SLOTS:APPROACH_SLOTS;
    const candidates=slots.map(([dx,dy])=>({x:spot.x+dx,y:spot.y+dy})).filter(p=>!seats.some(s=>near(s,p,SEAT_RADIUS)));
    return this.firstFree(candidates,self,taken)??candidates[0]??{...spot};
  }
  /** Sends a character back to its own seat. */
  private goHome(c:CharacterController,eventId:string){
    c.interrupt({eventId,agentId:c.id,priority:2,behavior:'Returning to desk',destination:this.freeSpot(desk(c.id,this.state),c.id),terminal:true});
  }
  private firstFree(candidates:Point[],self:string,taken:Point[]):Point|undefined{
    const occupied=[...this.characters.values()].filter(x=>x.id!==self&&!x.hidden).flatMap(x=>[x.location,x.destination,...x.queue.map(q=>q.destination)]).concat(taken);
    return candidates.find(p=>!occupied.some(o=>Math.hypot(o.x-p.x,o.y-p.y)<.35));
  }
  /** Has no queued task and no running operation, so it can leave its post. */
  private isDone(id:string){const a=this.state.agents[id];return !!a&&!a.queue.length&&!a.operation;}
  /** Sends a finished character to the lobby or out of the door. With `now` it goes straight away; otherwise it
   *  first finishes showing its current state. Returns the spot it was sent to. */
  private finish(id:string,eventId:string,taken:Point[]=[],now=false):Point|undefined{
    const c=this.characters.get(id);
    if(!c||c.away||c.current?.exit||c.current?.lobby||(c.inLobby&&!c.current))return;
    const exit=this.finishMode==='exit';
    const destination=exit?{...DOOR}:this.firstFree(LOBBY_SPOTS,id,taken)??{...LOBBY_SPOTS[taken.length%LOBBY_SPOTS.length]};
    const command:Command={eventId,agentId:id,priority:1,behavior:exit?'Leaving':'Heading to lobby',destination,terminal:true,exit,lobby:!exit};
    if(!exit)c.lobbySince??=this.time;
    if(now||!c.current)c.interrupt(command);else c.queue.push(command);
    return destination;
  }
  ingest(e:AOEvent){
    const seatBefore=e.agent_id&&this.state.desks[e.agent_id]?JSON.stringify(this.state.desks[e.agent_id]):undefined;
    if(!project(this.state,e))return;
    if(e.type==='agent.removed'&&e.agent_id)this.characters.delete(e.agent_id);
    const bounds=boundsFor(this.state);
    for(const a of Object.values(this.state.agents))if(!this.characters.has(a.id)){
      // New agents walk in through the door, one after another, to their desk.
      const c=new CharacterController(a.id,{...DOOR});
      // Queue only behind agents still in the office: a departed agent (e.g. history replayed at once on page load)
      // must not hold a turn, or new arrivals would wait unseen for minutes.
      const previous=Math.max(-Infinity,...[...this.characters.values()].map(x=>x.enterAt));
      c.entering=Math.max(0,previous+ENTRY_GAP_MS-this.time);c.enterAt=this.time+c.entering;
      c.bounds=bounds;
      c.start({eventId:e.event_id,agentId:a.id,priority:2,behavior:'Arriving',destination:this.freeSpot(desk(a.id,this.state),a.id),terminal:true});
      this.characters.set(a.id,c);
    }
    for(const c of this.characters.values())c.bounds=bounds;
    // A role change can move an agent to a different desk; one sitting at the old desk walks over to the new one.
    if(e.agent_id&&seatBefore&&this.state.desks[e.agent_id]&&JSON.stringify(this.state.desks[e.agent_id])!==seatBefore){
      const c=this.characters.get(e.agent_id);
      if(c&&!c.hidden&&!c.inLobby&&(!c.current||/Arriving|Returning to desk/.test(c.current.behavior)))this.goHome(c,e.event_id);
    }
    const senders:string[]=[];
    if(['task.accepted','handoff.completed'].includes(e.type)&&e.task_id){
      // The receiver is the agent that accepted the folder, or the target named by handoff.completed (sender or receiver may report it).
      const receiver=e.type==='handoff.completed'&&typeof e.data.target_agent_id==='string'?e.data.target_agent_id:e.agent_id;
      for(const sender of this.characters.values())if(sender.id!==receiver&&sender.carriedObject===e.task_id&&sender.current?.target===receiver){
        // Handing work on submits it, so the sender is finished; assigning work is delegation, so a manager goes back to its desk.
        const submitted=sender.current?.behavior==='Delivering folder'&&this.isDone(sender.id);
        this.state.agents[sender.id].status='Idle';
        if(submitted)senders.push(sender.id);
        else sender.interrupt({eventId:e.event_id,agentId:sender.id,priority:1,behavior:'Returning to desk',destination:this.freeSpot(desk(sender.id,this.state),sender.id),terminal:true});
      }
    }
    if(e.agent_id&&typeof e.data.target_agent_id==='string'&&/question.routed|question.answered|handoff.started|message.sent|task.assigned/.test(e.type)){
      this.interactions.push({id:e.event_id,from:e.agent_id,to:e.data.target_agent_id,kind:e.type,started:this.time,question:typeof e.data.question==='string'?e.data.question:undefined});
    }
    let commandEvent=e;
    const agent=e.agent_id?this.state.agents[e.agent_id]:undefined;
    if(e.type.endsWith('.completed')&&agent?.operation&&agent.operation!==e.operation_id){
      const op=this.state.operations[agent.id+':'+agent.operation];
      if(op)commandEvent={...e,type:op.kind+'.started',operation_id:op.id,data:{tool:op.tool}};
    }
    const c=interpret(commandEvent,this.state);if(c){
      if(/failed|cancelled/.test(e.type)||e.type==='agent.progress'&&['waiting','blocked','failed','cancelled'].includes(String(e.data.state)))c.destination={...this.characters.get(c.agentId)!.location};
      // Reserve distinct approach slots without inventing a telemetry queue. A failing agent stays where it is.
      if(!/failed|cancelled/.test(e.type))c.destination=this.freeSpot(c.destination,c.agentId);
      this.characters.get(c.agentId)?.schedule(c);
      if(e.type==='message.sent'&&Array.isArray(e.data.participants)){
        const taken=[c.destination];
        for(const id of e.data.participants){
          if(typeof id!=='string'||id===c.agentId)continue;
          const destination=this.freeSpot({x:stations.meeting.x+0.6,y:stations.meeting.y+0.6},id,taken);
          taken.push(destination);
          this.characters.get(id)?.schedule({...c,agentId:id,destination});
        }
      }
    }
    // Runs after this event's own command, which would otherwise pull the sender back to its desk.
    for(const id of senders)this.finish(id,e.event_id,[],true);
    if(e.agent_id&&(e.type==='task.completed'||e.type==='agent.progress'&&e.data.state==='completed')&&this.isDone(e.agent_id))this.finish(e.agent_id,e.event_id);
    if(/^run\.(completed|failed|cancelled)$/.test(e.type)){
      const taken:Point[]=[];
      for(const id of this.characters.keys()){const spot=this.finish(id,e.event_id,taken);if(spot)taken.push(spot);}
    }
  }
  update(ms:number){
    this.time+=ms;this.interactions=this.interactions.filter(i=>this.time-i.started<5000);
    for(const c of this.characters.values()){
      if(this.reducedMotion&&c.path.length){c.location={...c.destination};c.path=[];c.phase='working';}
      c.update(ms);
      // Gone through the door: free its desk for others. Its next piece of work assigns it one again.
      if(c.away&&this.state.desks[c.id])delete this.state.desks[c.id];
      if(c.hidden||c.inLobby||!this.state.desks[c.id])continue;
      // A delegation nobody acknowledged has been shown long enough: the manager goes back to its own desk.
      if(c.current?.behavior==='Assigning'&&!c.path.length&&c.elapsed>=ASSIGN_HOLD_MS){this.goHome(c,c.current.eventId);continue;}
      // Nothing left to show away from the desk (a finished visit, a station after its last call): walk back to it.
      if(!c.current&&!c.queue.length&&!near(c.location,desk(c.id,this.state),.05))this.goHome(c,'home:'+c.id);
    }
    if(this.finishMode==='lobby')this.makeRoomInLobby();
  }
  /** Keeps at most LOBBY_CAPACITY idle agents in the lobby: first in, first out through the door. Busy agents never leave. */
  private makeRoomInLobby(){
    const waiting=[...this.characters.values()].filter(c=>c.lobbySince!==undefined&&!c.hidden&&!c.current?.exit&&this.isDone(c.id))
      .sort((a,b)=>a.lobbySince!-b.lobbySince!||a.id.localeCompare(b.id));
    for(const c of waiting.slice(0,Math.max(0,waiting.length-LOBBY_CAPACITY)))
      c.interrupt({eventId:'lobby-full:'+c.id,agentId:c.id,priority:1,behavior:'Leaving · lobby full',destination:{...DOOR},terminal:true,exit:true});
  }
  replay(events:AOEvent[],until:number){this.reset();let previous=0;const base=events.length?Date.parse(events[0].timestamp):0;
    for(const e of events){const at=Math.max(previous,Date.parse(e.timestamp)-base);if(at>until)break;this.advance(at-previous);this.ingest(e);previous=at;}this.advance(until-previous);
  }
  advance(ms:number){while(ms>0){const step=Math.min(ms,50);this.update(step);ms-=step;}}
}

/** Run status for the floor heading. Apps that send run.* events set it; for the many that don't, it is read from
 *  the work itself, so a finished run doesn't keep saying "Waiting". */
export function runBadge(s:State):string{
  if(s.runStatus!=='Waiting'||!s.events.length)return s.runStatus;
  const tasks=Object.values(s.tasks);
  if(tasks.some(t=>!/completed|cancelled|failed/.test(t.status)))return 'Running';
  return tasks.length?'Tasks complete':'Idle';
}
