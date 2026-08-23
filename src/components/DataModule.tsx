import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Eye, FilePlus2, ImagePlus, Pencil, RefreshCw, Search, Trash2, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { modules, optionText, type Field, type Lang, type Role } from '../lib/modules'
import { ui } from '../lib/ui'

type Row=Record<string,unknown>&{id:string}
const hidden=(field:Field,role:Role)=>field.sensitive&&role==='sales'
const permissions:Record<string,{create:Role[];edit:Role[];delete:Role[]}>={inventory:{create:['owner','manager'],edit:['owner','manager','delivery'],delete:['owner','manager']},crm:{create:['owner','manager','sales'],edit:['owner','manager','sales'],delete:['owner','manager']},tasks:{create:['owner','manager','sales','finance','delivery'],edit:['owner','manager','sales','finance','delivery'],delete:['owner','manager']},content:{create:['owner','manager','sales'],edit:['owner','manager','sales'],delete:['owner','manager']},pricing:{create:['owner','manager','sales'],edit:['owner','manager'],delete:['owner','manager']},orders:{create:['owner','manager','sales'],edit:['owner','manager','sales','finance'],delete:['owner','manager']},payments:{create:['owner','manager','finance'],edit:['owner','manager','finance'],delete:['owner','manager','finance']},payroll:{create:['owner','finance'],edit:['owner','finance'],delete:['owner','finance']},delivery:{create:['owner','manager','delivery'],edit:['owner','manager','delivery'],delete:['owner','manager']},afterSales:{create:['owner','manager','sales','delivery'],edit:['owner','manager','delivery'],delete:['owner','manager']}}
const display=(value:unknown,lang:Lang)=>{if(value===null||value===undefined||value==='')return '—';if(typeof value==='boolean')return value?(lang==='fr'?'Oui':'是'):(lang==='fr'?'Non':'否');if(typeof value==='number')return new Intl.NumberFormat(lang==='fr'?'fr-FR':'zh-CN').format(value);const key=String(value);return optionText[key]?.[lang]||key.split('_').join(' ')}

