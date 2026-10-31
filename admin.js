const CH=3*1024*1024;
let started=false,timer=null,mode='login';
const esc=s=>String(s==null?'':s);

// ---------- lock / unlock ----------
function show(ok){$('gate').classList.toggle('hide',ok);$('panel').classList.toggle('hide',!ok);$('out').classList.toggle('hide',!ok);
 if(ok&&!started){started=true;refresh();timer=setInterval(()=>{if(!document.hidden)refresh()},6000)}
 if(!ok){started=false;if(timer)clearInterval(timer)}}
function setMode(m){mode=m;const s=m==='setup';
 $('gt').textContent=s?'🔐 Create your admin password':'🔒 Admin locked';
 $('gs').textContent=s?'First time here. Enter the admin Gmail and choose a password only you know (min 6 characters).':'Only Sumit. Enter the admin Gmail and password.';
 $('pw2').classList.toggle('hide',!s);$('ug').textContent=s?'Save password & enter':'Unlock';
 $('pw').autocomplete=s?'new-password':'current-password'}
async function init(){
 if(getTok()){show(true);return} // already unlocked on this phone: go straight in (checked quietly in background)
 try{const s=await api('/api/status');setMode(s.configured?'login':'setup')}
 catch(e){$('gmsg').textContent=e.message}
 show(false)}
async function unlock(){const em=$('em').value.trim(),p=$('pw').value;if(!em){$('gmsg').textContent='Enter the admin Gmail.';return}if(!p){$('gmsg').textContent='Enter the password.';return}
 try{
  if(mode==='setup'){if(p.length<6){$('gmsg').textContent='Use at least 6 characters.';return}
   if(p!==$('pw2').value){$('gmsg').textContent='The two passwords do not match.';return}
   $('gmsg').textContent='Saving…';const r=await api('/api/setup',{method:'POST',json:{password:p,email:em}});setTok(r.token)}
  else{$('gmsg').textContent='Checking…';const r=await api('/api/login',{method:'POST',json:{password:p,email:em}});setTok(r.token)}
  $('pw').value='';$('pw2').value='';$('gmsg').textContent='';show(true)}
 catch(e){$('gmsg').textContent=e.message;if(e.status===403)setMode('login')}}
$('ug').onclick=unlock;$('em').onkeydown=$('pw').onkeydown=$('pw2').onkeydown=e=>{if(e.key==='Enter')unlock()};
$('out').onclick=e=>{e.preventDefault();setTok('');location.reload()};
function expired(e){if(e.status===401){setTok('');location.reload();return true}return false}

// ---------- upload in 3 MB pieces (works for big videos on free Netlify) ----------
async function upload(file,onp){
 const id=(crypto.randomUUID?crypto.randomUUID():'u'+Date.now()+Math.random().toString(16).slice(2)).replace(/[^a-zA-Z0-9-]/g,''),n=Math.ceil(file.size/CH);
 for(let i=0;i<n;i++){const part=file.slice(i*CH,(i+1)*CH);let ok=false,err;
  for(let t=0;t<4&&!ok;t++){try{await api('/api/admin/upload/'+id+'/'+i,{method:'PUT',body:part,headers:{'content-type':'application/octet-stream'}});ok=true}catch(e){err=e;if(e.status===401)throw e;await new Promise(r=>setTimeout(r,800*(t+1)))}}
  if(!ok)throw err;onp(Math.round((i+1)/n*100))}
 await api('/api/admin/finish/'+id,{method:'POST',json:{name:file.name,type:file.type,size:file.size,chunks:n}});
 return id}

$('add').onclick=async()=>{const f=$('af').files[0],n=$('an').value.trim(),p=+$('ap').value;if(!f||!n||!p){$('amsg').textContent='Fill name, price and choose a video.';return}
 $('add').disabled=true;$('amsg').textContent='Uploading… 0%';
 try{const fid=await upload(f,pc=>$('amsg').textContent='Uploading… '+pc+'%  (keep this page open)');
  const o=await api('/api/admin/order',{method:'POST',json:{client:n,price:p,fileId:fid}}),c=o.code;
  const link=location.origin+'/',msg='Hi '+n+', your edited video is ready! Open '+link+' , go to Client Portal and enter code '+c+'. Watch the preview free and pay Rs '+p+' by UPI to unlock the full video.';
  $('amsg').textContent='Created! Code: '+c+' ';const a=document.createElement('a');a.href='https://wa.me/?text='+encodeURIComponent(msg);a.target='_blank';a.textContent='Send on WhatsApp';a.style.color='var(--c)';$('amsg').appendChild(a);
  $('an').value='';$('ap').value='';$('af').value='';refresh()}
 catch(e){if(!expired(e))$('amsg').textContent='Failed: '+e.message}
 $('add').disabled=false};

