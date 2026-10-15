"use strict";
const academicPages = {activity:'Atividades',material:'Materiais',notice:'Avisos',event:'Eventos',schedule:'Grade de horários'};
Object.assign(titles,academicPages);
const academicSearch={};
const weekdays=['Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado','Domingo'];
function academicTime(value) {if(!value)return '—';return new Date(/[Zz]|[+-]\d\d:\d\d$/.test(value)?value:value+'Z').toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'});}
function minuteTime(value) {return String(Math.floor(value/60)).padStart(2,'0')+':'+String(value%60).padStart(2,'0');}
function dateInput(value) {if(!value)return '';const d=new Date(/[Zz]|[+-]\d\d:\d\d$/.test(value)?value:value+'Z');return new Date(d.getTime()-3*3600000).toISOString().slice(0,16);}
function canManage(row) {return user?.role==='coordinator'||(user?.role==='teacher'&&row.audience==='group');}
function learningAction(handler) {return async()=>{try{await handler();}catch(error){status(error.message,true);}};}
function learningDialog(title) {
  document.querySelectorAll('.academic-dialog').forEach(node=>node.remove());
  const dialog=el('dialog',undefined,'academic-dialog'),form=el('form'),heading=el('h2',title),error=el('p');heading.id='academic-title';dialog.setAttribute('aria-labelledby',heading.id);error.setAttribute('role','alert');
  const fields=el('div'),actions=el('div',undefined,'dialog-actions'),cancel=button('Fechar',()=>dialog.close()),save=el('button','Salvar','primary');save.type='submit';actions.append(cancel,save);form.append(heading,fields,error,actions);dialog.append(form);document.body.append(dialog);
  let busy=false;dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});dialog.addEventListener('close',()=>dialog.remove());
  const controls={};
  function field(key,label,type,value='',choices=null) {
    const caption=el('label',label),input=el(choices?'select':type==='textarea'?'textarea':'input');input.id='learning-'+key;caption.htmlFor=input.id;input.name=key;
    if(choices)for(const [id,name] of choices){const option=el('option',name);option.value=id;input.append(option);}
    else if(type!=='textarea')input.type=type;
    input.required=type!=='checkbox';if(type==='checkbox')input.checked=Boolean(value);else input.value=value??'';
    if(type==='text')input.maxLength=120;if(type==='textarea'){input.maxLength=20000;input.rows=6;}
    fields.append(caption,input);controls[key]=input;return input;
  }
  form.addEventListener('submit',async event=>{event.preventDefault();if(busy)return;busy=true;save.disabled=true;cancel.disabled=true;error.textContent='';try{await form.save();dialog.close();await render();}catch(e){error.textContent=e.message;}finally{busy=false;save.disabled=false;cancel.disabled=false;}});
  dialog.showModal();return {dialog,form,fields,field,controls,save};
}
async function learningGroups(ui,value='',locked=false) {
  const select=ui.field('group_id','Turma','select',value,[[value,value?'Carregando turma…':'Selecione…']]);let skip=0;
  const more=button('Carregar turmas',learningAction(load));ui.fields.append(more);
  async function load() {
    more.disabled=true;
    try{const rows=await api('/learning/groups?offset='+skip+'&limit=100');if(!ui.dialog.isConnected)return;
      rows.forEach(row=>{labels.set('groups:'+row.id,row.label);const existing=[...select.options].find(o=>o.value===row.id);if(existing)existing.textContent=row.label;else{const option=el('option',row.label);option.value=row.id;select.append(option);}});
      skip+=rows.length;more.hidden=rows.length<100;
    }finally{more.disabled=false;}
  }
  await load();select.disabled=locked;return select;
}
async function publicationEditor(kind,row=null) {
  const ui=learningDialog((row?'Editar · ':'Criar · ')+academicPages[kind]);ui.save.disabled=true;
  try {
    ui.field('title','Título','text',row?.title);ui.field('body','Conteúdo','textarea',row?.body);
    const audiences=[['group','Turma']];if(user.role==='coordinator'&&['notice','event'].includes(kind))audiences.push(['institution','Toda a instituição']);
    const audience=ui.field('audience','Público','select',row?.audience||'group',audiences);audience.disabled=Boolean(row);
    const group=await learningGroups(ui,row?.group_id||'',Boolean(row));
    const sync=()=>{group.required=audience.value==='group';group.disabled=Boolean(row)||audience.value!=='group';};audience.addEventListener('change',sync);sync();
    if(kind==='activity')ui.field('due_at','Prazo — horário de Brasília','datetime-local',dateInput(row?.due_at));
    if(kind==='event') {ui.field('starts_at','Início — horário de Brasília','datetime-local',dateInput(row?.starts_at));ui.field('ends_at','Término — horário de Brasília','datetime-local',dateInput(row?.ends_at));const capacity=ui.field('capacity','Vagas (vazio = sem limite)','number',row?.capacity);capacity.required=false;capacity.min=1;capacity.max=100000;}
    const draft=ui.field('draft','Manter como rascunho','checkbox',row?row.draft:true);draft.disabled=Boolean(row&&!row.draft);
    ui.form.save=async()=>{
      const body={kind,title:ui.controls.title.value,body:ui.controls.body.value,audience:audience.value,group_id:audience.value==='group'?group.value:null,draft:draft.checked,version:row?.version||0};
      for(const key of ['due_at','starts_at','ends_at'])if(ui.controls[key])body[key]=new Date(ui.controls[key].value+':00-03:00').toISOString();
      if(ui.controls.capacity)body.capacity=ui.controls.capacity.value?Number(ui.controls.capacity.value):null;
      if(body.audience==='institution'&&!body.draft&&!confirm('Publicar para TODA a instituição?\n\n'+body.title+'\n\n'+body.body))throw new Error('Publicação não confirmada.');
      await api('/learning/publications'+(row?'/'+row.id:''),{method:row?'PUT':'POST',body:JSON.stringify(body)});
    };
    ui.save.disabled=false;
  }catch(error){ui.dialog.close();throw error;}
}
async function scheduleEditor(row=null) {
  const ui=learningDialog('Grade de horários');ui.save.disabled=true;
  try {await learningGroups(ui,row?.group_id||'');ui.field('weekday','Dia da semana','select',row?.weekday??0,weekdays.map((name,index)=>[String(index),name]));
    ui.field('starts_minute','Início — horário de Brasília','time',row?minuteTime(row.starts_minute):'19:00');ui.field('ends_minute','Término — horário de Brasília','time',row?minuteTime(row.ends_minute):'20:40');ui.field('starts_on','Início da vigência','date',row?.starts_on);ui.field('ends_on','Fim da vigência','date',row?.ends_on);ui.field('room','Sala','text',row?.room);
    ui.form.save=async()=>{const body={};for(const [key,input] of Object.entries(ui.controls))body[key]=key.endsWith('_minute')?input.value.split(':').reduce((h,m)=>Number(h)*60+Number(m)):key==='weekday'?Number(input.value):input.value;await api('/learning/schedule'+(row?'/'+row.id:''),{method:row?'PUT':'POST',body:JSON.stringify(body)});};ui.save.disabled=false;
  }catch(error){ui.dialog.close();throw error;}
}
async function attachmentPanel(kind,key,box,writable) {
  const section=el('section'),heading=el('h3','Anexos');section.append(heading);box.append(section);
  async function load(){const rows=await api(`/learning/${kind}/${key}/attachments`);if(!box.isConnected)return;section.replaceChildren(heading);
    for(const row of rows){const line=el('p'),link=el('a',row.name);link.href='/api/v1/learning/attachments/'+encodeURIComponent(row.id);link.download=row.name;line.append(link);
      if(writable)line.append(button('Arquivar',learningAction(async()=>{await api('/learning/attachments/'+row.id+'/archive',{method:'PATCH',body:JSON.stringify({archived:true})});await load();})));section.append(line);}
    if(!rows.length)section.append(el('p','Nenhum anexo.'));
    if(writable){const caption=el('label','Texto UTF-8 (.txt), até 512 KiB. Máximo de 10 arquivos por registro, incluindo arquivados.'),file=el('input');file.type='file';file.accept='.txt,text/plain';caption.append(file);section.append(caption);
      const upload=button('Enviar arquivo',learningAction(async()=>{const selected=file.files[0];if(!selected)throw new Error('Selecione um arquivo.');if(selected.size>512*1024)throw new Error('Arquivo maior que 512 KiB.');upload.disabled=true;try{await api(`/learning/${kind}/${key}/attachments`,{method:'POST',headers:{'Content-Type':'text/plain','X-File-Name':selected.name},body:selected});await load();}finally{upload.disabled=false;}}));section.append(upload);
    }
  }await load();
}
async function activityDetails(row,box) {
  const section=el('section'),list=el('div');section.append(el('h3',user.role==='student'?'Minha entrega':'Entregas recebidas'),list);box.append(section);let skip=0;
  const more=button('Carregar mais entregas',learningAction(load));section.append(more);
  async function load(){const rows=await api(`/learning/activities/${row.id}/submissions?offset=${skip}&limit=25`);if(!box.isConnected)return;
    for(const submission of rows){const card=el('div',undefined,'guide');card.append(el('h4',submission.student_name),el('p',submission.draft?'Rascunho privado':'Enviada em '+academicTime(submission.submitted_at)),el('p',submission.body,'academic-body'),el('p','Nota: '+(submission.grade??'Aguardando avaliação')),el('p',submission.feedback));list.append(card);
      if(user.role==='student'&&submission.grade===null)card.append(button('Editar entrega',()=>submissionEditor(row,submission)));
      if(user.role!=='student')card.append(button('Avaliar / reabrir',()=>gradeEditor(submission)));
      await attachmentPanel('submission',submission.id,card,user.role==='student'&&submission.draft&&submission.grade===null);
    }
    if(skip===0&&rows.length===0){list.append(el('p','Nenhuma entrega.'));if(user.role==='student')list.append(button('Preparar entrega',()=>submissionEditor(row)));}
    skip+=rows.length;more.hidden=rows.length<25;
  }await load();
}
function submissionEditor(activity,row=null) {
  const ui=learningDialog('Entrega da atividade');ui.field('body','Resposta','textarea',row?.body);ui.field('draft','Salvar rascunho privado (desmarque para enviar)','checkbox',row?row.draft:true);ui.fields.append(el('p','Salve como rascunho para adicionar anexos. Após enviar, o professor poderá avaliar.'));
  ui.form.save=async()=>api('/learning/activities/'+activity.id+'/submission',{method:'PUT',body:JSON.stringify({body:ui.controls.body.value,draft:ui.controls.draft.checked,version:row?.version||0})});
}
function gradeEditor(row) {
  const ui=learningDialog('Avaliação · '+row.student_name),grade=ui.field('grade','Nota de 0 a 10 (vazio = reabrir)','number',row.grade);grade.required=false;grade.min=0;grade.max=10;grade.step='0.01';ui.field('feedback','Feedback / justificativa','textarea',row.feedback).maxLength=10000;
  ui.form.save=async()=>api('/learning/submissions/'+row.id+'/grade',{method:'PUT',body:JSON.stringify({grade:grade.value===''?null:Number(grade.value),feedback:ui.controls.feedback.value,version:row.version})});
}
async function renderLearning(kind,ticket) {
  const isSchedule=kind==='schedule',path=isSchedule?'/learning/schedule':'/learning/publications';
  const rows=await api(path+'?'+new URLSearchParams({...(isSchedule?{}:{kind,q:academicSearch[kind]||''}),offset:String(offset),limit:'25',archived:String(archived)}));if(ticket!==generation)return;
  const query=new URLSearchParams({limit:'100'});[...new Set(rows.map(row=>row.group_id).filter(Boolean))].forEach(id=>query.append('ids',id));
  for(const group of await api('/learning/groups?'+query))labels.set('groups:'+group.id,group.label);if(ticket!==generation)return;
  const toolbar=el('div',undefined,'toolbar'),box=el('div');$('view').append(toolbar,box);
  if(!isSchedule){const search=el('input');search.type='search';search.maxLength=120;search.value=academicSearch[kind]||'';search.setAttribute('aria-label','Buscar em '+academicPages[kind].toLowerCase());const find=()=>{academicSearch[kind]=search.value;offset=0;render();};search.addEventListener('keydown',event=>{if(event.key==='Enter')find();});toolbar.append(search,button('Buscar',find));}
  const manage=isSchedule?user.role==='coordinator':user.role!=='student';
  if(manage){toolbar.append(button(isSchedule?'Novo horário':'Nova publicação',learningAction(()=>isSchedule?scheduleEditor():publicationEditor(kind)),'primary'));
    const caption=el('label','Mostrar arquivados'),check=el('input');check.type='checkbox';check.checked=archived;check.addEventListener('change',()=>{archived=check.checked;offset=0;render();});caption.prepend(check);toolbar.append(caption);}
  if(kind==='activity'&&user.role==='student'){const averages=await api('/learning/averages');if(ticket!==generation)return;for(const item of averages)box.append(el('p',`Média das atividades avaliadas no hub · ${reference('groups',item.group_id)}: ${item.average.toFixed(2)} (${item.count} avaliações). Não é a nota oficial.`));}
  for(const row of rows){const card=el('article',undefined,'guide');box.append(card);
    card.append(el('h2',isSchedule?weekdays[row.weekday]+' · '+minuteTime(row.starts_minute)+'–'+minuteTime(row.ends_minute):row.title));
    card.append(el('p',row.group_id?reference('groups',row.group_id):'Toda a instituição','muted'));
    if(isSchedule)card.append(el('p',row.room+' · '+formatDate(row.starts_on)+' a '+formatDate(row.ends_on)));
    else {card.append(el('p',row.draft?'Rascunho':'Publicado'),el('p',row.body,'academic-body'));if(row.due_at)card.append(el('p','Prazo (Brasília): '+academicTime(row.due_at)));if(row.starts_at)card.append(el('p','Evento (Brasília): '+academicTime(row.starts_at)+' a '+academicTime(row.ends_at)));}
    if(isSchedule?manage:canManage(row)){
      if(!row.archived)card.append(button('Editar',learningAction(()=>isSchedule?scheduleEditor(row):publicationEditor(kind,row))));
      card.append(button(row.archived?'Restaurar':'Arquivar',learningAction(async()=>{if(!confirm((row.archived?'Restaurar':'Arquivar')+' este registro?'))return;await api((isSchedule?'/learning/schedule/':'/learning/publications/')+row.id+'/archive',{method:'PATCH',body:JSON.stringify({archived:!row.archived})});await render();})));
    }
    if(!isSchedule&&!row.archived)card.append(button('Abrir detalhes',learningAction(async()=>{const detail=el('div');card.append(detail);await attachmentPanel('publication',row.id,detail,canManage(row));if(kind==='activity'&&!row.draft)await activityDetails(row,detail);
      if(kind==='event'&&!row.draft){const info=await api('/learning/events/'+row.id+'/enrollment');if(!detail.isConnected)return;detail.append(el('p',`${info.count} inscritos · ${info.capacity??'sem limite de'} vagas`),button(info.enrolled?'Cancelar inscrição':'Inscrever-me',learningAction(async()=>{await api('/learning/events/'+row.id+'/enrollment',{method:'PUT',body:JSON.stringify({archived:info.enrolled})});await render();})));}
    })));
  }
  if(!rows.length)box.append(el('p','Nenhum registro nesta página.'));
  const prev=button('Anterior',()=>{offset=Math.max(0,offset-25);render();}),next=button('Próxima',()=>{offset+=25;render();});prev.disabled=offset===0;next.disabled=rows.length<25;$('view').append(prev,next);status('');
}

