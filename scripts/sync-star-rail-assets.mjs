import { access, cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
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
const avatarDirectory = 'icon/avatar'
const avatarCatalogPath = path.resolve(
  frontendRoot,
  'src/features/accounts/data/generated/account-avatar-options.json',
)

const catalog = JSON.parse(await readFile(catalogPath, 'utf8'))
const iconPaths = Array.from(
  new Set(
    catalog.items
      .map((item) => item.iconPath)
      .filter((iconPath) => typeof iconPath === 'string' && iconPath.length > 0),
  ),
).sort()
const sparseDirectories = Array.from(
  new Set([
    ...iconPaths.map((iconPath) => path.posix.dirname(iconPath)),
    avatarDirectory,
  ]),
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

const avatarFiles = await readDirectoryFiles(path.join(cachePath, avatarDirectory))
const avatars = []

for (const fileName of avatarFiles.filter((fileName) => fileName.endsWith('.png')).sort(compareFileNames)) {
  const avatarPath = path.posix.join(avatarDirectory, fileName)
  const sourcePath = path.join(cachePath, avatarPath)
  const targetPath = path.join(publicPath, avatarPath)
  const id = path.basename(fileName, '.png')

  await mkdir(path.dirname(targetPath), { recursive: true })
  await cp(sourcePath, targetPath)
  avatars.push({
    id,
    label: `Avatar ${id}`,
    path: avatarPath,
  })
}

await mkdir(path.dirname(avatarCatalogPath), { recursive: true })
await writeFile(
  avatarCatalogPath,
  `${JSON.stringify(
    {
      schemaVersion: 1,
      source: {
        name: 'Mar-7th/StarRailRes',
        repository: STAR_RAIL_RES_REPOSITORY.replace(/\.git$/, ''),
        branch: 'master',
        path: avatarDirectory,
      },
      generatedAt: new Date().toISOString(),
      avatars,
    },
    null,
    2,
  )}\n`,
)

console.log(`Synced ${copied} StarRailRes icons into ${path.join(publicPath, 'icon')}.`)
console.log(`Synced ${avatars.length} StarRailRes avatars into ${path.join(publicPath, avatarDirectory)}.`)

if (missing > 0) {
  console.warn(`Skipped ${missing} missing icon files from StarRailRes.`)
}

async function readDirectoryFiles(targetPath) {
  try {
    return await readdir(targetPath)
  } catch {
    return []
  }
}

function compareFileNames(left, right) {
  return left.localeCompare(right, undefined, {
    numeric: true,
    sensitivity: 'base',
  })
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
