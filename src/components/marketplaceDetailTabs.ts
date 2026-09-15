const labels={fr:{photos:'Photos',specs:'Configuration',versions:'Versions',compare:'Comparer'},zh:{photos:'图片',specs:'配置',versions:'版本',compare:'对比'}}

function enhance(){
 const page=document.querySelector('.vehicle-page.detail-page') as HTMLElement|null
 if(!page||page.dataset.detailTabs==='1')return
 const left=page.querySelector('.detail-left') as HTMLElement|null
 const gallery=left?.querySelector('.swipe-gallery-wrap') as HTMLElement|null
 if(!left||!gallery)return
 page.dataset.detailTabs='1'
 const zh=document.body.innerText.includes('返回选车')
 const t=zh?labels.zh:labels.fr
 const nav=document.createElement('nav');nav.className='detail-quick-tabs';nav.setAttribute('aria-label','Vehicle detail navigation')
 const items=[['photos',t.photos],['specs',t.specs],['versions',t.versions],['compare',t.compare]]
 items.forEach(([key,label])=>{const b=document.createElement('button');b.type='button';b.dataset.target=key;b.textContent=label;b.onclick=()=>{
   nav.querySelectorAll('button').forEach(x=>x.classList.remove('active'));b.classList.add('active')
   if(key==='photos'){gallery.scrollIntoView({behavior:'smooth',block:'start'});return}
   if(key==='specs'){const el=left.querySelector('.public-specs') as HTMLElement|null;if(el){el.classList.add('expanded');el.scrollIntoView({behavior:'smooth',block:'start'})};return}
   if(key==='versions'){const el=page.querySelector('.variant-picker') as HTMLElement|null;(el||page.querySelector('.vehicle-buybox'))?.scrollIntoView({behavior:'smooth',block:'start'});return}
   const compare=page.querySelector('.compare-actions button,.variant-compare-btn') as HTMLButtonElement|null;if(compare){compare.click();setTimeout(()=>page.querySelector('.variant-compare,.compare-actions')?.scrollIntoView({behavior:'smooth',block:'start'}),80)}
 };nav.appendChild(b)})
 ;(nav.firstElementChild as HTMLElement)?.classList.add('active');gallery.insertAdjacentElement('afterend',nav)
 const specs=left.querySelector('.public-specs') as HTMLElement|null
 if(specs){const groups=specs.querySelectorAll('.spec-group');if(groups.length>2){specs.classList.add('collapsed');const more=document.createElement('button');more.className='spec-expand-btn';more.textContent=zh?'查看全部配置':'Voir toute la configuration';more.onclick=()=>{specs.classList.toggle('expanded');more.textContent=specs.classList.contains('expanded')?(zh?'收起配置':'Réduire'):(zh?'查看全部配置':'Voir toute la configuration')};specs.appendChild(more)}}
}

const observer=new MutationObserver(()=>enhance())
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{enhance();observer.observe(document.body,{childList:true,subtree:true})})
else{enhance();observer.observe(document.body,{childList:true,subtree:true})}
