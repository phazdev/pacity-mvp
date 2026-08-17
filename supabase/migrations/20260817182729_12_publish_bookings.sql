-- Pacity MVP — 12 : publication de bookings
--
-- Sur cette table la RLS joue en notre faveur : chaque membre ne recoit
-- que SES propres reservations. C est donc sans risque, et ca fait vivre
-- l ecran "Mes reservations" en direct (passage a 'cancelled' quand le
-- gerant annule) sans avoir a le deduire du ledger.
--
-- Attention : c est precisement pour cette meme raison que la table ne
-- peut PAS servir a rafraichir la grille d une salle — un membre ne
-- recevrait jamais les reservations des autres. D ou room_schedule_events.
-- Voir docs/REALTIME.md.

alter publication supabase_realtime add table public.bookings;
