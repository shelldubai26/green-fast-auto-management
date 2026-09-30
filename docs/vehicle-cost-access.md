# GF Auto vehicle cost access

Vehicle inventory access is routed through role-safe catalog views.

- Owner / Finance: internal vehicle cost and margin fields.
- Manager / Sales / Delivery: operational and sales fields only.
- Public marketplace: published vehicle information and sales pricing only.
- Direct client access to `public.vehicles` is removed after the role-safe frontend deployment is active.
