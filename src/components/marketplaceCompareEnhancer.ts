import './marketplaceCompareEnhancer.css'

// Lightweight DOM enhancement for public comparison tables.
const label=(zh:boolean,active:boolean)=>active?(zh?'显示全部配置':'Afficher tout'):(zh?'只看差异':'Voir seulement les différences')

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
}

function scan(){
 document.querySelectorAll<HTMLElement>('.variant-compare,.compare-modal').forEach(enhance)
}

if(typeof window!=='undefined'){
 window.addEventListener('DOMContentLoaded',scan,{once:true})
 const observer=new MutationObserver(scan)
 observer.observe(document.documentElement,{childList:true,subtree:true})
}
