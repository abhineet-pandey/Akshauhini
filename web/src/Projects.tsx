import React,{useEffect,useMemo,useState} from 'react';

export type Run={run_id:string;event_count:number;app_id?:string;app_name?:string;last_event_at?:string|null};
export type ProjectsTab='projects'|'connect'|'samples';

const ACTIVE_MS=15_000;
const RECENT_MS=10*60_000;

function ago(ms:number){
  if(ms<60_000)return `${Math.max(0,Math.round(ms/1000))}s ago`;
  if(ms<3_600_000)return `${Math.round(ms/60_000)} min ago`;
  if(ms<86_400_000)return `${Math.round(ms/3_600_000)} h ago`;
  return `${Math.round(ms/86_400_000)} d ago`;
}

function activity(run:Run,now:number){
  const at=run.last_event_at?Date.parse(run.last_event_at):NaN;
  if(Number.isNaN(at))return {label:'No activity time',tone:'quiet'};
  const age=now-at;
  if(age<ACTIVE_MS)return {label:'Active now',tone:'live'};
  if(age<RECENT_MS)return {label:ago(age),tone:'recent'};
  return {label:ago(age),tone:'quiet'};
}

/** An opaque generated id (uuid, hash) as opposed to one a person chose ("mainstreet-sentinel-live"). */
const opaqueId=(id:string)=>/^[0-9a-f]{8}-?[0-9a-f]{4}/i.test(id)||/^[0-9a-f]{16,}$/i.test(id)||!/[a-z]{3}/i.test(id);
/** How a run id is shown: in full when a person chose it, shortened when it is a generated id. */
export const runIdLabel=(id:string)=>opaqueId(id)?id.slice(0,8):id;
/** Display name for a run's app: its reported name or id, else the run id when that reads as a name. */
export function runName(run:Pick<Run,'run_id'|'app_id'|'app_name'>|undefined,fallback='Connected app workspace'){
  if(!run)return fallback;
  if(run.app_name||run.app_id)return (run.app_name??run.app_id)!;
  if(opaqueId(run.run_id))return `Run ${run.run_id.slice(0,8)}`;
  return run.run_id.split(/[-_.]+/).filter(Boolean).map(p=>p[0].toUpperCase()+p.slice(1)).join(' ');
}

/** Runs of one app are one project. Input is already newest-first from the collector. */
export function groupProjects(runs:Run[]){
  const groups=new Map<string,{key:string;name:string;runs:Run[]}>();
  for(const run of runs){
    const key=run.app_id??run.app_name??`run:${run.run_id}`;
    const group=groups.get(key)??{key,name:runName(run),runs:[]};
    group.runs.push(run);
    groups.set(key,group);
  }
  return [...groups.values()];
}

async function copyText(text:string){
  try{await navigator.clipboard.writeText(text);return true;}catch{return false;}
}

function CopyBlock({label,text}:{label:string;text:string}){
  const [state,setState]=useState<'idle'|'copied'|'failed'>('idle');
  return(
    <div className="copy-block">
      <div className="copy-head">
        <span>{label}</span>
        <button onClick={async()=>{setState(await copyText(text)?'copied':'failed');setTimeout(()=>setState('idle'),1600);}}>
          {state==='copied'?'Copied':state==='failed'?'Select and copy':'Copy'}
        </button>
      </div>
      <pre>{text}</pre>
    </div>
  );
}

const PYTHON_SNIPPET=`import akshauhini

# Starts the office if it isn't running, registers your app, prints its URL.
office = akshauhini.init("my-agents", "My Agent Team")

@office.track("researcher", name="Research Agent", role="researcher")
def research_agent(topic):
    result = run_your_agent(topic)
    office.artifact("researcher", None,
        artifact_id="report", name="Research result", content=result)
    return result

research_agent("market trends")`;

const RUN_COMMAND='python your_app.py';
const INSTALL_COMMAND='pip install akshauhini';

const SAMPLES:{name:string;summary:string;steps:{label:string;text:string}[];link?:{href:string;text:string}}[]=[
  {
    name:'Insights demo',
    summary:'A support team recorded at version 1.0 and a deliberately worse 1.1: LLM calls, evaluations, a loop and a failure. Open it and press I. Run it from a clone of the repository.',
    steps:[{label:'Run',text:'python examples/insights_demo.py'}],
  },
  {
    name:'Connected example app',
    summary:'A small app that registers agents, reports work and answers progress questions. Run it from a clone of the repository.',
    steps:[{label:'Run',text:'akshauhini run python examples/connected_app.py --directory . --seconds 90'}],
  },
  {
    name:'Request Studio',
    summary:'A request-driven team of six workers that retrieves sources and writes a report. Start the collector first, then the studio.',
    steps:[
      {label:'Terminal 1 · collector',text:'akshauhini serve'},
      {label:'Terminal 2 · studio',text:'python sample_projects/request_studio/run.py'},
    ],
    link:{href:'http://127.0.0.1:8766',text:'Open Request Studio at 127.0.0.1:8766'},
  },
  {
    name:'Market Intelligence',
    summary:'A canned research pipeline with an orchestrator, analysts and a reviewer. No LLM is called.',
    steps:[{label:'Run from its folder',text:'cd sample_projects/market_intelligence\nakshauhini run python demo_run.py'}],
  },
];

