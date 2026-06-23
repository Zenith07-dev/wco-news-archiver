"use strict";
const axios = require("axios");
const TARGET = "uz";
const SOURCE = "en";
function decodeEntities(s) {
  return String(s).replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(+n));
}
function splitText(text,maxLen){
  if(text.length<=maxLen)return[text];
  const chunks=[],words=text.split(" ");let current="";
  for(const word of words){
    if((current+" "+word).trim().length>maxLen){if(current)chunks.push(current.trim());current=word;}
    else{current=current?current+" "+word:word;}
  }
  if(current)chunks.push(current.trim());return chunks;
}
async function myMemoryTranslate(texts){
  const email=process.env.MY_MEMORY_EMAIL||"";const results=[];
  for(const text of texts){
    if(!text||!text.trim()){results.push("");continue;}
    const chunks=splitText(text,450);const translated=[];
    for(const chunk of chunks){
      const params=new URLSearchParams({q:chunk,langpair:SOURCE+"|"+TARGET});
      if(email)params.append("de",email);
      const{data}=await axios.get("https://api.mymemory.translated.net/get?"+params,{timeout:15000});
      if(data.responseStatus===200){translated.push(decodeEntities(data.responseData.translatedText));}
      else{throw new Error("MyMemory xato: "+data.responseDetails);}
      await new Promise((res)=>setTimeout(res,200));
    }
    results.push(translated.join(" "));
  }
  return results;
}
async function claudeTranslate(texts){
  const key=process.env.ANTHROPIC_API_KEY;if(!key)throw new Error("ANTHROPIC_API_KEY yo'q");
  const numbered=texts.map((t,i)=>"["+(i+1)+"] "+t).join("\n\n");
  const prompt="Translate English to formal Uzbek (Latin). Keep [N] numbers. Return ONLY translations.\n\n"+numbered;
  const{data}=await axios.post("https://api.anthropic.com/v1/messages",
    {model:process.env.CLAUDE_MODEL||"claude-sonnet-4-6",max_tokens:8192,messages:[{role:"user",content:prompt}]},
    {timeout:60000,headers:{"x-api-key":key,"anthropic-version":"2023-06-01","content-type":"application/json"}}
  );
  const out=data.content.map((c)=>c.type==="text"?c.text:"").join("");
  const parts=[];const re=/\[(\d+)\]\s*([\s\S]*?)(?=\n+\[\d+\]|\s*$)/g;let m;
  while((m=re.exec(out))!==null)parts[parseInt(m[1],10)-1]=m[2].trim();
  for(let i=0;i<texts.length;i++)if(parts[i]===undefined)parts[i]="";
  return parts;
}
function isQuotaError(err){const s=err.response&&err.response.status;return s===403||s===429||s===400;}
function chunkBySize(arr,maxItems,maxChars){
  const out=[];let cur=[],curChars=0;
  for(const item of arr){const len=(item||"").length;
    if(cur.length&&(cur.length>=maxItems||curChars+len>maxChars)){out.push(cur);cur=[];curChars=0;}
    cur.push(item);curChars+=len;
  }
  if(cur.length)out.push(cur);return out;
}
async function translateParagraphs(texts){
  if(!texts.length)return{translations:[],provider:"none"};
  const order=["mymemory","claude"];let lastErr=null;
  for(const provider of order){
    try{
      console.log("  Tarjima: "+provider+" ...");
      const fn=provider==="claude"?claudeTranslate:myMemoryTranslate;
      const maxItems=provider==="claude"?20:10;const maxChars=provider==="claude"?6000:3000;
      const chunks=chunkBySize(texts,maxItems,maxChars);const results=[];
      for(const ch of chunks){results.push(...(await fn(ch)));await new Promise((res)=>setTimeout(res,300));}
      console.log("  OK tarjima ("+provider+")");return{translations:results,provider};
    }catch(err){lastErr=err;console.warn("  "+provider+" ishlamadi: "+(isQuotaError(err)?"kvota":err.message));}
  }
  throw new Error("Barcha tarjima provayderlari ishlamadi: "+(lastErr&&lastErr.message));
}
module.exports={translateParagraphs};
