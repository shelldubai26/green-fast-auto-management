import './marketplaceCompareEnhancer.css'

// Public comparison enhancement. All advice is deterministic and derived from the visible table only.
const label=(zh:boolean,active:boolean)=>active?(zh?'显示全部配置':'Afficher tout'):(zh?'只看差异':'Voir seulement les différences')
type Scenario='family'|'ride'|'business'|'long'|'city'
type VehicleScore={name:string;score:number;reasons:string[]}

const scenarios:Record<Scenario,{zh:string;fr:string}>={
 family:{zh:'家庭用车',fr:'Famille'},
 ride:{zh:'网约车 / 高频运营',fr:'VTC / usage intensif'},
 business:{zh:'商务接待',fr:'Business'},
 long:{zh:'长途 / 跨城',fr:'Longue distance'},
 city:{zh:'市区通勤',fr:'Ville'}
}

const clean=(v:string)=>(v||'').replace(/\s+/g,' ').trim()
const num=(v:string)=>Number((v||'').replace(/[^0-9.,]/g,'').replace(/,/g,''))||0
const has=(v:string,rx:RegExp)=>rx.test((v||'').toLowerCase())

function tableModel(root:HTMLElement){
 const table=root.querySelector('table')
 if(!table)return null
 const heads=Array.from(table.querySelectorAll('thead th')).slice(1).map(x=>clean(x.textContent||''))
 const rows=Array.from(table.querySelectorAll('tbody tr')).map(tr=>{
  const tds=Array.from(tr.querySelectorAll('td'))
  return {label:clean(tds[0]?.textContent||''),values:tds.slice(1).map(td=>clean(td.textContent||''))}
 })
 return {heads,rows}
}

function valueFor(model:ReturnType<typeof tableModel>,vehicleIndex:number,rx:RegExp){
 if(!model)return''
 const row=model.rows.find(r=>rx.test(r.label.toLowerCase()))
 return clean(row?.values[vehicleIndex]||'')
}

function scoreVehicles(root:HTMLElement,scenario:Scenario,zh:boolean):VehicleScore[]{
 const model=tableModel(root)
 if(!model)return[]
 return model.heads.map((name,i)=>{
  let score=50
  const reasons:string[]=[]
  const price=valueFor(model,i,/prix|价格/),fuel=valueFor(model,i,/énergie|energie|动力|燃油/),mileage=valueFor(model,i,/kilométrage|kilometrage|里程/),year=valueFor(model,i,/année|annee|年份/),seats=valueFor(model,i,/places|座位|座/)
  const blob=model.rows.map(r=>`${r.label} ${r.values[i]||''}`).join(' ').toLowerCase()
  const p=num(price),km=num(mileage),seat=num(seats)
  const add=(points:number,zhText:string,frText:string)=>{score+=points;reasons.push(zh?zhText:frText)}
  if(scenario==='family'){
   if(seat>=7)add(18,'7座/大空间更适合多人家庭','7 places / espace familial')
   else if(seat>=5)add(8,'满足常规家庭乘坐','capacité familiale correcte')
   if(has(blob,/360|camera|影像|parking|泊车/))add(8,'泊车影像配置更友好','aides au stationnement utiles')
   if(has(blob,/airbag|adas|lane|cruise|安全|车道|巡航/))add(9,'安全与辅助驾驶配置更完整','meilleures aides de sécurité')
   if(has(blob,/sunroof|panoram|天窗/))add(3,'家庭出行舒适性更好','confort familial renforcé')
  }
  if(scenario==='ride'){
   if(has(`${fuel} ${blob}`,/hybrid|hev|phev|electric|électrique|hybride|混动|纯电/))add(18,'高频运营更看重能耗','énergie mieux adaptée à un usage intensif')
   if(km===0)add(5,'里程状态更有利','kilométrage favorable')
   if(p>0&&p<=20000000)add(10,'购车成本更适合运营回本','coût d’achat plus favorable au rendement')
   if(has(blob,/consumption|consommation|油耗/))add(6,'有明确能耗数据可比较','consommation identifiable')
  }
  if(scenario==='business'){
   if(has(blob,/leather|cuir|皮|massage|按摩|ventilat|通风|screen|écran|屏/))add(12,'舒适和座舱配置更适合接待','meilleur confort pour les rendez-vous clients')
   if(has(blob,/adas|cruise|lane|巡航|车道/))add(6,'长时间驾驶更轻松','conduite plus reposante')
   if(p>=18000000)add(4,'定位更偏中高端','positionnement plus premium')
  }
  if(scenario==='long'){
   if(has(blob,/range|autonomie|续航|tank|réservoir|油箱/))add(12,'续航相关配置更适合长途','autonomie mieux adaptée aux longs trajets')
   if(has(blob,/cruise|adaptive|巡航/))add(10,'巡航辅助对长途更有价值','régulateur utile sur longue distance')
   if(has(blob,/massage|ventilat|通风|按摩/))add(5,'长途乘坐舒适性更好','meilleur confort sur longue distance')
  }
  if(scenario==='city'){
   if(p>0&&p<=20000000)add(8,'城市通勤购车成本更友好','budget plus rationnel pour la ville')
   if(has(`${fuel} ${blob}`,/hybrid|electric|hybride|électrique|混动|纯电/))add(12,'走走停停场景更省能耗','mieux adapté aux arrêts fréquents')
   if(has(blob,/360|camera|parking|泊车|影像/))add(10,'停车和窄路更方便','plus pratique pour stationner')
  }
  if(year&&num(year)>=2025)add(2,'年份较新','année récente')
  return{name:name||`${zh?'车型':'Véhicule'} ${i+1}`,score,reasons:reasons.slice(0,3)}
 }).sort((a,b)=>b.score-a.score)
}

