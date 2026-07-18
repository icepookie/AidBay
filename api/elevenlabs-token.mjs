import {send} from "./_shared.mjs";
export default async function handler(req,res){
  try{
    const headers=process.env.ELEVENLABS_API_KEY?{"xi-api-key":process.env.ELEVENLABS_API_KEY}:{};
    const agent=process.env.ELEVENLABS_AGENT_ID||"agent_5301kxvj22yrezs9qa5evw01hnfe";
    const upstream=await fetch(`https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${agent}`,{headers});
    if(!upstream.ok)return send(res,upstream.status,{error:"ElevenLabs agent token unavailable"});
    const data=await upstream.json();return send(res,200,{conversationToken:data.token||data.conversation_token});
  }catch(error){return send(res,502,{error:"Could not connect to ElevenLabs"})}
}
