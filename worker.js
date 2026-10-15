// Bins Out connector — WhenIsBins address and collection API proxy, with legacy routes retained.
const UKBIN="https://ukbinday.co.uk/api/v2", WHENISBINS="https://whenisbins.com/v1";
const ALLOWED_ORIGINS=new Set(["https://tickets101010-ux.github.io","http://localhost:8788"]);
function cors(origin){return {"Access-Control-Allow-Origin":ALLOWED_ORIGINS.has(origin)?origin:"https://tickets101010-ux.github.io","Access-Control-Allow-Methods":"GET, POST, OPTIONS","Access-Control-Allow-Headers":"Content-Type, Accept, Idempotency-Key","Vary":"Origin"}}
function json(body,status,headers){return new Response(JSON.stringify(body),{status,headers:{...headers,"Content-Type":"application/json; charset=utf-8"}})}
async function proxy(url,init,headers){const r=await fetch(url,init);return new Response(await r.text(),{status:r.status,headers:{...headers,"Content-Type":r.headers.get("Content-Type")||"application/json","Cache-Control":"no-store"}})}

// Web Push helpers. Secrets are configured as VAPID_PUBLIC_KEY and VAPID_PRIVATE_JWK;
// PUSH_STORE is a Cloudflare KV namespace binding.
const B64="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
function b64u(bytes){let s="";for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_")}
function unb64u(s){s=String(s||"").replace(/-/g,"+").replace(/_/g,"/");while(s.length%4)s+="=";return Uint8Array.from(atob(s),c=>c.charCodeAt(0))}
function cat(...arrays){const out=new Uint8Array(arrays.reduce((n,a)=>n+a.length,0));let p=0;for(const a of arrays){out.set(a,p);p+=a.length}return out}
function utf8(s){return new TextEncoder().encode(s)}
async function hkdfBits(secret,salt,info,length){const key=await crypto.subtle.importKey("raw",secret,"HKDF",false,["deriveBits"]);return new Uint8Array(await crypto.subtle.deriveBits({name:"HKDF",hash:"SHA-256",salt,info},key,length*8))}
function uint32(n){return new Uint8Array([(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255])}
async function encryptPush(subscription,payload){
 const ua=unb64u(subscription.keys.p256dh),auth=unb64u(subscription.keys.auth),salt=crypto.getRandomValues(new Uint8Array(16));
 const pair=await crypto.subtle.generateKey({name:"ECDH",namedCurve:"P-256"},true,["deriveBits"]);
 const as=new Uint8Array(await crypto.subtle.exportKey("raw",pair.publicKey));
 const client=await crypto.subtle.importKey("raw",ua,{name:"ECDH",namedCurve:"P-256"},false,[]);
 const shared=new Uint8Array(await crypto.subtle.deriveBits({name:"ECDH",public:client},pair.privateKey,256));
 const ikm=await hkdfBits(shared,auth,cat(utf8("WebPush: info\0"),ua,as),32);
 const cek=await hkdfBits(ikm,salt,utf8("Content-Encoding: aes128gcm\0"),16);
 const nonce=await hkdfBits(ikm,salt,utf8("Content-Encoding: nonce\0"),12);
 const key=await crypto.subtle.importKey("raw",cek,{name:"AES-GCM"},false,["encrypt"]);
 const plain=cat(utf8(JSON.stringify(payload)),new Uint8Array([2]));
 const encrypted=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv:nonce},key,plain));
 return cat(salt,uint32(4096),new Uint8Array([as.length]),as,encrypted);
}
async function vapidToken(endpoint,env){
 const privateJwk=JSON.parse(env.VAPID_PRIVATE_JWK||"{}"),publicKey=String(env.VAPID_PUBLIC_KEY||"");
 if(!privateJwk.d||!publicKey)throw Error("VAPID keys are not configured");
 const aud=new URL(endpoint).origin,now=Math.floor(Date.now()/1000);
 const enc=o=>b64u(utf8(JSON.stringify(o)));
 const unsigned=enc({typ:"JWT",alg:"ES256"})+"."+enc({aud,exp:now+12*60*60,sub:"mailto:bins-out-support@example.com"});
 const key=await crypto.subtle.importKey("jwk",privateJwk,{name:"ECDSA",namedCurve:"P-256"},false,["sign"]);
 const sig=new Uint8Array(await crypto.subtle.sign({name:"ECDSA",hash:"SHA-256"},key,utf8(unsigned)));
 return "vapid t="+unsigned+"."+b64u(sig)+", k="+publicKey;
}
async function sendWebPush(subscription,payload,env){
 const body=await encryptPush(subscription,payload),authorization=await vapidToken(subscription.endpoint,env);
 const response=await fetch(subscription.endpoint,{method:"POST",headers:{"Authorization":authorization,"TTL":"86400","Urgency":"normal","Content-Encoding":"aes128gcm","Content-Type":"application/octet-stream"},body});
 if(response.status===404||response.status===410)return {expired:true};
 if(!response.ok)throw Error("Push service returned "+response.status);
 return {sent:true};
}
function ukParts(date){const p=new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/London",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(date);return Object.fromEntries(p.map(x=>[x.type,x.value]))}
function localDateKey(date){const p=ukParts(date);return p.year+"-"+p.month+"-"+p.day}
function nextDayKey(date){const d=new Date(date);d.setUTCDate(d.getUTCDate()+1);return localDateKey(d)}
async function runPushSchedule(env){
 if(!env.PUSH_STORE||!env.VAPID_PUBLIC_KEY||!env.VAPID_PRIVATE_JWK)return;
 const now=new Date(),parts=ukParts(now),minute=Number(parts.minute);
 if(minute%15!==0)return;
 let cursor;
 do{
  const page=await env.PUSH_STORE.list({prefix:"push:",limit:1000,cursor});
  for(const key of page.keys){
   let record;try{record=await env.PUSH_STORE.get(key.name,"json")}catch{continue}
   if(!record||!record.subscription||record.reminders?.enabled===false||record.schedule?.confirmed!==true||!Array.isArray(record.schedule?.bins))continue;
   const time=String(record.reminders?.time||"19:00"),[hh,mm]=time.split(":").map(Number);
   if(hh!==Number(parts.hour)||mm!==minute)continue;
   const due=record.schedule.bins.filter(b=>String(b.date||"").slice(0,10)===nextDayKey(now));
   if(!due.length)continue;
   const sentKey=localDateKey(now)+"T"+time;
   if(record.lastSent===sentKey)continue;
   const details=record.reminders?.details!==false;
   const names=[...new Set(due.map(b=>String(b.name||b.waste||"Collection")))];
   const body=details?"Tomorrow: "+names.join(", ")+". Put your bins out tonight.":"Your bin collection is tomorrow. Put your bins out tonight.";
   try{
    const result=await sendWebPush(record.subscription,{title:"Bins Out reminder",body,url:"https://tickets101010-ux.github.io/bins-out/"},env);
    if(result.expired){await env.PUSH_STORE.delete(key.name);continue}
    record.lastSent=sentKey;await env.PUSH_STORE.put(key.name,JSON.stringify(record));
   }catch(error){console.error("Push delivery failed",key.name,String(error))}
  }
  cursor=page.list_complete?undefined:page.cursor;
 }while(cursor);
}

export default {async fetch(request, env){
 const u=new URL(request.url),origin=request.headers.get("Origin")||"",h=cors(origin);
 if(request.method==="OPTIONS")return new Response(null,{status:204,headers:h});

 if(u.pathname==="/push/public-key"&&request.method==="GET"){
  if(!env.VAPID_PUBLIC_KEY)return json({problem:"push_not_configured",detail:"Automatic reminders are not configured on the connector yet."},503,h);
  return json({publicKey:env.VAPID_PUBLIC_KEY},200,h);
 }
 if(u.pathname==="/push/register"&&request.method==="POST"){
  if(!env.PUSH_STORE||!env.VAPID_PUBLIC_KEY||!env.VAPID_PRIVATE_JWK)return json({problem:"push_not_configured",detail:"Cloudflare push storage and VAPID keys have not been configured yet."},503,h);
  let body;try{body=await request.json()}catch{return json({problem:"invalid_request",detail:"Request body must be valid JSON."},400,h)}
  const id=String(body.id||"");
  const sub=body.subscription;
  if(!/^[a-zA-Z0-9_-]{12,80}$/.test(id)||!sub||typeof sub.endpoint!=="string"||!sub.keys?.p256dh||!sub.keys?.auth)return json({problem:"invalid_request",detail:"A valid reminder ID and browser push subscription are required."},400,h);
  const old=await env.PUSH_STORE.get("push:"+id,"json").catch(()=>null);
  const record={id,subscription:sub,schedule:body.schedule||old?.schedule||null,reminders:body.reminders||old?.reminders||{time:"19:00",enabled:true,details:true},lastSent:old?.lastSent||null,updatedAt:new Date().toISOString()};
  await env.PUSH_STORE.put("push:"+id,JSON.stringify(record));
  return json({ok:true,registered:true},200,h);
 }
 if(u.pathname==="/push/schedule"&&request.method==="POST"){
  if(!env.PUSH_STORE)return json({problem:"push_not_configured",detail:"Push storage is not configured."},503,h);
  let body;try{body=await request.json()}catch{return json({problem:"invalid_request",detail:"Request body must be valid JSON."},400,h)}
  const id=String(body.id||"");if(!/^[a-zA-Z0-9_-]{12,80}$/.test(id))return json({problem:"invalid_request",detail:"A valid reminder ID is required."},400,h);
  const key="push:"+id,record=await env.PUSH_STORE.get(key,"json").catch(()=>null);
  if(!record)return json({problem:"not_registered",detail:"Enable automatic reminders on this device first."},409,h);
  record.schedule=body.schedule||null;record.reminders=body.reminders||record.reminders;record.updatedAt=new Date().toISOString();
  await env.PUSH_STORE.put(key,JSON.stringify(record));return json({ok:true,saved:true},200,h);
 }
 if(u.pathname==="/push/unregister"&&request.method==="POST"){
  if(!env.PUSH_STORE)return json({ok:true,removed:true},200,h);
  let body;try{body=await request.json()}catch{return json({problem:"invalid_request",detail:"Request body must be valid JSON."},400,h)}
  const id=String(body.id||"");if(!/^[a-zA-Z0-9_-]{12,80}$/.test(id))return json({problem:"invalid_request",detail:"A valid reminder ID is required."},400,h);
  await env.PUSH_STORE.delete("push:"+id);return json({ok:true,removed:true},200,h);
 }

 if(u.pathname==="/health"&&request.method==="GET")return json({ok:true,service:"Bins Out connector",addressProvider:"WhenIsBins",legacyProvider:UKBIN},200,h);
 if(u.pathname==="/glasgow-calendar"&&request.method==="GET"){
  const uprn=(u.searchParams.get("uprn")||"").trim();if(!/^\d{1,12}$/.test(uprn))return json({problem:"invalid_uprn",detail:"A valid property UPRN is required."},400,h);
  try{return await proxy(`https://onlineservices.glasgow.gov.uk/forms/refuseandrecyclingcalendar/CollectionsCalendar.aspx?UPRN=${encodeURIComponent(uprn)}`,{headers:{"Accept":"text/html"}},h)}catch(e){return json({problem:"upstream_unavailable",detail:"Glasgow City Council calendar is temporarily unavailable."},502,h)}
 }
 if(u.pathname==="/resolve-uprn"&&request.method==="GET"){
  const postcode=(u.searchParams.get("postcode")||"").trim().toUpperCase();
  const address=(u.searchParams.get("address")||"").trim();
  if(!postcode||!address)return json({problem:"invalid_request",detail:"A postcode and selected address are required."},400,h);
  const apiKey=String(env&&env.OS_PLACES_API_KEY||"").trim();
  if(!apiKey)return json({problem:"address_provider_not_configured",detail:"Automatic UPRN lookup is not configured yet. Add OS_PLACES_API_KEY as a Cloudflare Worker secret, then retry Find address by postcode."},503,h);
  try{
   const target=new URL("https://api.os.uk/search/places/v1/postcode");
   target.searchParams.set("postcode",postcode);target.searchParams.set("dataset","DPA");target.searchParams.set("maxresults","100");target.searchParams.set("key",apiKey);
   const r=await fetch(target.toString(),{headers:{Accept:"application/json"}});
   const data=await r.json().catch(()=>null);
   if(!r.ok||!data)return json({problem:"address_provider_error",detail:"Ordnance Survey address lookup failed ("+r.status+"). Check the OS Places API key and access plan."},502,h);
   const rows=Array.isArray(data.results)?data.results:[];
   const addresses=rows.map(row=>row.DPA||row.LPI).filter(a=>a&&a.UPRN).map(a=>({
    uprn:String(a.UPRN),address:String(a.ADDRESS||"").trim(),postcode:String(a.POSTCODE||a.POSTCODE_LOCATOR||postcode).trim(),
    building_number:String(a.BUILDING_NUMBER||a.PAO_START_NUMBER||"").trim(),
    thoroughfare:String(a.THOROUGHFARE_NAME||a.STREET_DESCRIPTION||"").trim(),
    council_name:String(a.LOCAL_CUSTODIAN_CODE_DESCRIPTION||a.ADMINISTRATIVE_AREA||"").trim()
   })).filter(a=>a.address&&/^\d{1,12}$/.test(a.uprn));
   const normalise=s=>String(s||"").toUpperCase()
    .replace(/\bST\b/g,"STREET").replace(/\bRD\b/g,"ROAD").replace(/\bAVE\b/g,"AVENUE")
    .replace(/\bCRES\b/g,"CRESCENT").replace(/\bDR\b/g,"DRIVE").replace(/\bLN\b/g,"LANE")
    .replace(/\bGDNS\b/g,"GARDENS").replace(/\bPL\b/g,"PLACE")
    .replace(/[^A-Z0-9]+/g," ").trim().replace(/\s+/g," ");
   const q=normalise(address),tokens=[...new Set(q.split(" ").filter(t=>t.length>1))];
   const ranked=addresses.map(a=>{
    const candidate=normalise(a.address),candidateTokens=new Set(candidate.split(" "));
    const hits=tokens.filter(t=>candidateTokens.has(t));
    return {...a,score:tokens.length?hits.length/tokens.length:0,exact:candidate===q};
   }).sort((a,b)=>Number(b.exact)-Number(a.exact)||b.score-a.score);
   const exact=ranked.filter(a=>a.exact);
   const confident=ranked.filter(a=>a.score===1);
   if(exact.length===1||(!exact.length&&confident.length===1)){
    const a=(exact.length?exact:confident)[0];
    return json({status:"matched",uprn:a.uprn,matched_address:a.address,postcode:a.postcode,council_name:a.council_name},200,h);
   }
   const likely=(exact.length?exact:ranked.filter(a=>a.score>=0.5)).slice(0,12).map(({uprn,address,postcode,building_number,thoroughfare,council_name})=>({uprn,address,postcode,building_number,thoroughfare,council_name}));
   return json({status:"choose",detail:likely.length?"Several address records are possible. Select the exact property before saving its UPRN.":"No confident match was found for this address and postcode. No UPRN has been guessed.",candidates:likely},200,h);
  }catch(e){return json({problem:"upstream_unavailable",detail:"Ordnance Survey address lookup is temporarily unavailable."},502,h)}
 }
 if(u.pathname==="/addresses"&&request.method==="GET"){
  const postcode=(u.searchParams.get("postcode")||"").trim();if(!postcode)return json({problem:"invalid_postcode",detail:"Enter a full UK postcode."},400,h);
  try{return await proxy(`${WHENISBINS}/addresses?postcode=${encodeURIComponent(postcode)}`,{headers:{Accept:"application/json"}},h)}catch(e){return json({problem:"upstream_unavailable",detail:"Address service is temporarily unavailable."},502,h)}
 }
 if(u.pathname==="/lookups"&&request.method==="POST"){
  let body;try{body=await request.json()}catch{return json({problem:"invalid_request",detail:"Request body must be valid JSON."},400,h)}
  try{return await proxy(`${WHENISBINS}/lookups`,{method:"POST",headers:{"Accept":"application/json","Content-Type":"application/json","Idempotency-Key":request.headers.get("Idempotency-Key")||crypto.randomUUID()},body:JSON.stringify(body)},h)}catch(e){return json({problem:"upstream_unavailable",detail:"Collection service is temporarily unavailable."},502,h)}
 }
 if(u.pathname==="/status"&&request.method==="GET"){
  const id=(u.searchParams.get("id")||"").trim();if(!/^[0-9a-f-]{20,60}$/i.test(id))return json({problem:"invalid_request",detail:"A valid lookup ID is required."},400,h);
  try{return await proxy(`${WHENISBINS}/lookups/${encodeURIComponent(id)}`,{headers:{Accept:"application/json"}},h)}catch(e){return json({problem:"upstream_unavailable",detail:"Could not check collection lookup progress."},502,h)}
 }
 if(request.method!=="GET")return json({error:"Unsupported method"},405,h);
 let upstream;
 if(u.pathname==="/find"){const p=(u.searchParams.get("postcode")||"").replace(/\s+/g,"").toUpperCase();if(!p)return json({error:"postcode required"},400,h);upstream=`${UKBIN}/find?postcode=${encodeURIComponent(p)}`}
 else if(u.pathname==="/view"){const lad=(u.searchParams.get("lad")||"").trim(),uprn=(u.searchParams.get("uprn")||"").trim();if(!lad||!/^[A-Za-z0-9_-]{3,20}$/.test(lad))return json({error:"Valid council LAD code required"},400,h);if(!/^\d{1,12}$/.test(uprn))return json({error:"A valid UPRN is required"},400,h);const p=new URLSearchParams();for(const k of ["postcode","address"]){const v=u.searchParams.get(k);if(v)p.set(k,v)}upstream=`${UKBIN}/${encodeURIComponent(lad)}/view/${encodeURIComponent(uprn)}${p.size?"?"+p:""}`}
 else if(u.pathname==="/councils")upstream=`${UKBIN}/councils`;else return json({error:"Not found"},404,h);
 try{return await proxy(upstream,{headers:{Accept:"application/json"}},h)}catch(e){return json({error:"Upstream request failed"},502,h)}
},async scheduled(event,env,ctx){ctx.waitUntil(runPushSchedule(env));}};
