import React, {useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
function Status({status}) { return <p id="status" role="status" data-ux-state={status==='Idle'?'idle':status==='Saving'?'pending':status==='Saved'?'success':'error'}>{status}</p>; }
function Editor({name,onNameChange,disabled}) { return <label htmlFor="name">Name <input id="name" value={name} onChange={e=>onNameChange(e.target.value)} disabled={disabled}/></label>; }
function App() {
  const [name,setName]=useState(''); const [status,setStatus]=useState('Idle'); const [pending,setPending]=useState(false);
  const inFlight=useRef(false);
  async function save() {
    if(inFlight.current) return;
    if(!name.trim()) {setStatus('Name required');return;}
    inFlight.current=true;setPending(true);setStatus('Saving');
    try { const response=await fetch('/api/save',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name})});
      if(!response.ok) throw Error('HTTP '+response.status);
      setStatus('Saved');
    } catch {setStatus('Could not save. Retry available');}
    finally {inFlight.current=false;setPending(false);}
  }
  return <main><h1>React save fixture</h1><Editor name={name} onNameChange={setName} disabled={pending}/><button id="save" type="button" disabled={pending} onClick={save}>Save</button><Status status={status}/></main>;
}
createRoot(document.getElementById('app')).render(<App/>);
