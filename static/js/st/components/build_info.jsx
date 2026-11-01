import * as React from "react"

export default function BuildInfo() {
  const [info, setInfo] = React.useState(null)

  React.useEffect(() => {
    const controller = new AbortController()
    fetch("/static/build-info.json", {cache: "no-store", signal: controller.signal})
      .then(response => response.ok ? response.json() : null)
      .then(value => {
        if (!value || typeof value.built_at !== "string") { return }
        const builtAt = new Date(value.built_at)
        if (Number.isNaN(builtAt.getTime())) { return }
        setInfo({
          builtAt: builtAt.toISOString(),
          commit: /^[a-f0-9]{40}$/.test(value.app_sha || "") ? value.app_sha.slice(0, 7) : null
        })
      })
      .catch(() => {}) // Older/upstream builds may not provide build metadata.
    return () => controller.abort()
  }, [])

  if (!info) { return null }
  return <small>
    Build <time dateTime={info.builtAt}>{info.builtAt.slice(0, 19).replace("T", " ")} UTC</time>
    {info.commit && <> · {info.commit}</>}
  </small>
}
