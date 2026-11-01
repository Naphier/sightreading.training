// Generates the frontend assets normally produced by tup, so the frontend
// can be developed without the backend toolchain (tup, moonscript, lua).
// Source-derived files are only written when missing or stale, so existing
// tup-generated assets are left alone. Build identity is refreshed per invocation.

import {readFileSync, writeFileSync, readdirSync, statSync, existsSync} from "fs"
import {join, dirname, basename} from "path"
import {fileURLToPath} from "url"

import peg from "pegjs"
import {marked} from "marked"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")

function mtime(path) {
  return existsSync(path) ? statSync(path).mtimeMs : -Infinity
}

function stale(target, sources) {
  const targetTime = mtime(target)
  return sources.some(source => mtime(source) >= targetTime)
}

export function buildAssets() {
  const generated = []

  // Stable for this preview/build invocation, never the browser refresh time.
  // Production images replace this with their final image-build metadata.
  const buildInfo = join(ROOT, "static/build-info.json")
  writeFileSync(buildInfo, JSON.stringify({built_at: new Date().toISOString()}))
  generated.push(buildInfo)

  // song parser: song_parser_peg.pegjs -> song_parser_peg.js
  const grammar = join(ROOT, "static/js/st/song_parser_peg.pegjs")
  const parserOut = join(ROOT, "static/js/st/song_parser_peg.js")
  if (stale(parserOut, [grammar])) {
    const source = peg.generate(readFileSync(grammar, "utf8"), {
      output: "source",
      format: "commonjs"
    })
    writeFileSync(parserOut, source)
    generated.push(parserOut)
  }

  // staff assets: static/staff/*.svg -> staff_assets.jsx with a React export per file
  const staffDir = join(ROOT, "static/staff")
  const staffSvgs = readdirSync(staffDir).filter(f => f.endsWith(".svg")).sort()
    .map(f => join(staffDir, f))
  const staffOut = join(ROOT, "static/js/st/staff_assets.jsx")
  if (stale(staffOut, staffSvgs)) {
    let out = 'import * as React from "react"\n'
    for (const file of staffSvgs) {
      const name = basename(file, ".svg").toUpperCase()
      out += `export const ${name} = ${readFileSync(file, "utf8").trimEnd()};\n`
    }
    writeFileSync(staffOut, out)
    generated.push(staffOut)
  }

  // guide pages: static/guides/*.md -> *.json
  // (tup uses the lua discount renderer; marked output differs slightly but is
  // equivalent for dev purposes)
  const guidesDir = join(ROOT, "static/guides")
  for (const md of readdirSync(guidesDir).filter(f => f.endsWith(".md"))) {
    const source = join(guidesDir, md)
    const target = join(guidesDir, md.replace(/\.md$/, ".json"))
    if (stale(target, [source])) {
      const contents = marked.parse(readFileSync(source, "utf8"))
      writeFileSync(target, JSON.stringify({ contents }))
      generated.push(target)
    }
  }

  return generated
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const generated = buildAssets()
  console.log(generated.length ?
    `generated:\n${generated.map(f => "  " + f).join("\n")}` :
    "all generated assets up to date")
}
