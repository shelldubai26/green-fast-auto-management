import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import PublicShowroomV2 from './components/PublicShowroomV2'
import PublicLegalPage from './components/PublicLegalPage'
import './styles.css'
import './extras.css'
import './table-fixes.css'
import './sidebar-scroll.css'
import './showroom.css'

const path=window.location.pathname
const isTerms=path==='/terms'||path.startsWith('/terms/')
const isPrivacy=path==='/privacy'||path.startsWith('/privacy/')
const isShowroom=path.startsWith('/showroom')

function PublicShowroomWithLegalLinks(){
 return <>
  <PublicShowroomV2/>
  <footer style={{padding:'22px 24px',textAlign:'center',fontFamily:'Inter,Arial,sans-serif',fontSize:13,color:'#66736a',borderTop:'1px solid #dfe6e1',background:'#fff'}}>
   <strong style={{color:'#17211b'}}>GREEN FAST AUTO</strong>
   <span style={{margin:'0 10px'}}>·</span>
   <a href="/terms" style={{color:'#129b3a'}}>Terms of Service</a>
   <span style={{margin:'0 10px'}}>·</span>
   <a href="/privacy" style={{color:'#129b3a'}}>Privacy Policy</a>
   <span style={{margin:'0 10px'}}>·</span>
   <span>Abidjan, Côte d’Ivoire · 07 00 73 71 18</span>
  </footer>
 </>
}

const content=isTerms?<PublicLegalPage kind="terms"/>:isPrivacy?<PublicLegalPage kind="privacy"/>:isShowroom?<PublicShowroomWithLegalLinks/>:<App/>
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode>{content}</React.StrictMode>)
