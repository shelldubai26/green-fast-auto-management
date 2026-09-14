import './marketplaceCompareAdvisor.css'

const clean=(v:string)=>v.replace(/\s+/g,' ').trim()
const parseMoney=(v:string)=>Number(clean(v).replace(/[^0-9]/g,''))||0
const norm=(v:string)=>clean(v).toLowerCase()
const absent=(v:string)=>!v||['—','-','non','no','false','0','无','没有','否'].includes(norm(v))
const present=(v:string)=>!absent(v)

function isZh(root:HTMLElement){return /配置|价格|动力|变速箱|驱动|项目|公里|年份/.test(root.textContent||'')}

function buildSummary(root:HTMLElement){
 if(root.dataset.compareAdvisor==='1')return
 const table=root.querySelector('table') as HTMLTableElement|null
 if(!table)return
 const headers=Array.from(table.querySelectorAll('thead th')).slice(1).map(x=>clean(x.textContent||''))
 if(headers.length<2)return
 const rows=Array.from(table.querySelectorAll('tbody tr')) as HTMLTableRowElement[]
 const rowData=rows.map(r=>{const cells=Array.from(r.querySelectorAll('td')).map(td=>clean(td.textContent||''));return{label:cells[0]||'',values:cells.slice(1)}}).filter(r=>r.values.length===headers.length)
 const zh=isZh(root)
 const priceRow=rowData.find(r=>/prix|价格/i.test(r.label))
 const prices=(priceRow?.values||[]).map(parseMoney)
 let lowIndex=0,highIndex=headers.length-1
 if(prices.some(Boolean)){
  const valid=prices.map((v,i)=>({v,i})).filter(x=>x.v>0)
  if(valid.length>=2){lowIndex=valid.reduce((a,b)=>a.v<=b.v?a:b).i;highIndex=valid.reduce((a,b)=>a.v>=b.v?a:b).i}
 }
 if(lowIndex===highIndex){lowIndex=0;highIndex=headers.length-1}
 const diffs=rowData.filter(r=>r.values[lowIndex]!==r.values[highIndex]&&!/prix|价格/i.test(r.label))
 const added=diffs.filter(r=>absent(r.values[lowIndex])&&present(r.values[highIndex]))
 const changed=diffs.filter(r=>present(r.values[lowIndex])&&present(r.values[highIndex]))
 const priceDiff=Math.max(0,(prices[highIndex]||0)-(prices[lowIndex]||0))
 const pct=(prices[lowIndex]||0)>0?priceDiff/(prices[lowIndex]||1):0
 const featureNames=[...added,...changed].map(r=>r.label).filter(Boolean).slice(0,5)
 const valueScore=added.length*2+changed.length-(pct>0.18?2:0)-(priceDiff>3000000?2:0)
 let verdict=''
 if(zh){
  verdict=valueScore>=5?`${headers[highIndex]} 的升级幅度比较明显，预算允许的话更值得。`:valueScore>=2?`${headers[highIndex]} 有实际升级，但要看这些配置是否正好是你需要的。`:`如果主要考虑性价比，${headers[lowIndex]} 更合适。`
 }else{
  verdict=valueScore>=5?`${headers[highIndex]} apporte une vraie montée en gamme et peut valoir le supplément si le budget le permet.`:valueScore>=2?`${headers[highIndex]} ajoute des équipements utiles, à choisir surtout s’ils correspondent à votre usage.`:`Pour le meilleur rapport prix/équipement, ${headers[lowIndex]} paraît plus rationnel.`
 }
 const box=document.createElement('section')
 box.className='compare-ai-advisor'
 const title=document.createElement('div');title.className='compare-ai-title';title.innerHTML=`<span>✦</span><div><small>${zh?'GREEN FAST 智能配置顾问':'CONSEILLER CONFIGURATION GREEN FAST'}</small><h3>${zh?'这两个版本，核心差别在哪里？':'Quelles différences comptent vraiment ?'}</h3></div>`
 const grid=document.createElement('div');grid.className='compare-ai-grid'
 const price=document.createElement('article');price.innerHTML=`<small>${zh?'价格差':'Écart de prix'}</small><strong>${priceDiff?new Intl.NumberFormat('fr-FR').format(priceDiff)+' FCFA':'—'}</strong><p>${headers[lowIndex]} → ${headers[highIndex]}</p>`
 const feature=document.createElement('article');feature.innerHTML=`<small>${zh?'主要升级':'Principales évolutions'}</small><strong>${diffs.length}${zh?' 项差异':' différences'}</strong><p>${featureNames.length?featureNames.join(' · '):(zh?'暂无已录入的明显差异':'Aucune différence détaillée renseignée')}</p>`
 const recommend=document.createElement('article');recommend.className='compare-ai-verdict';recommend.innerHTML=`<small>${zh?'购买建议':'Conseil d’achat'}</small><strong>${zh?'智能判断':'Avis intelligent'}</strong><p>${verdict}</p>`
 grid.append(price,feature,recommend);box.append(title,grid)
 const toolbar=root.querySelector('.compare-diff-toolbar')
 if(toolbar)toolbar.insertAdjacentElement('beforebegin',box)
 else{const scroll=root.querySelector('.compare-scroll');if(scroll)scroll.insertAdjacentElement('beforebegin',box);else root.prepend(box)}
 root.dataset.compareAdvisor='1'
}

function scan(){document.querySelectorAll<HTMLElement>('.variant-compare,.compare-modal').forEach(buildSummary)}
if(typeof window!=='undefined'){
 window.addEventListener('DOMContentLoaded',scan,{once:true})
 const observer=new MutationObserver(scan)
 observer.observe(document.documentElement,{childList:true,subtree:true})
}
