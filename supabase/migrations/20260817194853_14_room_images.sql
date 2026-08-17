-- Pacity MVP — 14 : photo de salle
--
-- Le champ accepte indifféremment un chemin relatif servi par
-- l'application (`/rooms/medium-room.jpg`, ce qu'on fait aujourd'hui)
-- ou une URL absolue. Le jour où le gérant pourra téléverser ses propres
-- photos via Supabase Storage, il n'y aura AUCUNE migration de schéma :
-- seule la valeur change.
--
-- NULL est autorisé : une salle nouvellement créée n'a pas de photo, et
-- l'interface doit savoir l'afficher sans casser.

alter table public.rooms add column image_url text;

comment on column public.rooms.image_url is
  'Chemin relatif servi par l app, ou URL absolue. NULL = pas de photo, l interface affiche un aplat.';

update public.rooms set image_url = '/rooms/phone-booth.jpg'  where name = 'Phone Booth';
update public.rooms set image_url = '/rooms/small-room.jpg'   where name = 'Small Room';
update public.rooms set image_url = '/rooms/medium-room.jpg'  where name = 'Medium Room';
update public.rooms set image_url = '/rooms/large-room.jpg'   where name = 'Large Room';
