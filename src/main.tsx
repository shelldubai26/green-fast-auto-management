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
const page=path.startsWith('/showroom')?<PublicShowroomV2/>:path==='/terms'?<PublicLegalPage kind="terms"/>:path==='/privacy'?<PublicLegalPage kind="privacy"/>:<App/>
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode>{page}</React.StrictMode>)
