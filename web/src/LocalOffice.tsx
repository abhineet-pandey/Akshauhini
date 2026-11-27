import React,{useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {Office} from './Office';
import {FlatOffice} from './FlatOffice';
import {Dataflow} from './Dataflow';
import {AOEvent,DOOR,OfficeEngine,desk} from './engine';
import {Theme,isFlatTheme,FinishMode} from './theme';
import {ProgressDetails} from './AgentQuestions';
import {Answer,AskLocal,AskRequest,Detail,DetailTab,LlmUsage,LocalAgent,LocalAgents,SessionDetail,get} from './LocalAgents';
import {IconChat,IconChevronLeft,IconChevronRight,IconCrosshair,IconFit,IconFolder} from './Icons';
import {fillViewport} from './layout';
import {CollapseTeam,TeamRail,useTeamCollapsed} from './teamRail';
import {usageTitle} from './usage';

/**
 * Local agents on the same office floor as connected apps. Each recent Claude Code / Codex / Gemini CLI
 * session is one character; its department is the agent product, its role the project folder. Every movement comes
 * from a real transcript entry (served by /api/local-agents/office): a tool call walks to the station for that kind
 * of tool, a model turn is thinking at the desk, a user request is a task folder. Questions go to a local model.
 */
type Meta={local_agent:string;session:string;title:string;path:string};
const WINDOWS:[number,string][]=[[1,'Last hour'],[24,'Last 24 hours'],[24*7,'Last 7 days'],[24*30,'Last 30 days']];
const BUSY=/Thinking|Working|Using tool|Searching|Coding|Reading|Querying|Computing|Collecting/;
/** The local LLM character at the Q&A desk. */
const QA='local-qa-desk';
const REPLIES=['Checking my transcript…','Here is what I ran…','These files changed…','Looking at earlier steps…'];
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function waitUntil(ready:()=>boolean,timeout:number){const t0=Date.now();while(!ready()&&Date.now()-t0<timeout)await sleep(100);}
/** The Q&A desk character's arrival: a coordinator role gets one of the operations desks along the back wall. */
const qaCreated=():AOEvent=>({event_id:'local-qa-desk:created',run_id:'local',seq:0,type:'agent.created',agent_id:QA,
  timestamp:new Date().toISOString(),data:{name:'Local LLM',role:'Q&A coordinator',department:'Q&A desk'}});

export function LocalOffice({theme,agentScale,reducedMotion,finishMode,askOpen,onAskClose,onAsk}:{
  theme:Theme;agentScale:number;reducedMotion:boolean;finishMode:FinishMode;askOpen:boolean;onAskClose:()=>void;onAsk:()=>void;
}){
  const engine=useMemo(()=>new OfficeEngine(),[]);
  // Quiet sessions always rest in the lobby here (they come back to their desk when the transcript grows), whatever
  // the apps office does with finished agents.
  engine.reducedMotion=reducedMotion;engine.finishMode='lobby';engine.lobbyLabel='zZ Sleeping';
  void finishMode;
  const meta=useRef<Record<string,Meta>>({});
  const [view,setView]=useState<'office'|'dataflow'|'sessions'>('office');
  const [hours,setHours]=useState(24);
  const [selected,setSelected]=useState<string>();
  const [follow,setFollow]=useState<string>();
  const [fitToken,setFitToken]=useState(0);
  const [department,setDepartment]=useState('All');
  const [error,setError]=useState('');
  const [loaded,setLoaded]=useState(false);
  const [localAgents,setLocalAgents]=useState<LocalAgent[]>([]);
  const [jump,setJump]=useState<{agent:string;session:string}>();
  const [,render]=useState(0);
  const [teamCollapsed,setTeamCollapsed]=useTeamCollapsed();

  useEffect(()=>{get<{agents:LocalAgent[]}>('/api/local-agents').then(d=>setLocalAgents(d.agents)).catch(()=>{});},[]);

  // Poll the transcripts. The first load fast-forwards through recent history so characters start where the work
  // left off; after that each new transcript entry is ingested as it appears and animates live.
  useEffect(()=>{
    let live=true,first=true;
    engine.reset();meta.current={};setSelected(undefined);setFollow(undefined);setLoaded(false);
    engine.ingest(qaCreated());
    const load=async()=>{
      try{
        const events=await get<AOEvent[]>(`/api/local-agents/office?hours=${hours}`);
        if(!live)return;
        const fresh=events.filter(e=>!engine.state.seen.has(e.event_id));
        for(const e of fresh){
          if(e.type==='agent.created'&&e.agent_id)meta.current[e.agent_id]=e.data as unknown as Meta;
          engine.ingest(e);
          if(first)engine.advance(2500);
        }
        if(first){first=false;engine.advance(12000);setLoaded(true);setFitToken(x=>x+1);}   // let sleepers reach the lobby
        setError('');
        if(fresh.length)render(x=>x+1);
      }catch(e){if(live)setError(String(e).replace(/^Error: /,''));}
    };
    void load();
    const timer=setInterval(load,3000);
    return()=>{live=false;clearInterval(timer);};
  },[engine,hours]);

  // The Q&A desk character's token count: what the local LLM reported for the answers given since the server
  // started (it keeps no history of its own). Read on load, and again with each answer.
  const showLlmUsage=useCallback((u?:LlmUsage)=>{
    if(!u)return;
    engine.ingest({event_id:`local-qa-desk:usage:${u.input}:${u.output}`,run_id:'local',seq:0,type:'x.usage',agent_id:QA,
      timestamp:new Date().toISOString(),data:{input:u.input,output:u.output}});
  },[engine]);
  useEffect(()=>{get<{usage?:LlmUsage}>('/api/ollama/models').then(d=>showLlmUsage(d.usage)).catch(()=>{});},[showLlmUsage,hours]);

  useEffect(()=>{
    let raf:number,last=performance.now(),ui=0;
    const tick=(now:number)=>{
      engine.update(Math.min(now-last,100));last=now;
      if(now-ui>250){render(x=>x+1);ui=now;}
      raf=requestAnimationFrame(tick);
    };
    raf=requestAnimationFrame(tick);
    return()=>cancelAnimationFrame(raf);
  },[engine]);

  const state=engine.state;
  const agents=Object.values(state.agents).filter(x=>x.id!==QA);
  const departments=[...new Set(agents.map(a=>a.department))].sort();
  const busy=agents.filter(a=>BUSY.test(a.status)).length;
  const tasks=Object.values(state.tasks).sort((a,b)=>b.id.localeCompare(a.id));
  const a=selected?state.agents[selected]:undefined;
  const m=selected?meta.current[selected]:undefined;
  // Resting in the lobby, or (once the lobby is full) gone out of the door: either way the session is quiet.
  const asleep=(id:string)=>{const c=engine.characters.get(id);return !!c&&(c.inLobby||c.away||!!c.current?.lobby||!!c.current?.exit);};
  const statusOf=(x:{id:string;status:string})=>asleep(x.id)?'Sleeping':x.status;
  const [detail,setDetail]=useState<Detail>();
  const [detailTab,setDetailTab]=useState<DetailTab>('timeline');
  useEffect(()=>{
    setDetail(undefined);
    const target=selected?meta.current[selected]:undefined;
    if(!target)return;
    let live=true;
    const load=()=>get<Detail>(`/api/local-agents/${target.local_agent}/sessions/${encodeURIComponent(target.session)}`)
      .then(d=>live&&setDetail(d)).catch(()=>{});
    void load();const timer=setInterval(load,5000);
    return()=>{live=false;clearInterval(timer);};
  },[selected]);
  // ── The Q&A desk: a local LLM character that acts out each question ─────────────
  // It walks to the session(s) the question is about (at their desk, at a station, or asleep in the lobby), talks
  // with them while the local model reads their transcripts, then walks back to its desk; only then is the answer
  // shown. The animation is presentation only: the answer always comes from /api/local-agents/ask.
  const visit=useCallback(async(request:AskRequest)=>{
    const c=engine.characters.get(QA);
    let done=false,result:Answer|undefined;
    request.answer.then(r=>{result=r;showLlmUsage(r.usage);}).catch(()=>{}).finally(()=>{done=true;});
    if(!c)return;
    const st=engine.state;
    const recent=Object.values(st.agents).filter(x=>x.id!==QA).sort((x,y)=>(y.updatedAt??'').localeCompare(x.updatedAt??''));
    const targets=request.scope==='session'?[`${request.agentId}:${request.sessionId}`].filter(id=>st.agents[id])
      :request.scope==='agent'?recent.filter(x=>meta.current[x.id]?.local_agent===request.agentId).slice(0,3).map(x=>x.id)
      :recent.slice(0,4).map(x=>x.id);
    const label=(id:string)=>(meta.current[id]?.title??st.agents[id]?.name??id).slice(0,22);
    const say=(from:string,to:string,text:string,kind='message.sent')=>
      engine.interactions.push({id:`qa:${Date.now()}:${Math.random()}`,from,to,kind,started:engine.time,question:text});
    const waitArrived=()=>waitUntil(()=>!c.path.length,20000);
    setFollow(QA);
    let last:string|undefined;
    for(const t of targets){
      const tc=engine.characters.get(t);
      if(!tc)continue;
      const where=tc.away?{...DOOR}:{...tc.location};
      c.interrupt({eventId:`qa-go:${t}:${Date.now()}`,agentId:QA,priority:1,behavior:`Going to ask ${label(t)}`,destination:engine.freeSpot(where,QA),target:t,terminal:false});
      await waitArrived();
      if(c.current)c.current.behavior=`Asking ${label(t)}`;
      say(QA,t,request.question,'question.asked');
      last=t;
      const isLast=t===targets.at(-1);
      const started=Date.now();let spoke=Date.now(),n=0;
      // Each session gets a short conversation; the last one keeps talking until the model has answered.
      while(Date.now()-started<2600||(isLast&&!done&&Date.now()-started<300000)){
        await sleep(200);
        if(Date.now()-spoke>3200){spoke=Date.now();say(t,QA,REPLIES[n++%REPLIES.length]);}
      }
    }
    if(!targets.length){   // nothing on the floor to visit (e.g. outside the time window): read at the desk
      c.interrupt({eventId:`qa-read:${Date.now()}`,agentId:QA,priority:1,behavior:'Reading transcripts',destination:engine.freeSpot(desk(QA,st),QA),terminal:false});
      await waitUntil(()=>done,300000);
    }
    if(last&&result)say(last,QA,result.answer.replace(/\s+/g,' ').slice(0,60),'question.answered');
    await sleep(last?1400:0);
    c.interrupt({eventId:`qa-back:${Date.now()}`,agentId:QA,priority:2,behavior:result?'Writing the answer':'Returning to desk',destination:engine.freeSpot(desk(QA,engine.state),QA),terminal:true});
    await waitArrived();
    await sleep(500);
    setFollow(f=>f===QA?undefined:f);
  },[engine,showLlmUsage]);

  const openSessions=(target?:Meta)=>{setJump(target?{agent:target.local_agent,session:target.session}:undefined);setView('sessions');};

  return(
    <>

      <section className="toolbar">
        <div className="segmented" role="group" aria-label="Local agents view">
          <button className={view!=='sessions'?'active':''} onClick={()=>setView('office')}>Office</button>
          <button className={view==='sessions'?'active':''} onClick={()=>openSessions()}>Sessions &amp; data</button>
        </div>
        <select aria-label="Time window" value={hours} onChange={e=>setHours(Number(e.target.value))}>
          {WINDOWS.map(([h,label])=><option key={h} value={h}>{label}</option>)}
        </select>
        <div className="toolbar-spacer"/>
        <span className="la-readonly-note">Read-only · from transcripts on this machine</span>
        <span className="mode-note">LOCAL TRANSCRIPTS</span>
      </section>

      {view==='sessions'
        ?<LocalAgents key={jump?`${jump.agent}:${jump.session}`:'all'} initial={jump}/>
        :<>
        <section className="command-overview" aria-label="Local agents overview">
          <div className="overview-primary">
            <span className={`signal-orb ${loaded&&!error?'online':''}`} aria-hidden="true"/>
            <div><small>SOURCE</small><strong>Local transcripts</strong></div>
          </div>
          <div><small>WORKING NOW</small><strong>{busy}<span> / {agents.length} sessions</span></strong></div>
          <div><small>DEPARTMENTS</small><strong>{departments.length}<span> agents</span></strong></div>
          <div><small>REQUESTS</small><strong>{tasks.length}</strong></div>
          <div className="overview-context"><small>TELEMETRY</small><strong>{state.events.length.toLocaleString()}<span> transcript events</span></strong></div>
        </section>

        {error&&<div role="alert" className="error-banner">{error}</div>}

        <main ref={fillViewport} className={teamCollapsed?'team-collapsed':undefined}>
          <section className="scene">
            <div className="scene-heading">
              <div>
                <span className="eyebrow">LOCAL AGENTS FLOOR</span>
                <h2>Agents on this machine <span className="badge">{busy?'Working':'Quiet'}</span></h2>
              </div>
              <div className="scene-controls">
                <div className="segmented view-switch" role="group" aria-label="Floor view">
                  <button className={view==='office'?'active':''} aria-pressed={view==='office'} onClick={()=>setView('office')}>Office</button>
                  <button className={view==='dataflow'?'active':''} aria-pressed={view==='dataflow'} onClick={()=>setView('dataflow')}>Dataflow</button>
                </div>
                <button onClick={()=>{setSelected(undefined);onAsk();}}><IconChat size={13}/> Ask agents</button>
                <button onClick={()=>{setFollow(undefined);setFitToken(x=>x+1);}}><IconFit size={13}/> Fit office</button>
              </div>
            </div>

            {view==='dataflow'
              ?<Dataflow engine={engine} selected={selected} onSelect={setSelected}/>
              :isFlatTheme(theme)
              ?<FlatOffice engine={engine} selected={selected} follow={follow} fitToken={fitToken} onSelect={setSelected} agentScale={agentScale} variant={theme}/>
              :<Office engine={engine} selected={selected} follow={follow} fitToken={fitToken} onSelect={setSelected} theme={theme} agentScale={agentScale}/>}

            {loaded&&!agents.length&&(
              <div className="empty-office">
                <h2>No local agent sessions in this window.</h2>
                <p>Claude Code, Codex and Gemini CLI sessions appear here as soon as they write their transcripts. Try a longer time window.</p>
              </div>
            )}

            <div className="scene-footer">
              <span><i className="dot"/> {busy} working <i className="dot waiting"/> {agents.filter(x=>asleep(x.id)).length} sleeping in the lobby</span>
              <span>Each character is one session · stations show the kind of tool it used · sleepers wake when their transcript grows · Select a character · <kbd>?</kbd> to ask</span>
            </div>
          </section>

          <aside className={`inspector${teamCollapsed?' collapsed':''}`}>
            {teamCollapsed&&<TeamRail members={agents.map(x=>({...x,name:meta.current[x.id]?.title??x.name}))} selected={selected} label="sessions"
              colorOf={id=>Object.keys(state.agents).indexOf(id)} statusOf={statusOf}
              onSelect={setSelected} onExpand={()=>setTeamCollapsed(false)} detailOf={id=>state.agents[id]?usageTitle(state.agents[id]):''}/>}
            <div className="panel-title"><span>{a?'SESSION INSPECTOR':'LOCAL TEAM'}</span><span>{agents.length} sessions</span><CollapseTeam onCollapse={()=>setTeamCollapsed(true)}/></div>
            {a&&m?(
              <>
                <button className="text-button" onClick={()=>setSelected(undefined)}><IconChevronLeft size={12}/> All sessions</button>
                <div className="agent-profile">
                  <div className={`avatar color-${Object.keys(state.agents).indexOf(a.id)%6}`}>{a.name.slice(0,1)}</div>
                  <h2 title={m.title}>{m.title}</h2>
                  <p>{a.department} · {a.role}</p>
                  <span className={a.status==='Error'?'status error':asleep(a.id)?'status sleeping':'status'}>{statusOf(a)}</span>
                </div>
                <div className="la-inspector-actions">
                  <button className="wide" onClick={()=>setFollow(follow===a.id?undefined:a.id)}>
                    {follow===a.id?'Stop following':<><IconCrosshair size={13}/> Follow</>}
                  </button>
                  <button className="wide" onClick={()=>openSessions(m)}>Full transcript view</button>
                </div>

                <AskLocal key={a.id} agents={localAgents} agentId={m.local_agent} sessionId={m.session} sessionTitle={m.title}
                  title="ASK ABOUT THIS SESSION" onAsk={visit}/>

                <ProgressDetails agent={a}/>

                <div className="panel-title la-record-title"><span>EVERYTHING THIS SESSION DID</span><span>from its transcript</span></div>
                <div className="la-inspector-record">
                  {detail
                    ?<SessionDetail d={detail} agent={localAgents.find(x=>x.id===m.local_agent)} tab={detailTab} setTab={setDetailTab}/>
                    :<p className="muted">Reading the transcript…</p>}
                </div>

                <dl>
                  <dt>CURRENT ACTION</dt><dd>{engine.characters.get(a.id)?.current?.behavior??a.status}</dd>
                  <dt>MODEL</dt><dd>{a.model??'Not recorded'}</dd>
                  <dt>TOOL</dt><dd>{a.tool??'—'}</dd>
                  <dt>PROJECT FOLDER</dt><dd>{a.role}</dd>
                  <dt>READ FROM</dt><dd><code className="la-path">{m.path}</code></dd>
                </dl>
              </>
            ):(
              <>
                {askOpen&&(
                  <div className="la-ask-panel">
                    <div className="gap-header">
                      <span className="panel-title">ASK ABOUT YOUR LOCAL AGENTS</span>
                      <button className="gap-close" onClick={onAskClose} aria-label="Close">×</button>
                    </div>
                    <p className="muted">The local LLM walks over to the agents, asks them, and brings the answer back to the Q&amp;A desk. Answers come only from transcripts on this machine.</p>
                    <AskLocal agents={localAgents} defaultScope="all" title="QUESTION" onAsk={visit}/>
                  </div>
                )}
                <p className="muted">Recent sessions of the agents on this machine, grouped by agent. Select one to see its work and ask about it.</p>
                <select className="wide" aria-label="Department" value={department} onChange={e=>setDepartment(e.target.value)}>
                  <option value="All">All agents</option>
                  {departments.map(d=><option key={d}>{d}</option>)}
                </select>
                <div className="team-list">
                  {departments.filter(d=>department==='All'||d===department).map(d=>{
                    const members=agents.filter(x=>x.department===d);
                    return(
                      <div key={d} className="la-dept">
                        <div className="la-dept-title"><span>{d}</span><small>{members.filter(x=>BUSY.test(x.status)).length} working · {members.filter(x=>asleep(x.id)).length} sleeping · {members.length}</small></div>
                        {members.map(x=>(
                          <button className="team-member" key={x.id} title={`${meta.current[x.id]?.title??x.name} · ${usageTitle(x)}`} onClick={()=>setSelected(x.id)}>
                            <span className={`mini-avatar color-${Object.keys(state.agents).indexOf(x.id)%6}`}>{x.name[0]}</span>
                            <span><strong>{meta.current[x.id]?.title??x.name}</strong><small>{x.role} · {statusOf(x)}</small></span>
                            <span className="chevron"><IconChevronRight size={14}/></span>
                          </button>
                        ))}
                      </div>
                    );
                  })}
                </div>
                <button className="wide ask-team-btn" onClick={()=>{setSelected(undefined);onAsk();}} disabled={!agents.length}><IconChat size={14}/> Ask about all sessions</button>
                <div className="honesty">
                  <span>↳ Grounded in transcripts</span>
                  <p>Every movement is a real transcript entry. Nothing is sent to the agents; questions are answered by a local model.</p>
                </div>
              </>
            )}
          </aside>
        </main>

        <section className="bottom-panels">
          <div className="task-panel">
            <div className="panel-title"><span>REQUESTS</span><span>{tasks.length} in window</span></div>
            {tasks.length
              ?<div className="task-cards">
                {tasks.slice(0,40).map(t=>(
                  <button key={t.id} className="task-card" onClick={()=>{if(t.owner){setSelected(t.owner);setFollow(t.owner);}}}>
                    <span className="folder"><IconFolder size={18}/></span>
                    <strong>{t.title}</strong>
                    <small>{t.status} · {t.owner?meta.current[t.owner]?.title??t.owner:'—'}</small>
                  </button>
                ))}
              </div>
              :<p className="muted">Each prompt you give an agent appears here as a request.</p>}
          </div>
          <div className="activity-panel">
            <div className="panel-title"><span>AGENT ACTIVITY</span><span>{state.events.length} events</span></div>
            <div className="activity">
              {state.events.slice(-40).reverse().map(e=>(
                <div key={e.event_id}>
                  <time>{new Date(e.timestamp).toLocaleTimeString()}</time>
                  <span>
                    <strong>{e.agent_id?state.agents[e.agent_id]?.name??e.agent_id:'Office'}</strong>
                    {' '}{e.type==='tool.call.started'?`uses ${String(e.data.tool)}`:e.type==='x.tool.error'?'tool failed':e.type.replaceAll('.',' ')}
                    {typeof e.data.target==='string'&&e.type==='tool.call.started'&&<small> · {e.data.target.slice(0,90)}</small>}
                    {e.type==='task.started'&&<small> · {String(e.data.title)}</small>}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>
        </>}
    </>
  );
}
