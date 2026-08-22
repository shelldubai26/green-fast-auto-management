# Green Fast Auto Management V1

Mobile-first operations portal for Green Fast Auto's Abidjan team. The interface defaults to French and includes a Chinese language switch.

## Local setup

```bash
cp .env.example .env.local
npm install
npm run dev
```

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from **GF Auto Project**. Apply `supabase/migrations` through the Supabase CLI, then add the same variables to Vercel. Authentication uses Supabase email/password sessions and the `profiles.role` value.

```bash
supabase db push
npm run build
vercel deploy
```

The operational migration adds the complete inventory file, CRM, tasks/KPI, content attribution, price approval, orders, payments, payroll, delivery, and after-sales records. Every module reads and writes Supabase directly; dashboard metrics are aggregated from those live records.

## Security

Row-level security limits customer and order visibility by assignment and role. Sales-facing vehicle queries must use `vehicle_catalog`, which deliberately excludes landed cost and company floor price. Never use a service-role key in the browser.
