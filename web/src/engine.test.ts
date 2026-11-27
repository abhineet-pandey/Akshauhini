import {describe,it,expect} from 'vitest';
import {OfficeEngine,AOEvent,pathfind,CharacterController,stationFor,isManagerRole,desk,deskPoint,floorRows,stations,DOOR,activeStations} from './engine';
import {demoEvents} from './demo';
const e=(seq:number,type:string,data:Record<string,unknown>={},operation_id?:string):AOEvent=>({seq,event_id:String(seq),run_id:'r',agent_id:'a',task_id:'t',type,data,operation_id,timestamp:new Date(seq*1000).toISOString()});
describe('honest state and behavior',()=>{
 it('deduplicates and never manufactures progress',()=>{const x=new OfficeEngine();x.ingest(e(1,'llm.started'));x.ingest(e(1,'llm.started'));x.update(30000);expect(x.state.events).toHaveLength(1);expect(x.state.tasks.t.progress).toBeUndefined();expect(x.state.agents.a.status).toBe('Thinking');});
 it('interrupts travel on failure and ignores stale operation completion',()=>{const x=new OfficeEngine();x.ingest(e(1,'tool.call.started',{tool:'web_search'},'one'));x.ingest(e(2,'tool.call.started',{tool:'python'},'two'));x.ingest(e(3,'tool.call.completed',{},'one'));expect(x.state.agents.a.status).toBe('Using tool');x.ingest(e(4,'tool.call.failed',{error:'API error'},'two'));expect(x.characters.get('a')?.current?.priority).toBe(0);expect(x.state.agents.a.error).toBe('API error');});
 it('replays the same state and positions after seeking backwards',()=>{const events=demoEvents(),x=new OfficeEngine();x.replay(events,32000);const state=JSON.stringify(x.state),positions=JSON.stringify([...x.characters].map(([id,c])=>[id,c.location]));x.replay(events,55000);x.replay(events,32000);expect(JSON.stringify(x.state)).toBe(state);expect(JSON.stringify([...x.characters].map(([id,c])=>[id,c.location]))).toBe(positions);});
 it('keeps real task ownership and reported progress',()=>{const x=new OfficeEngine();x.ingest(e(1,'task.started'));x.ingest(e(2,'task.progress',{progress:.4}));expect(x.state.tasks.t.progress).toBe(.4);x.ingest(e(3,'handoff.completed',{target_agent_id:'b'}));expect(x.state.tasks.t.owner).toBe('b');});
 it('holds brief successful operations visibly but errors interrupt immediately',()=>{const x=new OfficeEngine();x.ingest(e(1,'tool.call.started',{tool:'web_search'},'one'));x.update(27);x.ingest(e(2,'tool.call.completed',{duration_ms:27},'one'));expect(x.characters.get('a')?.current?.behavior).toBe('Searching');expect(x.state.agents.a.status).toBe('Collecting results');x.update(450);expect(x.characters.get('a')?.current?.behavior).toBe('Collecting results');});
 it('returns a sender after the receiving agent accepts the folder',()=>{const x=new OfficeEngine();x.ingest({...e(1,'agent.created'),agent_id:'b'});x.ingest(e(2,'task.assigned',{target_agent_id:'b'}));x.ingest({...e(3,'task.accepted'),agent_id:'b'});expect(x.characters.get('a')?.carriedObject).toBeUndefined();expect(x.characters.get('a')?.current?.behavior).toBe('Returning to desk');});
 it('navigates around furniture and supports pause/resume/cancel',()=>{const path=pathfind({x:0,y:1},{x:3,y:1});expect(path.length).toBeGreaterThan(3);expect(path).not.toContainEqual({x:1,y:1});const c=new CharacterController('a',{x:0,y:1});c.start({agentId:'a',eventId:'e',priority:2,behavior:'Searching',destination:{x:3,y:1},terminal:false});c.pause();c.update(100);expect(c.location).toEqual({x:0,y:1});c.resume();c.update(100);expect(c.location).not.toEqual({x:0,y:1});c.cancel();expect(c.path).toHaveLength(0);});
});

