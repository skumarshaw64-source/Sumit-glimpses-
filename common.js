// Shared by client and admin pages. Both talk to the same /api backend, so they are always in sync.
const $=id=>document.getElementById(id);
const TK='sg_admin_token';
function ck(){const m=document.cookie.match(/(?:^|; )sg_t=([^;]*)/);return m?decodeURIComponent(m[1]):''}
function getTok(){let t='';
 try{t=localStorage.getItem(TK)||''}catch(e){}
 if(!t)t=ck();
 if(!t){try{t=sessionStorage.getItem(TK)||''}catch(e){}}
 return t||window._tk||''}
function setTok(t){window._tk=t||'';
 try{t?localStorage.setItem(TK,t):localStorage.removeItem(TK)}catch(e){}
 try{t?sessionStorage.setItem(TK,t):sessionStorage.removeItem(TK)}catch(e){}
 try{document.cookie='sg_t='+(t?encodeURIComponent(t):'')+'; path=/; max-age='+(t?2592000:0)+'; SameSite=Lax'+(location.protocol==='https:'?'; Secure':'')}catch(e){}}
async function api(path,o={}){
 const h={...(o.headers||{})};let body=o.body;
 if(o.json!==undefined){h['content-type']='application/json';body=JSON.stringify(o.json)}
 const t=getTok();if(t&&path.startsWith('/api/admin'))h.authorization='Bearer '+t;
 let r;try{r=await fetch(path,{method:o.method||'GET',headers:h,body,cache:'no-store'})}
 catch(e){const x=new Error('No internet connection. Please try again.');x.status=0;throw x}
 let d={};try{d=await r.json()}catch(e){}
 if(!r.ok){const x=new Error(d.error||('Error '+r.status));x.status=r.status;throw x}
 return d}
