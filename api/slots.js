import { list, put, del } from '@vercel/blob';

const OPEN_MIN = 7*60;
const CLOSE_MIN = 18*60;
const SLOT_MINUTES = 15;
const SERVICE_DURATIONS = {
  'Manicura y pedicura':225,
  'Manicure y pedicure':225,
  'Semipermanente':90,
  'Press on':60,
  'Base rubber':90,
  'Soft gel':120,
  'Acrílico':150
};

function parseBody(req){try{return typeof req.body==='string'?JSON.parse(req.body):(req.body||{})}catch{return {}}}
function validDate(v){return /^\d{4}-\d{2}-\d{2}$/.test(v||'')}
function toMin(t){const [h,m]=String(t||'').split(':').map(Number);return h*60+m}
function toTime(n){return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0')}
function validTime(v){if(!/^\d{2}:\d{2}$/.test(v||''))return false;const n=toMin(v);return n>=OPEN_MIN&&n<CLOSE_MIN&&n%15===0}
function durationFor(body){const d=Number(body.durationMinutes);if(Number.isFinite(d)&&d>=15&&d<=660&&d%15===0)return d;return SERVICE_DURATIONS[body.service]||120}
function pathFor(date,time){return `caterine/slots/${date}/${time.replace(':','-')}.json`}
function notificationPath(kind,date,time){return `caterine/notifications/${Date.now()}-${kind}-${date}-${time.replace(':','-')}.json`}
async function readBlob(b){try{const r=await fetch(b.url,{cache:'no-store'});return r.ok?await r.json():null}catch{return null}}
async function rowsForDate(date){const r=await list({prefix:`caterine/slots/${date}/`,limit:1000});return (await Promise.all((r.blobs||[]).map(readBlob))).filter(Boolean)}
async function writeNotification(record){await put(notificationPath(record.kind,record.date,record.time),JSON.stringify(record),{access:'public',addRandomSuffix:true,contentType:'application/json',cacheControlMaxAge:0})}
function conflictError(e){const s=String(e?.message||e||'').toLowerCase();return s.includes('already')||s.includes('exist')||s.includes('overwrite')||s.includes('409')}
function occupiedTimes(start,duration){const a=[];for(let n=toMin(start);n<toMin(start)+duration;n+=15)a.push(toTime(n));return a}
async function deleteBooking(bookingId,date,time){
  const prefix=validDate(date)?`caterine/slots/${date}/`:'caterine/slots/';
  const r=await list({prefix,limit:1000}); const doomed=[];
  for(const b of r.blobs||[]){const x=await readBlob(b);if(x&&(x.bookingId===bookingId||(!bookingId&&x.date===date&&x.time===time)))doomed.push(b.url)}
  if(doomed.length)await del(doomed); return doomed.length;
}
async function createBooking(body){
  const date=String(body.date||'').trim(),time=String(body.time||'').trim();
  if(!validDate(date)||!validTime(time))throw Object.assign(new Error('Fecha u hora fuera del horario de atención.'),{status:400});
  const durationMinutes=durationFor(body);
  if(toMin(time)+durationMinutes>CLOSE_MIN)throw Object.assign(new Error('Ese servicio no termina antes de las 6:00 p. m. Elige una hora más temprana.'),{status:400});
  const existing=await rowsForDate(date), busy=new Set(existing.map(x=>x.slotTime||x.time));
  const times=occupiedTimes(time,durationMinutes);
  if(times.some(t=>busy.has(t)))throw Object.assign(new Error('Ese horario se cruza con otra cita o bloqueo. Elige otro.'),{status:409});
  const name=String(body.name||'').trim().slice(0,80),phone=String(body.phone||'').trim().slice(0,40),service=String(body.service||'').trim().slice(0,80);
  if(!name||!phone)throw Object.assign(new Error('Escribe nombre y teléfono.'),{status:400});
  const bookingId=body.bookingId||('bk_'+Date.now()+'_'+Math.random().toString(36).slice(2,8));
  const record={type:'booking',bookingId,date,time,startTime:time,durationMinutes,endTime:toTime(toMin(time)+durationMinutes),name,phone,service,location:'studio',address:'',frequency:body.frequency||'once',notes:String(body.notes||'').trim().slice(0,500),createdAt:body.createdAt||new Date().toISOString(),status:'confirmed'};
  const written=[];
  try{
    for(const slotTime of times){const p=pathFor(date,slotTime);await put(p,JSON.stringify({...record,slotTime}),{access:'public',addRandomSuffix:false,allowOverwrite:false,contentType:'application/json',cacheControlMaxAge:0});written.push(p)}
  }catch(e){
    if(written.length){const r=await list({prefix:`caterine/slots/${date}/`,limit:1000});const urls=(r.blobs||[]).filter(b=>written.includes(b.pathname)).map(b=>b.url);if(urls.length)await del(urls)}
    if(conflictError(e))throw Object.assign(new Error('Ese horario acaba de ser ocupado. Elige otro.'),{status:409}); throw e;
  }
  return record;
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  try{
    if(req.method==='GET'){
      const q=req.query||{};let prefix='caterine/slots/';
      if(validDate(q.date))prefix+=q.date+'/';else if(/^\d{4}-\d{2}$/.test(q.month||''))prefix+=q.month+'-';
      const r=await list({prefix,limit:1000});let rows=(await Promise.all((r.blobs||[]).map(readBlob))).filter(Boolean);
      rows.sort((a,b)=>(a.date+(a.slotTime||a.time)).localeCompare(b.date+(b.slotTime||b.time)));
      return res.status(200).json({openHour:7,closeHour:18,slotMinutes:15,serviceDurations:SERVICE_DURATIONS,slots:rows});
    }
    if(req.method==='POST'){
      const body=parseBody(req),action=body.action||'book';
      if(action==='update'){
        const old=await rowsForDate(body.oldDate||body.date);const current=old.find(x=>x.bookingId===body.bookingId);
        if(!current)return res.status(404).json({error:'No encontramos esa cita.'});
        const next={...current,...body,date:body.date||current.date,time:body.time||current.time,bookingId:current.bookingId,createdAt:current.createdAt};
        await deleteBooking(current.bookingId,current.date,current.time);
        try{const booking=await createBooking(next);await writeNotification({kind:'booking',title:'Cita modificada',message:`${booking.name} · ${booking.date} · ${booking.time}–${booking.endTime}`,...booking});return res.status(200).json({ok:true,booking})}
        catch(e){await createBooking(current).catch(()=>{});throw e}
      }
      if(action==='block'){
        const date=String(body.date||'').trim(),time=String(body.time||'').trim(),durationMinutes=durationFor({durationMinutes:body.durationMinutes||15});
        if(!validDate(date)||!validTime(time)||toMin(time)+durationMinutes>CLOSE_MIN)return res.status(400).json({error:'Horario inválido.'});
        const existing=await rowsForDate(date),busy=new Set(existing.map(x=>x.slotTime||x.time)),times=occupiedTimes(time,durationMinutes);
        if(times.some(t=>busy.has(t)))return res.status(409).json({error:'Ese período ya está ocupado.'});
        const bookingId='block_'+Date.now()+'_'+Math.random().toString(36).slice(2,8),reason=String(body.reason||'No disponible').slice(0,120);
        for(const slotTime of times)await put(pathFor(date,slotTime),JSON.stringify({type:'blocked',bookingId,date,time,startTime:time,slotTime,durationMinutes,endTime:toTime(toMin(time)+durationMinutes),reason,createdAt:new Date().toISOString()}),{access:'public',addRandomSuffix:false,allowOverwrite:false,contentType:'application/json',cacheControlMaxAge:0});
        return res.status(201).json({ok:true});
      }
      const booking=await createBooking(body);await writeNotification({kind:'booking',title:'Nueva reserva',message:`${booking.name} reservó ${booking.date} de ${booking.time} a ${booking.endTime} · ${booking.service}`,...booking});return res.status(201).json({ok:true,booking});
    }
    if(req.method==='DELETE'){
      const body=parseBody(req);const count=await deleteBooking(body.bookingId,String(body.date||''),String(body.time||''));
      if(!count)return res.status(404).json({error:'Ese horario ya estaba libre.'});
      return res.status(200).json({ok:true,deleted:count});
    }
    return res.status(405).json({error:'Método no permitido.'});
  }catch(e){return res.status(e.status||500).json({error:e?.message||'Error del servidor'})}
}
