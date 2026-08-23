import { useCallback, useEffect, useMemo, useState } from 'react'
import { KeyRound, Pencil, Plus, RefreshCw, Search, ShieldCheck, Users, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Lang, Role } from '../lib/modules'
import '../staff.css'

type Staff = {
  id: string
  email: string
  full_name: string
  role: Role
  active: boolean
  created_at: string
  last_sign_in_at: string | null
}

type ApiResult = { users?: Staff[]; callerRole?: Role; error?: string }

const roleNames: Record<Role,{fr:string;zh:string}> = {
  owner:{fr:'Propriétaire',zh:'Owner'},
  manager:{fr:'Manager',zh:'经理'},
  sales:{fr:'Ventes',zh:'销售'},
  finance:{fr:'Finance',zh:'财务'},
  delivery:{fr:'Livraison',zh:'交付'},
}

const text = {
  fr:{title:'Gestion des employés',sub:'Créez les comptes, attribuez les rôles et contrôlez les accès.',create:'Ajouter un employé',search:'Rechercher un employé…',name:'Nom',email:'E-mail',role:'Rôle',status:'Statut',last:'Dernière connexion',actions:'Actions',active:'Actif',inactive:'Désactivé',never:'Jamais',refresh:'Actualiser',edit:'Modifier',password:'Nouveau mot de passe temporaire',passwordHint:'Laissez vide pour conserver le mot de passe actuel.',save:'Enregistrer',cancel:'Annuler',createTitle:'Nouvel employé',editTitle:'Modifier l’employé',initialPassword:'Mot de passe initial',loading:'Chargement…',empty:'Aucun employé trouvé.',ownerNote:'Les comptes Owner disposent des droits les plus élevés. Le dernier Owner ne peut pas être désactivé ou rétrogradé.'},
  zh:{title:'员工管理',sub:'创建员工账号、分配角色并控制系统访问权限。',create:'新增员工',search:'搜索员工…',name:'姓名',email:'邮箱',role:'角色',status:'状态',last:'最后登录',actions:'操作',active:'启用',inactive:'已停用',never:'从未登录',refresh:'刷新',edit:'编辑',password:'新的临时密码',passwordHint:'留空则保持当前密码不变。',save:'保存',cancel:'取消',createTitle:'新增员工',editTitle:'编辑员工',initialPassword:'初始密码',loading:'加载中…',empty:'没有找到员工。',ownerNote:'Owner 拥有系统最高权限。系统最后一个 Owner 不能被停用或降级。'},
}

async function callAdmin(body: Record<string,unknown>): Promise<ApiResult> {
  if (!supabase) return { error: 'Supabase is not configured.' }
  const { data, error } = await supabase.functions.invoke('admin-users', { body })
  if (error) return { error: error.message }
  return (data || {}) as ApiResult
}

