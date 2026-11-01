const {test} = require("node:test")
const assert = require("node:assert/strict")
const notify = require("./feedback_alert.cjs")
const marker = "<!-- website-feedback-votes -->"
function fixture(votes = 5, options = {}) {
  const comments = [{user: {login: "Naphier"}, body: `${marker}\n**Website upvotes: ${votes}**\nAlert threshold: ${options.threshold || 5}`}]
  const created = []
  const context = {repo: {owner: "Naphier", repo: "sightreading.training"}, eventName: "issue_comment",
    payload: {issue: {number: 12}, comment: comments[0]}}
  const github = {paginate: async () => comments, rest: {issues: {
    listComments() {}, listForRepo: async () => ({data: [{number: 12}]}),
    createComment: async data => {created.push(data); comments.push({user: {login: "github-actions[bot]"}, body: data.body})}
  }}}
  return {github, context, core: {info() {}}, env: {}, comments, created}
}
test("alert at five, authored separately, with no repeat at six", async () => {
  const f = fixture()
  await notify(f)
  assert.equal(f.created.length, 1)
  assert.match(f.created[0].body, /@Naphier/)
  f.comments[0].body = `${marker}\n**Website upvotes: 6**`
  await notify(f)
  assert.equal(f.created.length, 1)
})
test("no alert below threshold; honors the server's configured threshold", async () => {
  for (const f of [fixture(4), fixture(5, {threshold: 6})]) { await notify(f); assert.equal(f.created.length, 0) }
})
test("does not trust another comment author, pull requests, or spoofed markers", async () => {
  const other = fixture(); other.context.payload.comment.user.login = "someone-else"
  const pr = fixture(); pr.context.payload.issue.pull_request = {}
  const text = fixture(); text.context.payload.comment.body = "arbitrary feedback"
  for (const f of [other, pr, text]) {await notify(f); assert.equal(f.created.length, 0)}
})
test("scheduled recovery sends a missing alert and deduplicates future scans", async () => {
  const f = fixture(); f.context.eventName = "schedule"; f.context.payload = {}
  await notify(f); await notify(f)
  assert.equal(f.created.length, 1)
})
test("manual recovery validates issue number", async () => {
  const f = fixture(); f.context.eventName = "workflow_dispatch"; f.context.payload = {inputs: {issue_number: "not-a-number"}}
  await assert.rejects(notify(f), /Invalid issue number/)
})
