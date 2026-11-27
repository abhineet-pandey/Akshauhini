"""Ollama semantic candidate retrieval retaining exact document quotes and IDs."""
import math
import httpx

def retrieve_embeddings(documents, query, model, url, limit=16):
    rows=[{'source_id':f'{name}:L{i}','title':name,'excerpt':line.strip()} for name,text in documents.items() for i,line in enumerate(text.splitlines(),1) if line.strip() and not line.startswith('#')]
    if not rows:return []
    if len(rows)>200:raise ValueError('Embedding demo supports at most 200 nonempty source lines per batch of documents')
    inputs=[query]+[r['excerpt'] for r in rows];vectors=[]
    with httpx.Client(timeout=120,trust_env=False) as client:
        for i in range(0,len(inputs),32):
            response=client.post(url.rstrip('/')+'/api/embed',json={'model':model,'input':inputs[i:i+32],'truncate':False})
            response.raise_for_status();batch=response.json().get('embeddings',[])
            if len(batch)!=len(inputs[i:i+32]):raise ValueError('Ollama returned an unexpected embedding count')
            vectors.extend(batch)
    dimension=len(vectors[0]);norms=[]
    for vector in vectors:
        if not dimension or len(vector)!=dimension or any(not isinstance(v,(int,float)) or not math.isfinite(v) for v in vector):raise ValueError('Invalid Ollama embedding vectors')
        norm=math.sqrt(sum(v*v for v in vector))
        if not norm:raise ValueError('Ollama returned a zero embedding')
        norms.append(norm)
    ranked=[]
    for i,row in enumerate(rows,1):
        score=sum(a*b for a,b in zip(vectors[0],vectors[i]))/(norms[0]*norms[i])
        ranked.append((score,row))
    ranked.sort(key=lambda item:(-item[0],item[1]['source_id']))
    return [row for score,row in ranked[:limit] if score>0]
