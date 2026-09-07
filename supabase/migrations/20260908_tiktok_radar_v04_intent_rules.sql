create table if not exists public.tiktok_intent_rules (
  id uuid primary key default gen_random_uuid(),
  intent_type text not null,
  pattern text not null,
  match_type text not null default 'contains' check (match_type in ('contains','regex')),
  weight int not null default 10 check (weight between -100 and 100),
  language text not null default 'fr',
  market_scope text not null default 'abidjan_auto',
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(intent_type, pattern, market_scope)
);

alter table public.tiktok_intent_rules enable row level security;

drop policy if exists tiktok_intent_rules_read on public.tiktok_intent_rules;
create policy tiktok_intent_rules_read on public.tiktok_intent_rules
for select to authenticated using (true);

drop policy if exists tiktok_intent_rules_manage on public.tiktok_intent_rules;
create policy tiktok_intent_rules_manage on public.tiktok_intent_rules
for all to authenticated
using (public.current_role() = any(array['owner'::app_role,'manager'::app_role]))
with check (public.current_role() = any(array['owner'::app_role,'manager'::app_role]));

grant select on public.tiktok_intent_rules to authenticated;

create table if not exists public.tiktok_radar_scan_runs (
  id uuid primary key default gen_random_uuid(),
  watchlist_id uuid references public.tiktok_watchlist(id) on delete cascade,
  channel text not null check (channel in ('live','video_comment')),
  provider text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  items_seen int not null default 0,
  candidates_found int not null default 0,
  inserted_count int not null default 0,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists tiktok_radar_scan_runs_started_idx on public.tiktok_radar_scan_runs(started_at desc);
create index if not exists tiktok_radar_scan_runs_watchlist_idx on public.tiktok_radar_scan_runs(watchlist_id, channel, started_at desc);

alter table public.tiktok_radar_scan_runs enable row level security;
drop policy if exists tiktok_radar_scan_runs_read on public.tiktok_radar_scan_runs;
create policy tiktok_radar_scan_runs_read on public.tiktok_radar_scan_runs
for select to authenticated
using (public.current_role() = any(array['owner'::app_role,'manager'::app_role]));

grant select on public.tiktok_radar_scan_runs to authenticated;

insert into public.tiktok_intent_rules(intent_type,pattern,match_type,weight,language,notes) values
('price','prix','contains',14,'fr','Price question'),
('price','combien','contains',14,'fr','How much'),
('price','c’est combien','contains',16,'fr','Direct price question'),
('price','c est combien','contains',16,'fr','Direct price question no apostrophe'),
('price','ça coûte combien','contains',16,'fr','How much does it cost'),
('price','ca coute combien','contains',16,'fr','ASCII variant'),
('price','tarif','contains',12,'fr','Price/tariff'),
('price','dernier prix','contains',18,'fr','Negotiation intent'),
('price','prix final','contains',18,'fr','Final price'),
('price','prix net','contains',18,'fr','Net price'),
('price','fcfa','contains',10,'fr','Local currency'),
('price','cfa','contains',8,'fr','Local currency shorthand'),
('budget','budget','contains',18,'fr','Budget stated'),
('budget','j’ai','contains',4,'fr','Potential budget phrase'),
('budget','jai','contains',4,'fr','Potential budget phrase ASCII'),
('budget','million','contains',8,'fr','Budget magnitude'),
('budget','millions','contains',8,'fr','Budget magnitude'),
('budget','15m','contains',10,'fr','Budget shorthand'),
('budget','20m','contains',10,'fr','Budget shorthand'),
('budget','25m','contains',10,'fr','Budget shorthand'),
('budget','30m','contains',10,'fr','Budget shorthand'),
('budget','40m','contains',10,'fr','Budget shorthand'),
('budget','50m','contains',10,'fr','Budget shorthand'),
('finance','crédit','contains',20,'fr','Credit'),
('finance','credit','contains',20,'fr','Credit ASCII'),
('finance','financement','contains',20,'fr','Financing'),
('finance','acompte','contains',18,'fr','Down payment'),
('finance','apport','contains',18,'fr','Down payment'),
('finance','mensualité','contains',20,'fr','Monthly payment'),
('finance','mensualite','contains',20,'fr','Monthly payment ASCII'),
('finance','par mois','contains',12,'fr','Monthly payment phrasing'),
('finance','paiement en plusieurs fois','contains',22,'fr','Installments'),
('finance','échelonné','contains',18,'fr','Installments'),
('finance','echelonne','contains',18,'fr','Installments ASCII'),
('availability','disponible','contains',18,'fr','Availability'),
('availability','dispo','contains',15,'fr','Availability slang'),
('availability','en stock','contains',20,'fr','Stock'),
('availability','stock','contains',16,'fr','Stock'),
('availability','vous avez','contains',10,'fr','Do you have it'),
('availability','arrivage','contains',14,'fr','Arrival'),
('availability','quand ça arrive','contains',18,'fr','Arrival timing'),
('availability','quand ca arrive','contains',18,'fr','Arrival timing ASCII'),
('visit','je viens','contains',22,'fr','Visit intent'),
('visit','je peux venir','contains',24,'fr','Visit intent'),
('visit','venir voir','contains',24,'fr','Visit intent'),
('visit','voir la voiture','contains',24,'fr','Visit vehicle'),
('visit','visite','contains',18,'fr','Visit'),
('visit','rendez-vous','contains',24,'fr','Appointment'),
('visit','rendez vous','contains',24,'fr','Appointment ASCII'),
('visit','rdv','contains',24,'fr','Appointment shorthand'),
('visit','demain','contains',12,'fr','Near-term timing'),
('visit','aujourd’hui','contains',14,'fr','Immediate timing'),
('visit','aujourdhui','contains',14,'fr','Immediate timing ASCII'),
('visit','ce soir','contains',14,'fr','Immediate timing'),
('location','vous êtes où','contains',18,'fr','Location'),
('location','vous etes ou','contains',18,'fr','Location ASCII'),
('location','adresse','contains',16,'fr','Address'),
('location','localisation','contains',14,'fr','Location'),
('location','abidjan','contains',8,'fr','Local market signal'),
('location','cocody','contains',8,'fr','Abidjan district'),
('location','marcory','contains',8,'fr','Abidjan district'),
('location','treichville','contains',8,'fr','Abidjan district'),
('location','yopougon','contains',8,'fr','Abidjan district'),
('contact','whatsapp','contains',24,'fr','Contact request'),
('contact','numéro','contains',20,'fr','Phone number'),
('contact','numero','contains',20,'fr','Phone number ASCII'),
('contact','contact','contains',16,'fr','Contact request'),
('contact','appelez-moi','contains',26,'fr','Call me'),
('contact','appelez moi','contains',26,'fr','Call me ASCII'),
('contact','écris-moi','contains',24,'fr','DM me'),
('contact','ecris moi','contains',24,'fr','DM me ASCII'),
('contact','inbox','contains',14,'fr','DM'),
('contact','dm','contains',10,'fr','DM shorthand'),
('purchase','je veux acheter','contains',32,'fr','Explicit purchase intent'),
('purchase','je veux la voiture','contains',30,'fr','Explicit purchase intent'),
('purchase','je prends','contains',30,'fr','Explicit purchase intent'),
('purchase','je suis intéressé','contains',26,'fr','Explicit interest'),
('purchase','je suis interesse','contains',26,'fr','Explicit interest ASCII'),
('purchase','intéressé','contains',20,'fr','Interest'),
('purchase','interesse','contains',20,'fr','Interest ASCII'),
('purchase','je cherche une voiture','contains',28,'fr','Active shopping'),
('purchase','je cherche un véhicule','contains',28,'fr','Active shopping'),
('purchase','je cherche un vehicule','contains',28,'fr','Active shopping ASCII'),
('purchase','besoin d’une voiture','contains',28,'fr','Need car'),
('purchase','besoin dune voiture','contains',28,'fr','Need car ASCII'),
('purchase','urgent','contains',16,'fr','Urgency'),
('comparison','prado','contains',12,'fr','Model interest'),
('comparison','land cruiser','contains',12,'fr','Model interest'),
('comparison','lc300','contains',12,'fr','Model interest'),
('comparison','lc250','contains',12,'fr','Model interest'),
('comparison','fortuner','contains',12,'fr','Model interest'),
('comparison','rav4','contains',12,'fr','Model interest'),
('comparison','x5','contains',10,'fr','Model interest'),
('comparison','gle','contains',10,'fr','Model interest'),
('comparison','range rover','contains',12,'fr','Model interest'),
('comparison','jetour','contains',12,'fr','Model interest'),
('comparison','t2','contains',12,'fr','Model interest'),
('comparison','changan','contains',12,'fr','Model interest'),
('comparison','cs55','contains',12,'fr','Model interest'),
('comparison','byd','contains',10,'fr','Model interest'),
('comparison','suv','contains',8,'fr','Vehicle class'),
('comparison','4x4','contains',8,'fr','Vehicle class'),
('comparison','diesel','contains',8,'fr','Powertrain preference'),
('comparison','essence','contains',8,'fr','Powertrain preference'),
('comparison','hybride','contains',10,'fr','Powertrain preference'),
('comparison','électrique','contains',10,'fr','Powertrain preference'),
('comparison','electrique','contains',10,'fr','Powertrain preference ASCII'),
('tradein','reprise','contains',20,'fr','Trade-in'),
('tradein','échanger','contains',18,'fr','Trade-in'),
('tradein','echanger','contains',18,'fr','Trade-in ASCII'),
('tradein','ancienne voiture','contains',16,'fr','Trade-in'),
('used','occasion','contains',14,'fr','Used car interest'),
('used','deuxième main','contains',14,'fr','Used car interest'),
('used','deuxieme main','contains',14,'fr','Used car interest ASCII'),
('condition','kilométrage','contains',12,'fr','Mileage'),
('condition','kilometrage','contains',12,'fr','Mileage ASCII'),
('condition','année','contains',8,'fr','Year'),
('condition','annee','contains',8,'fr','Year ASCII'),
('condition','garantie','contains',12,'fr','Warranty'),
('condition','neuve','contains',10,'fr','New car'),
('condition','neuf','contains',10,'fr','New car'),
('condition','automatique','contains',8,'fr','Transmission'),
('condition','boîte auto','contains',8,'fr','Transmission'),
('condition','boite auto','contains',8,'fr','Transmission ASCII')
on conflict (intent_type,pattern,market_scope) do update
set weight=excluded.weight, match_type=excluded.match_type, is_active=true, notes=excluded.notes, updated_at=now();
