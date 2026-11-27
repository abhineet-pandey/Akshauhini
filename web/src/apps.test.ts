import {describe,expect,it} from 'vitest';
import {OfficeEngine,AOEvent,runBadge,autoName} from './engine';

const ev=(n:number,type:string,agent:string,data:Record<string,unknown>={},extra:Partial<AOEvent>={}):AOEvent=>
  ({event_id:`e${n}`,run_id:'r',seq:n,type,agent_id:agent,timestamp:new Date(1700000000000+n*1000).toISOString(),data,...extra} as AOEvent);

describe('apps with sparse telemetry',()=>{
  it('names an unannounced agent from a readable id, and a first name for an opaque one',()=>{
    expect(autoName('sentinel-coordinator',new Set())).toBe('Sentinel Coordinator');
    expect(autoName('web_researcher_2',new Set())).toBe('Web Researcher 2');
    expect(autoName('3cddcb22-9974-4c87-bfd6-c61ce92f41c9',new Set())).not.toMatch(/\d/);
  });
  it('seats an unannounced agent that assigns work at the coordinator desk',()=>{
    const e=new OfficeEngine();
    e.ingest(ev(1,'agent.created','worker-a',{name:'Analyst',role:'analyst'}));
    e.ingest(ev(2,'task.created','boss',{title:'Study'},{task_id:'t1'}));
    e.ingest(ev(3,'task.assigned','boss',{target_agent_id:'worker-a'},{task_id:'t1'}));
    expect(e.state.agents.boss.name).toBe('Boss');
    expect(e.state.agents.boss.role).toBe('coordinator');
    expect(e.state.desks.boss.manager).toBe(true);
  });
  it('keeps the role of an agent that introduced itself',()=>{
    const e=new OfficeEngine();
    e.ingest(ev(1,'agent.created','lead',{name:'Lead',role:'analyst'}));
    e.ingest(ev(2,'agent.created','b',{name:'B',role:'analyst'}));
    e.ingest(ev(3,'task.assigned','lead',{target_agent_id:'b'},{task_id:'t1'}));
    expect(e.state.agents.lead.role).toBe('analyst');
  });
  it('reads the run status from the work when the app sends no run events',()=>{
    const e=new OfficeEngine();
    expect(runBadge(e.state)).toBe('Waiting');
    e.ingest(ev(1,'agent.created','a',{name:'A'}));
    e.ingest(ev(2,'task.started','a',{title:'T'},{task_id:'t1'}));
    expect(runBadge(e.state)).toBe('Running');
    e.ingest(ev(3,'task.completed','a',{},{task_id:'t1'}));
    expect(runBadge(e.state)).toBe('Tasks complete');
    e.ingest({event_id:'r1',run_id:'r',seq:4,type:'run.failed',timestamp:new Date().toISOString(),data:{}} as AOEvent);
    expect(runBadge(e.state)).toBe('failed');
  });
});
