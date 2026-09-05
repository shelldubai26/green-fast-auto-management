type LegalKind='terms'|'privacy'

const contact='07 00 73 71 18'

export default function PublicLegalPage({kind}:{kind:LegalKind}){
 const privacy=kind==='privacy'
 return <main style={{maxWidth:900,margin:'0 auto',padding:'48px 24px 80px',fontFamily:'Inter,Arial,sans-serif',lineHeight:1.65,color:'#17211b'}}>
  <a href="/showroom" style={{color:'#129b3a',fontWeight:700,textDecoration:'none'}}>GREEN FAST AUTO</a>
  <h1 style={{fontSize:'clamp(32px,5vw,52px)',lineHeight:1.05,margin:'18px 0 8px'}}>{privacy?'Privacy Policy':'Terms of Service'}</h1>
  <p style={{color:'#66736a'}}>Effective date: 6 September 2026 · Green Fast Auto · Côte d’Ivoire</p>
  {privacy?<>
   <h2>1. Scope</h2><p>This Privacy Policy explains how Green Fast Auto processes information when customers, employees and authorized sales representatives use our automotive sales, customer-management and LIVE SALES AI services.</p>
   <h2>2. Information we process</h2><p>Depending on how you use our services, we may process account and profile information, contact details, customer enquiries, vehicle interests, sales and follow-up activity, and technical records needed to operate and secure the service.</p>
   <h2>3. TikTok connection</h2><p>When an authorized salesperson chooses to connect a TikTok account, TikTok may provide the information covered by the permissions shown on its authorization screen, such as a TikTok account identifier, display name and avatar. Green Fast Auto only requests and uses TikTok data for features the user has authorized.</p>
   <h2>4. How we use information</h2><p>We use information to authenticate users, link authorized accounts, operate our CRM and sales workflows, support customers, measure sales activity, improve internal sales assistance, maintain security, and comply with applicable obligations.</p>
   <h2>5. LIVE SALES AI</h2><p>LIVE SALES AI may analyze authorized sales activity and customer intent to provide internal recommendations to sales staff. Simulated development data is kept distinct from data received through an authorized provider. Green Fast Auto does not use the service to create fake viewers, likes, comments, followers or other artificial engagement.</p>
   <h2>6. Tokens and security</h2><p>OAuth credentials and refresh tokens used to maintain authorized connections are handled server-side and are not intentionally exposed to ordinary browser users. We apply access controls appropriate to employee roles and operational needs.</p>
   <h2>7. Sharing and retention</h2><p>Information may be processed by service providers that host or support our systems and by platforms a user explicitly connects. We retain information only as reasonably necessary for the purposes described here, legal requirements, security and legitimate business records.</p>
   <h2>8. Disconnecting TikTok and deletion requests</h2><p>A user may revoke TikTok authorization through TikTok where available and may contact Green Fast Auto to request disconnection of the linked account or deletion of eligible personal information. Some records may be retained when required for legal, fraud-prevention or accounting purposes.</p>
   <h2>9. Your choices and rights</h2><p>You may contact us to request access, correction or deletion of eligible personal information, or to ask questions about how it is used. Rights may vary under applicable law.</p>
   <h2>10. Changes</h2><p>We may update this policy as our services or legal obligations change. The effective date above identifies the current version.</p>
  </>:<>
   <h2>1. Service</h2><p>Green Fast Auto provides automotive sales, customer-management and internal sales-assistance services in Côte d’Ivoire. Authorized employees may use the platform to manage vehicles, customer leads, follow-up activity and supported account connections.</p>
   <h2>2. Eligibility and authorized use</h2><p>Users must provide accurate information, protect their credentials and use the service only for lawful and authorized Green Fast Auto business. Access may be limited according to role.</p>
   <h2>3. TikTok Login and connected accounts</h2><p>Where TikTok Login is offered, connecting a TikTok account is voluntary and subject to the permissions presented by TikTok. Users must connect only accounts they are authorized to use. Green Fast Auto may suspend a connection if authorization expires, is revoked or presents a security risk.</p>
   <h2>4. LIVE SALES AI</h2><p>AI-generated scores, recommendations and commercial-value estimates are internal decision-support tools. They are not guarantees of reach, sales, profit or platform recommendation. Green Fast Auto does not authorize fake engagement, automated manipulation of viewers, likes, comments, followers or watch time.</p>
   <h2>5. Customer and sales data</h2><p>Users must handle customer information responsibly and only for legitimate sales, service and follow-up purposes. Sales outcomes, attribution and AI-assisted indicators may be recorded for operational analysis.</p>
   <h2>6. Availability and changes</h2><p>We may modify, suspend or improve features as our systems, third-party platforms and regulatory requirements change. Third-party services, including TikTok, are governed by their own terms and availability.</p>
   <h2>7. Intellectual property</h2><p>Green Fast Auto branding, software interfaces, internal workflows and original materials remain the property of their respective owners and may not be copied or misused without authorization.</p>
   <h2>8. Limitation</h2><p>To the extent permitted by applicable law, analytical outputs and AI recommendations are provided as operational assistance and require human judgment. Users remain responsible for sales representations, customer commitments and compliance with applicable rules.</p>
   <h2>9. Suspension</h2><p>Access may be restricted or terminated for unauthorized use, security risks, misuse of customer information, violation of platform rules or other conduct that threatens Green Fast Auto, customers or connected services.</p>
   <h2>10. Changes to these Terms</h2><p>We may update these Terms as the service evolves. Continued use after an update is subject to the then-current Terms.</p>
  </>}
  <h2>Contact</h2><p>Green Fast Auto · Abidjan, Côte d’Ivoire<br/>Tél. / WhatsApp : {contact}</p>
  <p style={{marginTop:40,paddingTop:20,borderTop:'1px solid #dfe6e1',color:'#66736a'}}>Related: <a href={privacy?'/terms':'/privacy'} style={{color:'#129b3a'}}>{privacy?'Terms of Service':'Privacy Policy'}</a></p>
 </main>
}