export default function StaffManagement({lang,role}:{lang:Lang;role:Role}) {
  const t=text[lang]
  const [rows,setRows]=useState<Staff[]>([])
  const [query,setQuery]=useState('')
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [editing,setEditing]=useState<Staff|null|undefined>(undefined)

  const load=useCallback(async()=>{
    setLoading(true);setError('')
    const result=await callAdmin({action:'list'})
    if(result.error)setError(result.error)
    else setRows(result.users||[])
    setLoading(false)
  },[])

  useEffect(()=>{void load()},[load])

  const filtered=useMemo(()=>rows.filter(row=>`${row.full_name} ${row.email} ${row.role}`.toLowerCase().includes(query.toLowerCase())),[rows,query])
  const fmt=(value:string|null)=>value?new Intl.DateTimeFormat(lang==='fr'?'fr-FR':'zh-CN',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value)):t.never

  return <main className="main module-page">
    <section className="module-title"><div><p>GREEN FAST AUTO · {lang==='fr'?'ADMINISTRATION':'管理后台'}</p><h1>{t.title}</h1><h2>{t.sub}</h2></div><button className="primary" onClick={()=>setEditing(null)}><Plus size={16}/>{t.create}</button></section>
    <div className="module-toolbar"><div className="search module-search"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder={t.search}/></div><button className="secondary" onClick={()=>void load()}><RefreshCw size={15}/>{t.refresh}</button></div>
    <div className="staff-note"><ShieldCheck size={18}/><span>{t.ownerNote}</span></div>
    {error&&<div className="error-banner">{error}</div>}
    {loading?<div className="card loading-state">{t.loading}</div>:filtered.length===0?<div className="card empty"><div className="empty-icon"><Users/></div><h3>{t.empty}</h3></div>:<div className="card data-wrap"><table><thead><tr><th>{t.name}</th><th>{t.email}</th><th>{t.role}</th><th>{t.status}</th><th>{t.last}</th><th>{t.actions}</th></tr></thead><tbody>{filtered.map(row=><tr key={row.id}><td data-label={t.name}><strong>{row.full_name||'—'}</strong></td><td data-label={t.email}>{row.email}</td><td data-label={t.role}><span className="role-badge">{roleNames[row.role][lang]}</span></td><td data-label={t.status}><span className={row.active?'staff-status active':'staff-status'}>{row.active?t.active:t.inactive}</span></td><td data-label={t.last}>{fmt(row.last_sign_in_at)}</td><td className="row-actions"><button title={t.edit} onClick={()=>setEditing(row)}><Pencil/></button><button title={t.password} onClick={()=>setEditing(row)}><KeyRound/></button></td></tr>)}</tbody></table></div>}
    {editing!==undefined&&<StaffEditor lang={lang} callerRole={role} row={editing} close={()=>setEditing(undefined)} saved={()=>{setEditing(undefined);void load()}}/>}
  </main>
}

function StaffEditor({lang,callerRole,row,close,saved}:{lang:Lang;callerRole:Role;row:Staff|null;close:()=>void;saved:()=>void}){
  const t=text[lang]
  const [name,setName]=useState(row?.full_name||'')
  const [email,setEmail]=useState(row?.email||'')
  const [role,setRole]=useState<Role>(row?.role||'sales')
  const [active,setActive]=useState(row?.active??true)
  const [password,setPassword]=useState('')
  const [saving,setSaving]=useState(false)
  const [error,setError]=useState('')
  const selectableRoles=(Object.keys(roleNames) as Role[]).filter(r=>callerRole==='owner'||r!=='owner')

  const submit=async(e:React.FormEvent)=>{
    e.preventDefault();setSaving(true);setError('')
    let result:ApiResult
    if(!row){
      result=await callAdmin({action:'create',email,full_name:name,role,password})
    }else{
      result=await callAdmin({action:'update',user_id:row.id,full_name:name,role,active})
      if(!result.error&&password){ result=await callAdmin({action:'set_password',user_id:row.id,password}) }
    }
    setSaving(false)
    if(result.error)setError(result.error);else saved()
  }

  return <div className="modal-layer"><div className="modal"><div className="modal-head"><div><small>{row?t.edit:t.create}</small><h2>{row?t.editTitle:t.createTitle}</h2></div><button onClick={close}><X/></button></div><form onSubmit={submit}><div className="form-grid"><label>{t.name} *<input value={name} onChange={e=>setName(e.target.value)} required/></label><label>{t.email} *<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required disabled={Boolean(row)}/></label><label>{t.role} *<select value={role} onChange={e=>setRole(e.target.value as Role)}>{selectableRoles.map(r=><option value={r} key={r}>{roleNames[r][lang]}</option>)}</select></label>{row&&<label>{t.status}<select value={active?'active':'inactive'} onChange={e=>setActive(e.target.value==='active')}><option value="active">{t.active}</option><option value="inactive">{t.inactive}</option></select></label>}<label className="wide">{row?t.password:t.initialPassword} *<input type="password" minLength={8} required={!row} value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••"/>{row&&<small className="field-hint">{t.passwordHint}</small>}</label></div>{error&&<div className="error-banner">{error}</div>}<div className="form-actions"><button type="button" className="secondary" onClick={close}>{t.cancel}</button><button className="primary" disabled={saving}>{saving?t.loading:t.save}</button></div></form></div></div>
}
