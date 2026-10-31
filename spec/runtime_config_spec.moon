describe "production runtime configuration", ->
  production = require("helpers.runtime_config").production
  values = nil
  paths = nil

  before_each ->
    paths = {}
    values = {
      SR_STAGE: "dev", SR_PUBLIC_URL: "https://dev.example.test"
      SR_DB_HOST: "db", SR_DB_NAME: "sightreading", SR_DB_USER: "sightreading"
      SR_DB_PASSWORD: "test-password", SR_SESSION_SECRET: string.rep("s", 32)
    }
    stub os, "getenv", (name) -> values[name]

  after_each ->
    os.getenv\revert!
    os.remove path for path in *paths

  secret_file = (contents) ->
    path = os.tmpname!
    table.insert paths, path
    file = assert io.open path, "wb"
    file\write contents
    file\close!
    path

  it "requires independent runtime configuration and a secure origin", ->
    config = production!
    assert.same "sr_dev_session", config.session_name
    assert.same "dev.example.test", config.public_host
    assert.same "db", config.postgres.host

  it "separates production sessions", ->
    values.SR_STAGE = "prd"
    assert.same "sr_prd_session", production!.session_name

  it "rejects missing secrets without printing their contents", ->
    values.SR_SESSION_SECRET = nil
    assert.has_error production, "Invalid runtime secret: SR_SESSION_SECRET"

  it "rejects ambiguous and unsafe origins", ->
    for url in *{"http://example.test", "https://example.test/", "https://user@example.test", "https://example.test\nother", "https://a..test"}
      values.SR_PUBLIC_URL = url
      assert.has_error production, "SR_PUBLIC_URL must be an HTTPS origin without a path"

  it "rejects conflicting secret sources", ->
    values.SR_DB_PASSWORD_FILE = "/unused"
    assert.has_error production, "Use SR_DB_PASSWORD or SR_DB_PASSWORD_FILE, not both"


  it "reads independent secrets from files and trims line endings", ->
    values.SR_DB_PASSWORD = nil
    values.SR_SESSION_SECRET = nil
    values.SR_DB_PASSWORD_FILE = secret_file "file-password\n"
    values.SR_SESSION_SECRET_FILE = secret_file string.rep("s", 32) .. "\r\n"
    config = production!
    assert.same "file-password", config.postgres.password
    assert.same string.rep("s", 32), config.secret

  it "rejects empty and oversized secret files with a setting-only error", ->
    values.SR_SESSION_SECRET = nil
    for value in *{"", string.rep("s", 4097), string.rep("s", 32) .. string.rep("\n", 4065)}
      values.SR_SESSION_SECRET_FILE = secret_file value
      assert.has_error production, "Invalid runtime secret: SR_SESSION_SECRET"

  it "rejects unreadable secret files", ->
    path = secret_file "test"
    os.remove path
    values.SR_DB_PASSWORD = nil
    values.SR_DB_PASSWORD_FILE = path
    assert.has_error production, "Cannot read runtime secret: SR_DB_PASSWORD_FILE"

  it "rejects short, oversized and NUL-containing signing secrets", ->
    for value in *{"short", string.rep("s", 4097), string.rep("s", 32) .. "\0"}
      values.SR_SESSION_SECRET = value
      assert.has_error production, "Invalid runtime secret: SR_SESSION_SECRET"

  it "rejects unknown stage identifiers", ->
    for stage in *{"development", "production", "other", "dev;sh"}
      values.SR_STAGE = stage
      assert.has_error production, "SR_STAGE must be dev or prd"

  it "rejects invalid DNS labels and normalizes host case", ->
    for host in *{".example.test", "example.test.", "-bad.example.test", "bad-.example.test", string.rep("a", 64) .. ".test", string.rep("a.", 126) .. "test"}
      values.SR_PUBLIC_URL = "https://" .. host
      assert.has_error production, "SR_PUBLIC_URL must be an HTTPS origin without a path"
    values.SR_PUBLIC_URL = "https://Dev.Example.Test"
    assert.same "dev.example.test", production!.public_host
