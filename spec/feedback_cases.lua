-- Real disposable PostgreSQL; fake remote HTTP. Loaded by feedback_spec.moon.
return function()
  local db = require('lapis.db')
  local util = require('lapis.util')
  local original_http = package.loaded['resty.http']
  local http = {}
  local factory = require('spec.factory')
  local feedback, issues, comments, calls, offline, pending_create, values
  local function fake_request(_, url, opts)
    calls[#calls + 1] = {url = url, opts = opts}
    assert.is_true(opts.ssl_verify)
    assert.equal('Bearer test-token', opts.headers.Authorization)
    if offline then return nil, 'private network failure' end
    local body = opts.body and util.from_json(opts.body)
    local result
    if url:find('/search/issues?', 1, true) then
      result = {items = {}, incomplete_results = false}
    elseif url:match('/user$') then
      result = {login = 'test-bot'}
    elseif url:match('/issues/comments/%d+$') then
      local id = tonumber(url:match('(%d+)$'))
      comments[id].body = body.body
      result = comments[id]
    elseif url:find('/comments?', 1, true) then
      result = {}
      local number = tonumber(url:match('/issues/(%d+)/'))
      for _, comment in ipairs(comments) do
        if comment.issue_number == number then result[#result + 1] = comment end
      end
    elseif url:match('/comments$') then
      result = {id = #comments + 1, body = body.body, user = {login = 'test-bot'},
        issue_number = tonumber(url:match('/issues/(%d+)/'))}
      comments[#comments + 1] = result
    elseif url:match('/issues$') and opts.method == 'POST' then
      local number = #issues + 1
      result = {number = number, title = body.title, body = body.body, state = 'open'}
      issues[number] = result
      if pending_create then return nil, 'ambiguous timeout' end
    elseif url:match('/issues/%d+$') then
      result = issues[tonumber(url:match('(%d+)$'))]
    else
      result = issues
    end
    return {status = 200, body = util.to_json(result)}
  end
  local function ctx(user, params) return {current_user = user, params = params or {}} end
  local function draft(key)
    return {title = 'Improve scrolling speed', description = 'Please make scrolling easier to control.',
      request_key = key or '12345678-1234-1234-1234-123456789abc', reviewed = '1', confirm_new = '1'}
  end
  before_each(function()
    db.query('TRUNCATE feedback_votes, feedback_submissions, feedback_issues RESTART IDENTITY')
    package.loaded['helpers.feedback'] = nil
    feedback = require('helpers.feedback')
    issues = {{number = 1, title = 'Scroll speed', state = 'open'}}
    comments, calls, offline, pending_create = {}, {}, false, false
    values = {SR_FEEDBACK_ENABLED = '1', SR_FEEDBACK_TOKEN = 'test-token'}
    stub(os, 'getenv', function(name) return values[name] end)
    http.new = function() return {set_timeouts = function() end, request_uri = fake_request} end
    package.loaded['resty.http'] = http
  end)
  after_each(function()
    package.loaded['resty.http'] = original_http
    os.getenv:revert()
    db.query('TRUNCATE feedback_votes, feedback_submissions, feedback_issues RESTART IDENTITY')
    package.loaded['helpers.feedback'] = nil
  end)
  it('allows anonymous search and bounds repository search grammar', function()
    local result = feedback.list(ctx(nil, {q = 'repo:evil/other is:closed scroll'}))
    assert.is_true(result.success)
    assert.equal(0, #result.issues)
    assert.equal(5, result.threshold)
    local url = calls[1].url
    assert.is_truthy(url:find('Naphier', 1, true))
    assert.is_nil(url:find('repo:evil/other', 1, true))
  end)
  it('requires accounts for mutations and rejects non-issue targets', function()
    assert.is_false(pcall(feedback.vote, ctx(nil, {issue = '1'})))
    local user = factory.Users()
    for _, number in ipairs({'0', '-1', '1/../../2', '9999999999'}) do
      assert.is_false(pcall(feedback.vote, ctx(user, {issue = number})))
    end
    issues[1].state = 'closed'
    assert.is_false(pcall(feedback.vote, ctx(user, {issue = '1'})))
    issues[1].state = 'open'
    issues[1].pull_request = {}
    assert.is_false(pcall(feedback.vote, ctx(user, {issue = '1'})))
    assert.equal(0, tonumber(db.select('count(*) AS n FROM feedback_votes')[1].n))
  end)
  it('deduplicates votes, mirrors the count and alerts once at five', function()
    local first = factory.Users()
    feedback.vote(ctx(first, {issue = '1'}))
    feedback.vote(ctx(first, {issue = '1'}))
    for i = 2, 5 do feedback.vote(ctx(factory.Users(), {issue = '1'})) end
    db.query("UPDATE feedback_issues SET sync_after = now() - interval '1 second'")
    feedback.reconcile()
    assert.equal(5, tonumber(db.select('count(*) AS n FROM feedback_votes')[1].n))
    assert.equal(2, #comments)
    assert.is_truthy(comments[1].body:find('Website upvotes: 5', 1, true))
    assert.is_truthy(comments[2].body:find('@Naphier', 1, true))
    feedback.vote(ctx(factory.Users(), {issue = '1'}))
    db.query("UPDATE feedback_issues SET sync_after = now() - interval '1 second'")
    feedback.reconcile()
    assert.equal(2, #comments)
    assert.is_truthy(comments[1].body:find('Website upvotes: 6', 1, true))
  end)
  it('keeps saved votes when GitHub synchronization fails and retries', function()
    local user = factory.Users()
    feedback.vote(ctx(user, {issue = '1'}))
    db.query("UPDATE feedback_issues SET synced_count = -1, sync_after = now() - interval '1 second'")
    offline = true
    assert.is_false(feedback.sync(1))
    assert.equal(1, tonumber(db.select('count(*) AS n FROM feedback_votes')[1].n))
    offline = false
    db.query("UPDATE feedback_issues SET sync_after = now() - interval '1 second'")
    feedback.reconcile()
    assert.equal(1, #comments)
    assert.equal(1, tonumber(db.select('synced_count FROM feedback_issues')[1].synced_count))
  end)
  it('creates one issue and first vote for repeated submission UUIDs', function()
    local user = factory.Users()
    local result = feedback.create(ctx(user, draft()))
    assert.equal(2, result.issue.number)
    assert.equal(1, result.issue.votes)
    result = feedback.create(ctx(user, draft()))
    assert.equal(2, #issues)
    assert.equal(1, result.issue.votes)
    assert.equal(1, tonumber(db.select('count(*) AS n FROM feedback_submissions')[1].n))
  end)
  it('does not duplicate issues after ambiguous GitHub create timeouts', function()
    local user = factory.Users()
    pending_create = true
    assert.is_false(pcall(feedback.create, ctx(user, draft())))
    pending_create = false
    assert.is_false(pcall(feedback.create, ctx(user, draft())))
    assert.equal(2, #issues)
  end)
  it('limits daily submissions and refuses missing review', function()
    local user = factory.Users()
    local invalid = draft()
    invalid.reviewed = '0'
    assert.is_false(pcall(feedback.create, ctx(user, invalid)))
    for i = 1, 5 do feedback.create(ctx(user, draft('daily-request-key-' .. i))) end
    assert.is_false(pcall(feedback.create, ctx(user, draft('daily-request-key-6'))))
    assert.equal(6, #issues)
  end)
  it('honors the disabled switch without contacting GitHub', function()
    values.SR_FEEDBACK_ENABLED = nil
    assert.is_false(pcall(feedback.list, ctx(nil)))
    assert.equal(0, #calls)
  end)
end
