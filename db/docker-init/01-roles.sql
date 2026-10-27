-- Local development only. Runs once, when the Docker volume is first created.
-- medasset (the owner, set by POSTGRES_USER) runs migrations and resets.
-- medasset_app is what the app and the seed connect as: no DELETE, no TRUNCATE,
-- and INSERT/SELECT only on audit_log (granted in the first migration).
create role medasset_app login password 'medasset_app_dev';

create database medasset_test owner medasset;

grant connect on database medasset to medasset_app;
grant connect on database medasset_test to medasset_app;
