import React,{useEffect,useMemo,useRef,useState,useCallback} from 'react';
import {createRoot} from 'react-dom/client';
import {Office} from './Office';
import {FlatOffice} from './FlatOffice';
import {Dataflow} from './Dataflow';
import {AOEvent,OfficeEngine,isManagerRole,runBadge} from './engine';
import {demoEvents} from './demo';
import './style.css';
import {AgentQuestions,ProgressDetails,GlobalAskPanel,runEnded} from './AgentQuestions';
import {Projects,Run,ProjectsTab,groupProjects,runName} from './Projects';
import {LocalOffice} from './LocalOffice';
import {RenameAgent} from './RenameAgent';
import {WorkDetails,Operations} from './WorkDetails';
import {Settings} from './Settings';
import {AgentTimeline} from './AgentTimeline';
import {fillViewport} from './layout';
import {CollapseTeam,TeamRail,useTeamCollapsed} from './teamRail';
import {usageTitle} from './usage';
import {Toasts,toastAPI} from './Toasts';
import {IconOffice,IconSettings,IconChat,IconTerminal,IconFolder,IconPlay,IconPause,IconFit,IconRestart,IconChevronLeft,IconChevronRight,IconCrosshair,IconAgents} from './Icons';
import {Theme,isFlatTheme,loadTheme,saveTheme,applyTheme,loadAgentScale,saveAgentScale,loadFinishMode,saveFinishMode,FinishMode} from './theme';

type Mode='demo'|'live'|'replay';
type Page='apps'|'local';

async function request<T>(url:string):Promise<T>{
  const r=await fetch(url);
  if(!r.ok)throw Error(`${r.status}: ${await r.text()}`);
  return r.json();
}

