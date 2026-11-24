(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const api=(document.querySelector('meta[name="prosolver-api"]')?.content||'').replace(/\/$/,'');
  const categories=['Biomedical engineering','Equipment management','Maintenance','Calibration','Nursing workflows','Clinical administration','Procurement','Inventory','Finance','Human resources','Hospital operations','Quality management','Regulatory compliance','IT and digital systems','Facilities management','Other'];
  const statuses=['new','under_review','awaiting_information','accepted','in_progress','resolved','archived','rejected'];
  let secret='';
  const status=message=>{$('status').textContent=message;};
  async function request(path,options={}){
    const response=await fetch(api+path,{...options,headers:{Authorization:'Bearer '+secret,...options.headers},cache:'no-store'});
    if(!response.ok)throw Error(response.status===401?'Access denied. Enter the current admin token.':'Request failed ('+response.status+').');
    return response;
  }
  const node=(tag,label,className)=>{const el=document.createElement(tag);el.textContent=label;if(className)el.className=className;return el;};
  const selector=(items,value)=>{const select=document.createElement('select');for(const item of items){const option=document.createElement('option');option.value=item;option.textContent=item.replaceAll('_',' ');if(item===value)option.selected=true;select.append(option);}return select;};
  async function load(){
    if(!secret)return status('Enter an admin token.');
    status('Loading…');$('rows').replaceChildren();$('stats').replaceChildren();$('trends').replaceChildren();
    const params=new URLSearchParams();
    for(const [field,id] of [['q','q'],['status','statusFilter'],['type','typeFilter'],['review','reviewFilter'],['from','from'],['to','to']])if($(id).value)params.set(field,$(id).value);
    try{
      const data=await (await request('/admin/summary?'+params)).json();
      for(const [key,value] of Object.entries(data.totals))$('stats').append(node('span',key.replaceAll('_',' ')+': '+value));
      for(const day of data.trends)$('trends').append(node('span',day.day+': '+day.count));
      for(const row of data.submissions)render(row);
      status('Showing '+data.submissions.length+' latest matching requests. '+data.trends.length+' days in trend data.');
    }catch(e){status(e.message);if(e.message.startsWith('Access denied'))secret='';}
  }
  function render(row){
    const card=document.createElement('article');card.className='card';
    card.append(node('h3',row.problem||'Voice submission'));
    card.append(node('p',row.daily||'No daily challenges provided'));
    card.append(node('p',row.created_at+' · '+(row.verified_at?'Verified':'Pending verification'),'meta'));
    card.append(node('p',row.email+' · '+row.phone,'private'));
    const review=selector(statuses,row.review_status),category=selector(['',...categories],row.category||''),priority=selector(['','low','normal','high','critical'],row.priority||'');
    const notes=document.createElement('textarea');notes.value=row.founder_notes||'';notes.maxLength=5000;notes.placeholder='Private founder notes';
    for(const [label,element] of [['Review status',review],['Category',category],['Priority',priority],['Private notes',notes]]){const wrap=document.createElement('label');wrap.textContent=label+' ';wrap.append(element);card.append(wrap);}
    const save=node('button','Save review');save.onclick=async()=>{save.disabled=true;try{await request('/admin/submissions/'+row.id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({review_status:review.value,category:category.value||null,priority:priority.value||null,founder_notes:notes.value})});status('Review saved.');}catch(e){status(e.message);}finally{save.disabled=false;}};card.append(save);
    const research=document.createElement('details');research.append(node('summary','Research classification'));
    const researchKeys=['frequency','severity','urgency','operational_impact','resolution_effort','willingness_to_pay','product_opportunity','recurring_pattern'];
    const inputs={};
    for(const key of researchKeys){const label=document.createElement('label');label.textContent=key.replaceAll('_',' ')+' ';const input=document.createElement('input');input.maxLength=120;input.value=row[key]||'';label.append(input);research.append(label);inputs[key]=input;}
    const classify=node('button','Save classification');classify.onclick=async()=>{const body={};for(const key of researchKeys)body[key]=inputs[key].value.trim()||null;try{await request('/admin/research/'+row.id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});status('Classification saved.');}catch(e){status(e.message);}};research.append(classify);card.append(research);
    if(row.has_audio){const audio=node('button','Download private audio');audio.onclick=async()=>{try{const blob=await (await request('/admin/audio/'+row.id)).blob();const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='prosolver-voice-note-'+row.id;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}catch(e){status(e.message);}};card.append(audio);}
    const del=node('button','Delete submission');del.onclick=async()=>{if(!confirm('Delete this submission and its private audio?'))return;try{await request('/admin/submissions/'+row.id,{method:'DELETE'});card.remove();status('Submission deleted.');}catch(e){status(e.message);}};card.append(del);
    $('rows').append(card);
  }
  $('load').onclick=()=>{secret=$('token').value;$('token').value='';load();};
  $('filter').onclick=load;
  $('clear').onclick=()=>{secret='';$('token').value='';$('stats').replaceChildren();$('trends').replaceChildren();$('rows').replaceChildren();status('Session cleared.');};
  $('export').onclick=async()=>{try{const data=await (await request('/admin/research/export')).json();const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='prosolver-aggregate-research.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);status('Aggregate research export downloaded.');}catch(e){status(e.message);}};
})();