export default function DataModule({id,lang,role,userId}:{id:string;lang:Lang;role:Role;userId?:string}){
 const cfg=modules[id],t=ui[lang];const[rows,setRows]=useState<Row[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[query,setQuery]=useState(''),[status,setStatus]=useState('all'),[editing,setEditing]=useState<Row|null|undefined>(undefined),[viewing,setViewing]=useState<Row|null>(null)
 const fields=useMemo(()=>cfg.fields.filter(x=>!hidden(x,role)),[cfg,role]);const editableFields=fields.filter(f=>!f.writeRoles||f.writeRoles.includes(role));const columns=cfg.columns.filter(k=>fields.some(f=>f.key===k)||!cfg.fields.some(f=>f.key===k));const can=permissions[id]
 const relation=id==='inventory'&&role==='sales'?'sales_vehicle_catalog':cfg.table
 const load=useCallback(async()=>{setLoading(true);setError('');if(!supabase){setRows([]);setLoading(false);return}const{data,error}=await supabase.from(relation).select('*').order('created_at',{ascending:false});if(error)setError(error.message);else setRows((data||[]) as Row[]);setLoading(false)},[relation])
 useEffect(()=>{void load()},[load])
 const filtered=rows.filter(row=>{const matches=Object.values(row).some(v=>String(v??'').toLowerCase().includes(query.toLowerCase()));return matches&&(status==='all'||row.status===status||row.stage===status||row.verification_status===status)})
 const remove=async(row:Row)=>{if(!confirm(t.confirmDelete)||!supabase)return;const{error}=await supabase.from(cfg.table).delete().eq('id',row.id);if(error)setError(error.message);else void load()}
 const statusOptions=Array.from(new Set(rows.map(r=>String(r.status||r.stage||r.verification_status||'')).filter(Boolean)))
 return <main className="main module-page"><section className="module-title"><div><p>GREEN FAST AUTO · {t.live}</p><h1>{cfg.title[lang]}</h1><h2>{lang==='fr'?'Gérez les opérations, les responsabilités et le suivi depuis un seul espace.':'在一个工作区管理运营、责任和进度。'}</h2></div>{can.create.includes(role)&&<button className="primary" onClick={()=>setEditing(null)}><FilePlus2 size={16}/>{t.create}</button>}</section>
 <div className="module-toolbar"><div className="search module-search"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder={t.search}/></div><select value={status} onChange={e=>setStatus(e.target.value)}><option value="all">{t.all}</option>{statusOptions.map(s=><option value={s} key={s}>{display(s,lang)}</option>)}</select><button className="secondary" onClick={()=>void load()}><RefreshCw size={15}/>{t.refresh}</button></div>
 {error&&<div className="error-banner">{error}</div>}{loading?<div className="card loading-state">{t.loading}</div>:filtered.length===0?<div className="card empty"><div className="empty-icon"><FilePlus2/></div><h3>{t.empty}</h3><p>{t.emptyHint}</p>{can.create.includes(role)&&<button className="primary" onClick={()=>setEditing(null)}>{t.create} {cfg.singular[lang]}</button>}</div>:<div className="card data-wrap"><table><thead><tr>{columns.map(k=><th key={k}>{fields.find(f=>f.key===k)?.[lang]||k}</th>)}<th>{t.actions}</th></tr></thead><tbody>{filtered.map(row=><tr key={row.id}>{columns.map(k=><td data-label={fields.find(f=>f.key===k)?.[lang]||k} key={k}>{display(row[k],lang)}</td>)}<td className="row-actions"><button title={t.view} onClick={()=>setViewing(row)}><Eye/></button>{can.edit.includes(role)&&<button title={t.edit} onClick={()=>setEditing(row)}><Pencil/></button>}{can.delete.includes(role)&&<button title={t.delete} onClick={()=>void remove(row)}><Trash2/></button>}</td></tr>)}</tbody></table></div>}
 {editing!==undefined&&<Editor lang={lang} fields={editableFields} configId={id} row={editing} userId={userId} close={()=>setEditing(undefined)} saved={()=>{setEditing(undefined);void load()}}/>}{viewing&&<Detail lang={lang} fields={fields} row={viewing} close={()=>setViewing(null)}/>}</main>
}

function Editor({lang,fields,configId,row,userId,close,saved}:{lang:Lang;fields:Field[];configId:string;row:Row|null;userId?:string;close:()=>void;saved:()=>void}){
 const cfg=modules[configId],t=ui[lang]
 const[form,setForm]=useState<Record<string,unknown>>(()=>Object.fromEntries(fields.map(f=>[f.key,row?.[f.key]??(f.type==='checkbox'?false:'')])) )
 const[pendingPhotos,setPendingPhotos]=useState<File[]>([])
 const[saving,setSaving]=useState(false),[error,setError]=useState('')
 const uploadPhotos=async()=>{
  if(!supabase||pendingPhotos.length===0)return [] as string[]
  if(pendingPhotos.length>10)throw new Error(lang==='fr'?'Maximum 10 photos par enregistrement.':'每次最多上传 10 张图片。')
  const urls:string[]=[]
  for(const file of pendingPhotos){
   if(file.size>10*1024*1024)throw new Error(lang==='fr'?`${file.name} dépasse 10 Mo.`:`${file.name} 超过 10MB。`)
   const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,'_')
   const folder=row?.id||userId||'vehicle'
   const path=`vehicles/${folder}/${Date.now()}-${Math.random().toString(36).slice(2,8)}-${safe}`
   const{error:uploadError}=await supabase.storage.from('vehicle-media').upload(path,file,{cacheControl:'3600',upsert:false})
   if(uploadError)throw uploadError
   const{data}=supabase.storage.from('vehicle-media').getPublicUrl(path)
   urls.push(data.publicUrl)
  }
  return urls
 }
 const submit=async(e:React.FormEvent)=>{
  e.preventDefault();if(!supabase)return;setSaving(true);setError('')
  try{
   const uploaded=await uploadPhotos()
   if(uploaded.length){const existing=String(form.photos||'').trim();form.photos=[existing,...uploaded].filter(Boolean).join('\n')}
   const clean=Object.fromEntries(Object.entries(form).map(([k,v])=>[k,v===''?null:v]))
   if(configId==='pricing'&&!row)clean.requested_by=userId;if(configId==='orders'&&!row)clean.salesperson_id=clean.salesperson_id||userId;if(configId==='content'&&!row)clean.creator_id=clean.creator_id||userId;if(configId==='crm'&&!row)clean.assigned_to=clean.assigned_to||userId
   const result=row?await supabase.from(cfg.table).update(clean).eq('id',row.id):await supabase.from(cfg.table).insert(clean)
   if(result.error)throw result.error
   saved()
  }catch(err){setError(err instanceof Error?err.message:String(err))}finally{setSaving(false)}
 }
 return <div className="modal-layer"><div className="modal"><div className="modal-head"><div><small>{row?t.edit:t.create}</small><h2>{cfg.singular[lang]}</h2></div><button onClick={close}><X/></button></div><form onSubmit={submit}><div className="form-grid">{fields.map(field=><label className={field.type==='textarea'||(configId==='inventory'&&field.key==='photos')?'wide':''} key={field.key}>{field[lang]}{field.required&&' *'}{configId==='inventory'&&field.key==='photos'?<><div className="photo-upload"><ImagePlus size={19}/><div><strong>{lang==='fr'?'Téléverser des photos':'上传车辆图片'}</strong><small>{lang==='fr'?'JPG, PNG, WEBP ou HEIC · 10 Mo max/image · jusqu’à 10 photos':'支持 JPG、PNG、WEBP、HEIC · 单张最大 10MB · 最多 10 张'}</small></div><input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple onChange={e=>setPendingPhotos(Array.from(e.target.files||[]))}/></div>{pendingPhotos.length>0&&<div className="photo-selection">{pendingPhotos.map((file,i)=><span key={`${file.name}-${i}`}>{file.name}</span>)}</div>}<textarea value={String(form[field.key]??'')} onChange={e=>setForm({...form,[field.key]:e.target.value})} placeholder={lang==='fr'?'Les liens existants restent disponibles ici.':'已有图片链接会保留在这里，也可以继续粘贴链接。'}/></>:field.type==='select'?<select required={field.required} value={String(form[field.key]??'')} onChange={e=>setForm({...form,[field.key]:e.target.value})}><option value="">—</option>{field.options?.map(o=><option key={o} value={o}>{display(o,lang)}</option>)}</select>:field.type==='textarea'?<textarea required={field.required} value={String(form[field.key]??'')} onChange={e=>setForm({...form,[field.key]:e.target.value})}/>:field.type==='checkbox'?<input className="toggle" type="checkbox" checked={Boolean(form[field.key])} onChange={e=>setForm({...form,[field.key]:e.target.checked})}/>:<input required={field.required} type={field.type||'text'} step={field.type==='number'?'any':undefined} value={String(form[field.key]??'')} onChange={e=>setForm({...form,[field.key]:field.type==='number'&&e.target.value!==''?Number(e.target.value):e.target.value})}/>}</label>)}</div>{error&&<div className="error-banner">{error}</div>}<div className="form-actions"><button type="button" className="secondary" onClick={close}>{t.cancel}</button><button className="primary" disabled={saving}>{saving?(lang==='fr'?'Téléversement…':'上传中…'):t.save}</button></div></form></div></div>
}

function Detail({lang,fields,row,close}:{lang:Lang;fields:Field[];row:Row;close:()=>void}){const t=ui[lang];return <div className="modal-layer"><div className="modal detail"><div className="modal-head"><div><small>{t.details}</small><h2>{display(row[fields[0]?.key],lang)}</h2></div><button onClick={close}><X/></button></div><div className="detail-grid">{fields.map(f=><div key={f.key}><small>{f[lang]}</small><strong>{display(row[f.key],lang)}</strong></div>)}</div><div className="form-actions"><button className="secondary" onClick={close}><ArrowLeft size={15}/>{t.back}</button></div></div></div>}
