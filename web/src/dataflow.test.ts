import {describe,it,expect} from 'vitest';
import {OfficeEngine,AOEvent} from './engine';
import {buildGraph} from './Dataflow';
import {demoEvents} from './demo';

let seq=0;
const ev=(type:string,agent_id:string,data:Record<string,unknown>={},operation_id?:string):AOEvent=>({event_id:'d'+(++seq),seq,run_id:'r',type,agent_id,task_id:'t',data,operation_id,timestamp:new Date(seq*1000).toISOString()});

describe('dataflow graph',()=>{
 it('lays agents out in lanes along the handoff chain, starting from the managers',()=>{
  const x=new OfficeEngine();
  for(const [id,role] of [['boss','supervisor'],['a','worker'],['b','worker'],['idle','worker']])x.ingest(ev('agent.created',id,{name:id,role}));
  x.ingest(ev('task.assigned','boss',{target_agent_id:'a'}));
  x.ingest(ev('handoff.started','a',{target_agent_id:'b'}));
  const lane=Object.fromEntries(buildGraph(x.state).nodes.map(n=>[n.id,n.lane]));
  expect(lane).toMatchObject({boss:0,a:1,b:2});
  // An agent nobody has handed work to is not a lead.
  expect(lane.idle).toBe(1);
 });
 it('aggregates tool calls and failures per agent and tool',()=>{
  const x=new OfficeEngine();x.ingest(ev('agent.created','a',{name:'a',role:'worker'}));
  x.ingest(ev('tool.call.started','a',{tool:'web_search'},'o1'));x.ingest(ev('tool.call.completed','a',{},'o1'));
  x.ingest(ev('tool.call.started','a',{tool:'web_search'},'o2'));x.ingest(ev('tool.call.failed','a',{error:'x'},'o2'));
  const g=buildGraph(x.state);
  const edge=g.edges.find(e=>e.to==='tool:web_search')!;
  expect(edge.count).toBe(2);expect(edge.failed).toBe(1);
  expect(g.nodes.find(n=>n.id==='tool:web_search')?.sub).toBe('2 calls · 1 failed');
 });
 it('draws every transfer in the demo run',()=>{
  const x=new OfficeEngine();x.replay(demoEvents(),60000);
  const g=buildGraph(x.state);
  expect(g.edges.filter(e=>e.kind==='handoff').map(e=>`${e.from}>${e.to}`).sort()).toEqual(['analyst>writer','researcher>analyst','reviewer>manager','writer>reviewer']);
  expect(g.nodes.filter(n=>n.kind==='tool').map(n=>n.label).sort()).toEqual(['python','web_search']);
 });
});