async function membershipBatch() {
  const ui=learningDialog('Matrículas em lote · prévia obrigatória');ui.save.disabled=true;
  try{await learningGroups(ui);ui.field('starts_on','Início do vínculo','date');ui.field('ends_on','Fim do vínculo','date');
    ui.fields.append(el('p','Cole até 100 e-mails institucionais, um por linha. Vínculos existentes terão a vigência substituída.'));
    const input=ui.field('rows','E-mails institucionais','textarea');input.maxLength=20000;
    let preview=null;ui.save.textContent='Validar prévia';ui.save.disabled=false;
    ui.fields.addEventListener('input',()=>{preview=null;ui.save.textContent='Validar prévia';});
    ui.form.save=async()=>{
      const rows=input.value.trim().split(/\r?\n/).map(email=>({email:email.trim(),group_id:ui.controls.group_id.value,starts_on:ui.controls.starts_on.value,ends_on:ui.controls.ends_on.value}));
      const result=await api('/memberships/batch',{method:'POST',body:JSON.stringify({rows,confirm:Boolean(preview)})});
      if(result.errors.length)throw new Error(result.errors.map(item=>'Linha '+item.line+': '+item.message).join(' · '));
      if(!preview){preview=result;ui.save.textContent='Confirmar '+rows.length+' vínculos';throw new Error('Prévia validada: '+result.rows.filter(item=>item.action==='create').length+' novos vínculos e '+result.rows.filter(item=>item.action==='update').length+' atualizações. Revise a turma e os e-mails antes de confirmar.');}
    };
  }catch(error){ui.dialog.close();status(error.message,true);}
}
