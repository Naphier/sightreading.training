describe "readiness probe", ->
  pgmoon = require "pgmoon"
  check = require("helpers.readiness").check
  connection = nil

  before_each ->
    connection = {
      settimeout: spy.new ->
      connect: spy.new -> true
      query: spy.new -> {}
      disconnect: spy.new -> true
    }
    stub pgmoon, "new", -> connection

  after_each -> pgmoon.new\revert!

  it "checks the migrated schema with a separate bounded connection", ->
    assert.true check!
    assert.spy(connection.settimeout).was.called_with connection, 1000
    assert.spy(connection.query).was.called_with connection, "select trainer_preferences from users limit 0"
    assert.spy(connection.disconnect).was.called 1

  it "reports connection failure without exposing details and closes the probe", ->
    connection.connect = spy.new -> nil, "private connection detail"
    assert.false check!
    assert.spy(connection.query).was_not.called!
    assert.spy(connection.disconnect).was.called 1

  it "reports a missing migration as unready and closes the probe", ->
    connection.query = spy.new -> nil, "missing private column detail"
    assert.false check!
    assert.spy(connection.disconnect).was.called 1


  it "reports constructor failures as unready instead of leaking them", ->
    pgmoon.new\revert!
    stub pgmoon, "new", -> error "private constructor detail"
    assert.false check!
