import {describe,expect,it} from 'vitest';
import {OfficeEngine,AOEvent} from './engine';
import {usageLines} from './usage';

const ev=(n:number,type:string,data:Record<string,unknown>={},extra:Partial<AOEvent>={}):AOEvent=>
  ({event_id:`e${n}`,run_id:'r',seq:n,type,agent_id:'a',timestamp:new Date(1700000000000+n*1000).toISOString(),data,...extra} as AOEvent);

describe('token usage',()=>{
  it('sums tokens reported by completed model calls',()=>{
    const e=new OfficeEngine();
    e.ingest(ev(1,'agent.created',{name:'Ada',role:'researcher'}));
    e.ingest(ev(2,'llm.started',{model:'m'},{operation_id:'o1'}));
    e.ingest(ev(3,'llm.completed',{input_tokens:1200,output_tokens:300},{operation_id:'o1'}));
    e.ingest(ev(4,'llm.started',{},{operation_id:'o2'}));
    e.ingest(ev(5,'llm.completed',{input_tokens:800,output_tokens:200},{operation_id:'o2'}));
    expect(e.state.agents.a.tokens).toEqual({input:2000,output:500});
    expect(usageLines(e.state.agents.a)[0]).toBe('2.0k in · 500 out');
  });
  it('takes running totals from x.usage without changing work state',()=>{
    const e=new OfficeEngine();
    e.ingest(ev(1,'agent.created',{name:'Ada'}));
    const status=e.state.agents.a.status;
    e.ingest(ev(2,'x.usage',{input:5_400_000,output:12_000,cache_read:3_000_000,cache_write:0}));
    expect(e.state.agents.a.status).toBe(status);
    expect(usageLines(e.state.agents.a).slice(0,2)).toEqual(['5.4M in · 12k out','of input: 3.0M cache read · 0 cache write']);
  });
  it('says so when nothing was reported',()=>{
    const e=new OfficeEngine();
    e.ingest(ev(1,'agent.created',{name:'Ada'}));
    expect(usageLines(e.state.agents.a)).toEqual(['No token usage reported']);
  });
});

describe('token usage split across a call',()=>{
  it('pairs input reported at start with output reported at the end',()=>{
    const e=new OfficeEngine();
    e.ingest(ev(1,'agent.created',{name:'Ada'}));
    e.ingest(ev(2,'llm.started',{input_tokens:7200},{operation_id:'o1'}));
    e.ingest(ev(3,'llm.completed',{output_tokens:2100},{operation_id:'o1'}));
    expect(e.state.agents.a.tokens).toEqual({input:7200,output:2100});
  });
});
