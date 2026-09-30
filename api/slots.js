import { list, put, del } from '@vercel/blob';
import { sendPush } from '../lib/push.js';

const OPEN_HOUR = 7;
const CLOSE_HOUR = 18;
const SLOT_MINUTES = 60;

function parseBody(req){
  try { return typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); }
  catch { return {}; }
}
function validDate(v){ return /^\d{4}-\d{2}-\d{2}$/.test(v || ''); }
function validTime(v){
  if(!/^\d{2}:\d{2}$/.test(v || '')) return false;
  const [h,m]=v.split(':').map(Number);
  return m===0 && h>=OPEN_HOUR && h<CLOSE_HOUR;
}
function pathnameFor(date,time){ return `caterine/slots/${date}/${time.replace(':','-')}.json`; }
async function readBlob(b){
  try{
    const r=await fetch(b.url,{cache:'no-store'});
    if(!r.ok) return null;
    return await r.json();
  }catch{return null}
}
function conflictError(e){
  const s=String(e?.message||e||'').toLowerCase();
  return s.includes('already') || s.includes('exist') || s.includes('overwrite') || s.includes('409');
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  try{
    if(req.method==='GET'){
      const q=req.query||{};
      let prefix='caterine/slots/';
      if(validDate(q.date)) prefix += q.date + '/';
      else if(/^\d{4}-\d{2}$/.test(q.month||'')) prefix += q.month + '-';
      else if(validDate(q.from)) prefix += q.from.slice(0,7) + '-';

      const r=await list({prefix,limit:1000});
      const rows=(await Promise.all((r.blobs||[]).map(readBlob))).filter(Boolean);
      rows.sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time));
      return res.status(200).json({
        openHour:OPEN_HOUR,
        closeHour:CLOSE_HOUR,
        slotMinutes:SLOT_MINUTES,
        slots:rows
      });
    }

    if(req.method==='POST'){
      const body=parseBody(req);
      const action=body.action==='block'?'block':'book';
      const date=(body.date||'').trim();
      const time=(body.time||'').trim();
      if(!validDate(date)||!validTime(time)) return res.status(400).json({error:'Fecha u hora inválida.'});

      const today=new Date();
      const y=today.getFullYear(),m=String(today.getMonth()+1).padStart(2,'0'),d=String(today.getDate()).padStart(2,'0');
      const localToday=`${y}-${m}-${d}`;
      if(date<localToday) return res.status(400).json({error:'No se puede reservar una fecha pasada.'});

      const path=pathnameFor(date,time);
      const now=new Date().toISOString();

      if(action==='book'){
        const name=(body.name||'').trim().slice(0,80);
        const phone=(body.phone||'').trim().slice(0,40);
        const service=(body.service||'').trim().slice(0,80);
        const notes=(body.notes||'').trim().slice(0,500);
        if(!name) return res.status(400).json({error:'Escribe tu nombre.'});
        if(!phone) return res.status(400).json({error:'Escribe tu teléfono.'});
        const record={type:'booking',date,time,name,phone,service,notes,createdAt:now,status:'confirmed'};
        try{
          await put(path,JSON.stringify(record),{
            access:'public',
            addRandomSuffix:false,
            allowOverwrite:false,
            contentType:'application/json',
            cacheControlMaxAge:0
          });
          await sendPush({title:'Nueva reserva',body:`${name} reservó ${date} a las ${time}${service ? ' · '+service : ''}`,tag:'booking-'+date+'-'+time,data:{url:'/caterine-panel.html'}});
          return res.status(201).json({ok:true,booking:record});
        }catch(e){
          if(conflictError(e)) return res.status(409).json({error:'Ese horario acaba de ser ocupado. Elige otro.'});
          throw e;
        }
      }

      const reason=(body.reason||'No disponible').trim().slice(0,120);
      const record={type:'blocked',date,time,reason,createdAt:now};
      try{
        await put(path,JSON.stringify(record),{
          access:'public',
          addRandomSuffix:false,
          allowOverwrite:false,
          contentType:'application/json',
          cacheControlMaxAge:0
        });
        return res.status(201).json({ok:true,slot:record});
      }catch(e){
        if(conflictError(e)) return res.status(409).json({error:'Ese horario ya está ocupado o bloqueado.'});
        throw e;
      }
    }

    if(req.method==='DELETE'){
      const body=parseBody(req);
      const date=(body.date||'').trim(), time=(body.time||'').trim();
      if(!validDate(date)||!validTime(time)) return res.status(400).json({error:'Fecha u hora inválida.'});
      const path=pathnameFor(date,time);
      const r=await list({prefix:path,limit:10});
      const b=(r.blobs||[]).find(x=>x.pathname===path);
      if(!b) return res.status(404).json({error:'Ese horario ya estaba libre.'});
      const existing=await readBlob(b);
      await del(b.url);
      if(existing?.type==='booking'){
        await sendPush({title:'Cita cancelada',body:`${existing.name||'Una clienta'} canceló ${date} a las ${time}`,tag:'cancel-'+date+'-'+time,data:{url:'/caterine-panel.html'}});
      }
      return res.status(200).json({ok:true});
    }

    return res.status(405).json({error:'Método no permitido.'});
  }catch(e){
    return res.status(500).json({error:e?.message||'Error del servidor'});
  }
}
