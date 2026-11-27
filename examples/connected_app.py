"""Working integration: a dynamic app roster, real file scans and progress Q&A.

akshauhini run python examples/connected_app.py --directory . --seconds 90
Select 'Repository Scanner' in Live, select a scanner, and ask about progress.
No LLM is necessary. Optional Ollama summaries are available separately in the UI.
"""
import argparse
from pathlib import Path
import threading
import time
from akshauhini import Office

parser = argparse.ArgumentParser()
parser.add_argument('--directory', default='.')
parser.add_argument('--seconds', type=int, default=90)
args = parser.parse_args()
root = Path(args.directory)
# These are the actual workers in this app. Change this mapping to your agent roster.
workers = {'python-scanner': '*.py', 'typescript-scanner': '*.ts'}
snapshots = {}
lock = threading.Lock()

def answer(agent_id):
    def callback(question):
        with lock:
            report = dict(snapshots[agent_id])
        return {'answer':f'Reported progress: {report["summary"]} Completed: {", ".join(report["completed_items"]) or "none yet"}. Waiting for: {", ".join(report["waiting_for"]) or "nothing reported"}.', 'progress':report}
    return callback

with Office(app_id='repository-scanner', app_name='Repository Scanner', strict=True) as office:
    for agent_id, pattern in workers.items():
        office.agent(agent_id, name=agent_id.replace('-', ' ').title(), role='scanner', department='Code inspection')
        snapshots[agent_id] = {'state':'working','summary':f'Looking for {pattern} files','task_id':agent_id+'-scan','completed_items':[], 'waiting_for':[], 'next_steps':['Read source files']}
        office.progress(agent_id, **snapshots[agent_id])
    with office.answer_questions({id:answer(id) for id in workers}):
        for agent_id, pattern in workers.items():
            files = [p for p in root.rglob(pattern) if not any(part in {'.venv','node_modules','.git','build','dist'} for part in p.parts)]
            completed = []
            for i, path in enumerate(files):
                with office.operation('tool.call', agent_id, agent_id+'-scan', tool='python_file_read') as metrics:
                    text = path.read_text(encoding='utf-8',errors='replace')
                    metrics['lines'] = len(text.splitlines())
                completed.append(str(path))
                report = {'state':'working','summary':f'Read {i+1} of {len(files)} files','task_id':agent_id+'-scan','completed_items':completed[-10:],'waiting_for':[], 'next_steps':['Read remaining files'],'completed_units':i+1,'total_units':len(files)}
                with lock:
                    snapshots[agent_id] = report
                office.progress(agent_id, **report)
            report = {'state':'completed','summary':f'Finished scanning {len(files)} files','task_id':agent_id+'-scan','completed_items':completed[-10:],'waiting_for':[], 'next_steps':[]}
            if files:
                report.update(completed_units=len(files),total_units=len(files))
            with lock:
                snapshots[agent_id] = report
            office.progress(agent_id, **report)
        print(f'Visit http://127.0.0.1:8765/?run={office.run_id}. Answering questions for {args.seconds} seconds.',flush=True)
        time.sleep(args.seconds)  # Keep the real app's question responders online after work.