function App(){
  const engine=useMemo(()=>new OfficeEngine(),[]);
  const demo  =useMemo(demoEvents,[]);
  const params=new URLSearchParams(location.search);
  const initialRun=params.get('run')??'';
  // A project-scoped office (?app=<app_id>, or a collector started with --app) shows only that project's runs and
  // follows its newest run, so another project's agents never appear.
  const [scope,setScope]       =useState<string|undefined>(params.get('app')||undefined);
  const [scopeReady,setScopeReady]=useState(!!params.get('app'));
  const [followLatest,setFollowLatest]=useState(!initialRun);

  const [mode,setMode]         =useState<Mode>('live');
  const [page,setPageState]    =useState<Page>(params.get('tab')==='local'?'local':'apps');
  const [localEnabled,setLocalEnabled]=useState(true);
  const setPage=(p:Page)=>{setPageState(p);const u=new URL(location.href);if(p==='local')u.searchParams.set('tab','local');else u.searchParams.delete('tab');history.replaceState(null,'',u);};
  const [run,setRun]           =useState(initialRun);
  const [runs,setRuns]         =useState<Run[]>([]);
  const [events,setEvents]     =useState<AOEvent[]>([]);
  const [selected,setSelected] =useState<string>();
  const [follow,setFollow]     =useState<string>();
  const [view,setView]         =useState<'office'|'dataflow'>('office');
  const [playing,setPlaying]   =useState(true);
  const [speed,setSpeed]       =useState(1);
  const [position,setPosition] =useState(0);
  const [fitToken,setFitToken] =useState(0);
  const [technical,setTechnical]=useState(false);
  const [connection,setConnection]=useState('Offline demo');
  const [error,setError]       =useState('');
  const [department,setDepartment]=useState('All departments');
  const [,render]              =useState(0);
  const [showSettings,setShowSettings]=useState(false),[expanded,setExpanded]=useState(false),[fullOffice,setFullOffice]=useState(false);
  const [showProjects,setShowProjects]=useState(!initialRun&&!params.get('app'));
  const [projectsTab,setProjectsTab]=useState<ProjectsTab>('projects');
  const [runsLoaded,setRunsLoaded]=useState(false);
  const [showAsk,setShowAsk]   =useState(false);
  const [reducedMotion,setReducedMotion]=useState(matchMedia('(prefers-reduced-motion: reduce)').matches);
  engine.reducedMotion=reducedMotion;
  const [theme,setThemeState]=useState<Theme>(loadTheme);
  const [teamCollapsed,setTeamCollapsed]=useTeamCollapsed();
  const setTheme=(t:Theme)=>{setThemeState(t);saveTheme(t);applyTheme(t);};
  useEffect(()=>{applyTheme(theme);},[]);
  const [agentScale,setAgentScaleState]=useState(loadAgentScale);
  const setAgentScale=(s:number)=>{setAgentScaleState(s);saveAgentScale(s);};
  const [finishMode,setFinishModeState]=useState<FinishMode>(loadFinishMode);
  const setFinishMode=(m:FinishMode)=>{setFinishModeState(m);saveFinishMode(m);};
  engine.finishMode=finishMode;

  const timeline=useRef({position:0,index:0}),clock=useRef(0);
  // A loop, not Math.max(...spread): spreading a six-figure event list overflows the call stack and blanks the page.
  const duration=useMemo(()=>{
    if(!events.length)return 0;
    const first=Date.parse(events[0].timestamp);let latest=0;
    for(const e of events)latest=Math.max(latest,Date.parse(e.timestamp)-first);
    return latest+2000;
  },[events]);

  // ── Project scope from the collector, unless the URL chose one ──────────
  useEffect(()=>{
    if(scopeReady)return;
    request<{app_id:string|null;local_agents?:boolean}>('/api/config')
      .then(c=>{setLocalEnabled(c.local_agents!==false);if(c.app_id){setScope(c.app_id);setShowProjects(false);}})
      .catch(()=>{})
      .finally(()=>setScopeReady(true));
  },[scopeReady]);

  // ── Run list polling ────────────────────────────────────────────────────
  useEffect(()=>{
    if(!scopeReady)return;
    let active=true;
    const url=scope?`/api/runs?app_id=${encodeURIComponent(scope)}`:'/api/runs';
    const refresh=()=>request<Run[]>(url).then(r=>{if(active){setRuns(r);setRunsLoaded(true);}}).catch(()=>{});
    refresh();
    const timer=setInterval(refresh,2000);
    return()=>{active=false;clearInterval(timer);};
  },[scope,scopeReady]);

  // ── Scoped office follows the project's newest run as new ones start ────
  useEffect(()=>{
    if(!scope||!followLatest||mode==='demo'||!runs.length)return;
    const newest=runs[0].run_id;
    if(newest!==run){setRun(newest);setShowProjects(false);}
  },[scope,followLatest,runs,run,mode]);

  // ── Live / replay connection ────────────────────────────────────────────
  useEffect(()=>{
    let active=true,socket:WebSocket|undefined,reconnect:ReturnType<typeof setTimeout>|undefined;
    let cursor=0;
    engine.reset();timeline.current={position:0,index:0};setPosition(0);
    setError('');setSelected(undefined);setFollow(undefined);

    if(mode==='demo'){setEvents(demo);setConnection('Sample telemetry · simulated');setPlaying(true);return;}
    setEvents([]);
    if(!run){setConnection('Choose a run');return;}

    if(mode==='replay'){
      setConnection('Loading recording');
      (async()=>{
        const all:AOEvent[]=[];
        while(active){
          const page=await request<AOEvent[]>(`/api/runs/${encodeURIComponent(run)}/events?after=${cursor}&limit=5000`);
          all.push(...page);
          if(!page.length||page.length<5000)break;
          cursor=page.at(-1)!.seq;
        }
        if(active){setEvents(all);setPlaying(true);setConnection('Stored telemetry');}
      })().catch(e=>{if(active)setError(String(e));});
    } else {
      const connect=()=>{
        if(!active)return;
        setConnection('Connecting');
        socket=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/api/live/${encodeURIComponent(run)}?after=${cursor}`);
        socket.onopen=()=>{if(active)setConnection('Connected · live');};
        socket.onmessage=message=>{
          if(!active)return;
          const data=JSON.parse(message.data) as {events:AOEvent[]};
          // History (anything older than a few seconds, e.g. the backlog sent on connect) is fast-forwarded, so the
          // floor opens in its current state instead of re-walking the whole run; new events animate in real time.
          let caughtUp=0;
          for(const e of data.events){
            const old=Date.now()-Date.parse(e.timestamp)>20_000;
            engine.ingest(e);cursor=Math.max(cursor,e.seq);
            if(old){engine.advance(1500);caughtUp++;}
          }
          if(caughtUp)engine.advance(10_000);
          if(data.events.length){setEvents(old=>[...old,...data.events].slice(-20000));render(x=>x+1);}
        };
        socket.onclose=()=>{if(active){setConnection('Reconnecting…');reconnect=setTimeout(connect,1500);}};
        socket.onerror=()=>socket?.close();
      };
      connect();
    }
    return()=>{active=false;clearTimeout(reconnect);socket?.close();};
  },[mode,run,engine,demo]);

  // ── Animation loop ─────────────────────────────────────────────────────
  useEffect(()=>{
    let raf:number,last=performance.now(),ui=0;
    const tick=(now:number)=>{
      const delta=Math.min(now-last,100);last=now;
      if(mode==='live'){engine.update(delta);clock.current=Date.now();}
      else if(playing&&events.length>0){
        const next=Math.min(duration,timeline.current.position+delta*speed);
        const base=events.length?Date.parse(events[0].timestamp):0;
        let previous=timeline.current.position;
        while(timeline.current.index<events.length){
          const e=events[timeline.current.index];
          const at=Math.max(previous,Date.parse(e.timestamp)-base);
          if(at>next)break;
          engine.advance(at-previous);engine.ingest(e);previous=at;timeline.current.index++;
        }
        engine.advance(next-previous);timeline.current.position=next;
        clock.current=base+next;
        if(next>=duration)setPlaying(false);
      }
      if(now-ui>100){setPosition(timeline.current.position);render(x=>x+1);ui=now;}
      raf=requestAnimationFrame(tick);
    };
    raf=requestAnimationFrame(tick);
    return()=>cancelAnimationFrame(raf);
  },[engine,mode,playing,speed,events,duration]);

  // ── Keyboard shortcuts ─────────────────────────────────────────────────
  useEffect(()=>{
    const h=(e:KeyboardEvent)=>{
      if(e.key!=='Escape'&&(e.target instanceof HTMLInputElement||e.target instanceof HTMLTextAreaElement||e.target instanceof HTMLSelectElement))return;
      switch(e.key){
        case '?': e.preventDefault();setShowAsk(v=>!v);break;
        case 'Escape':setSelected(undefined);setShowAsk(false);setShowProjects(false);setShowSettings(false);setExpanded(false);setFullOffice(false);break;
        case 'f':case 'F':setFitToken(x=>x+1);break;
        case 't':case 'T':setTechnical(x=>!x);break;
        case ' ':
          e.preventDefault();
          if(mode!=='live'){if(position>=duration)seek(0);setPlaying(x=>!x);}
          break;
      }
    };
    window.addEventListener('keydown',h);
    return()=>window.removeEventListener('keydown',h);
  },[mode,playing,position,duration]);

  const seek=(value:number)=>{
    engine.replay(events,value);
    timeline.current={position:value,index:engine.state.events.length};
    clock.current=(events.length?Date.parse(events[0].timestamp):0)+value;
    setPosition(value);render(x=>x+1);
  };

  const state=engine.state;
  const agents=Object.values(state.agents);
  const tasks=Object.values(state.tasks);
  const currentRun=runs.find(r=>r.run_id===run);
  const scopeName=runs.find(r=>r.app_id===scope)?.app_name??scope;
  const currentName=!run?(scope?`${scopeName} · waiting for a run`:'Choose a project'):runName(currentRun??{run_id:run});
  const a=selected?state.agents[selected]:undefined;
  const elapsed=a?Math.max(0,(clock.current-a.started)/1000):0;
  // Apps that reported in the last 15 seconds: every connected app on this machine.
  const liveApps=useMemo(()=>groupProjects(runs).filter(p=>p.runs[0].last_event_at&&Date.now()-Date.parse(p.runs[0].last_event_at)<15_000),[runs]);
  const active=agents.filter(x=>/Thinking|Working|Using tool|Reviewing|Retrying|Searching|Coding|Querying|Computing|Reading results/.test(x.status)).length;

  // Select the lead agent once a project's roster arrives, so the inspector is never empty for a connected app.
  const autoSelectedView=useRef<string|undefined>(undefined);
  useEffect(()=>{
    const view=`${mode}:${run}`;
    if(mode==='demo'||!run||autoSelectedView.current===view)return;
    const roster=Object.values(engine.state.agents);
    if(!roster.length)return;
    autoSelectedView.current=view;
    const lead=roster.find(x=>isManagerRole(x.role))??roster[0];
    setSelected(current=>current??lead.id);
  },[engine,mode,run,agents.length]);

  const focusAskManager=useCallback(()=>{
    const manager=agents.find(x=>isManagerRole(x.role));
    if(manager){setSelected(manager.id);setFollow(manager.id);}
    setShowAsk(true);
  },[agents]);

  return(
    <div className="app">
      {/* Toast notifications */}
      <Toasts/>

      {showProjects&&page==='apps'&&(
        <Projects
          runs={runs}
          runsLoaded={runsLoaded}
          current={run}
          tab={projectsTab}
          onTab={setProjectsTab}
          onOpen={id=>{setRun(id);setFollowLatest(!!scope&&id===runs[0]?.run_id);if(mode==='demo')setMode('live');setShowProjects(false);}}
          onClose={()=>setShowProjects(false)}
        />
      )}

      {/* Global "Ask anyone" modal */}
      {showAsk&&page==='apps'&&(
        <GlobalAskPanel
          state={state}
          run={run}
          live={mode==='live'&&!!run}
          onClose={()=>setShowAsk(false)}
        />
      )}

      {/* Sidebar rail */}
      <aside className="rail">
        <div className="brand-icon" aria-label="Akshauhini" lang="hi">अ</div>
        <button title="Apps office (F = fit)" aria-label="Apps office" className={page==='apps'?'rail-active':''}
          onClick={()=>{setPage('apps');setDepartment('All departments');setFollow(undefined);setFitToken(x=>x+1);}}>
          <IconOffice size={20}/>
        </button>
        {localEnabled&&<button title="Local agents: Claude Code, Codex, Gemini CLI, local LLM" aria-label="Local agents" className={page==='local'?'rail-active':''}
          onClick={()=>setPage('local')}>
          <IconAgents size={20}/>
        </button>}
        <button title="Settings" aria-label="Settings" onClick={()=>setShowSettings(x=>!x)}>
          <IconSettings size={20}/>
        </button>
        <button title="Ask agents (? key)" aria-label="Ask agents" onClick={()=>setShowAsk(v=>!v)}>
          <IconChat size={20}/>
        </button>
        <button title="Technical mode (T key)" aria-label="Technical mode" className={technical?'rail-active':''} onClick={()=>setTechnical(x=>!x)}>
          <IconTerminal size={20}/>
        </button>
        <div className="rail-bottom">AK<br/><small>v0.1</small></div>
      </aside>

      <div className="workspace">
        <header className="product-header">
          <div className="product-heading">
            <div className="product-mark"><span lang="hi">अ</span></div>
            <div>
              <div className="eyebrow">AGENT OPERATIONS CENTER</div>
              <h1>Akshauhini <span>Live orchestration intelligence</span></h1>
            </div>
          </div>
          <div className="segmented page-switch" role="tablist" aria-label="Section">
            <button role="tab" aria-selected={page==='apps'} className={page==='apps'?'active':''} onClick={()=>setPage('apps')}>
              Apps{runs.length?<small> {groupProjects(runs).length}</small>:null}{liveApps.length?<i className="live-count">{liveApps.length} live</i>:null}
            </button>
            {localEnabled&&<button role="tab" aria-selected={page==='local'} className={page==='local'?'active':''} onClick={()=>setPage('local')}>Local agents</button>}
          </div>
          {page==='apps'&&<div className="header-actions">
            <button onClick={()=>{setProjectsTab('connect');setShowProjects(true);}}>Connect app</button>
            <span className={`connection ${mode==='live'?'live':''}`}>
              <span className="live-ping-dot"/> {connection}
            </span>
            <button title="Ask any agent (? key)" onClick={()=>setShowAsk(v=>!v)}>
              <IconChat size={14}/> Ask agents
            </button>
            <button className={technical?'active':''} onClick={()=>setTechnical(x=>!x)}>Technical mode</button>
          </div>}
          {page==='local'&&<div className="header-actions">
            <button title="Ask about local agents (? key)" onClick={()=>setShowAsk(v=>!v)}><IconChat size={14}/> Ask agents</button>
          </div>}
        </header>

        {showSettings&&<Settings close={()=>setShowSettings(false)} theme={theme} onThemeChange={setTheme} agentScale={agentScale} onAgentScaleChange={setAgentScale} finishMode={finishMode} onFinishModeChange={setFinishMode}/>}
        {page==='local'&&<LocalOffice theme={theme} agentScale={agentScale} reducedMotion={reducedMotion} finishMode={finishMode}
          askOpen={showAsk} onAskClose={()=>setShowAsk(false)} onAsk={()=>setShowAsk(true)}/>}
        {page==='apps'&&<>

        <section className="toolbar">
          <div className="segmented">
            {(['demo','live','replay'] as Mode[]).map(m=>(
              <button key={m} className={mode===m?'active':''} onClick={()=>setMode(m)}>
                {m==='demo'?'Demo':m==='live'?'Live':'Replay'}
              </button>
            ))}
          </div>
          {mode!=='demo'&&(
            <button className="project-switch" aria-haspopup="dialog"
              onClick={()=>{setProjectsTab('projects');setShowProjects(true);}}>
              <span>{currentName}</span> <span aria-hidden="true">▾</span>
            </button>
          )}
          {mode!=='demo'&&liveApps.filter(p=>p.runs[0].run_id!==run).slice(0,4).map(p=>(
            <button key={p.key} className="live-app" title={`Switch to ${p.name} (reporting now)`}
              onClick={()=>{setRun(p.runs[0].run_id);setFollowLatest(false);}}>
              <span className="activity-dot live"/> {p.name}
            </button>
          ))}
          {mode!=='demo'&&scope&&(
            <button className={followLatest?'active':''} aria-pressed={followLatest}
              title="Switch to this project's newest run automatically"
              onClick={()=>setFollowLatest(x=>!x)}>
              {followLatest?'Following latest run':'Follow latest run'}
            </button>
          )}
          <div className="toolbar-spacer"/>
          <div className="kb-hints">
            <kbd>?</kbd> ask&nbsp; <kbd>F</kbd> fit&nbsp; <kbd>T</kbd> technical&nbsp;
            {mode!=='live'&&<><kbd>Space</kbd> play</>}
          </div>
          <span className="mode-note">
            {mode==='demo'?'SIMULATED · sample event sequence':mode==='live'?'RUNTIME TELEMETRY':'DETERMINISTIC RECORDING'}
          </span>
        </section>

        <section className="command-overview" aria-label="Workspace overview">
          <div className="overview-primary">
            <span className={`signal-orb ${connection.includes('Connected')||mode==='demo'?'online':''}`} aria-hidden="true"/>
            <div><small>RUNTIME</small><strong>{mode==='demo'?'Simulation':mode==='live'?'Live operations':'Recorded session'}</strong></div>
          </div>
          <div><small>ACTIVE AGENTS</small><strong>{active}<span> / {agents.length}</span></strong></div>
          <div><small>TASK PROGRESS</small><strong>{tasks.filter(t=>t.status==='completed').length}<span> / {tasks.length}</span></strong></div>
          <div><small>TELEMETRY</small><strong>{state.events.length.toLocaleString()}<span> events</span></strong></div>
          <div className="overview-context"><small>CURRENT WORKSPACE</small><strong>{mode==='demo'?'Demo research operation':currentName}</strong></div>
        </section>

        {error&&<div role="alert" className="error-banner">{error}</div>}

        <main ref={fillViewport} className={[fullOffice?'office-only':expanded?'expanded-workspace':'',teamCollapsed?'team-collapsed':''].filter(Boolean).join(' ')}>
          <section className="scene">
            <div className="scene-heading">
              <div>
                <span className="eyebrow">LIVE OPERATIONS FLOOR</span>
                <h2>
                  {mode==='demo'?'Research to report':runName(runs.find(r=>r.run_id===run))}
                  {' '}<span className="badge" title="Run status">{runBadge(state)}</span>
                </h2>
              </div>
              <div className="scene-controls">
                <div className="segmented view-switch" role="group" aria-label="Floor view">
                  <button className={view==='office'?'active':''} aria-pressed={view==='office'} onClick={()=>setView('office')}>Office</button>
                  <button className={view==='dataflow'?'active':''} aria-pressed={view==='dataflow'} onClick={()=>setView('dataflow')}>Dataflow</button>
                </div>
                <button onClick={()=>{setExpanded(x=>!x);setFitToken(x=>x+1);}}>{expanded?'Restore workspace':'Expand workspace'}</button>
                <button onClick={()=>setFullOffice(true)}>Full office</button>
                <button
                  disabled={!agents.some(x=>isManagerRole(x.role))||mode!=='live'}
                  onClick={focusAskManager}>
                  <IconChat size={13}/> Ask manager
                </button>
                <button aria-pressed={reducedMotion} onClick={()=>setReducedMotion(x=>!x)}>Reduce motion</button>
                <button disabled={!agents.some(x=>isManagerRole(x.role))}
                  onClick={()=>setFollow(agents.find(x=>isManagerRole(x.role))?.id)}>Follow manager</button>
                <button onClick={()=>{setFollow(undefined);setFitToken(x=>x+1);}}><IconFit size={13}/> Fit office</button>
              </div>
            </div>

            {fullOffice&&<button className="office-exit" onClick={()=>setFullOffice(false)}>Exit full office · Esc</button>}
            {view==='dataflow'
              ?<Dataflow engine={engine} selected={selected} onSelect={setSelected}/>
              :isFlatTheme(theme)
              ?<FlatOffice engine={engine} selected={selected} follow={follow} fitToken={fitToken} onSelect={setSelected} agentScale={agentScale} variant={theme}/>
              :<Office engine={engine} selected={selected} follow={follow} fitToken={fitToken} onSelect={setSelected} theme={theme} agentScale={agentScale}/>}

            {!agents.length&&(
              <div className="empty-office">
                <h2>Your office is ready.</h2>
                <p>{mode==='live'?'Waiting for agent events. Connect the Python SDK or send AOEP events to /api/events.':'Select a run to watch your agents work.'}</p>
                <code>import akshauhini; office = akshauhini.init("my-app")</code>
              </div>
            )}

            <div className="scene-footer">
              <span>
                <i className="dot"/> {active} working
                <i className="dot waiting"/> {agents.filter(x=>/Waiting|Blocked|Awaiting|Queued/.test(x.status)).length} waiting
              </span>
              <span>
                {follow?'Following '+follow+' · ':''}
                Drag to pan · Scroll to zoom · Select a character · <kbd>?</kbd> to ask
              </span>
            </div>

            {mode!=='live'&&(
              <div className="playback">
                <button className="play" aria-label={playing?'Pause':'Play'}
                  onClick={()=>{if(position>=duration)seek(0);setPlaying(x=>!x);}}>
                  {playing?<IconPause size={13}/>:<IconPlay size={13}/>}
                </button>
                <span>{formatTime(position)}</span>
                <input aria-label="Replay position" type="range" min="0" max={duration||1} value={position}
                  onChange={e=>seek(Number(e.target.value))}/>
                <span>{formatTime(duration)}</span>
                <select aria-label="Replay speed" value={speed} onChange={e=>setSpeed(Number(e.target.value))}>
                  {[.5,1,2,5].map(n=><option key={n} value={n}>{n}×</option>)}
                </select>
                <button onClick={()=>{seek(0);setPlaying(true);}} title="Restart"><IconRestart size={13}/></button>
              </div>
            )}
          </section>

          {/* Inspector sidebar */}
          <aside className={`inspector${teamCollapsed?' collapsed':''}`}>
            {teamCollapsed&&<TeamRail members={agents} selected={selected} colorOf={id=>Object.keys(state.agents).indexOf(id)}
              onSelect={setSelected} onExpand={()=>setTeamCollapsed(false)} detailOf={id=>state.agents[id]?usageTitle(state.agents[id]):''}/>}
            <div className="panel-title">
              <span>{a?'AGENT INSPECTOR':'YOUR TEAM'}</span>
              <span>{agents.length} agents</span>
              <CollapseTeam onCollapse={()=>setTeamCollapsed(true)}/>
            </div>

            {a ? (
              <>
                <button className="text-button" onClick={()=>setSelected(undefined)}><IconChevronLeft size={12}/> All agents</button>
                <div className="agent-profile">
                  <div className={`avatar color-${Object.keys(state.agents).indexOf(a.id)%6}`}>{a.name.slice(0,1)}</div>
                  <h2>{a.name}</h2>
                  <p>{a.department} · {a.role}</p>
                  <span className={a.status==='Error'?'status error':'status'}>{a.status}</span>
                  <small className="agent-id">ID {a.id}</small>
                  <RenameAgent run={run} agentId={a.id} name={a.name} live={mode==='live'&&!!run}/>
                </div>

                <button className="wide" onClick={()=>setFollow(follow===a.id?undefined:a.id)}>
                  {follow===a.id?'Stop following':<><IconCrosshair size={13}/> Follow agent</>}
                </button>

                {/* Ask this agent */}
                <AgentQuestions key={`${mode}:${run}:${a.id}`} run={run} agent={a} live={mode==='live'&&!!run} ended={runEnded(state.runStatus)}/>

                {/* Progress */}
                <ProgressDetails agent={a}/>

                {/* Operations */}
                <Operations state={state} agentId={a.id}/>

                {/* Timeline */}
                <AgentTimeline state={state} agentId={a.id} now={clock.current}/>

                {/* Key/value details */}
                <dl>
                  <dt>CURRENT TASK</dt><dd>{a.task?state.tasks[a.task]?.title:'No active assignment'}</dd>
                  <dt>CURRENT ACTION</dt><dd>{engine.characters.get(a.id)?.current?.behavior??a.status}</dd>
                  <dt>MODEL</dt><dd>{a.model??'Not reported'}</dd>
                  <dt>TIME IN CURRENT STATE</dt><dd>{elapsed.toFixed(1)} sec</dd>
                  <dt>TOOL</dt><dd>{a.tool??'—'}</dd>
                  <dt>TOKENS · INPUT → OUTPUT</dt><dd>{String(a.metrics.input_tokens??'—')} → {String(a.metrics.output_tokens??'—')}</dd>
                  {a.metrics.duration_ms!==undefined&&<><dt>REPORTED OPERATION DURATION</dt><dd>{String(a.metrics.duration_ms)} ms</dd></>}
                  {a.error&&<><dt>ERROR</dt><dd className="error">{a.error}</dd></>}
                </dl>

                <div className="panel-title">KNOWN TASK QUEUE</div>
                {a.queue.length
                  ? a.queue.map(id=><p className="queue-item" key={id}>▣ {state.tasks[id]?.title??id}</p>)
                  : <p className="muted">No queued assignments reported.</p>}
              </>
            ) : (
              <>
                <p className="muted">This team is registered by the selected app. New agents appear as the app reports them.</p>
                <select className="wide" aria-label="Department" value={department} onChange={e=>setDepartment(e.target.value)}>
                  <option>All departments</option>
                  {[...new Set(agents.map(x=>x.department))].map(d=><option key={d}>{d}</option>)}
                </select>
                <div className="team-list">
                  {agents
                    .filter(x=>department==='All departments'||x.department===department)
                    .map((a,i)=>(
                      <button className="team-member" key={a.id} title={`${a.name} · ${usageTitle(a)}`} onClick={()=>setSelected(a.id)}>
                        <span className={`mini-avatar color-${i%6}`}>{a.name[0]}</span>
                        <span>
                          <strong>{a.name}</strong>
                          <small>{a.status}</small>
                        </span>
                        <span className="chevron"><IconChevronRight size={14}/></span>
                      </button>
                    ))}
                </div>
                <button className="wide ask-team-btn" onClick={()=>setShowAsk(true)} disabled={!agents.length}>
                  <IconChat size={14}/> Ask anyone on the team
                </button>
                <div className="honesty">
                  <span>↳ Grounded in events</span>
                  <p>Movement, conversations and work reflect telemetry. Sample data is always labeled.</p>
                </div>
              </>
            )}
          </aside>
        </main>

        {/* Bottom panels */}
        <section className="bottom-panels">
          <div className="task-panel">
            <div className="panel-title">
              <span>TASK BOARD</span>
              <span>{tasks.filter(t=>t.status==='completed').length} / {tasks.length} complete</span>
            </div>
            {tasks.length
              ? <div className="task-cards">
                  {tasks.map(t=>(
                    <button key={t.id} className={`task-card ${follow==='task:'+t.id?'selected':''}`}
                      onClick={()=>{setFollow('task:'+t.id);if(t.owner)setSelected(t.owner);}}>
                      <span className="task-card-head">
                        <span className="folder"><IconFolder size={16}/></span>
                        <strong title={t.title}>{t.title}</strong>
                      </span>
                      <small className={`task-status ${t.status}`}>{t.status} · {t.owner?state.agents[t.owner]?.name??t.owner:'Unassigned'}</small>
                      {t.progress!==undefined&&<progress value={t.progress} max="1"/>}
                      {t.artifact&&<small className="task-artifact" title={t.artifact}>↳ {t.artifact}</small>}
                    </button>
                  ))}
                </div>
              : <p className="muted">Task folders appear when task events arrive.</p>}
          </div>
          <div className="activity-panel">
            <div className="panel-title">
              <span>{technical?'RAW EVENT STREAM':'OFFICE ACTIVITY'}</span>
              <span>{state.events.length} events</span>
            </div>
            <div className="activity">
              {state.events.slice(-30).reverse().map(e=>(
                <div key={e.event_id} className={technical?'raw':undefined}
                  title={technical?undefined:`${e.agent_id?state.agents[e.agent_id]?.name??e.agent_id:'Office'} ${e.type.replaceAll('.',' ')}${e.task_id?` · ${state.tasks[e.task_id]?.title??''}`:''}`}>
                  <time>{new Date(e.timestamp).toISOString().slice(11,19)}</time>
                  <span>
                    {technical
                      ? <code>{JSON.stringify(e)}</code>
                      : <><strong>{e.agent_id?state.agents[e.agent_id]?.name??e.agent_id:'Office'}</strong>
                          {' '}{e.type.replaceAll('.',' ')}
                          {e.task_id&&<small> · {state.tasks[e.task_id]?.title}</small>}
                        </>}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <WorkDetails state={state}/>
        </>}

        <footer>
          AKSHAUHINI <span>Framework independent. Event driven. Semantically honest.</span>
          <a href="/docs" target="_blank" rel="noreferrer">Collector API ↗</a>
        </footer>
      </div>
    </div>
  );
}

function formatTime(ms:number){
  return `${Math.floor(ms/60000)}:${String(Math.floor(ms/1000)%60).padStart(2,'0')}`;
}

createRoot(document.getElementById('root')!).render(<App/>);