describe('connected app progress',()=>{
 it('assigns stable, distinct names to agents that report none and keeps reported names',()=>{
  const names=(ids:string[])=>{const x=new OfficeEngine();for(const [i,id] of ids.entries())x.ingest({...e(i+1,'agent.created',{role:'worker'}),agent_id:id});return ids.map(id=>x.state.agents[id].name);};
  const [first,second]=names(['researcher-1','researcher-2']);
  expect(first).not.toBe('researcher-1');
  expect(first).not.toBe(second);
  expect(names(['researcher-1'])[0]).toBe(first);
  const x=new OfficeEngine();x.ingest({...e(1,'agent.created',{name:'Reported',role:'worker'}),agent_id:'reviewer'});x.ingest({...e(2,'agent.updated',{name:'Dana Lee'}),agent_id:'reviewer'});
  expect(x.state.agents['reviewer'].name).toBe('Dana Lee');
});
it('creates arbitrary agents, updates their metadata and removes them',()=>{const x=new OfficeEngine();x.ingest({...e(1,'agent.created',{name:'Custom Verifier',role:'critic',department:'Checks'}),agent_id:'external-78'});expect([...x.characters.keys()]).toEqual(['external-78']);x.ingest({...e(2,'agent.updated',{name:'Renamed'}),agent_id:'external-78'});expect(x.state.agents['external-78'].role).toBe('critic');x.ingest({...e(3,'agent.removed'),agent_id:'external-78'});expect(x.characters.size).toBe(0);});
 it('reflects completed work and waiting dependencies without inventing progress',()=>{const x=new OfficeEngine();x.ingest(e(1,'agent.progress',{state:'working',summary:'Two of five',completed_items:['A','B'],waiting_for:[],next_steps:['C'],completed_units:2,total_units:5,progress:.4}));expect(x.state.tasks.t.progress).toBe(.4);x.ingest(e(2,'agent.progress',{state:'blocked',summary:'Need access',completed_items:['A','B'],waiting_for:['Credentials'],next_steps:['Resume'],progress:null}));expect(x.state.agents.a.status).toBe('Blocked');expect(x.state.agents.a.report?.waiting_for).toEqual(['Credentials']);expect(x.state.tasks.t.progress).toBeUndefined();expect(x.characters.get('a')?.current?.priority).toBe(0);});
});

describe('observability gaps',()=>{
 it('tracks concurrent operations and resumes the one still executing',()=>{const x=new OfficeEngine();x.ingest(e(1,'tool.call.started',{tool:'web_search'},'one'));x.ingest(e(2,'llm.started',{},'two'));x.ingest(e(3,'llm.completed',{duration_ms:20},'two'));expect(x.state.operations['a:two'].status).toBe('completed');expect(x.state.operations['a:one'].status).toBe('started');expect(x.state.agents.a.operation).toBe('one');expect(x.characters.get('a')?.current?.behavior).toBe('Searching');});
 it('records actual queue capacity and artifact lineage',()=>{const x=new OfficeEngine();x.ingest(e(1,'tool.queued',{tool:'archive',capacity:1,active_agents:['b'],waiting_agents:['a']}));expect(x.state.resources.archive.waiting).toEqual(['a']);x.ingest(e(2,'artifact.created',{artifact_id:'report',name:'Report',content:'Exact output',version:2,parent_ids:['source']}));expect(x.state.artifacts['report:2'].content).toBe('Exact output');expect(x.state.artifacts['report:2'].parents).toEqual(['source']);});
 it('animates actual question routing without changing computational progress',()=>{const x=new OfficeEngine();x.ingest(e(1,'agent.created'));x.ingest({...e(2,'agent.created'),agent_id:'b'});x.ingest(e(3,'question.routed',{target_agent_id:'b',question_id:'q'}));expect(x.interactions[0].to).toBe('b');expect(x.state.agents.a.status).toBe('Idle');expect(x.characters.get('a')?.current?.behavior).toBe('Routing question');});
});