$('sadd').onclick=async()=>{const f=$('sf').files[0];if(!f){$('smsg').textContent='Choose a file first.';return}
 $('sadd').disabled=true;$('smsg').textContent='Uploading… 0%';
 try{const fid=await upload(f,pc=>$('smsg').textContent='Uploading… '+pc+'%');
  await api('/api/admin/sample',{method:'POST',json:{title:$('st').value.trim(),fileId:fid,kind:f.type.startsWith('image')?'image':'video'}});
  $('smsg').textContent='Sample added ✔';$('st').value='';$('sf').value='';refresh()}
 catch(e){if(!expired(e))$('smsg').textContent='Failed: '+e.message}
 $('sadd').disabled=false};

// ---------- live data (refreshes every few seconds) ----------
let busy=false,lastSig='';
async function refresh(){if(busy)return;busy=true;
 try{const d=await api('/api/admin/data'),sm=await api('/api/samples');
  const sig=JSON.stringify([d,sm]);if(sig!==lastSig&&!document.activeElement?.matches?.('#rows input')){lastSig=sig;drawOrders(d);drawSamples(sm)}}
 catch(e){expired(e)}
 busy=false}
function drawOrders(d){const rows=$('rows');rows.innerHTML='';
 d.orders.forEach(o=>{const tr=document.createElement('tr'),cl=d.claims[o.code];
  const cells=[o.code,o.client,'',o.paid?'✅ Paid':(cl?'⏳ Verify':'🔒 Unpaid'),cl?cl.utr:'—'];
  cells.forEach((t,i)=>{const td=document.createElement('td');
   if(i==2){const inp=document.createElement('input');inp.type='number';inp.value=o.price;inp.style.width='90px';inp.onchange=async()=>{try{await api('/api/admin/order/'+o.code,{method:'PATCH',json:{price:+inp.value}})}catch(e){expired(e)}};td.appendChild(inp)}
   else td.textContent=t;tr.appendChild(td)});
  const td=document.createElement('td'),b=document.createElement('button');b.className='btn ghost';b.style.padding='6px 14px';b.textContent=o.paid?'Lock again':'Approve';
  b.onclick=async()=>{b.disabled=true;try{await api('/api/admin/order/'+o.code,{method:'PATCH',json:{paid:!o.paid}});lastSig='';refresh()}catch(e){expired(e)}};
  const x=document.createElement('button');x.className='btn ghost';x.style.cssText='padding:6px 12px;margin-left:6px';x.textContent='🗑';x.title='Delete this order';
  x.onclick=async()=>{if(!confirm('Delete order '+o.code+' and its video?'))return;try{await api('/api/admin/order/'+o.code,{method:'DELETE'});lastSig='';refresh()}catch(e){expired(e)}};
  td.append(b,x);tr.appendChild(td);rows.appendChild(tr)});
 const fb=$('fbs');fb.textContent='';if(!d.feedback.length){fb.textContent='None yet.'}
 d.feedback.forEach(x=>{const p=document.createElement('p');p.textContent=x.code+' — '+'⭐'.repeat(x.rating)+' '+(x.text||'');fb.appendChild(p)})}
function drawSamples(list){const g=$('slist');g.innerHTML='';
 list.forEach(o=>{const r=document.createElement('div');r.style.cssText='display:flex;justify-content:space-between;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #ffffff14';
  const t=document.createElement('span');t.textContent=(o.kind==='image'?'📷 ':'🎬 ')+(o.title||'Untitled');
  const b=document.createElement('button');b.className='btn ghost';b.style.padding='4px 14px';b.textContent='🗑 Remove';
  b.onclick=async()=>{if(!confirm('Remove this sample?'))return;try{await api('/api/admin/sample/'+o.id,{method:'DELETE'});lastSig='';refresh()}catch(e){expired(e)}};
  r.append(t,b);g.appendChild(r)})}
init();
