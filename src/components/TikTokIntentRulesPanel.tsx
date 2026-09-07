import { useEffect, useMemo, useState } from 'react'
import { Plus, RefreshCw, Search, SlidersHorizontal } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Lang, Role } from '../lib/modules'

type Rule={id:string;intent_type:string;pattern:string;match_type:'contains'|'regex';weight:number;language:string;is_active:boolean;notes:string|null}

export default function TikTokIntentRulesPanel({lang,role}:{lang:Lang;role:Role}){
  const txt=(fr:string,zh:string)=>lang==='fr'?fr:zh
  const isManager=role==='owner'||role==='manager'
  const [rules,setRules]=useState<Rule[]>([]),[q,setQ]=useState(''),[type,setType]=useState('all'),[loading,setLoading]=useState(true)
  const [pattern,setPattern]=useState(''),[intentType,setIntentType]=useState('purchase'),[weight,setWeight]=useState(20),[busy,setBusy]=useState('')
  const load=async()=>{if(!supabase)return;setLoading(true);const{data}=await supabase.from('tiktok_intent_rules').select('*').eq('market_scope','abidjan_auto').order('intent_type').order('weight',{ascending:false});setRules((data||[]) as Rule[]);setLoading(false)}
  useEffect(()=>{void load()},[])
  const types=useMemo(()=>Array.from(new Set(rules.map(r=>r.intent_type))).sort(),[rules])
  const filtered=useMemo(()=>rules.filter(r=>(type==='all'||r.intent_type===type)&&(!q||`${r.pattern} ${r.intent_type} ${r.notes||''}`.toLowerCase().includes(q.toLowerCase()))),[rules,type,q])
  const patch=async(id:string,values:Partial<Rule>)=>{if(!supabase)return;setBusy(id);await supabase.from('tiktok_intent_rules').update({...values,updated_at:new Date().toISOString()}).eq('id',id);setBusy('');await load()}
  const add=async()=>{if(!supabase||!pattern.trim())return;setBusy('add');await supabase.from('tiktok_intent_rules').upsert({intent_type:intentType,pattern:pattern.trim(),match_type:'contains',weight,language:'fr',market_scope:'abidjan_auto',is_active:true},{onConflict:'intent_type,pattern,market_scope'});setPattern('');setBusy('');await load()}
  return <div className="rules-panel">
    <div className="wl-head"><div><span className="eyebrow">V0.4 · INTENT RULES</span><h2>{txt('Bibliothèque de signaux d’achat','购车意向关键词库')}</h2><p>{txt('Les règles sont modifiables sans redéployer le worker. Plusieurs signaux dans un même commentaire augmentent le score.','规则可直接维护，无需重新部署抓取引擎；同一评论命中多个意图会叠加评分。')}</p></div><button className="lr-refresh" onClick={()=>void load()}><RefreshCw size={16}/>{txt('Actualiser','刷新')}</button></div>
    <div className="rules-summary"><div><b>{rules.filter(r=>r.is_active).length}</b><span>{txt('Règles actives','启用规则')}</span></div><div><b>{types.length}</b><span>{txt('Catégories','意图类别')}</span></div><div><b>{rules.filter(r=>r.weight>=24&&r.is_active).length}</b><span>{txt('Signaux forts','强意向词')}</span></div></div>
    {isManager&&<div className="rules-add"><select value={intentType} onChange={e=>setIntentType(e.target.value)}>{['purchase','price','budget','finance','availability','visit','location','contact','comparison','tradein','used','condition'].map(x=><option key={x} value={x}>{x}</option>)}</select><input placeholder={txt('Nouveau mot ou expression…','新增关键词或短语…')} value={pattern} onChange={e=>setPattern(e.target.value)}/><input type="number" min={-100} max={100} value={weight} onChange={e=>setWeight(Number(e.target.value))}/><button className="primary-action" disabled={busy==='add'||!pattern.trim()} onClick={()=>void add()}><Plus size={16}/>{txt('Ajouter','添加')}</button></div>}
    <div className="lr-toolbar"><div className="lr-search"><Search size={16}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder={txt('Rechercher une règle…','搜索关键词…')}/></div><select value={type} onChange={e=>setType(e.target.value)}><option value="all">{txt('Toutes les catégories','全部类别')}</option>{types.map(x=><option key={x} value={x}>{x}</option>)}</select></div>
    <div className="rules-grid">{loading?<div className="empty">{txt('Chargement…','加载中…')}</div>:filtered.map(r=><article className={`rule-card ${!r.is_active?'off':''}`} key={r.id}><div><span className="rule-type"><SlidersHorizontal size={13}/>{r.intent_type}</span><strong>{r.pattern}</strong><small>{r.notes||'—'}</small></div><div className="rule-side"><b>{r.weight>0?'+':''}{r.weight}</b>{isManager&&<button disabled={busy===r.id} className={r.is_active?'danger-lite':'ok-lite'} onClick={()=>void patch(r.id,{is_active:!r.is_active})}>{r.is_active?txt('Pause','停用'):txt('Activer','启用')}</button>}</div></article>)}</div>
  </div>
}
