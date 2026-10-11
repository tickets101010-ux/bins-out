// Bins Out V8 Cloudflare Worker — CORS-enabled proxy for UKBinDay API v2.
const API = "https://ukbinday.co.uk/api/v2";
const ALLOWED_ORIGINS = new Set(["https://tickets101010-ux.github.io", "http://localhost:8788"]);
function cors(origin) {
  const allow = ALLOWED_ORIGINS.has(origin) ? origin : "https://tickets101010-ux.github.io";
  return {"Access-Control-Allow-Origin":allow,"Access-Control-Allow-Methods":"GET, OPTIONS","Access-Control-Allow-Headers":"Content-Type, Accept","Vary":"Origin"};
}
export default {
 async fetch(request) {
  const url=new URL(request.url),origin=request.headers.get("Origin")||"",headers=cors(origin);
  if(request.method==="OPTIONS")return new Response(null,{status:204,headers});
  if(request.method!=="GET")return Response.json({error:"GET only"},{status:405,headers});
  if(url.pathname==="/health")return Response.json({ok:true,service:"Bins Out V8 connector",upstream:API},{headers});
  let upstream;
  if(url.pathname==="/find"){
   const postcode=(url.searchParams.get("postcode")||"").replace(/\s+/g,"").toUpperCase();
   if(!postcode)return Response.json({error:"postcode required"},{status:400,headers});
   upstream=`${API}/find?postcode=${encodeURIComponent(postcode)}`;
  }else if(url.pathname==="/view"){
   const lad=(url.searchParams.get("lad")||"").trim(),uprn=(url.searchParams.get("uprn")||"").trim();
   if(!lad||!/^[A-Za-z0-9_-]{3,20}$/.test(lad))return Response.json({error:"Valid council LAD code required; search postcode first"},{status:400,headers});
   if(!/^\d{1,12}$/.test(uprn))return Response.json({error:"A valid UPRN (up to 12 digits) is required"},{status:400,headers});
   const params=new URLSearchParams();
   for(const key of ["postcode","address"]){const value=url.searchParams.get(key);if(value)params.set(key,value)}
   upstream=`${API}/${encodeURIComponent(lad)}/view/${encodeURIComponent(uprn)}${params.size?`?${params}`:""}`;
  }else if(url.pathname==="/councils"){
   upstream=`${API}/councils`;
  }else return Response.json({error:"Use /health, /find?postcode=..., /view?lad=...&uprn=...&postcode=...&address=..., or /councils"},{status:404,headers});
  try{
   const response=await fetch(upstream,{headers:{Accept:"application/json","User-Agent":"Bins-Out-V8/1.0"}});
   const body=await response.text();
   return new Response(body,{status:response.status,headers:{...headers,"Content-Type":response.headers.get("Content-Type")||"application/json","Cache-Control":"no-store"}});
  }catch(error){return Response.json({error:"Upstream request failed",detail:String(error)},{status:502,headers})}
 }
};
