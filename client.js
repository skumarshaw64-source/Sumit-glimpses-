const UPI="6295305574@ptyes";let cur=null,unsub=null,rating=0;
// 3D tilt
document.querySelectorAll('.tilt').forEach(c=>{c.addEventListener('pointermove',e=>{const r=c.getBoundingClientRect(),x=(e.clientX-r.left)/r.width-.5,y=(e.clientY-r.top)/r.height-.5;c.style.transform=`rotateY(${x*18}deg) rotateX(${-y*18}deg) translateZ(10px)`});c.addEventListener('pointerleave',()=>c.style.transform='')});
// stars
for(let i=1;i<=5;i++){const b=document.createElement('button');b.textContent='⭐';b.onclick=()=>{rating=i;[...$('stars').children].forEach((s,j)=>s.classList.toggle('on',j<i))};$('stars').appendChild(b)}
// ---- samples
let soundOn=false;
const sobs=new IntersectionObserver(es=>es.forEach(e=>{const v=e.target;if(e.isIntersecting){document.querySelectorAll('#sgrid video').forEach(x=>{if(x!==v)x.pause()});v.muted=!soundOn;v.play().catch(()=>{v.muted=true;v.play().catch(()=>{})})}else v.pause()}),{threshold:.6});
function applySound(){document.querySelectorAll('#sgrid video').forEach(v=>v.muted=!soundOn);$('snd').textContent=soundOn?'🔊 Sound on':'🔇 Sound off'}
$('snd').onclick=()=>{soundOn=!soundOn;applySound()};
let sampleSig='';
async function loadSamples(){try{const docs=await api('/api/samples');const sig=JSON.stringify(docs.map(d=>d.id));if(sig===sampleSig)return;sampleSig=sig;
const g=$('sgrid');g.innerHTML='';$('sempty').classList.toggle('hide',docs.length>0);
docs.forEach(o=>{const c=document.createElement('div');c.className='tilt sm';let m;if(o.kind==='image'){m=document.createElement('img');m.src=o.url}else{m=document.createElement('video');m.src=o.url;m.preload='metadata';m.loop=true;m.muted=true;m.playsInline=true;m.controls=true;m.setAttribute('controlsList','nodownload');sobs.observe(m)}
const t=document.createElement('p');t.textContent=o.title||'';c.append(m,t);
g.appendChild(c)});applySound()}catch(e){}}
loadSamples();setInterval(()=>{if(!document.hidden)loadSamples()},20000);
// ---- client
$('go').onclick=open;$('code').onkeydown=e=>{if(e.key==='Enter')open()};
async function fetchOrder(){const o=await api('/api/order/'+encodeURIComponent(cur));render(o)}
async function open(){const c=$('code').value.trim().toUpperCase();if(!c)return;
$('pmsg').textContent='Checking…';
try{const o=await api('/api/order/'+encodeURIComponent(c));$('pmsg').textContent='';cur=c;lastUrl='';lastQr='';
if(unsub)clearInterval(unsub);unsub=setInterval(()=>{if(!document.hidden)fetchOrder().catch(()=>{})},5000);render(o)}
catch(e){$('pmsg').textContent=e.status===404?'Code not found. Please check and try again.':e.message}}
let lastUrl='',lastQr='';
function render(o){if(!o)return;$('view').classList.remove('hide');$('vt').textContent=o.title||('Video for '+o.client);
const paid=!!o.paid;$('vb').textContent=paid?'✅ Unlocked':'🔒 Preview 50%';$('vb').className='badge '+(paid?'b-ok':'b-lock');
const v=$('vid');if(lastUrl!==o.url){lastUrl=o.url;v.src=o.url}
$('paybox').classList.toggle('hide',paid);$('thanks').classList.toggle('hide',!paid);$('cn').textContent=o.client||'friend';
$('amt').textContent=o.price;if(!paid&&lastQr!==cur+'|'+o.price){lastQr=cur+'|'+o.price;const link=`upi://pay?pa=${UPI}&pn=${encodeURIComponent('Sumit Kumar Shaw')}&am=${o.price}&cu=INR&tn=${encodeURIComponent('Sumit Glimpses '+cur)}`;
$('qr').innerHTML='';try{new QRCode($('qr'),{text:link,width:170,height:170})}catch(e){$('qr').textContent='Tap “Pay with UPI app”'}$('upilink').href=link}
if(o.claimed&&!paid)$('paymsg').textContent='✔ Transaction ID sent. Sumit will verify and unlock your video shortly.';
if(paid)$('lock').style.display='none';v.dataset.paid=paid?'1':''}
const v=$('vid');
$('lock').addEventListener('click',e=>{if(e.target.closest('a'))return;$('lock').style.display='none';v.currentTime=0;v.play().catch(()=>{})});
function guard(){if(v.dataset.paid||!v.duration)return;const half=v.duration/2;if(v.currentTime>=half){v.pause();v.currentTime=Math.max(0,half-.3);$('lock').style.display='flex'}}
v.addEventListener('timeupdate',guard);v.addEventListener('seeking',guard);v.addEventListener('contextmenu',e=>e.preventDefault());
$('sendutr').onclick=async()=>{const u=$('utr').value.trim();if(u.length<6){$('paymsg').textContent='Please enter a valid transaction ID.';return}
try{await api('/api/claim',{method:'POST',json:{code:cur,utr:u}});$('paymsg').textContent='✔ Sent! Sumit will verify and unlock your video.'}catch(e){$('paymsg').textContent='Could not send. '+e.message}};
$('sendfb').onclick=async()=>{if(!rating){$('fbmsg').textContent='Please choose a star rating.';return}
try{await api('/api/feedback',{method:'POST',json:{code:cur,rating,text:$('fb').value}});$('fbmsg').textContent='💖 Thank you for your feedback!'}catch(e){$('fbmsg').textContent='Could not send. '+e.message}};
$('dl').onclick=async()=>{const b=$('dl');b.disabled=true;
try{const parts=[];let pos=0,total=null,type='video/mp4';
while(total===null||pos<total){const r=await fetch(lastUrl,{headers:{Range:'bytes='+pos+'-'}});if(!r.ok&&r.status!==206)throw new Error('download failed');
type=r.headers.get('content-type')||type;const cr=r.headers.get('content-range');const blob=await r.blob();parts.push(blob);pos+=blob.size;total=cr?+cr.split('/')[1]:pos;
$('fbmsg').textContent='Downloading… '+Math.round(pos/total*100)+'%'}
const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(parts,{type}));a.download='SumitGlimpses-'+cur+'.mp4';document.body.appendChild(a);a.click();a.remove();$('fbmsg').textContent='Download started ✔'}
catch(e){$('fbmsg').textContent='Download failed. Please try again.'}
b.disabled=false};
