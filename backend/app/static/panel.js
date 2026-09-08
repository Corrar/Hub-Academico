"use strict";
const $ = (id) => document.getElementById(id);
const titles = {dashboard:"Visão geral",courses:"Cursos",subjects:"Disciplinas",groups:"Turmas",memberships:"Matrículas e vínculos",users:"Usuários",audit:"Auditoria"};
const descriptions = {dashboard:"Acompanhe a base acadêmica e organize os próximos cadastros.",courses:"Os cursos que compõem a estrutura da unidade.",subjects:"Disciplinas vinculadas a cursos e períodos da matriz.",groups:"Ofertas de disciplinas em cada semestre letivo.",memberships:"Alunos e professores associados às turmas, com vigência definida.",users:"Contas provisionadas para uso no ambiente de desenvolvimento.",audit:"Histórico de alterações nos cadastros, com autor e valores registrados."};
const roles = {student:"Aluno",teacher:"Professor",coordinator:"Coordenação"};
const resources = {
  courses: {fields:[['code','Código','text'],['name','Nome do curso','text']]},
  subjects: {fields:[['course_id','Curso','courses'],['code','Código','text'],['name','Nome da disciplina','text'],['term','Período da matriz','number']]},
  groups: {fields:[['subject_id','Disciplina','subjects'],['semester','Semestre letivo (AAAA/1 ou AAAA/2)','text'],['name','Nome da turma','text']]},
  users: {fields:[['name','Nome completo','text'],['email','E-mail institucional','email'],['role','Perfil','role'],['password','Senha inicial de teste','password']]},
  memberships: {fields:[['user_id','Aluno ou professor','users'],['group_id','Turma','groups'],['starts_on','Início do vínculo','date'],['ends_on','Fim do vínculo','date']]}
};
let csrf = "", user = null, page = "dashboard", offset = 0, archived = false, generation = 0;
let editing = null, editorResource = null, editorVersion = 0, saving = false;
const labels = new Map();
function el(tag, text, className) { const node = document.createElement(tag); if(text !== undefined) node.textContent = text; if(className) node.className = className; return node; }
function button(text, handler, className="secondary") {const node=el('button',text,className);node.type='button';node.addEventListener('click',handler);return node;}
function status(message, error=false) {$('status').textContent=message;$('status').className=error?'error':'';}
function resetSession(message="") {
  csrf="";user=null;labels.clear();generation++;editorVersion++;
  $('editor').close();$('fields').replaceChildren();$('view').replaceChildren();$('account-name').textContent='';
  $('app-view').hidden=true;$('login-view').hidden=false;$('login-error').textContent=message;
}
async function api(path, options={}) {
  const headers = {...options.headers};
  if(options.body) headers['Content-Type']='application/json';
  if(options.method && options.method!=='GET' && csrf) headers['X-CSRF-Token']=csrf;
  let response;
  try { response=await fetch('/api/v1'+path,{...options,headers,credentials:'same-origin',cache:'no-store'}); }
  catch {throw new Error('Não foi possível conectar. Verifique a conexão e tente novamente.');}
  if(response.status===204) return null;
  const data=await response.json().catch(()=>({}));
  if(!response.ok) {
    if(response.status===401 && user && path!=='/web/login') resetSession('Sua sessão terminou. Entre novamente.');
    let message=typeof data.detail==='string'?data.detail:'Não foi possível concluir a operação.';
    if(Array.isArray(data.detail)) message='Revise os campos: '+[...new Set(data.detail.map(e=>e.loc.slice(1).join('.')))].join(', ')+'.';
    throw new Error(message);
  }
  return data;
}
function enter(data) {
  user=data.user;csrf=data.csrf_token;
  $('login-view').hidden=true;$('app-view').hidden=false;$('account-name').textContent=user.name;
  $('navigation').replaceChildren(...Object.entries(titles).map(([key,title])=>{
    const item=button(title,()=>navigate(key));item.dataset.page=key;return item;
  }));
  navigate('dashboard');
}
$('login-form').addEventListener('submit',async event=>{
  event.preventDefault();const submit=event.submitter;submit.disabled=true;$('login-error').textContent='';
  const credentials={email:$('email').value,password:$('password').value};
  try {const data=await api('/web/login',{method:'POST',body:JSON.stringify(credentials)});$('password').value='';enter(data);}
  catch(error){$('login-error').textContent=error.message;}
  finally{credentials.password='';$('password').value='';submit.disabled=false;}
});
$('logout').addEventListener('click',async()=>{
  $('logout').disabled=true;
  try{await api('/auth/logout',{method:'POST'});resetSession();$('email').focus();}
  catch(error){status(error.message,true);}finally{$('logout').disabled=false;}
});
function navigate(key) {
  page=key;offset=0;archived=false;
  for(const item of $('navigation').children) {if(item.dataset.page===key)item.setAttribute('aria-current','page');else item.removeAttribute('aria-current');}
  $('page-title').textContent=titles[key];$('page-description').textContent=descriptions[key];
  $('new-record').hidden=!resources[key];$('new-record').textContent=key==='memberships'?'Vincular pessoa':'Novo cadastro';
  render();
}
$('new-record').addEventListener('click',()=>openEditor());
function formatDate(value) {if(!value)return '—';const parts=value.split('-');return parts.length===3?`${parts[2]}/${parts[1]}/${parts[0]}`:value;}
function reference(resource,id) {return labels.get(resource+':'+id)||id;}
async function resolveReferences(rows) {
  const map={course_id:'courses',subject_id:'subjects',group_id:'groups',user_id:'users',actor_id:'users'};
  await Promise.all(Object.entries(map).map(async([field,resource])=>{
    const ids=[...new Set(rows.map(row=>row[field]).filter(Boolean))];if(!ids.length)return;
    const query=new URLSearchParams({limit:'100'});ids.forEach(id=>query.append('ids',id));
    for(const row of await api('/lookup/'+resource+'?'+query)) labels.set(resource+':'+row.id,row.label);
  }));
}
async function render() {
  const ticket=++generation, resource=page;
  status('Carregando…');$('view').replaceChildren();
  try {
    if(resource==='dashboard') {
      const counts=await api('/dashboard');if(ticket!==generation)return;
      const cards=el('div',undefined,'cards');
      for(const key of ['courses','subjects','groups','users','memberships']) {
        const card=button('',()=>navigate(key),'card');card.append(el('span',titles[key]),el('strong',String(counts[key])),el('span','Cadastros não arquivados'));cards.append(card);
      }
      const guide=el('div',undefined,'guide');guide.append(el('h2','Comece pela estrutura acadêmica'),el('p','Cadastre o curso, suas disciplinas e as ofertas do semestre. Depois, associe alunos e professores às turmas. Os vínculos têm início e fim; a permissão de acesso é calculada pelo servidor.','muted'));
      const steps=el('div',undefined,'steps');['courses','subjects','groups','memberships'].forEach((key,i)=>steps.append(button(`${i+1}. ${titles[key]}`,()=>navigate(key))));guide.append(steps);$('view').append(cards,guide);status('');return;
    }
    const rows=await api('/'+resource+'?'+new URLSearchParams({offset:String(offset),limit:'25',...(resource==='audit'?{}:{archived:String(archived)})}));
    await resolveReferences(rows);if(ticket!==generation)return;
    const box=el('div',undefined,'table-card');
    const toolbar=el('div',undefined,'toolbar');toolbar.append(el('span',resource==='audit'?'Mais recentes primeiro':'Registros '+(archived?'arquivados':'não arquivados')));
    if(resource!=='audit') {
      const label=el('label','Mostrar arquivados');const check=el('input');check.type='checkbox';check.checked=archived;
      check.addEventListener('change',()=>{archived=check.checked;offset=0;render();});label.prepend(check);toolbar.append(label);
    } else toolbar.append(button('Atualizar',render));
    box.append(toolbar);
    if(rows.length) {
      const scroll=el('div',undefined,'table-scroll'),table=el('table'),head=el('thead'),tr=el('tr');
      const columns={courses:['Curso','Código'],subjects:['Disciplina','Curso','Período'],groups:['Turma','Disciplina','Semestre'],users:['Pessoa','E-mail','Perfil'],memberships:['Pessoa','Turma','Vigência'],audit:['Quando','Autor','Operação','Registro']}[resource];
      [...columns,...(resource==='audit'?[]:['Ações'])].forEach(name=>{const th=el('th',name);th.scope='col';tr.append(th);});head.append(tr);table.append(head);
      const body=el('tbody');
      rows.forEach(row=>{
        const line=el('tr');let values;
        if(resource==='courses')values=[row.name,row.code];
        if(resource==='subjects')values=[`${row.code} · ${row.name}`,reference('courses',row.course_id),`${row.term}º`];
        if(resource==='groups')values=[row.name,reference('subjects',row.subject_id),row.semester];
        if(resource==='users')values=[row.name,row.email,roles[row.role]];
        if(resource==='memberships')values=[reference('users',row.user_id),reference('groups',row.group_id),`${formatDate(row.starts_on)} a ${formatDate(row.ends_on)}`];
        if(resource==='audit')values=[new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo'}).format(new Date(row.occurred_at.endsWith('Z')||/[+-]\d\d:\d\d$/.test(row.occurred_at)?row.occurred_at:row.occurred_at+'Z')),reference('users',row.actor_id),({create:'Criação',update:'Edição',upsert:'Vínculo',archive:'Arquivamento',restore:'Restauração'})[row.action]||row.action,row.entity];
        values.forEach(value=>line.append(el('td',value)));
        if(resource==='audit') {
          const detail=el('details'),summary=el('summary','Ver alteração'),pre=el('pre');
          try{pre.textContent=JSON.stringify(JSON.parse(row.changes),null,2);}catch{pre.textContent=row.changes;}
          detail.append(summary,pre);line.lastChild.append(el('small',row.entity_id),detail);
        } else {
          const cell=el('td'),actions=el('div',undefined,'row-actions');
          if(!archived&&resource!=='users')actions.append(button('Editar',()=>openEditor(row)));
          if(!(resource==='users'&&row.role==='coordinator'))actions.append(button(archived?'Restaurar':'Arquivar',()=>archiveRow(resource,row),archived?'secondary':'secondary danger'));
          if(!actions.childNodes.length)actions.append(el('span','Conta protegida','muted'));
          cell.append(actions);line.append(cell);
        }
        body.append(line);
      });table.append(body);scroll.append(table);box.append(scroll);
    } else {const empty=el('div',undefined,'empty');empty.append(el('h2',offset?'Fim da lista':'Nenhum registro por aqui'),el('p',archived?'Os registros arquivados aparecerão aqui.':resource==='audit'?'As alterações nos cadastros aparecerão aqui.':'Use o botão de novo cadastro para começar.'));box.append(empty);}
    const pager=el('div',undefined,'pagination'),previous=button('Anterior',()=>{offset=Math.max(0,offset-25);render();}),next=button('Próxima',()=>{offset+=25;render();});previous.disabled=offset===0;next.disabled=rows.length<25;
    pager.append(previous,el('span',rows.length?`Registros ${offset+1}–${offset+rows.length}`:'Nenhum registro nesta página'),next);box.append(pager);$('view').append(box);status('');
  }catch(error){if(ticket===generation){status(error.message,true);$('view').append(button('Tentar novamente',render));}}
}
async function archiveRow(resource,row) {
  const action=row.archived?'Restaurar':'Arquivar';
  const name=row.name||reference('users',row.user_id);
  if(!window.confirm(`${action} ${name}? ${row.archived?'Os vínculos e a estrutura precisam estar ativos.':'O acesso associado pode ser interrompido. O histórico será preservado.'}`))return;
  try{await api(`/${resource}/${row.id}/archive`,{method:'PATCH',body:JSON.stringify({archived:!row.archived})});await render();status('Alteração registrada na auditoria.');}catch(error){status(error.message,true);}
}
function closeEditor() {if(saving)return;editorVersion++;$('editor').close();$('fields').replaceChildren();editing=null;}
$('close-editor').addEventListener('click',closeEditor);$('cancel-editor').addEventListener('click',closeEditor);
$('editor').addEventListener('cancel',event=>{if(saving){event.preventDefault();return;}editorVersion++;$('fields').replaceChildren();editing=null;});
function picker(field,label,resource,value,locked,version) {
  const wrapper=el('div'),caption=el('label',label);caption.htmlFor='field-'+field;
  const searchBox=el('div',undefined,'picker-search'),search=el('input');search.type='search';search.placeholder='Buscar por nome';search.setAttribute('aria-label','Buscar '+label.toLowerCase());
  const select=el('select');select.id='field-'+field;select.name=field;select.required=true;
  const initial=el('option',value?reference(resource,value):'Selecione…');initial.value=value||'';select.append(initial);
  let skip=0,query='',pending=0;
  const message=el('p','', 'picker-status');message.setAttribute('aria-live','polite');
  const more=button('Carregar mais opções',()=>load(false),'secondary picker-more');
  const load=async(reset)=>{
    const ticket=++pending;if(reset){skip=0;query=search.value;}
    more.disabled=true;message.textContent='Buscando…';
    try{const rows=await api('/lookup/'+resource+'?'+new URLSearchParams({q:query,offset:String(skip),limit:'25'}));
      if(version!==editorVersion||ticket!==pending)return;
      if(reset){const selected=select.selectedOptions[0];select.replaceChildren(initial);if(selected&&selected.value&&selected!==initial)select.append(selected);}
      const existing=new Set([...select.options].map(option=>option.value));
      for(const row of rows){labels.set(resource+':'+row.id,row.label);if(!existing.has(row.id)){const option=el('option',row.label);option.value=row.id;select.append(option);}}
      skip+=rows.length;more.hidden=rows.length<25;message.textContent=rows.length?'Selecione uma opção abaixo da busca.':'Nenhum outro resultado para esta busca.';
    }catch(error){message.textContent=error.message;}finally{if(ticket===pending)more.disabled=false;}
  };
  const find=button('Buscar',()=>load(true));search.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();load(true);}});
  searchBox.append(search,find);wrapper.append(caption);
  if(!locked)wrapper.append(searchBox);select.disabled=locked;wrapper.append(select);
  if(!locked){wrapper.append(more,message);load(true);}else wrapper.append(el('p','O vínculo com este cadastro não pode ser transferido.','help'));
  return wrapper;
}
function openEditor(row=null) {
  editing=row;editorResource=page;const version=++editorVersion;
  $('editor-title').textContent=(row?'Editar · ':'Novo cadastro · ')+titles[page];$('form-error').textContent='';$('fields').replaceChildren();$('save-record').disabled=false;
  for(const [field,label,type] of resources[page].fields) {
    const value=row?.[field];
    if(resources[type]) {const locked=Boolean(row);$('fields').append(picker(field,label,type,value,locked,version));continue;}
    const caption=el('label',label);caption.htmlFor='field-'+field;
    const input=el(type==='role'?'select':'input');input.id='field-'+field;input.name=field;input.required=true;
    if(type==='role') for(const [role,name] of Object.entries(roles)){const option=el('option',name);option.value=role;input.append(option);}
    else {input.type=type;if(type==='text')input.maxLength=field==='code'?30:120;if(type==='number'){input.min='1';input.max='20';}if(type==='password'){input.minLength=12;input.maxLength=128;input.autocomplete='new-password';}if(type==='email'){input.maxLength=254;input.autocomplete='off';}}
    if(field==='code')input.pattern='[A-Z0-9_-]{1,30}';if(field==='semester'){input.pattern='20[0-9]{2}/[12]';input.placeholder='2026/2';}
    if(value!==undefined)input.value=value;
    $('fields').append(caption,input);
    if(field==='password')$('fields').append(el('p','Mínimo de 12 caracteres. Não reutilize senhas reais neste ambiente.','help'));
  }
  $('editor').showModal();
}
$('record-form').addEventListener('submit',async event=>{
  event.preventDefault();const resource=editorResource,row=editing;const payload={};
  for(const [field,,type] of resources[resource].fields){const input=$('field-'+field);payload[field]=type==='number'?Number(input.value):input.value;}
  if(resource==='memberships'&&payload.ends_on<payload.starts_on){$('form-error').textContent='A data final deve ser igual ou posterior à inicial.';return;}
  saving=true;$('save-record').disabled=true;$('form-error').textContent='';
  try{await api('/'+resource+(row&&resource!=='memberships'?'/'+row.id:''),{method:resource==='memberships'||row?'PUT':'POST',body:JSON.stringify(payload)});saving=false;closeEditor();await render();status('Cadastro salvo e registrado na auditoria.');}
  catch(error){$('form-error').textContent=error.message;}finally{saving=false;if(payload.password)payload.password='';$('save-record').disabled=false;}
});
api('/web/session').then(enter).catch(error=>{if($('app-view').hidden&&error.message!=='Autenticação necessária')$('login-error').textContent=error.message;});
