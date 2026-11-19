import {createApp,defineComponent,h,ref} from 'vue';
const Status=defineComponent({props:['status'],setup(props){return ()=>h('p',{id:'status',role:'status','data-ux-state':props.status==='Idle'?'idle':props.status==='Saving'?'pending':props.status==='Saved'?'success':'error'},props.status);}});
const Editor=defineComponent({props:['modelValue','disabled'],emits:['update:modelValue'],setup(props,{emit}){return ()=>h('label',{for:'name'},['Name ',h('input',{id:'name',value:props.modelValue,disabled:props.disabled,onInput:e=>emit('update:modelValue',e.target.value)})]);}});
const App=defineComponent({setup(){
  const name=ref(''),status=ref('Idle'),pending=ref(false);let inFlight=false;
  async function save(){
    if(inFlight)return;
    if(!name.value.trim()){status.value='Name required';return;}
    inFlight=true;pending.value=true;status.value='Saving';
    try{const response=await fetch('/api/save',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:name.value})});
      if(!response.ok)throw Error('HTTP '+response.status);
      status.value='Saved';
    }catch{status.value='Could not save. Retry available';}
    finally{inFlight=false;pending.value=false;}
  }
  return ()=>h('main',[h('h1','Vue save fixture'),h(Editor,{modelValue:name.value,disabled:pending.value,'onUpdate:modelValue':v=>name.value=v}),h('button',{id:'save',type:'button',disabled:pending.value,onClick:save},'Save'),h(Status,{status:status.value})]);
}});
createApp(App).mount('#app');
