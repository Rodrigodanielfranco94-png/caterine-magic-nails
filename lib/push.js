import webpush from 'web-push';
import { list, del } from '@vercel/blob';

const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || 'BDU4VDXQNvnbPBFQDJI4kWjUYHJLzow4QlJrEV33oxSi4Hy4wkRjuQb88hhgXokvSbEec_W8rYP8zZtsoHsLJkE';

function configured(){
  return Boolean(PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}
function configure(){
  if(!configured()) return false;
  webpush.setVapidDetails(
    'mailto:Magicnailscaterine25@gmail.com',
    PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
  return true;
}
export function getVapidPublicKey(){ return PUBLIC_KEY; }

export async function sendPush(payload){
  if(!configure()) return {sent:0,skipped:true};
  const r=await list({prefix:'caterine/push/subscriptions/',limit:1000});
  let sent=0;
  for(const b of (r.blobs||[])){
    try{
      const rr=await fetch(b.url,{cache:'no-store'});
      if(!rr.ok) continue;
      const sub=await rr.json();
      await webpush.sendNotification(sub,JSON.stringify(payload));
      sent++;
    }catch(e){
      const code=e?.statusCode||e?.status;
      if(code===404||code===410){
        try{await del(b.url)}catch{}
      }
    }
  }
  return {sent};
}
