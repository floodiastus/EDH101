# Deep Cuts

An image-led tool for finding mechanically interesting, underplayed Magic: The Gathering commanders.

Normal discovery hides mechanically flat and ultra-narrow legends; the complete 3,334-card archive remains available through the **Show challenge picks** switch.

The public site is deployed with GitHub Pages. Card information, imagery, and mana symbols are provided by Scryfall; commander popularity signals come from EDHREC.

## Community Shit List

Community reactions are stored in Supabase using anonymous authentication. Each anonymous account gets one vote per commander. A commander qualifies after at least 25 votes when 70% or more are rejects; qualified commanders are hidden from normal discovery by default.

1. Create a Supabase project and enable Anonymous Sign-Ins under Authentication.
2. Run [`supabase/schema.sql`](supabase/schema.sql) in the project SQL editor.
3. Copy `.env.example` to `.env.local` and add the project URL and publishable key.
4. Rebuild the site.
