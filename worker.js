// Bins Out connector — WhenIsBins address and collection API proxy, with legacy routes retained.
const UKBIN="https://ukbinday.co.uk/api/v2", WHENISBINS="https://whenisbins.com/v1";
const ALLOWED_ORIGINS=new Set(["https://tickets101010-ux.github.io","http://localhost:8788"]);
function cors(origin){return {"Access-Control-Allow-Origin":ALLOWED_ORIGINS.has(origin)?origin:"https://tickets101010-ux.github.io","Access-Control-Allow-Methods":"GET, POST, OPTIONS","Access-Control-Allow-Headers":"Content-Type, Accept, Idempotency-Key","Vary":"Origin"}}
function json(body,status,headers){return new Response(JSON.stringify(body),{status,headers:{...headers,"Content-Type":"application/json; charset=utf-8"}})}
async function proxy(url,init,headers){const r=await fetch(url,init);return new Response(await r.text(),{status:r.status,headers:{...headers,"Content-Type":r.headers.get("Content-Type")||"application/json","Cache-Control":"no-store"}})}
export default {async fetch(request, env){
 const u=new URL(request.url),origin=request.headers.get("Origin")||"",h=cors(origin);
 if(request.method==="OPTIONS")return new Response(null,{status:204,headers:h});
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
}};
