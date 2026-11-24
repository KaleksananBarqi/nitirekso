import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const INSTALLER_EXTENSIONS = [
    '.app.tar.gz',
    '.appimage',
    '.rpm',
    '.deb',
    '.exe',
    '.msi',
    '.dmg',
    '.apk',
]

function isInstallerAsset(filename) {
    const lower = filename.toLowerCase()
    if (lower.endsWith('.sig')) return false
    return INSTALLER_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

function walkFiles(dir) {
    const results = []
    if (!existsSync(dir)) return results
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry)
        const st = statSync(full)
        if (st.isDirectory()) {
            results.push(...walkFiles(full))
        } else if (st.isFile()) {
            results.push(full)
        }
    }
    return results
}

function sha256File(filePath) {
    const hash = createHash('sha256')
    hash.update(readFileSync(filePath))
    return hash.digest('hex')
}

function findMatchingSig(fileByName, assetName) {
    return fileByName.get(`${assetName}.sig`) ?? null
}

/**
 * Menghasilkan `latest.json` (manifest Tauri v2 updater) dan `SHA256SUMS.txt`
 * dari direktori artefak multi-platform.
 */
export function generateReleaseManifests(options) {
    const {
        artifactsDir,
        outDir = artifactsDir,
        version,
        repo = 'KaleksananBarqi/nitirekso',
        notes = '',
        pubDate = new Date().toISOString(),
    } = options

    const cleanVersion = String(version).replace(/^v/i, '').trim()
    if (!cleanVersion) {
        throw new Error('Nomor versi wajib diisi untuk membuat manifest rilis.')
    }
    const tagName = `v${cleanVersion}`
    const baseDownloadUrl = `https://github.com/${repo}/releases/download/${tagName}`

    const allFiles = walkFiles(resolve(artifactsDir))
    const fileByName = new Map()
    for (const filePath of allFiles) {
        const name = basename(filePath)
        if (!fileByName.has(name)) {
            fileByName.set(name, filePath)
        }
    }

    const installerNames = Array.from(fileByName.keys())
        .filter(isInstallerAsset)
        .sort((a, b) => a.localeCompare(b))

    const checksumLines = installerNames.map((name) => {
        const digest = sha256File(fileByName.get(name))
        return `${digest}  ${name}`
    })

    const platforms = {}

    // 1. Windows x86_64 (-setup.exe atau .msi beserta .sig)
    const winExe = installerNames.find(
        (n) => n.toLowerCase().endsWith('.exe') && n.toLowerCase().includes('setup') && findMatchingSig(fileByName, n)
    ) ?? installerNames.find((n) => n.toLowerCase().endsWith('.exe') && findMatchingSig(fileByName, n))
    const winMsi = installerNames.find(
        (n) => n.toLowerCase().endsWith('.msi') && findMatchingSig(fileByName, n)
    )
    const chosenWin = winExe ?? winMsi
    if (chosenWin) {
        const sigPath = findMatchingSig(fileByName, chosenWin)
        platforms['windows-x86_64'] = {
            signature: readFileSync(sigPath, 'utf8').trim(),
            url: `${baseDownloadUrl}/${encodeURIComponent(chosenWin)}`,
        }
    }

    // 2. macOS Universal (.app.tar.gz -> dipetakan ke darwin-aarch64 dan darwin-x86_64)
    const macUniversal = installerNames.find(
        (n) => n.toLowerCase().endsWith('.app.tar.gz') && n.toLowerCase().includes('universal') && findMatchingSig(fileByName, n)
    ) ?? installerNames.find((n) => n.toLowerCase().endsWith('.app.tar.gz') && findMatchingSig(fileByName, n))
    if (macUniversal) {
        const sig = readFileSync(findMatchingSig(fileByName, macUniversal), 'utf8').trim()
        const entry = {
            signature: sig,
            url: `${baseDownloadUrl}/${encodeURIComponent(macUniversal)}`,
        }
        platforms['darwin-aarch64'] = { ...entry }
        platforms['darwin-x86_64'] = { ...entry }
    }

    // 3. Linux x86_64 (.AppImage beserta .sig)
    const linuxAppImage = installerNames.find(
        (n) => n.toLowerCase().endsWith('.appimage') && findMatchingSig(fileByName, n)
    )
    if (linuxAppImage) {
        const sig = readFileSync(findMatchingSig(fileByName, linuxAppImage), 'utf8').trim()
        platforms['linux-x86_64'] = {
            signature: sig,
            url: `${baseDownloadUrl}/${encodeURIComponent(linuxAppImage)}`,
        }
    }

    const latestManifest = {
        version: cleanVersion,
        notes: String(notes || `nitirekso ${tagName}`),
        pub_date: pubDate,
        platforms,
    }

    mkdirSync(resolve(outDir), { recursive: true })
    const latestJsonPath = join(resolve(outDir), 'latest.json')
    const sha256Path = join(resolve(outDir), 'SHA256SUMS.txt')

    writeFileSync(latestJsonPath, `${JSON.stringify(latestManifest, null, 2)}\n`, 'utf8')
    writeFileSync(sha256Path, checksumLines.length > 0 ? `${checksumLines.join('\n')}\n` : '', 'utf8')

    return {
        latestManifest,
        checksumLines,
        latestJsonPath,
        sha256Path,
    }
}

function parseCliArgs(argv) {
    const args = {}
    for (let i = 0; i < argv.length; i++) {
        const token = argv[i]
        if (token.startsWith('--') && i + 1 < argv.length) {
            args[token.slice(2)] = argv[++i]
        }
    }
    return args
}

function extractNotesFromChangelog(changelogPath, cleanVersion) {
    if (!changelogPath || !existsSync(changelogPath)) {
        return 'Lihat CHANGELOG.md untuk informasi pembaruan.'
    }
    const changelog = readFileSync(changelogPath, 'utf8')
    const escaped = cleanVersion.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(`## \\[${escaped}\\][^\\n]*\\n([\\s\\S]*?)(?=\\n## \\[|$)`)
    const match = re.exec(changelog)
    return match ? match[1].trim() : 'Lihat CHANGELOG.md untuk informasi pembaruan.'
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    const args = parseCliArgs(process.argv.slice(2))
    const pkg = JSON.parse(readFileSync(resolve('package.json'), 'utf8'))
    const version = args.version || pkg.version
    const cleanVersion = String(version).replace(/^v/i, '').trim()

    let notes = ''
    if (args['notes-file'] && existsSync(args['notes-file'])) {
        notes = readFileSync(args['notes-file'], 'utf8')
    } else if (args.changelog) {
        notes = extractNotesFromChangelog(args.changelog, cleanVersion)
    } else if (args.notes) {
        notes = args.notes
    }

    if (args['notes-out']) {
        writeFileSync(resolve(args['notes-out']), notes, 'utf8')
    }

    const result = generateReleaseManifests({
        artifactsDir: args.dir || 'release-artifacts',
        outDir: args.out || args.dir || 'release-artifacts',
        version: cleanVersion,
        repo: args.repo || 'KaleksananBarqi/nitirekso',
        notes,
    })

    console.log(`[generate-release-manifests] Versi: ${result.latestManifest.version}`)
    console.log(`[generate-release-manifests] Platform updater: ${Object.keys(result.latestManifest.platforms).join(', ') || '(kosong)'}`)
    console.log(`[generate-release-manifests] Checksum: ${result.checksumLines.length} berkas`)
}
