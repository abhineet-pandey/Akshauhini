"""Real Python operations emitting telemetry, with no model credentials required.
Run: akshauhini run python examples/research_team.py
"""
import ast
import time
from akshauhini import Office

with Office() as office:
    office.agent('manager', 'Morgan', 'manager', 'Operations')
    office.agent('engineer', 'Eden', 'coder', 'Engineering', model='No LLM — Python example')
    office.emit('task.created', 'manager', 'validate', title='Validate a Python expression')
    office.emit('task.assigned', 'manager', 'validate', target_agent_id='engineer')
    office.emit('task.accepted', 'engineer', 'validate')
    with office.operation('task', 'engineer', 'validate'):
        with office.operation('tool.call', 'engineer', 'validate', tool='python') as metrics:
            parsed = ast.parse('sum(i * i for i in range(10))', mode='eval')
            metrics['nodes'] = len(list(ast.walk(parsed)))
        office.emit('artifact.created', 'engineer', 'validate', name='Validated syntax tree')
        office.emit('handoff.started', 'engineer', 'validate', target_agent_id='manager')
        office.emit('handoff.completed', 'manager', 'validate', target_agent_id='manager')