export function Projects({runs,runsLoaded,current,tab,onTab,onOpen,onClose}:{
  runs:Run[];runsLoaded:boolean;current:string;tab:ProjectsTab;
  onTab:(tab:ProjectsTab)=>void;onOpen:(runId:string)=>void;onClose:()=>void;
}){
  const now=Date.now();
  const projects=useMemo(()=>groupProjects(runs),[runs]);

  // Runs that exist when the wizard first has data are the baseline; anything new afterwards came from the user's app.
  const [baseline,setBaseline]=useState<Set<string>|undefined>();
  useEffect(()=>{if(!baseline&&runsLoaded)setBaseline(new Set(runs.map(r=>r.run_id)));},[baseline,runs,runsLoaded]);
  const connected=baseline?runs.filter(r=>!baseline.has(r.run_id)&&r.event_count>0):[];

  return(
    <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal-panel projects-panel" role="dialog" aria-modal="true" aria-label="Projects">
        <div className="modal-head">
          <div className="segmented">
            {([['projects','My projects'],['connect','Connect a project'],['samples','Samples']] as [ProjectsTab,string][]).map(([key,label])=>(
              <button key={key} className={tab===key?'active':''} aria-pressed={tab===key} onClick={()=>onTab(key)}>{label}</button>
            ))}
          </div>
          <button aria-label="Close projects" onClick={onClose}>×</button>
        </div>

        {tab==='projects'&&(
          !runsLoaded
            ? <p className="modal-empty muted">Loading projects…</p>
            : projects.length
            ? <div className="project-list">
                {projects.map(project=>(
                  <section className="project-card" key={project.key}>
                    <div className="project-title">
                      <strong>{project.name}</strong>
                      <span>{project.runs.length} {project.runs.length===1?'run':'runs'}</span>
                    </div>
                    {project.runs.map(run=>{
                      const act=activity(run,now);
                      const isCurrent=run.run_id===current;
                      return(
                        <button key={run.run_id} className={`run-row ${isCurrent?'current':''}`}
                          aria-current={isCurrent?'true':undefined} onClick={()=>onOpen(run.run_id)}>
                          <span className={`activity-dot ${act.tone}`}/>
                          <span className="run-meta">
                            <code title={run.run_id}>{runIdLabel(run.run_id)}</code>
                            <small>{run.event_count} events · {act.label}</small>
                          </span>
                          <span className="run-action">{isCurrent?'Viewing':'Open'}</span>
                        </button>
                      );
                    })}
                  </section>
                ))}
              </div>
            : <div className="modal-empty">
                <h2>No projects yet</h2>
                <p>Connect your app or try a sample. Each app appears here as soon as it sends its first event.</p>
                <button onClick={()=>onTab('connect')}>Connect a project →</button>
              </div>
        )}

        {tab==='connect'&&(
          <div className="connect-steps">
            <ol>
              <li>
                <strong>Install once</strong>
                <p>Install the Akshauhini package into the Python environment your app uses.</p>
                <CopyBlock label="Install" text={INSTALL_COMMAND}/>
              </li>
              <li>
                <strong>Wrap an agent function</strong>
                <p>The decorator creates the agent, task, timing and success or failure events automatically. Add richer progress, tool and artifact events whenever you need them.</p>
                <CopyBlock label="Fastest Python integration" text={PYTHON_SNIPPET}/>
              </li>
              <li>
                <strong>Run your app as usual</strong>
                <p>Every app on this machine reports to this same office, so several apps can run side by side. You can also use <code>akshauhini run python your_app.py</code> to record process start and exit.</p>
                <CopyBlock label="Command" text={RUN_COMMAND}/>
              </li>
            </ol>
            <div className={`connect-status ${connected.length?'done':''}`}>
              {connected.length
                ? <>
                    <strong>Connected: {connected[0].app_name??connected[0].app_id??'your app'}</strong>
                    <span>{connected[0].event_count} events received.</span>
                    <button onClick={()=>onOpen(connected[0].run_id)}>Open its office →</button>
                  </>
                : <>
                    <span className="pulse-dot"/>
                    <strong>Waiting for your app</strong>
                    <span>This updates by itself when the first event arrives. Apps that use HTTP instead of Python are listed in the connection guide.</span>
                    <a href="/api/connection-guide" target="_blank" rel="noreferrer">HTTP and other languages · connection guide (text) ↗</a>
                  </>}
            </div>
          </div>
        )}

        {tab==='samples'&&(
          <div className="sample-grid">
            {SAMPLES.map(sample=>(
              <section className="sample-card" key={sample.name}>
                <strong>{sample.name}</strong>
                <p>{sample.summary}</p>
                {sample.steps.map(step=><CopyBlock key={step.label} label={step.label} text={step.text}/>)}
                {sample.link&&<a href={sample.link.href} target="_blank" rel="noreferrer">{sample.link.text} ↗</a>}
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