describe('other multi-agent systems',()=>{
 const agent=(seq:number,id:string,role='worker',extra:Record<string,unknown>={})=>({...e(seq,'agent.created',{name:id,role,...extra}),agent_id:id});
 const iso=(p:{x:number;y:number})=>({x:(p.x-p.y)*37,y:(p.x+p.y)*20});
 const team=(n:number,role=(i:number)=>'worker')=>{const x=new OfficeEngine();for(let i=0;i<n;i++)x.ingest(agent(i+1,'w'+i,role(i)));return x;};

 it('sends real-world tool names to the right station and never matches inside other words',()=>{
  const cases:Record<string,string>={web_search:'research',tavily_search:'research',browser:'research',fetch_url:'research',
   vector_search:'archive',rag_search:'archive',semantic_search:'archive',document_search:'archive',retrieve_docs:'archive',pinecone_query:'archive',file_search:'archive',
   sql_query:'database',execute_sql:'database',postgres:'database',
   python_repl:'engineering',code_interpreter:'engineering',bash:'engineering',github_api:'engineering',grep_search:'engineering',PythonREPLTool:'engineering',
   send_email:'compute',calculator:'compute',slack_post:'compute',
   average_calc:'compute',decode_jwt:'compute',executive_summary:'compute',storage_put:'compute',fragment_merge:'compute'};
  for(const [tool,station] of Object.entries(cases))expect(stationFor(tool),tool).toBe(station);
 });
 it('lets the producer decide the station and drives the walk from it',()=>{
  expect(stationFor('send_email','database')).toBe('database');
  expect(stationFor('send_email','not-a-station')).toBe('compute');
  const x=team(1);x.ingest({...e(10,'tool.call.started',{tool:'send_email',station:'archive'},'op'),agent_id:'w0'});
  expect(x.characters.get('w0')?.current?.destination.x).toBeCloseTo(stations.archive.x,0);
 });
 it('treats supervisor, orchestrator, coordinator and team lead as the manager in every place',()=>{
  for(const role of ['manager','Manager','supervisor','orchestrator','Coordinator','team_lead','TeamLead','tech lead','ManagerAgent'])expect(isManagerRole(role),role).toBe(true);
  for(const role of ['worker','researcher','planner','router','reviewer','management-consultant','lead_generation',''])expect(isManagerRole(role),role).toBe(false);
  const x=team(3,i=>i===0?'supervisor':'worker');
  expect(desk('w0',x.state)).toEqual(deskPoint({manager:true,index:0}));
 });
 it('gives several managers different desks',()=>{
  const x=team(4,()=>'manager');const seats=new Set(Object.keys(x.state.agents).map(id=>JSON.stringify(desk(id,x.state))));
  expect(seats.size).toBe(4);
 });
 it('seats any team size on distinct, on-floor desks that never move when others leave',()=>{
  for(const n of [1,6,12,40,100]){
   const x=team(n);const points=Object.keys(x.state.agents).map(id=>desk(id,x.state));
   expect(new Set(points.map(p=>JSON.stringify(p))).size,'distinct desks for '+n).toBe(n);
   for(const p of points){expect(p.x).toBeGreaterThanOrEqual(0);expect(p.x).toBeLessThanOrEqual(14);expect(Math.round(p.y)).toBeLessThanOrEqual(floorRows(x.state)-1);}
   let closest=Infinity;for(let i=0;i<points.length;i++)for(let j=i+1;j<points.length;j++){const a=iso(points[i]),b=iso(points[j]);closest=Math.min(closest,Math.hypot(a.x-b.x,a.y-b.y));}
   if(n>1)expect(closest,'closest pair for '+n).toBeGreaterThan(60);
  }
  const x=team(4);const before=desk('w2',x.state);x.ingest({...e(50,'agent.removed'),agent_id:'w1'});
  expect(desk('w2',x.state)).toEqual(before);
  x.ingest(agent(51,'late'));expect(desk('late',x.state)).toEqual(deskPoint({manager:false,index:1}));
 });
 it('extends the floor only when the team outgrows the fixed office',()=>{
  expect(floorRows(team(5).state)).toBe(11);
  expect(floorRows(team(12).state)).toBeGreaterThan(11);
  expect(floorRows(team(30).state)).toBeGreaterThan(floorRows(team(12).state));
 });
 it('never parks two agents on the same spot, so none hides behind another',()=>{
  const events=demoEvents(),x=new OfficeEngine(),base=Date.parse(events[0].timestamp);
  const end=Date.parse(events.at(-1)!.timestamp)-base+3000;let i=0,previous=0;
  for(let t=0;t<=end;t+=50){
   while(i<events.length){const at=Math.max(previous,Date.parse(events[i].timestamp)-base);if(at>t)break;x.advance(at-previous);x.ingest(events[i]);previous=at;i++;}
   x.advance(t-previous);previous=t;
   const parked=[...x.characters.values()].filter(c=>c.phase!=='walking'&&!c.hidden);
   for(let a=0;a<parked.length;a++)for(let b=a+1;b<parked.length;b++)
    expect(Math.hypot(parked[a].location.x-parked[b].location.x,parked[a].location.y-parked[b].location.y),`${parked[a].id}+${parked[b].id} at ${t}ms`).toBeGreaterThan(.25);
  }
 });
 it('walks new agents in through the door, one at a time, to their desks',()=>{
  const x=new OfficeEngine();x.ingest(agent(1,'a'));x.ingest(agent(2,'b'));
  const a=x.characters.get('a')!,b=x.characters.get('b')!;
  expect(a.location).toEqual(DOOR);expect(b.location).toEqual(DOOR);expect(b.hidden).toBe(true);
  x.advance(30000);
  for(const id of ['a','b']){const home=desk(id,x.state),at=x.characters.get(id)!.location;expect(Math.hypot(home.x-at.x,home.y-at.y)).toBeLessThan(.8);}
 });
 it('sends an agent that completes its task to the lobby, and back to work from there',()=>{
  const x=new OfficeEngine();x.ingest(agent(1,'a'));x.advance(20000);
  x.ingest({...e(2,'task.started'),agent_id:'a'});x.advance(5000);
  x.ingest({...e(3,'task.completed'),agent_id:'a'});x.advance(20000);
  const c=x.characters.get('a')!;expect(c.inLobby).toBe(true);expect(c.hidden).toBe(false);
  expect(Math.hypot(c.location.x-DOOR.x,c.location.y-DOOR.y)).toBeLessThan(2.5);
  x.ingest({...e(4,'tool.call.started',{tool:'web_search'},'op'),agent_id:'a'});expect(c.inLobby).toBe(false);expect(c.current?.behavior).toBe('Searching');
 });
 it('lets a new agent in promptly even after a long history of agents who came and left',()=>{
  // Opening the page replays all stored events at once; departed agents must not hold turns at the door.
  const x=new OfficeEngine();
  for(let i=0;i<400;i++){x.ingest(agent(2*i+1,'old'+i));x.ingest({...e(2*i+2,'agent.removed'),agent_id:'old'+i});}
  x.advance(1000);x.ingest(agent(5000,'fresh'));
  const c=x.characters.get('fresh')!;expect(c.entering).toBeLessThanOrEqual(700);
  x.advance(1000);expect(c.hidden).toBe(false);
 });
 it('keeps up to 10 idle agents in the lobby, then the earliest to arrive leave through the door first',()=>{
  const x=new OfficeEngine();for(let i=0;i<13;i++)x.ingest(agent(i+1,'w'+i));x.advance(30000);
  // w12 stays busy the whole time; the others finish one after another, w0 first.
  x.ingest({...e(100,'tool.call.started',{tool:'web_search'},'busy'),agent_id:'w12'});
  for(let i=0;i<12;i++){x.ingest({...e(200+i,'task.completed'),agent_id:'w'+i,task_id:'t'+i});x.advance(1000);}
  x.advance(30000);
  const c=(id:string)=>x.characters.get(id)!;
  expect(c('w0').away).toBe(true);expect(c('w1').away).toBe(true);
  for(let i=2;i<12;i++){expect(c('w'+i).inLobby,'w'+i).toBe(true);expect(c('w'+i).hidden,'w'+i).toBe(false);}
  expect(c('w12').away).toBe(false);expect(c('w12').inLobby).toBe(false);
  // One leaving the lobby for new work makes room, so nobody else is sent out.
  x.ingest({...e(300,'tool.call.started',{tool:'web_search'},'again'),agent_id:'w5'});x.advance(30000);
  expect(c('w5').inLobby).toBe(false);expect(c('w2').inLobby).toBe(true);
  // The next agent to finish fills the lobby again, so the earliest one still waiting (w2) leaves.
  x.ingest({...e(301,'task.completed'),agent_id:'w12',task_id:'t12'});x.advance(30000);
  expect(c('w12').inLobby).toBe(true);expect(c('w2').inLobby).toBe(true);
  x.ingest({...e(302,'tool.call.completed',{},'again'),agent_id:'w5'});x.ingest({...e(303,'task.completed'),agent_id:'w5',task_id:'t5b'});x.advance(30000);
  expect(c('w2').away).toBe(true);expect(c('w3').inLobby).toBe(true);expect(c('w5').inLobby).toBe(true);
 });
 it('in exit mode, walks a finished agent out of the door and back in for new work',()=>{
  const x=new OfficeEngine();x.finishMode='exit';x.ingest(agent(1,'a'));x.advance(20000);
  x.ingest({...e(2,'task.completed'),agent_id:'a'});x.advance(20000);
  const c=x.characters.get('a')!;expect(c.away).toBe(true);expect(c.hidden).toBe(true);
  x.ingest({...e(3,'tool.call.started',{tool:'web_search'},'op'),agent_id:'a'});
  expect(c.hidden).toBe(false);expect(c.location).toEqual(DOOR);expect(c.phase).toBe('walking');
 });
 it('frees the desk of an agent that left through the door, and gives it one again when it returns to work',()=>{
  const x=new OfficeEngine();x.finishMode='exit';x.ingest(agent(1,'a'));x.ingest(agent(2,'b'));x.advance(20000);
  expect(x.state.desks.a).toBeDefined();
  x.ingest({...e(3,'task.completed'),agent_id:'a'});x.advance(20000);
  expect(x.characters.get('a')!.away).toBe(true);expect(x.state.desks.a).toBeUndefined();expect(x.state.desks.b).toBeDefined();
  // A question alone does not bring it back or reserve an empty desk.
  x.ingest({...e(4,'question.asked',{question_id:'q',question:'what did you do?'}),agent_id:'a'});x.advance(1000);
  expect(x.state.desks.a).toBeUndefined();
  x.ingest({...e(5,'tool.call.started',{tool:'web_search'},'op'),agent_id:'a'});
  expect(x.state.desks.a).toBeDefined();expect(x.characters.get('a')!.hidden).toBe(false);
 });
 it('keeps a manager who delegated work, and anyone still busy, at their post',()=>{
  const x=new OfficeEngine();x.ingest(agent(1,'a'));x.ingest(agent(2,'b'));x.advance(20000);
  x.ingest(e(3,'task.assigned',{target_agent_id:'b'}));x.ingest({...e(4,'task.accepted'),agent_id:'b'});
  expect(x.characters.get('a')!.current?.behavior).toBe('Returning to desk');
  x.ingest({...e(5,'task.assigned',{target_agent_id:'b'}),task_id:'other'});
  x.ingest({...e(6,'task.completed'),agent_id:'b'});x.advance(20000);
  expect(x.characters.get('b')!.inLobby).toBe(false);
 });
 it('always walks to a reachable cell, even when the approach slot lands on furniture',()=>{
  const onFurniture=pathfind({x:8,y:5},{x:8,y:8.96});
  expect(onFurniture.length).toBeGreaterThan(0);
  expect(onFurniture.at(-1)).not.toEqual({x:8,y:8.96});
  expect(pathfind({x:2,y:4},{x:3,y:9}).length).toBeGreaterThan(0);
  expect(pathfind({x:2,y:4},{x:30,y:4}).length).toBeGreaterThan(0);
  const x=team(10);for(let i=0;i<10;i++)x.ingest({...e(100+i,'tool.call.started',{tool:'sql_query'},'op'+i),agent_id:'w'+i});
  for(let i=0;i<10;i++){const c=x.characters.get('w'+i)!;expect(c.phase,'w'+i+' should be walking to the database').toBe('walking');}
 });
 it('keeps a free-text waiting reason recognisable as waiting',()=>{
  const x=team(1);x.ingest({...e(20,'task.waiting',{reason:'planner output'}),agent_id:'w0'});
  expect(x.state.agents.w0.status).toBe('Waiting · planner output');
  expect(x.state.agents.w0.status).toMatch(/Waiting|Blocked|Awaiting|Queued/);
  x.ingest({...e(21,'task.waiting',{reason:'Waiting for review'}),agent_id:'w0'});expect(x.state.agents.w0.status).toBe('Waiting for review');
  x.ingest({...e(22,'task.waiting'),agent_id:'w0'});expect(x.state.agents.w0.status).toBe('Waiting for dependency');
 });
 it('accepts handoff.completed from the sender as well as from the receiver',()=>{
  const bySender=new OfficeEngine();bySender.ingest(agent(1,'a'));bySender.ingest(agent(2,'b'));
  bySender.ingest({...e(3,'handoff.started',{target_agent_id:'b'}),agent_id:'a'});bySender.advance(20000);
  bySender.ingest({...e(4,'handoff.completed',{target_agent_id:'b'}),agent_id:'a'});
  expect(bySender.state.tasks.t.owner).toBe('b');
  expect(bySender.state.agents.a.status).toBe('Idle');
  expect(bySender.characters.get('a')?.carriedObject).toBeUndefined();
  bySender.advance(30000);
  // Handing the folder on submits the sender's work, so it waits in the lobby by the door.
  const sender=bySender.characters.get('a')!;expect(sender.inLobby).toBe(true);expect(Math.hypot(sender.location.x-DOOR.x,sender.location.y-DOOR.y)).toBeLessThan(2.5);
  const byReceiver=new OfficeEngine();byReceiver.ingest(agent(1,'a'));byReceiver.ingest(agent(2,'b'));
  byReceiver.ingest({...e(3,'handoff.started',{target_agent_id:'b'}),agent_id:'a'});byReceiver.advance(20000);
  byReceiver.ingest({...e(4,'handoff.completed',{target_agent_id:'b'}),agent_id:'b'});
  expect(byReceiver.state.tasks.t.owner).toBe('b');expect(byReceiver.state.agents.b.status).toBe('Received folder');
  expect(byReceiver.characters.get('a')?.carriedObject).toBeUndefined();
 });
 it('keeps producer-defined x.* events in the stream without touching agent or task state',()=>{
  const x=team(1);const before=JSON.stringify([x.state.agents.w0.status,x.state.tasks]),command=x.characters.get('w0')?.current;
  x.ingest({...e(30,'x.crewai.step_finished',{step:3,status:'Working'}),agent_id:'w0'});
  expect(x.state.events.at(-1)?.type).toBe('x.crewai.step_finished');
  expect(JSON.stringify([x.state.agents.w0.status,x.state.tasks])).toBe(before);
  expect(x.characters.get('w0')?.current).toBe(command);
 });
 it('works only at its own desk, and visitors never take the owner\'s seat',()=>{
  // A supervisor that never sees task.accepted: it used to stay on the last worker's seat, pushing the worker aside.
  const x=new OfficeEngine();x.ingest(agent(1,'sup','supervisor'));for(let i=0;i<8;i++)x.ingest(agent(2+i,'w'+i));x.advance(30000);
  for(let i=0;i<8;i++){x.ingest({...e(20+i,'task.assigned',{target_agent_id:'w'+i}),agent_id:'sup',task_id:'t'+i});x.advance(3000);}
  for(let i=0;i<8;i++)x.ingest({...e(40+i,'llm.started',{},'l'+i),agent_id:'w'+i,task_id:'t'+i});
  x.advance(30000);
  for(const id of ['sup',...Array.from({length:8},(_,i)=>'w'+i)]){
   const c=x.characters.get(id)!,home=desk(id,x.state);
   expect(Math.hypot(c.location.x-home.x,c.location.y-home.y),id+' at its own desk').toBeLessThan(.01);
  }
 });
 it('stands a visitor beside an empty desk, not on its seat',()=>{
  const x=new OfficeEngine();x.ingest(agent(1,'a'));x.ingest(agent(2,'b'));x.advance(30000);
  x.ingest({...e(3,'tool.call.started',{tool:'web_search'},'op'),agent_id:'b'});
  x.ingest({...e(4,'handoff.started',{target_agent_id:'b'}),agent_id:'a'});x.advance(30000);
  const at=x.characters.get('a')!.location,seat=desk('b',x.state);
  expect(Math.hypot(at.x-seat.x,at.y-seat.y)).toBeGreaterThan(.45);
  expect(Math.hypot(at.x-seat.x,at.y-seat.y)).toBeLessThan(1.6);
 });
 it('never puts a desk on a station',()=>{
  const x=team(30,i=>i<6?'manager':'worker');
  for(const id of Object.keys(x.state.agents))for(const [key,p] of Object.entries(stations)){
   if(key==='desk'||key==='manager')continue;
   // On screen, not just on the grid: a desk one diagonal step from a station is drawn on top of it.
   const d=iso(desk(id,x.state)),s=iso(p);expect(Math.hypot(d.x-s.x,(d.y-s.y)*1.6),id+' vs '+key).toBeGreaterThan(90);
  }
 });
 it('walks back to its desk after a station visit is over',()=>{
  const x=new OfficeEngine();x.ingest(agent(1,'a'));x.advance(20000);
  x.ingest({...e(2,'tool.call.started',{tool:'web_search'},'op'),agent_id:'a'});x.advance(20000);
  x.ingest({...e(3,'tool.call.failed',{error:'boom'},'op'),agent_id:'a'});x.advance(30000);
  const c=x.characters.get('a')!,home=desk('a',x.state);
  expect(Math.hypot(c.location.x-home.x,c.location.y-home.y)).toBeLessThan(.01);
 });
 it('records the path each agent walks and where it stopped',()=>{
  const x=new OfficeEngine();x.ingest(agent(1,'a'));x.advance(20000);
  x.ingest({...e(2,'tool.call.started',{tool:'web_search'},'op'),agent_id:'a'});x.advance(20000);
  const c=x.characters.get('a')!;expect(c.trail[0]).toEqual(DOOR);
  expect(c.trail.length).toBeGreaterThan(8);
  expect(c.stops.map(s=>s.behavior)).toEqual(['Arriving','Searching']);
  const end=c.trail.at(-1)!;expect(Math.hypot(end.x-c.location.x,end.y-c.location.y)).toBeLessThan(.01);
 });
});