function addScenarioAdvisor(root:HTMLElement,zh:boolean){
 if(!root.classList.contains('compare-modal')||root.querySelector('.scenario-advisor'))return
 const model=tableModel(root);if(!model||model.heads.length<2)return
 const box=document.createElement('section');box.className='scenario-advisor'
 const eyebrow=document.createElement('small');eyebrow.textContent='GREEN FAST SMART ADVISOR'
 const title=document.createElement('h3');title.textContent=zh?'你怎么用车，结论就应该不一样':'Le meilleur choix dépend de votre usage'
 const intro=document.createElement('p');intro.textContent=zh?'选择使用场景，我们只根据当前对比表里的价格与配置重新判断，不凭空编参数。':'Choisissez votre usage. Le conseil est recalculé uniquement à partir des prix et équipements visibles.'
 const tabs=document.createElement('div');tabs.className='scenario-tabs'
 const result=document.createElement('div');result.className='scenario-result'
 const render=(scenario:Scenario)=>{
  Array.from(tabs.querySelectorAll('button')).forEach(b=>b.classList.toggle('active',(b as HTMLElement).dataset.scenario===scenario))
  const ranked=scoreVehicles(root,scenario,zh);const winner=ranked[0],second=ranked[1]
  if(!winner)return
  const gap=Math.max(0,winner.score-(second?.score||0))
  result.innerHTML=''
  const badge=document.createElement('span');badge.className='advisor-pick';badge.textContent=zh?'当前更推荐':'Choix recommandé'
  const h=document.createElement('h4');h.textContent=winner.name
  const p=document.createElement('p');p.textContent=winner.reasons.length?winner.reasons.join(' · '):(zh?'当前可见数据差异较少，建议重点比较价格、能耗和核心配置。':'Peu de différences visibles : comparez surtout prix, énergie et équipements clés.')
  const note=document.createElement('small');note.textContent=gap>=12?(zh?'匹配优势比较明显':'Avantage assez net pour cet usage'):gap>=5?(zh?'略占优势，建议继续看差异配置':'Léger avantage, vérifiez les différences'):zh?'两台匹配度接近，优先按预算和个人偏好选择':'Choix serré : privilégiez budget et préférence personnelle'
  result.append(badge,h,p,note)
 }
 ;(Object.keys(scenarios) as Scenario[]).forEach((s,idx)=>{const b=document.createElement('button');b.type='button';b.dataset.scenario=s;b.textContent=zh?scenarios[s].zh:scenarios[s].fr;b.onclick=()=>render(s);tabs.append(b);if(idx===0)b.classList.add('active')})
 box.append(eyebrow,title,intro,tabs,result)
 const toolbar=root.querySelector('.compare-diff-toolbar');if(toolbar)toolbar.insertAdjacentElement('beforebegin',box);else root.prepend(box)
 render('family')
}

function enhance(root:HTMLElement){
 if(root.dataset.diffEnhanced==='1')return
 const table=root.querySelector('table')
 if(!table)return
 root.dataset.diffEnhanced='1'
 const rows=Array.from(table.querySelectorAll('tbody tr')) as HTMLTableRowElement[]
 rows.forEach(row=>{
  const cells=Array.from(row.querySelectorAll('td')).slice(1).map(td=>(td.textContent||'').replace(/\s+/g,' ').trim().toLowerCase())
  if(cells.length>1&&cells.every(v=>v===cells[0]))row.classList.add('compare-same-row')
 })
 const zh=document.documentElement.lang==='zh'||/配置|价格|动力|变速箱|驱动|项目/.test(root.textContent||'')
 const bar=document.createElement('div')
 bar.className='compare-diff-toolbar'
 const text=document.createElement('span')
 text.textContent=zh?'对比时隐藏完全相同的项目，更快找到版本差异。':'Masquez les lignes identiques pour repérer les différences plus vite.'
 const button=document.createElement('button')
 button.type='button'
 let active=false
 button.textContent=label(zh,active)
 button.onclick=()=>{active=!active;root.classList.toggle('only-differences',active);button.classList.toggle('active',active);button.textContent=label(zh,active)}
 bar.append(text,button)
 const scroll=root.querySelector('.compare-scroll')
 if(scroll)root.insertBefore(bar,scroll)
 else root.prepend(bar)
 addScenarioAdvisor(root,zh)
}

function scan(){document.querySelectorAll<HTMLElement>('.variant-compare,.compare-modal').forEach(enhance)}

if(typeof window!=='undefined'){
 window.addEventListener('DOMContentLoaded',scan,{once:true})
 const observer=new MutationObserver(scan)
 observer.observe(document.documentElement,{childList:true,subtree:true})
}
