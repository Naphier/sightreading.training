-- Generic production configuration; host-specific deployment stays outside the app.
required = (name) ->
  value = os.getenv name
  assert value and value != "", "Missing runtime setting: #{name}"
  value

secret = (name, minimum=1) ->
  path = os.getenv "#{name}_FILE"
  value = os.getenv name
  assert not (path and value), "Use #{name} or #{name}_FILE, not both"
  if path
    file = assert io.open(path, "rb"), "Cannot read runtime secret: #{name}_FILE"
    value = file\read "*a"
    file\close!
    value = value\gsub "[\r\n]+$", ""
  assert value and #value >= minimum and not value\find("%z"), "Invalid runtime secret: #{name}"
  value

production = ->
  stage = required "SR_STAGE"
  assert stage == "dev" or stage == "prd", "SR_STAGE must be dev or prd"
  url = required "SR_PUBLIC_URL"
  host = url\match "^https://([%w%.%-]+)$"
  assert host and host\find("%.") and not host\find("%.%."), "SR_PUBLIC_URL must be an HTTPS origin without a path"
  {
    public_host: host
    secret: secret "SR_SESSION_SECRET", 32
    session_name: "sr_#{stage}_session"
    postgres: {
      host: required "SR_DB_HOST"
      database: required "SR_DB_NAME"
      user: required "SR_DB_USER"
      password: secret "SR_DB_PASSWORD"
    }
  }

{:production}
