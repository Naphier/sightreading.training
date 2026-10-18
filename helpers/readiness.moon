-- Probe with its own bounded connection, independent of sessions and migrations.
-- Never expose a connection error or change the normal migration timeout.
check = ->
  postgres = require "pgmoon"
  config = require("lapis.config").get!
  connection = postgres.new config.postgres
  connection\settimeout 1000
  ok = pcall ->
    assert connection\connect!
    assert connection\query "select trainer_preferences from users limit 0"
  pcall -> connection\disconnect!
  ok

{:check}
