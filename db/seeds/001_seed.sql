insert into public.characters (id, label, model_url, clips, tri_budget, enabled) values
('boss',    'Boss',    '/models/boss/base.fbx',    '{"idle":"idle","sit_idle":"sit_idle","point":"point","win":"win","fail":"fail","sit":"sit","stand_up":"stand_up","wave":"wave"}', 50000, true)
on conflict (id) do nothing;

insert into public.characters (id, label, model_url, clips, tri_budget, enabled) values
('jolleen', 'Jolleen', '/models/jolleen/base.fbx','{"idle":"idle","sit_idle":"sit_idle","point":"point","win":"win","fail":"fail","sit":"sit","stand_up":"stand_up","wave":"wave"}', 50000, true)
on conflict (id) do nothing;

insert into public.characters (id, label, model_url, clips, tri_budget, enabled) values
('medic',   'Medic',   '/models/medic/base.fbx',   '{"idle":"idle","sit_idle":"sit_idle","point":"point","win":"win","fail":"fail","sit":"sit","stand_up":"stand_up","wave":"wave"}', 50000, true)
on conflict (id) do nothing;

insert into public.characters (id, label, model_url, clips, tri_budget, enabled) values
('rani',    'Rani',    '/models/rani/base.fbx',    '{"idle":"idle","sit_idle":"sit_idle","point":"point","win":"win","fail":"fail","sit":"sit","stand_up":"stand_up","wave":"wave"}', 50000, true)
on conflict (id) do nothing;
