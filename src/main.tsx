import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import PublicShowroomV2 from './components/PublicShowroomV2'
import './styles.css'
import './extras.css'
import './table-fixes.css'
import './sidebar-scroll.css'
import './showroom.css'
const publicRoute=window.location.pathname.startsWith('/showroom')
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode>{publicRoute?<PublicShowroomV2/>:<App/>}</React.StrictMode>)