describe('dynamic floor',()=>{
 it('shows no stations for a run that has not used any',()=>{
  const x=new OfficeEngine();x.ingest({...e(1,'agent.created',{role:'reviewer'}),agent_id:'r'});
  expect(activeStations(x.state)).toEqual([]);
 });
 it('adds each station the first time the run sends someone there, and an operations desk for a manager',()=>{
  const x=new OfficeEngine();
  x.ingest({...e(1,'agent.created',{role:'manager'}),agent_id:'m'});
  expect(activeStations(x.state)).toEqual(['manager']);
  x.ingest(e(2,'tool.call.started',{tool:'document_parser'},'p'));
  x.ingest(e(3,'tool.call.started',{tool:'heuristic_check'},'h'));
  x.ingest(e(4,'human.requested'));
  x.ingest(e(5,'message.sent',{participants:['a','m','r']}));
  expect(activeStations(x.state)).toEqual(['manager','archive','compute','human','meeting']);
  expect(activeStations(x.state)).not.toContain('research');
 });
 it('starts empty again for the next run',()=>{
  const x=new OfficeEngine();x.ingest(e(1,'tool.call.started',{tool:'web_search'},'w'));
  expect(activeStations(x.state)).toEqual(['research']);
  x.reset();expect(activeStations(x.state)).toEqual([]);
 });
});
