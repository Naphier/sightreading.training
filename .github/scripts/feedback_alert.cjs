// No issue text is executed. Only the configured feedback writer's count marker
// is trusted; notifications are authored by github-actions[bot], not the owner.
module.exports = async function feedbackAlert({github, context, core, env = process.env}) {
  const marker = "<!-- website-feedback-votes -->"
  const alertMarker = "<!-- website-feedback-popular -->"
  const writer = env.FEEDBACK_BOT_LOGIN || context.repo.owner
  const recipient = env.FEEDBACK_ALERT_LOGIN || context.repo.owner
  if (!/^[a-zA-Z0-9-]{1,39}$/.test(recipient)) throw new Error("Invalid feedback alert recipient")
  let numbers
  if (context.eventName === "issue_comment") {
    const event = context.payload
    if (event.issue.pull_request || event.comment.user.login !== writer || !event.comment.body.startsWith(marker)) return
    numbers = [event.issue.number]
  } else if (context.payload.inputs?.issue_number) {
    const number = Number(context.payload.inputs.issue_number)
    if (!Number.isSafeInteger(number) || number < 1) throw new Error("Invalid issue number")
    numbers = [number]
  } else {
    // Recovery after a failed event run; bound work to the 100 most recent issues.
    const {data} = await github.rest.issues.listForRepo({...context.repo, state: "all", sort: "updated", per_page: 100})
    numbers = data.filter(issue => !issue.pull_request).map(issue => issue.number)
  }
  for (const issue_number of numbers) {
    const comments = await github.paginate(github.rest.issues.listComments, {...context.repo, issue_number, per_page: 100})
    if (comments.some(comment => comment.user.login === "github-actions[bot]" && comment.body.startsWith(alertMarker))) continue
    const countComment = comments.find(comment => comment.user.login === writer && comment.body.startsWith(marker))
    if (!countComment) continue
    const votes = Number(countComment.body.match(/\*\*Website upvotes: (\d+)\*\*/)?.[1])
    const threshold = Number(countComment.body.match(/Alert threshold: (\d+)/)?.[1] || 5)
    if (!Number.isSafeInteger(votes) || !Number.isSafeInteger(threshold) || threshold < 1 || votes < threshold) continue
    await github.rest.issues.createComment({...context.repo, issue_number,
      body: `${alertMarker}\n@${recipient} This issue has reached **${votes} website upvotes** (threshold: ${threshold}).`})
    core.info(`Popularity alert sent for issue #${issue_number}`)
  }
}
