describe "production runtime configuration", ->
  production = require("helpers.runtime_config").production
  values = nil

  before_each ->
    values = {
      SR_STAGE: "dev", SR_PUBLIC_URL: "https://dev.example.test"
      SR_DB_HOST: "db", SR_DB_NAME: "sightreading", SR_DB_USER: "sightreading"
      SR_DB_PASSWORD: "test-password", SR_SESSION_SECRET: string.rep("s", 32)
    }
    stub os, "getenv", (name) -> values[name]

  after_each -> os.getenv\revert!

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
