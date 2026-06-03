import { access, cp, mkdir, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const STAR_RAIL_RES_REPOSITORY = 'https://github.com/Mar-7th/StarRailRes.git'

const projectRoot = path.dirname(fileURLToPath(import.meta.url))
const frontendRoot = path.resolve(projectRoot, '..')
const cachePath = path.resolve(frontendRoot, '.asset-cache/StarRailRes')
const catalogPath = path.resolve(
  frontendRoot,
  'src/features/warp-history/data/generated/star-rail-item-catalog.json',
)
const publicPath = path.resolve(frontendRoot, 'public')

const catalog = JSON.parse(await readFile(catalogPath, 'utf8'))
const iconPaths = Array.from(
  new Set(
    catalog.items
      .map((item) => item.iconPath)
      .filter((iconPath) => typeof iconPath === 'string' && iconPath.length > 0),
  ),
).sort()
const sparseDirectories = Array.from(
  new Set(iconPaths.map((iconPath) => path.posix.dirname(iconPath))),
).sort()

await mkdir(path.dirname(cachePath), { recursive: true })

if (!(await pathExists(path.join(cachePath, '.git')))) {
  await rm(cachePath, { force: true, recursive: true })
  await run('git', [
    'clone',
    '--depth',
    '1',
    '--filter=blob:none',
    '--sparse',
    STAR_RAIL_RES_REPOSITORY,
    cachePath,
  ])
}

await run('git', ['-C', cachePath, 'sparse-checkout', 'set', ...sparseDirectories])
await run('git', ['-C', cachePath, 'pull', '--ff-only'])

let copied = 0
let missing = 0

for (const iconPath of iconPaths) {
  const sourcePath = path.join(cachePath, iconPath)
  const targetPath = path.join(publicPath, iconPath)

  if (!(await pathExists(sourcePath))) {
    missing += 1
    continue
  }

  await mkdir(path.dirname(targetPath), { recursive: true })
  await cp(sourcePath, targetPath)
  copied += 1
}

console.log(`Synced ${copied} StarRailRes icons into ${path.join(publicPath, 'icon')}.`)

if (missing > 0) {
  console.warn(`Skipped ${missing} missing icon files from StarRailRes.`)
}

async function pathExists(targetPath) {
  try {
    await access(targetPath)
    return true
  } catch {
    return false
  }
}

async function run(command, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: frontendRoot,
      shell: false,
      stdio: 'inherit',
    })

    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) {
        resolve()
        return
      }

      reject(new Error(`${command} ${args.join(' ')} exited with ${code}.`))
    })
  })
}
