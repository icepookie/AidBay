import {send} from "./_shared.mjs";
export default async function handler(req,res){
  try{
    const headers=process.env.ELEVENLABS_API_KEY?{"xi-api-key":process.env.ELEVENLABS_API_KEY}:{};
    const agent=process.env.ELEVENLABS_AGENT_ID||"agent_5301kxvj22yrezs9qa5evw01hnfe";
    const params=new URLSearchParams({agent_id:agent});if(process.env.ELEVENLABS_BRANCH_ID)params.set("branch_id",process.env.ELEVENLABS_BRANCH_ID);
    const [tokenResponse,signedResponse]=await Promise.all([
      fetch(`https://api.elevenlabs.io/v1/convai/conversation/token?${params}`,{headers}),
      fetch(`https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?${params}`,{headers})
    ]);
    if(!tokenResponse.ok&&!signedResponse.ok)return send(res,tokenResponse.status||signedResponse.status,{error:"ElevenLabs voice credentials unavailable"});
    const tokenData=tokenResponse.ok?await tokenResponse.json():{};
    const signedData=signedResponse.ok?await signedResponse.json():{};
    return send(res,200,{conversationToken:tokenData.token||tokenData.conversation_token||null,signedUrl:signedData.signed_url||signedData.signedUrl||null});
  }catch(error){return send(res,502,{error:"Could not connect to ElevenLabs"})}
}
